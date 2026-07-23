/**
 * server/intelligence-routes.ts - 情报蜂群 HTTP 端点
 *
 * 把已有的 runLiveSwarm 引擎暴露给前端。
 * 独立文件 - server/index.ts 只追加一行 app.use 即可注册，不修改现有端点。
 *
 * 端点：
 *   POST /api/intelligence/swarm
 *     body: { objective: string, packId?: string }
 *     返回: { ok: true, result: LiveSwarmResult }
 *
 * 约束：
 *   - 不改 server/index.ts 现有端点
 *   - 不新增 npm 依赖
 *   - API key 从注入的 env 读取（测试可注入），不硬编码，不日志输出
 *   - 缺 key 的源 graceful skip
 *   - 不接数据库（MemoryStore 是进程内 Map）
 */

import { Router } from "express";
import { z } from "zod";
import registrySeed from "../../data/intelligence-source-registry.seed.json" with { type: "json" };
import {
  parseSourceRegistry,
  runLiveSwarm,
  MemoryStore,
  apparelPack,
  type IntelligenceSource,
} from "../intelligence";
import type { SwarmTrigger } from "../intelligence/spine/types";
import type { IndustryPack } from "../intelligence/core/industry-pack";
import { CostEngine } from "../services/cost-engine";
import { compileIntent } from "../services/intent-compiler";

// 来源注册表 - 启动时解析一次
const registry = parseSourceRegistry(registrySeed);
const registrySources: IntelligenceSource[] = registry.sources;

// 行业包映射 - 目前只有 apparel
const PACK_MAP: Record<string, IndustryPack> = {
  apparel: apparelPack,
};

// 请求体 schema
const swarmBodySchema = z.object({
  objective: z.string().min(8, "Objective must be at least 8 characters."),
  packId: z.string().optional(),
});

/**
 * 情报蜂群所需的环境配置（API keys）。
 * 从 server/index.ts 注入，使路由可测试且不直接耦合 process.env。
 */
export interface IntelligenceEnv {
  fredApiKey?: string;
  censusApiKey?: string;
  openSupplyHubApiKey?: string;
  comtradeApiKey?: string;
}

/**
 * 从 process.env 读取 API keys 的默认实现。
 * 仅在未注入 env 时使用（向后兼容）。
 */
function readEnvFromProcess(): IntelligenceEnv {
  return {
    fredApiKey: process.env.FRED_API_KEY,
    censusApiKey: process.env.CENSUS_API_KEY,
    openSupplyHubApiKey: process.env.OPEN_SUPPLY_HUB_API_KEY,
    comtradeApiKey: process.env.UN_COMTRADE_API_KEY,
  };
}

/**
 * 创建情报蜂群路由。
 * 导出为函数以便 server/index.ts 调用 app.use(createIntelligenceRouter())。
 *
 * @param env 可选的 API key 配置。未传入时从 process.env 读取（向后兼容）。
 *            测试时可注入 fake env 避免耦合全局 process.env。
 */
