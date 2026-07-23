import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server";
import { FakeModelGateway, type FakeModelGatewayConfig } from "../integration";

// ===== Fixtures =====

function fakeConfig(): FakeModelGatewayConfig {
  return { responses: {} };
}

function makeGateway(): FakeModelGateway {
  return new FakeModelGateway(fakeConfig());
}

/** Start a temporary HTTP server on a random port. Returns baseUrl + close. */
function startServer(app: http.RequestListener): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        baseUrl,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

/** Send an HTTP request and return { statusCode, headers, body }. */
function httpRequest(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
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
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseBody<T>(body: string): T {
  return JSON.parse(body) as T;
}

// ===== Habitat Routes HTTP Integration =====

describe("Habitat Routes API", () => {
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

  it("GET /api/habitat/snapshot → 200 + HabitatSnapshot", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/habitat/snapshot`);
    expect(res.statusCode).toBe(200);
    const snapshot = parseBody<{
      capturedAt: string;
      motionPreference: string;
      residentAgents: unknown[];
      ephemeralAgents: unknown[];
      goals: unknown[];
      tasks: unknown[];
      squads: unknown[];
      userRequests: unknown[];
      memories: unknown[];
      activity: unknown[];
    }>(res.body);
    expect(snapshot.capturedAt).toBeTruthy();
    expect(snapshot.motionPreference).toBe("full");
    expect(Array.isArray(snapshot.residentAgents)).toBe(true);
    expect(snapshot.residentAgents.length).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.ephemeralAgents)).toBe(true);
    expect(Array.isArray(snapshot.goals)).toBe(true);
    expect(Array.isArray(snapshot.tasks)).toBe(true);
    expect(Array.isArray(snapshot.squads)).toBe(true);
    expect(Array.isArray(snapshot.userRequests)).toBe(true);
    expect(Array.isArray(snapshot.memories)).toBe(true);
    expect(Array.isArray(snapshot.activity)).toBe(true);
  });

  it("GET /api/habitat/snapshot — 初始状态有 1 个待审批请求", async () => {
    const res = await httpRequest("GET", `${baseUrl}/api/habitat/snapshot`);
    const snapshot = parseBody<{ userRequests: Array<{ id: string }> }>(res.body);
    expect(snapshot.userRequests.length).toBe(1);
    expect(snapshot.userRequests[0].id).toBe("req-001");
  });

  it("POST /api/habitat/requests/:id/approve → 200 + RequestActionResult", async () => {
    const res = await httpRequest("POST", `${baseUrl}/api/habitat/requests/req-001/approve`);
    expect(res.statusCode).toBe(200);
    const result = parseBody<{ ok: boolean; requestId: string; status: string }>(res.body);
    expect(result.ok).toBe(true);
    expect(result.requestId).toBe("req-001");
    expect(result.status).toBe("approved");
  });

  it("POST /api/habitat/requests/:id/approve — 批准后请求从列表移除", async () => {
    // 先批准
    const approveRes = await httpRequest("POST", `${baseUrl}/api/habitat/requests/req-001/approve`);
    expect(approveRes.statusCode).toBe(200);

    // 再获取快照，确认请求已移除
    const snapshotRes = await httpRequest("GET", `${baseUrl}/api/habitat/snapshot`);
    const snapshot = parseBody<{ userRequests: unknown[] }>(snapshotRes.body);
    expect(snapshot.userRequests.length).toBe(0);
  });

  it("POST /api/habitat/requests/:id/reject → 200 + RequestActionResult", async () => {
    const res = await httpRequest("POST", `${baseUrl}/api/habitat/requests/req-001/reject`);
    expect(res.statusCode).toBe(200);
    const result = parseBody<{ ok: boolean; requestId: string; status: string }>(res.body);
    expect(result.ok).toBe(true);
    expect(result.requestId).toBe("req-001");
    expect(result.status).toBe("rejected");
  });

  it("POST /api/habitat/requests/:id/auto-authorize → 200 + autonomyLevel", async () => {
    const res = await httpRequest(
      "POST",
      `${baseUrl}/api/habitat/requests/req-001/auto-authorize`,
      { autonomyLevel: "auto_within_limits" },
    );
    expect(res.statusCode).toBe(200);
    const result = parseBody<{ ok: boolean; requestId: string; status: string; autonomyLevel: string }>(res.body);
    expect(result.ok).toBe(true);
    expect(result.requestId).toBe("req-001");
    expect(result.status).toBe("auto_authorized");
    expect(result.autonomyLevel).toBe("auto_within_limits");
  });

  it("POST /api/habitat/requests/:id/auto-authorize — 提升对应 goal 的自治等级", async () => {
    const authorizeRes = await httpRequest(
      "POST",
      `${baseUrl}/api/habitat/requests/req-001/auto-authorize`,
      { autonomyLevel: "auto_within_limits" },
    );
    expect(authorizeRes.statusCode).toBe(200);

    // 获取快照，确认 goal-trip 的 autonomy 已提升
    const snapshotRes = await httpRequest("GET", `${baseUrl}/api/habitat/snapshot`);
    const snapshot = parseBody<{ goals: Array<{ id: string; autonomy: string }> }>(snapshotRes.body);
    const goal = snapshot.goals.find((g) => g.id === "goal-trip");
    expect(goal).toBeDefined();
    expect(goal?.autonomy).toBe("auto_within_limits");
  });

  it("POST /api/habitat/requests/:id/auto-authorize — 无 body 时使用默认 autonomyLevel", async () => {
    const res = await httpRequest("POST", `${baseUrl}/api/habitat/requests/req-001/auto-authorize`);
    expect(res.statusCode).toBe(200);
    const result = parseBody<{ autonomyLevel: string }>(res.body);
    expect(result.autonomyLevel).toBe("auto_within_limits");
  });

  it("PATCH /api/habitat/goals/:id/autonomy → 200 + GoalAutonomyResult", async () => {
    const res = await httpRequest(
      "PATCH",
      `${baseUrl}/api/habitat/goals/goal-trip/autonomy`,
      { autonomy: "observe_only" },
    );
    expect(res.statusCode).toBe(200);
    const result = parseBody<{ ok: boolean; goalId: string; autonomy: string }>(res.body);
    expect(result.ok).toBe(true);
    expect(result.goalId).toBe("goal-trip");
    expect(result.autonomy).toBe("observe_only");
  });

  it("PATCH /api/habitat/goals/:id/autonomy — 无效 autonomy → 400", async () => {
    const res = await httpRequest(
      "PATCH",
      `${baseUrl}/api/habitat/goals/goal-trip/autonomy`,
      { autonomy: "invalid_level" },
    );
    expect(res.statusCode).toBe(400);
    const result = parseBody<{ ok: boolean; error: string }>(res.body);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_autonomy");
  });

  it("PATCH /api/habitat/goals/:id/autonomy — 缺少 autonomy 字段 → 400", async () => {
    const res = await httpRequest(
      "PATCH",
      `${baseUrl}/api/habitat/goals/goal-trip/autonomy`,
      {},
    );
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/habitat/memories/:id/confirm → 200 + MemoryConfirmResult", async () => {
    const res = await httpRequest("POST", `${baseUrl}/api/habitat/memories/mem-006/confirm`);
    expect(res.statusCode).toBe(200);
    const result = parseBody<{ ok: boolean; memoryId: string; confirmed: boolean }>(res.body);
    expect(result.ok).toBe(true);
    expect(result.memoryId).toBe("mem-006");
    expect(result.confirmed).toBe(true);
  });

  it("POST /api/habitat/memories/:id/confirm — 确认后 userConfirmed = true", async () => {
    // mem-006 初始 userConfirmed = false
    const confirmRes = await httpRequest("POST", `${baseUrl}/api/habitat/memories/mem-006/confirm`);
    expect(confirmRes.statusCode).toBe(200);

    const snapshotRes = await httpRequest("GET", `${baseUrl}/api/habitat/snapshot`);
    const snapshot = parseBody<{ memories: Array<{ id: string; userConfirmed: boolean }> }>(snapshotRes.body);
    const memory = snapshot.memories.find((m) => m.id === "mem-006");
    expect(memory?.userConfirmed).toBe(true);
  });

  // ===== 404 错误处理 =====

  it("POST /api/habitat/requests/:id/approve — 不存在的 id → 404", async () => {
    const res = await httpRequest("POST", `${baseUrl}/api/habitat/requests/nonexistent/approve`);
    expect(res.statusCode).toBe(404);
    const result = parseBody<{ ok: boolean; error: string }>(res.body);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("request_not_found");
  });

  it("POST /api/habitat/requests/:id/reject — 不存在的 id → 404", async () => {
    const res = await httpRequest("POST", `${baseUrl}/api/habitat/requests/nonexistent/reject`);
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/habitat/requests/:id/auto-authorize — 不存在的 id → 404", async () => {
    const res = await httpRequest("POST", `${baseUrl}/api/habitat/requests/nonexistent/auto-authorize`);
    expect(res.statusCode).toBe(404);
  });

  it("PATCH /api/habitat/goals/:id/autonomy — 不存在的 id → 404", async () => {
    const res = await httpRequest(
      "PATCH",
      `${baseUrl}/api/habitat/goals/nonexistent/autonomy`,
      { autonomy: "observe_only" },
    );
    expect(res.statusCode).toBe(404);
    const result = parseBody<{ ok: boolean; error: string }>(res.body);
    expect(result.error).toBe("goal_not_found");
  });

  it("POST /api/habitat/memories/:id/confirm — 不存在的 id → 404", async () => {
    const res = await httpRequest("POST", `${baseUrl}/api/habitat/memories/nonexistent/confirm`);
    expect(res.statusCode).toBe(404);
    const result = parseBody<{ ok: boolean; error: string }>(res.body);
    expect(result.error).toBe("memory_not_found");
  });
});
