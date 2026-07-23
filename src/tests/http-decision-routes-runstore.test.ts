/**
 * http-decision-routes-runstore.test.ts — #2 RunStore 映射测试
 *
 * 验证 decision-routes 从 RunStore 最近一次 run 映射真实数据：
 *   - readiness: 从 run.status + completedNodeIds 计算
 *   - decisions: 从 taskPlan.tasks 映射
 *   - pipeline-stages: 从 workflow.nodes 映射
 *   - provenance: 从 auditEvents 映射
 *   - 其他端点保持 mock
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";

// ===== Fixtures =====

function makeGateway(): FakeModelGateway {
  return new FakeModelGateway({ responses: {} } as FakeModelGatewayConfig);
}

/** 启动临时 HTTP 服务器 */
function startServer(app: http.RequestListener): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

/** 发送 HTTP 请求 */
function httpRequest(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: http.RequestOptions = {
      method,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseBody<T>(body: string): T {
  return JSON.parse(body) as T;
}

// ===== 测试 =====

describe("Decision Routes — RunStore 映射 (#2)", () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    const app = createApp(makeGateway());
    const server = await startServer(app);
    baseUrl = server.baseUrl;
    close = server.close;
  });

  afterEach(async () => {
    await close();
  });

  // 注意：由于 createApp 使用内部 orchestrator（new SwarmOrchestrator()），
  // 其 RunStore 默认是空的（无 runs），所以默认情况下 decision 端点返回 mock。
  // 要测试 RunStore 映射，需要通过 POST /api/runs 创建 run。

  it("无 runs 时 GET /readiness 返回 mock 数据", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/decision/readiness`);
    expect(res.statusCode).toBe(200);
    const readiness = parseBody<{ level: string; summary: string }>(res.body);
    // mock 数据的 summary 包含 "当前情报可支撑"
    expect(readiness.summary).toContain("当前情报");
  });

  it("无 runs 时 GET /decisions 返回 mock 数据（dec-001）", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/decision/decisions`);
    expect(res.statusCode).toBe(200);
    const decisions = parseBody<Array<{ id: string }>>(res.body);
    // mock 数据包含 dec-001
    expect(decisions.some((d) => d.id === "dec-001")).toBe(true);
  });

  it("无 runs 时 GET /pipeline-stages 返回 mock 数据（7 阶段）", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/decision/pipeline-stages`);
    expect(res.statusCode).toBe(200);
    const stages = parseBody<Array<{ stageId: string }>>(res.body);
    // mock 数据有 7 个阶段
    expect(stages.length).toBe(7);
    expect(stages[0].stageId).toBe("scout");
  });

  it("无 runs 时 GET /provenance 返回 mock 数据", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/decision/provenance`);
    expect(res.statusCode).toBe(200);
    const trace = parseBody<{ title: string; layers: unknown[] }>(res.body);
    // mock 数据的 title 包含 "清洗穿透"
    expect(trace.title).toContain("清洗穿透");
  });

  it("创建 run 后 GET /readiness 返回映射数据", async () => {
    // 先创建一个 run
    const createRes = await httpRequest("POST", `${baseUrl}/api/runs`, {
      intent: "测试映射：降低缺货率",
    });
    expect(createRes.statusCode).toBe(201);

    // 再请求 readiness，应该返回映射数据
    const res = await httpRequest("GET", `${baseUrl}/api/decision/readiness`);
    expect(res.statusCode).toBe(200);
    const readiness = parseBody<{ level: string; summary: string; readyDecisions: number }>(res.body);
    // 映射数据的 summary 包含 "Run run_"
    expect(readiness.summary).toContain("Run run_");
    expect(readiness.readyDecisions).toBeGreaterThanOrEqual(0);
  });

  it("创建 run 后 GET /decisions 返回映射数据", async () => {
    // 先创建一个 run
    await httpRequest("POST", `${baseUrl}/api/runs`, {
      intent: "测试决策映射",
    });

    const res = await httpRequest("GET", `${baseUrl}/api/decision/decisions`);
    expect(res.statusCode).toBe(200);
    const decisions = parseBody<Array<{ id: string; title: string; status: string }>>(res.body);
    // 映射数据的 id 不包含 dec-001（mock 数据），而是来自 taskPlan.tasks
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions.some((d) => d.id === "dec-001")).toBe(false);
    // status 应该是 pending/accepted/rejected 之一
    expect(decisions.every((d) => ["pending", "accepted", "rejected"].includes(d.status))).toBe(true);
  });

  it("创建 run 后 GET /pipeline-stages 返回映射数据", async () => {
    await httpRequest("POST", `${baseUrl}/api/runs`, {
      intent: "测试管道映射",
    });

    const res = await httpRequest("GET", `${baseUrl}/api/decision/pipeline-stages`);
    expect(res.statusCode).toBe(200);
    const stages = parseBody<Array<{ stageId: string; name: string; status: string }>>(res.body);
    // 映射数据来自 workflow.nodes，数量取决于 run
    expect(stages.length).toBeGreaterThan(0);
    // status 应该是 idle/running/completed/failed 之一
    expect(stages.every((s) => ["idle", "running", "completed", "failed"].includes(s.status))).toBe(true);
  });

  it("创建 run 后 GET /provenance 返回映射数据（审计事件）", async () => {
    await httpRequest("POST", `${baseUrl}/api/runs`, {
      intent: "测试追溯映射",
    });

    const res = await httpRequest("GET", `${baseUrl}/api/decision/provenance`);
    expect(res.statusCode).toBe(200);
    const trace = parseBody<{ title: string; layers: Array<{ layerName: string }> }>(res.body);
    // 映射数据的 title 包含 "Run run_" 和 "审计轨迹"
    expect(trace.title).toContain("Run run_");
    expect(trace.title).toContain("审计轨迹");
    // 至少有 1 个审计事件（run_created）
    expect(trace.layers.length).toBeGreaterThan(0);
    expect(trace.layers[0].layerName).toBe("run_created");
  });

  it("GET /metrics 始终返回 mock 数据（6 个学科指标）", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/decision/metrics`);
    expect(res.statusCode).toBe(200);
    const metrics = parseBody<Array<{ id: string }>>(res.body);
    expect(metrics.length).toBe(6);
    expect(metrics.some((m) => m.id === "metric-propagation")).toBe(true);
  });

  it("GET /advices 始终返回 mock 数据（4 项建议）", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/decision/advices`);
    expect(res.statusCode).toBe(200);
    const advices = parseBody<Array<{ id: string }>>(res.body);
    expect(advices.length).toBe(4);
    expect(advices.some((a) => a.id === "advice-001")).toBe(true);
  });

  it("GET /collection-health 始终返回 mock 数据（9 个数据源）", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/decision/collection-health`);
    expect(res.statusCode).toBe(200);
    const health = parseBody<Array<{ sourceId: string }>>(res.body);
    expect(health.length).toBe(9);
    expect(health.some((h) => h.sourceId === "world-bank")).toBe(true);
  });

  it("GET /dimension-coverage 始终返回 mock 数据（7 个维度）", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/decision/dimension-coverage`);
    expect(res.statusCode).toBe(200);
    const coverage = parseBody<Array<{ dimension: string }>>(res.body);
    expect(coverage.length).toBe(7);
  });

  it("GET /raw-data 始终返回 mock 数据", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/decision/raw-data`);
    expect(res.statusCode).toBe(200);
    const rawData = parseBody<Array<{ id: string }>>(res.body);
    expect(rawData.length).toBeGreaterThan(0);
    expect(rawData.some((r) => r.id === "raw-001")).toBe(true);
  });
});