export function createIntelligenceRouter(env?: IntelligenceEnv): Router {
  const router = Router();
  const resolvedEnv = env ?? readEnvFromProcess();

  // POST /api/intelligence/swarm - 运行实时蜂群
  router.post("/swarm", async (req, res) => {
    const parsed = swarmBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "invalid_input",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    const { objective, packId } = parsed.data;
    const pack = packId ? PACK_MAP[packId] : apparelPack;

    const trigger: SwarmTrigger = {
      id: `trigger-api-${Date.now()}`,
      ruleId: "rule-api",
      signalId: "signal-api",
      firedAt: new Date().toISOString(),
      objective,
      pack,
    };

    // v3: 意图编译 - 自动检测意图类型，选择最优工作流
    const compiledTask = compileIntent(objective);

    // live-swarm 已在采集前单独执行 scout（匹配数据源），
    // 因此传给 orchestrator 的工作流需移除 scout 步骤，避免重复执行。
    const liveWorkflow = {
      ...compiledTask.workflow,
      steps: compiledTask.workflow.steps.filter((step) => step !== "scout"),
    };

    // 每次请求新建 MemoryStore（进程内，不持久化）
    const memoryStore = new MemoryStore();

    // v3: 创建成本引擎，记录每步模型成本到 6 桶 CostRecord
    const costEngine = new CostEngine();
    costEngine.createBudget({ taskId: trigger.id, maxCostUsd: 1.0 });

    // v2: 30s 总量超时 - 防止上游 API 挂起导致永久阻塞
    const SWARM_TIMEOUT_MS = 30_000;

    try {
      const result = await Promise.race([
        runLiveSwarm({
          registrySources,
          trigger,
          memoryStore,
          now: new Date(),
          apiKeys: {
            fredApiKey: process.env.FRED_API_KEY,
            censusApiKey: process.env.CENSUS_API_KEY,
            openSupplyHubApiKey: process.env.OPEN_SUPPLY_HUB_API_KEY,
            comtradeApiKey: process.env.UN_COMTRADE_API_KEY,
          },
          costEngine,
          // v3: 注入编译的工作流（意图驱动的工作流选择）
          workflow: liveWorkflow,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("swarm_timeout_30s")), SWARM_TIMEOUT_MS),
        ),
      ]);

      res.json({
        ok: true,
        result,
        // v3: 返回意图编译结果，前端可展示检测到的意图类型和假设
        intent: {
          detectedIntent: compiledTask.detectedIntent,
          assumptions: compiledTask.assumptions,
          riskLevel: compiledTask.riskLevel,
        },
        // v3: 返回预算信息，前端可展示成本/预算进度
        budget: {
          maxCostUsd: costEngine.getBudget(trigger.id) ?? 0,
          withinBudget: costEngine.assertWithinBudget(trigger.id),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("timeout") ? 504 : 500;
      res.status(status).json({ ok: false, error: status === 504 ? "swarm_timeout" : "swarm_failed", message });
    }
  });

  // POST /api/intelligence/swarm/stream — SSE 流式蜂群
  //   与 /swarm 相同的引擎，但逐步推送 onStepComplete 事件到前端
  router.post("/swarm/stream", async (req, res) => {
    const parsed = swarmBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "invalid_input",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    const { objective, packId } = parsed.data;
    const pack = packId ? PACK_MAP[packId] : apparelPack;

    const trigger: SwarmTrigger = {
      id: `trigger-stream-${Date.now()}`,
      ruleId: "rule-stream",
      signalId: "signal-stream",
      firedAt: new Date().toISOString(),
      objective,
      pack,
    };

    const compiledTask = compileIntent(objective);
    const liveWorkflow = {
      ...compiledTask.workflow,
      steps: compiledTask.workflow.steps.filter((step) => step !== "scout"),
    };

    const memoryStore = new MemoryStore();
    const costEngine = new CostEngine();
    costEngine.createBudget({ taskId: trigger.id, maxCostUsd: 1.0 });

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // proxy buffering disable
    res.flushHeaders();

    // Track client disconnect — use res.on("close") not req.on("close"),
    // because req "close" fires when request body is fully consumed (too early for SSE).
    let closed = false;
    res.on("close", () => { closed = true; });

    // Helper: send SSE event (skip if client disconnected)
    const sendEvent = (data: unknown): void => {
      if (closed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Helper: map role → phase label
    const roleToPhase = (role: string): string => {
      if (role === "collector" || role === "data_janitor") return "Phase 1: Collection & Cleaning";
      if (role === "verifier" || role === "analyst" || role === "devils_advocate") return "Phase 2: Verification & Analysis";
      return "Phase 3: Adjudication & Synthesis";
    };

    const SWARM_STREAM_TIMEOUT_MS = 60_000;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (!closed && !res.writableEnded) {
        sendEvent({ done: true, result: null, error: "swarm_timeout_60s" });
        res.end();
      }
    }, SWARM_STREAM_TIMEOUT_MS);

    try {
      const result = await runLiveSwarm({
        registrySources,
        trigger,
        memoryStore,
        now: new Date(),
        apiKeys: {
          fredApiKey: resolvedEnv.fredApiKey,
          censusApiKey: resolvedEnv.censusApiKey,
          openSupplyHubApiKey: resolvedEnv.openSupplyHubApiKey,
          comtradeApiKey: resolvedEnv.comtradeApiKey,
        },
        costEngine,
        workflow: liveWorkflow,
        onStepComplete: (step, total, role, agentResult) => {
          sendEvent({
            step,
            total,
            role,
            status: agentResult.status,
            result: agentResult,
            phase: roleToPhase(role),
          });
        },
      });

      if (timedOut || closed) return;

      sendEvent({
        done: true,
        result,
        intent: {
          detectedIntent: compiledTask.detectedIntent,
          assumptions: compiledTask.assumptions,
          riskLevel: compiledTask.riskLevel,
        },
        budget: {
          maxCostUsd: costEngine.getBudget(trigger.id) ?? 0,
          withinBudget: costEngine.assertWithinBudget(trigger.id),
        },
      });
    } catch (error) {
      if (!timedOut && !closed) {
        sendEvent({
          done: true,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      clearTimeout(timeoutId);
      if (!closed && !res.writableEnded) res.end();
    }
  });

  return router;
}
