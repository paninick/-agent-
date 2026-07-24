import cors from "cors";
import { config } from "dotenv";
import express, { type Express } from "express";
import helmet from "helmet";
import http from "node:http";
import path from "node:path";
import rateLimit from "express-rate-limit";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z, ZodError } from "zod";
import { streamLaunchPlan } from "../agent/streamLaunchPlan";
import { DEFAULT_MODEL } from "../agent/launchAgent";
import { approvalPolicy, DEFAULT_APPROVAL_META } from "../agent/approvalPolicy";
import { createModelGateway, type ModelGateway } from "../integration";
import { SwarmOrchestrator, type RunStoreResult, type Run } from "../runtime";
import { createPersistenceFromEnv } from "../intelligence/memory/persistence";
import { createIntelligenceRouter } from "./intelligence-routes";
import { createDecisionRouter } from "./decision-routes";
import { createHabitatRouter } from "./habitat-routes";
import { createCostRouter } from "./cost-routes";
import { createSkillsRouter } from "./skills-routes";
import {
  createAuthMiddleware,
  createAuthRouter,
  readAuthConfig,
  validateAuthConfig,
} from "./auth";
import {
  attachSentryErrorHandler,
  attachSentryRequestHandler,
  initSentry,
  readSentryConfig,
} from "./sentry";
import { httpLogger } from "./logger";

config({ path: ".env.local" });
config();

const port = Number(process.env.PORT || 8787);

/**
 * #6 — 启动时初始化持久化后端。
 *
 * 选择规则（createPersistenceFromEnv）：
 *   - NEON_PERSISTENCE=1 且 DATABASE_URL 已设置 → NeonPersistenceAdapter
 *   - 否则 → null（纯内存，不持久化）
 *
 * 警告：NEON_PERSISTENCE=1 但 DATABASE_URL 缺失时记录警告。
 */
function initPersistence() {
  const useNeon = process.env.NEON_PERSISTENCE === "1";
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  if (process.env.NODE_ENV === "production" && (!useNeon || !hasDbUrl)) {
    throw new Error(
      "[persistence] 生产环境必须设置 NEON_PERSISTENCE=1 和 DATABASE_URL，拒绝回退到内存模式",
    );
  }
  if (useNeon && !hasDbUrl) {
    console.warn("[persistence] NEON_PERSISTENCE=1 但 DATABASE_URL 未设置 — 回退到纯内存模式");
  }
  const backend = createPersistenceFromEnv();
  if (backend) {
    console.log("[persistence] 已启用 Neon PostgreSQL 持久化后端");
  } else {
    console.log("[persistence] 未启用持久化（纯内存模式）");
  }
  return backend;
}

/**
 * #3 — 启动时初始化认证配置。
 *
 * AUTH_ENABLED=true 时启用 JWT 认证，需配置 JWT_SECRET + ADMIN_PASSWORD。
 * 未启用时返回 disabled 配置，authMiddleware 直接放行。
 */
function initAuth() {
  const config = readAuthConfig();
  if (config.enabled) {
    const errors = validateAuthConfig(config);
    if (errors.length > 0) {
      throw new Error(`[auth] 认证启用但配置缺失：${errors.join("、")}，拒绝启动`);
    }
    console.log(`[auth] 已启用 JWT 认证（用户: ${config.adminUsername}, 过期: ${config.expiresIn}）`);
  } else {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[auth] 生产环境必须设置 AUTH_ENABLED=true，拒绝匿名启动");
    }
    console.log("[auth] 未启用认证（AUTH_ENABLED≠true）");
  }
  return config;
}

const runIntentBody = z.object({ intent: z.string().min(1) });

