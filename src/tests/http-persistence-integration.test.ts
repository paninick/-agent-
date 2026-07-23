/**
 * http-persistence-integration.test.ts — #6 Neon 持久化集成测试
 *
 * 验证：
 *   1. SwarmOrchestrator 接受 persistence 参数并暴露 getPersistence()
 *   2. /api/health 端点暴露持久化状态（默认 memory，注入后 neon）
 *   3. NEON_PERSISTENCE=1 但 DATABASE_URL 缺失时记录警告
 *   4. 默认生产模式（无环境变量）下 persistence 为 undefined
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server";
import { FakeModelGateway } from "../integration";
import { SwarmOrchestrator } from "../runtime";
import type { PersistenceBackend, PersistedState } from "../intelligence/memory/persistence/adapter";

// ===== Fixtures =====

function makeGateway(): FakeModelGateway {
  return new FakeModelGateway({ responses: {} });
}

/** Minimal stub implementing PersistenceBackend interface for testing. */
function makeFakePersistence(): PersistenceBackend {
  return {
    ensureDirs: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ entries: [], associations: [], reflexes: [] } satisfies PersistedState),
    commitEntry: vi.fn().mockResolvedValue(undefined),
    commitAssociation: vi.fn().mockResolvedValue(undefined),
    commitReflex: vi.fn().mockResolvedValue(undefined),
    compact: vi.fn().mockResolvedValue(undefined),
    compactAll: vi.fn().mockResolvedValue(undefined),
    rebuildIndex: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

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

function httpRequest(method: string, url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ===== Tests =====

describe("#6 Neon 持久化集成 — SwarmOrchestrator 注入", () => {
  it("未传入 persistence 时 getPersistence() 返回 undefined", () => {
    const orchestrator = new SwarmOrchestrator();
    expect(orchestrator.getPersistence()).toBeUndefined();
  });

  it("传入 persistence 时 getPersistence() 返回同一实例", () => {
    const fake = makeFakePersistence();
    const orchestrator = new SwarmOrchestrator({ persistence: fake });
    expect(orchestrator.getPersistence()).toBe(fake);
  });
});

describe("#6 Neon 持久化集成 — /api/health 端点", () => {
  let server: { baseUrl: string; close: () => Promise<void> };

  afterEach(async () => {
    if (server) await server.close();
  });

  it("默认（未注入 persistence）返回 backend=memory", async () => {
    // 注入一个无 persistence 的 orchestrator（测试模式）
    const orchestrator = new SwarmOrchestrator();
    const app = createApp(makeGateway(), orchestrator);
    server = await startServer(app);

    const res = await httpRequest("GET", `${server.baseUrl}/api/health`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.persistence).toEqual({ enabled: false, backend: "memory" });
  });

  it("注入 persistence 后返回 backend=neon", async () => {
    const fake = makeFakePersistence();
    const orchestrator = new SwarmOrchestrator({ persistence: fake });
    const app = createApp(makeGateway(), orchestrator);
    server = await startServer(app);

    const res = await httpRequest("GET", `${server.baseUrl}/api/health`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.persistence).toEqual({ enabled: true, backend: "neon" });
  });
});

describe("#6 Neon 持久化集成 — 启动日志", () => {
  let originalNeon: string | undefined;
  let originalDbUrl: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalNeon = process.env.NEON_PERSISTENCE;
    originalDbUrl = process.env.DATABASE_URL;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalNeon === undefined) delete process.env.NEON_PERSISTENCE;
    else process.env.NEON_PERSISTENCE = originalNeon;
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("默认（NEON_PERSISTENCE 未设置）记录纯内存模式日志", () => {
    delete process.env.NEON_PERSISTENCE;
    delete process.env.DATABASE_URL;
    createApp(makeGateway());
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[persistence]"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("纯内存模式"));
  });

  it("NEON_PERSISTENCE=1 但 DATABASE_URL 缺失时记录警告", () => {
    process.env.NEON_PERSISTENCE = "1";
    delete process.env.DATABASE_URL;
    createApp(makeGateway());
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEON_PERSISTENCE=1 但 DATABASE_URL 未设置"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("纯内存模式"));
  });
});