// Phase 2 — Approval decision endpoint schema.
const approvalDecisionBody = z.object({
  runId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

/** Pending approval stored while the SSE stream is paused waiting for a decision. */
type PendingApproval = {
  runId: string;
  approvalId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  resolve: (decision: "approved" | "rejected") => void;
  timer: ReturnType<typeof setTimeout>;
};

/** 5-minute timeout for pending approvals. After this the run completes safely. */
let APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/** Test helper — override the approval timeout (e.g. to a short value for tests). */
export function setApprovalTimeout(ms: number): void {
  APPROVAL_TIMEOUT_MS = ms;
}

/** Test helper — reset the approval timeout to the production default. */
export function resetApprovalTimeout(): void {
  APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
}

function mapErrorToStatus(err: RunStoreResult<Run>): number {
  if (err.ok) return 200;
  if (err.error === "run_not_found") return 404;
  if (err.error === "invalid_state") return 409;
  return 500;
}

/** Scan the pendingApprovals Map for an entry matching the given runId. */
function findPendingByRunId(
  map: Map<string, PendingApproval>,
  runId: string,
): PendingApproval | undefined {
  for (const [, pending] of map) {
    if (pending.runId === runId) return pending;
  }
  return undefined;
}

/**
 * Build the Express app. If `gateway` is omitted, a default `ModelGateway` is
 * created from environment config (preserving the original behavior).
 *
 * Exported so tests can inject a `FakeModelGateway` without starting the listener.
 */
export function createApp(
  gateway: ModelGateway = createModelGateway(),
  orchestrator?: SwarmOrchestrator,
): Express {
  const app = express();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // #7 — Sentry APM 初始化 + 请求处理器（必须在所有中间件之前）
  // 测试模式（注入 orchestrator）不重复初始化
  if (!orchestrator) {
    initSentry();
  }
  const _sentryConfig = readSentryConfig();
  attachSentryRequestHandler(app, _sentryConfig);

  // #8 — 结构化请求日志（pino-http）
  app.use(httpLogger);

  // #5 — Approval policy: env-driven (APPROVAL_ENABLED=true enables the gate)
  if (process.env.APPROVAL_ENABLED === "true") {
    approvalPolicy.enabled = true;
  }

  // Internal orchestrator for /api/runs endpoints — always available.
  // #6 — 当未注入 orchestrator（生产模式）时，启动时初始化持久化后端并注入。
  // 测试模式（注入 orchestrator）不重复初始化，避免污染。
  const _persistence = orchestrator ? undefined : initPersistence();
  const _orchestrator = orchestrator ?? new SwarmOrchestrator({ persistence: _persistence ?? undefined });

  // #3 — 认证配置（测试模式不重复初始化）
  const _authConfig = orchestrator ? readAuthConfig() : initAuth();
  const authMiddleware = createAuthMiddleware(_authConfig);
  // Approval gate is active when orchestrator is explicitly provided (test mode)
  // OR when the global approvalPolicy is enabled.
  const trackingEnabled = orchestrator !== undefined;
  const approvalEnabled = approvalPolicy.enabled || trackingEnabled;

  // Pending approval resolvers: "runId:approvalId" → PendingApproval.
  // When /api/launch-plan emits approval_required, it stores a Promise resolver here.
  // When POST /api/launch-plan/approval is called, it resolves the pending Promise.
  const pendingApprovals = new Map<string, PendingApproval>();

  // #12 — Security headers (HSTS, CSP, X-Frame-Options, etc.)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  // #11 — CORS: restrict to allowed origins (env-driven)
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(s => s.trim())
    : ["http://127.0.0.1:5173", "http://localhost:5173"];
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }));

  // #4 — Rate limiting: 100 req / 15 min per IP for general API
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "rate_limit_exceeded" },
  });
  app.use("/api/", apiLimiter);

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    const availableModels = gateway.getAvailableModels();
    res.json({
      ok: true,
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      hasProviderKey: availableModels.length > 0,
      model: availableModels[0] ?? DEFAULT_MODEL,
      availableModels,
      // #6 — 暴露持久化状态供运维监控
      persistence: {
        enabled: _orchestrator.getPersistence() !== undefined,
        backend: _orchestrator.getPersistence() ? "neon" : "memory",
      },
      // #3 — 暴露认证状态
      authEnabled: _authConfig.enabled,
    });
  });

  // #3 — 认证路由（/api/auth/login 公开，/api/auth/verify 内部自行认证）
  app.use("/api/auth", createAuthRouter(_authConfig));

  // #3 — 以下端点需要认证（AUTH_ENABLED=true 时生效，否则放行）
  app.use("/api/launch-plan", authMiddleware);
  app.use("/api/runs", authMiddleware);
  app.use("/api/decision", authMiddleware);
  app.use("/api/habitat", authMiddleware);
  app.use("/api/intelligence", authMiddleware);
  app.use("/api/cost", authMiddleware);
  app.use("/api/skills", authMiddleware);

  app.post("/api/launch-plan", async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Pre-flight: require at least one provider key (ModelGateway) OR OPENAI_API_KEY.
    const hasProviderKey = gateway.getAvailableModels().length > 0;
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
    if (!hasProviderKey && !hasOpenAIKey) {
      send("error", {
        message: "No model provider API keys configured. Set at least one of DEEPSEEK_API_KEY, ARK_API_KEY, OPENROUTER_API_KEY, LONGCAT_API_KEY, or OPENAI_API_KEY in .env.local."
      });
      res.end();
      return;
    }

    // Create a runtime run if tracking is enabled.
    let runId: string | undefined;
    if (trackingEnabled) {
      const input = typeof req.body === "object" && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};
      const brief = typeof input.productBrief === "string" ? input.productBrief : "Launch plan";
      const run = await _orchestrator.runIntent(`Launch plan: ${brief.slice(0, 80)}`);
      runId = run.runId;
    } else if (approvalEnabled) {
      // Approval enabled without orchestrator — generate a lightweight runId.
      runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    try {
      let streamExhausted = false;
      for await (const event of streamLaunchPlan(req.body)) {
        if (event.type === "run_started") {
          send("run_started", { ...event, runId });
          continue;
        }
        if (event.type === "run_completed") {
          streamExhausted = true;
          break; // Don't forward yet — wait for approval if tracking enabled.
        }
        send(event.type, event);
        if (event.type === "error") {
          if (trackingEnabled && runId) {
            _orchestrator.getRunStore().updateRun(runId, { status: "rejected" });
          }
          res.end();
          return;
        }
      }

      if (streamExhausted) {
        if (approvalEnabled && runId) {
          // Agent completed — emit approval_required with full payload and wait for decision.
          const approvalId = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const timestamp = new Date().toISOString();
          const approvalKey = `${runId}:${approvalId}`;

          send("approval_required", {
            type: "approval_required",
            runId,
            approvalId,
            title: DEFAULT_APPROVAL_META.title,
            reason: DEFAULT_APPROVAL_META.reason,
            riskLevel: DEFAULT_APPROVAL_META.riskLevel,
            toolName: DEFAULT_APPROVAL_META.toolName,
            requestedAction: DEFAULT_APPROVAL_META.requestedAction,
            payloadPreview: DEFAULT_APPROVAL_META.payloadPreview,
            timestamp,
          });

          try {
            const decision = await new Promise<"approved" | "rejected">((resolve) => {
              const timer = setTimeout(() => {
                // Timeout — auto-reject (safe default).
                resolve("rejected");
              }, APPROVAL_TIMEOUT_MS);
              pendingApprovals.set(approvalKey, {
                runId,
                approvalId,
                status: "pending",
                createdAt: Date.now(),
                resolve,
                timer,
              });
            });

            // Clear the entry (timer already fired or was cleared by the endpoint).
            pendingApprovals.delete(approvalKey);

            const resolvedTimestamp = new Date().toISOString();
            send("approval_resolved", {
              type: "approval_resolved",
              runId,
              approvalId,
              decision,
              timestamp: resolvedTimestamp,
            });

            if (decision === "approved") {
              if (trackingEnabled) {
                _orchestrator.approveRun(runId);
                await _orchestrator.resumeRun(runId);
              }
              send("run_completed", {});
            } else {
              // Rejected — do not continue. Output a safe explanation, then complete.
              if (trackingEnabled) {
                _orchestrator.rejectRun(runId);
              }
              send("text_delta", {
                type: "text_delta",
                delta: "\n\n[Run stopped: the approval request was rejected. No customer-facing copy was generated. Edit your brief and try again, or adjust the approval policy.]",
              });
              send("run_completed", {});
            }
          } catch {
            // Defensive — should not happen since we always resolve, not reject.
            pendingApprovals.delete(approvalKey);
            if (trackingEnabled) {
              _orchestrator.rejectRun(runId);
            }
            send("approval_resolved", {
              type: "approval_resolved",
              runId,
              approvalId,
              decision: "rejected",
              timestamp: new Date().toISOString(),
            });
            send("error", { message: "Run was rejected." });
          }
        } else {
          // No approval gate — emit run_completed directly (backward compatible).
          send("run_completed", {});
        }
      }
    } catch (error) {
      if (trackingEnabled && runId) {
        _orchestrator.getRunStore().updateRun(runId, { status: "rejected" });
      }
      const message =
        error instanceof ZodError
          ? error.issues.map((issue) => issue.message).join("; ")
          : error instanceof Error
            ? error.message
            : String(error);
      send("error", { message });
    } finally {
      // Clean up any pending approval entries (clear timers to avoid leaks).
      if (runId) {
        for (const [key, pending] of pendingApprovals) {
          if (pending.runId === runId) {
            clearTimeout(pending.timer);
            pendingApprovals.delete(key);
          }
        }
      }
      res.end();
    }
  });

  // ===== Phase 2 — Approval decision endpoint =====

  app.post("/api/launch-plan/approval", (req, res) => {
    const parsed = approvalDecisionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "invalid_input",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    const { runId, approvalId, decision } = parsed.data;
    const approvalKey = `${runId}:${approvalId}`;
    const pending = pendingApprovals.get(approvalKey);

    if (!pending) {
      res.status(404).json({
        ok: false,
        error: "approval_not_found",
        message: "No pending approval found for the given runId and approvalId.",
      });
      return;
    }

    // Resolve the pending Promise — unblocks the SSE handler.
    clearTimeout(pending.timer);
    pending.status = decision;
    pending.resolve(decision);
    // Note: do NOT delete from Map here — the SSE handler's `pendingApprovals.delete`
    // in the finally block will clean up. Deleting here would cause a double-resolve
    // race if the endpoint is called twice; the Map entry is the idempotency guard.
    pendingApprovals.delete(approvalKey);

    res.json({ ok: true });
  });

  // ===== Runs API (7 routes) =====

  app.post("/api/runs", async (req, res) => {
    const parsed = runIntentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", message: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    const result = await _orchestrator.runIntent(parsed.data.intent);
    res.status(201).json(result);
  });

  app.get("/api/runs", (_req, res) => {
    const runs = _orchestrator.getRunStore().listRuns();
    res.json({ runs });
  });

  app.get("/api/runs/:runId", (req, res) => {
    const state = _orchestrator.getRunState(req.params.runId);
    if (!state.ok) {
      res.status(mapErrorToStatus(state)).json({ error: state.error, message: state.message });
      return;
    }
    res.json(state.value);
  });

  app.post("/api/runs/:runId/approve", (req, res) => {
    // Check if this runId has a pending approval from an active SSE stream.
    // The Map is keyed by "runId:approvalId", so we scan for matching runId.
    const pending = findPendingByRunId(pendingApprovals, req.params.runId);
    if (pending) {
      clearTimeout(pending.timer);
      pending.status = "approved";
      pending.resolve("approved");
      pendingApprovals.delete(`${pending.runId}:${pending.approvalId}`);
      res.json({ status: "approved" });
      return;
    }

    const result = _orchestrator.approveRun(req.params.runId);
    if (!result.ok) {
      res.status(mapErrorToStatus(result)).json({ error: result.error, message: result.message });
      return;
    }
    res.json(result.value);
  });

  app.post("/api/runs/:runId/reject", (req, res) => {
    // Check if this runId has a pending approval from an active SSE stream.
    const pending = findPendingByRunId(pendingApprovals, req.params.runId);
    if (pending) {
      clearTimeout(pending.timer);
      pending.status = "rejected";
      pending.resolve("rejected");
      pendingApprovals.delete(`${pending.runId}:${pending.approvalId}`);
      res.json({ status: "rejected" });
      return;
    }

    const result = _orchestrator.rejectRun(req.params.runId);
    if (!result.ok) {
      res.status(mapErrorToStatus(result)).json({ error: result.error, message: result.message });
      return;
    }
    res.json(result.value);
  });

  app.post("/api/runs/:runId/resume", async (req, res) => {
    const result = await _orchestrator.resumeRun(req.params.runId);
    if (!result.ok) {
      res.status(mapErrorToStatus(result)).json({ error: result.error, message: result.message });
      return;
    }
    res.json(result.value);
  });

  app.get("/api/runs/:runId/audit", (req, res) => {
    const state = _orchestrator.getRunState(req.params.runId);
    if (!state.ok) {
      res.status(mapErrorToStatus(state)).json({ error: state.error, message: state.message });
      return;
    }
    const events = _orchestrator.getRunStore().getAuditEvents(req.params.runId);
    res.json({ events });
  });

  // ===== Intelligence Swarm API =====

  app.use("/api/intelligence", createIntelligenceRouter({
    fredApiKey: process.env.FRED_API_KEY,
    censusApiKey: process.env.CENSUS_API_KEY,
    openSupplyHubApiKey: process.env.OPEN_SUPPLY_HUB_API_KEY,
    comtradeApiKey: process.env.UN_COMTRADE_API_KEY,
  }));

  // ===== Decision Center API (Phase 2 后端接入 — #2 RunStore 映射) =====

  app.use("/api/decision", createDecisionRouter(() => _orchestrator.getRunStore()));

  // ===== Habitat Workspace API (#1 后端端点接入) =====

  app.use("/api/habitat", createHabitatRouter());

  // ===== Cost Center API (6 桶成本核算 + 预算守卫) =====

  app.use("/api/cost", createCostRouter(() => _orchestrator.getRunStore()));

  // ===== Skills & Tools API (技能注册表 + 上下文预算) =====

  app.use("/api/skills", createSkillsRouter());

  // ===== Static files =====

  const clientDist = path.resolve(__dirname, "../../dist/client");
  app.use(express.static(clientDist));
  app.get("*path", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });

  // #7 — Sentry 错误处理器（必须在所有路由之后）
  attachSentryErrorHandler(app, _sentryConfig);

  return app;
}

const app = createApp();

// Only start listening when this module is the entry point (not when imported by a test).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`Launch Desk API listening at http://127.0.0.1:${port}`);
  });
}

export { app, http };
