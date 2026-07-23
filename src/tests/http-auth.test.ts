/**
 * http-auth.test.ts — #3 JWT 用户认证集成测试
 *
 * 验证：
 *   1. POST /api/auth/login — 登录成功/失败
 *   2. GET /api/auth/verify — token 验证
 *   3. authMiddleware — 启用/未启用时的行为
 *   4. 受保护端点 — /api/runs 需要 token
 *   5. 公开端点 — /api/health 不需要 token
 *   6. 配置校验 — 缺失配置时回退到放行
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../server";
import { FakeModelGateway } from "../integration";
import {
  createAuthMiddleware,
  createAuthRouter,
  readAuthConfig,
  signToken,
  verifyToken,
  validateAuthConfig,
  type AuthConfig,
} from "../server/auth";

// ===== Fixtures =====

function makeGateway(): FakeModelGateway {
  return new FakeModelGateway({ responses: {} });
}

function makeAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    enabled: true,
    secret: "test-secret-at-least-16-chars",
    adminUsername: "admin",
    adminPassword: "test-password-8",
    expiresIn: "1h",
    ...overrides,
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

function httpRequest(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqHeaders: Record<string, string> = { ...headers };
    if (body !== undefined) reqHeaders["Content-Type"] = "application/json";
    const req = http.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: reqHeaders,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

// ===== 单元测试 — auth 模块 =====

describe("#3 JWT auth 模块 — signToken / verifyToken", () => {
  const config = makeAuthConfig();

  it("signToken 颁发的 token 可被 verifyToken 验证", () => {
    const token = signToken({ sub: "admin", role: "admin" }, config);
    const payload = verifyToken(token, config);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("admin");
    expect(payload?.role).toBe("admin");
  });

  it("verifyToken 拒绝用错误密钥签名的 token", () => {
    const token = signToken({ sub: "admin", role: "admin" }, config);
    const wrongConfig = { ...config, secret: "wrong-secret-also-16-chars" };
    const payload = verifyToken(token, wrongConfig);
    expect(payload).toBeNull();
  });

  it("verifyToken 拒绝无效字符串", () => {
    const payload = verifyToken("not-a-jwt", config);
    expect(payload).toBeNull();
  });
});

describe("#3 JWT auth 模块 — validateAuthConfig", () => {
  it("disabled 配置总是通过", () => {
    const errors = validateAuthConfig(makeAuthConfig({ enabled: false }));
    expect(errors).toEqual([]);
  });

  it("enabled 但缺少 JWT_SECRET 报错", () => {
    const errors = validateAuthConfig(makeAuthConfig({ secret: "" }));
    expect(errors).toContain("JWT_SECRET 未设置");
  });

  it("enabled 但缺少 ADMIN_PASSWORD 报错", () => {
    const errors = validateAuthConfig(makeAuthConfig({ adminPassword: "" }));
    expect(errors).toContain("ADMIN_PASSWORD 未设置");
  });

  it("enabled 且配置完整时通过", () => {
    const errors = validateAuthConfig(makeAuthConfig());
    expect(errors).toEqual([]);
  });
});

// ===== HTTP 集成测试 — /api/auth/* =====

describe("#3 JWT auth HTTP — /api/auth/login", () => {
  let server: { baseUrl: string; close: () => Promise<void> };
  let originalAuth: string | undefined;
  let originalSecret: string | undefined;
  let originalUser: string | undefined;
  let originalPass: string | undefined;

  beforeEach(() => {
    originalAuth = process.env.AUTH_ENABLED;
    originalSecret = process.env.JWT_SECRET;
    originalUser = process.env.ADMIN_USERNAME;
    originalPass = process.env.ADMIN_PASSWORD;
    process.env.AUTH_ENABLED = "true";
    process.env.JWT_SECRET = "http-test-secret-16-chars";
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "password123";
  });

  afterEach(async () => {
    if (originalAuth === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = originalAuth;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalUser === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = originalUser;
    if (originalPass === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPass;
    if (server) await server.close();
  });

  it("正确凭据返回 JWT token", async () => {
    const app = createApp(makeGateway());
    server = await startServer(app);

    const res = await httpRequest("POST", `${server.baseUrl}/api/auth/login`, {
      username: "admin",
      password: "password123",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.tokenType).toBe("Bearer");
  });

  it("错误密码返回 401", async () => {
    const app = createApp(makeGateway());
    server = await startServer(app);

    const res = await httpRequest("POST", `${server.baseUrl}/api/auth/login`, {
      username: "admin",
      password: "wrong",
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("invalid_credentials");
  });

  it("缺少字段返回 400", async () => {
    const app = createApp(makeGateway());
    server = await startServer(app);

    const res = await httpRequest("POST", `${server.baseUrl}/api/auth/login`, {
      username: "admin",
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("invalid_input");
  });
});

describe("#3 JWT auth HTTP — /api/auth/verify", () => {
  let server: { baseUrl: string; close: () => Promise<void> };
  let originalAuth: string | undefined;
  let originalSecret: string | undefined;
  let originalPass: string | undefined;

  beforeEach(() => {
    originalAuth = process.env.AUTH_ENABLED;
    originalSecret = process.env.JWT_SECRET;
    originalPass = process.env.ADMIN_PASSWORD;
    process.env.AUTH_ENABLED = "true";
    process.env.JWT_SECRET = "verify-test-secret-16-chars";
    process.env.ADMIN_PASSWORD = "password123";
  });

  afterEach(async () => {
    if (originalAuth === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = originalAuth;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalPass === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPass;
    if (server) await server.close();
  });

  it("有效 token 返回用户信息", async () => {
    const app = createApp(makeGateway());
    server = await startServer(app);

    // 先登录获取 token
    const loginRes = await httpRequest("POST", `${server.baseUrl}/api/auth/login`, {
      username: "admin",
      password: "password123",
    });
    const token = JSON.parse(loginRes.body).token;

    // 用 token 验证
    const res = await httpRequest("GET", `${server.baseUrl}/api/auth/verify`, undefined, {
      Authorization: `Bearer ${token}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.user.sub).toBe("admin");
    expect(body.user.role).toBe("admin");
  });

  it("无 token 返回 401", async () => {
    const app = createApp(makeGateway());
    server = await startServer(app);

    const res = await httpRequest("GET", `${server.baseUrl}/api/auth/verify`);
    expect(res.statusCode).toBe(401);
  });
});

// ===== HTTP 集成测试 — 受保护端点 =====

describe("#3 JWT auth HTTP — 受保护端点", () => {
  let server: { baseUrl: string; close: () => Promise<void> };
  let originalAuth: string | undefined;
  let originalSecret: string | undefined;
  let originalPass: string | undefined;

  beforeEach(() => {
    originalAuth = process.env.AUTH_ENABLED;
    originalSecret = process.env.JWT_SECRET;
    originalPass = process.env.ADMIN_PASSWORD;
  });

  afterEach(async () => {
    if (originalAuth === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = originalAuth;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalPass === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPass;
    if (server) await server.close();
  });

  it("AUTH_ENABLED=true 时 /api/runs 无 token 返回 401", async () => {
    process.env.AUTH_ENABLED = "true";
    process.env.JWT_SECRET = "protect-test-secret-16";
    process.env.ADMIN_PASSWORD = "password123";
    const app = createApp(makeGateway());
    server = await startServer(app);

    const res = await httpRequest("GET", `${server.baseUrl}/api/runs`);
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("missing_token");
  });

  it("AUTH_ENABLED=true 时 /api/health 仍可公开访问", async () => {
    process.env.AUTH_ENABLED = "true";
    process.env.JWT_SECRET = "health-test-secret-16";
    process.env.ADMIN_PASSWORD = "password123";
    const app = createApp(makeGateway());
    server = await startServer(app);

    const res = await httpRequest("GET", `${server.baseUrl}/api/health`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.authEnabled).toBe(true);
  });

  it("AUTH_ENABLED 未设置时 /api/runs 可公开访问", async () => {
    delete process.env.AUTH_ENABLED;
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_PASSWORD;
    const app = createApp(makeGateway());
    server = await startServer(app);

    const res = await httpRequest("GET", `${server.baseUrl}/api/runs`);
    expect(res.statusCode).toBe(200);
  });

  it("AUTH_ENABLED=true 且带有效 token 时 /api/runs 可访问", async () => {
    process.env.AUTH_ENABLED = "true";
    process.env.JWT_SECRET = "token-test-secret-16-chars";
    process.env.ADMIN_PASSWORD = "password123";
    const app = createApp(makeGateway());
    server = await startServer(app);

    // 登录获取 token
    const loginRes = await httpRequest("POST", `${server.baseUrl}/api/auth/login`, {
      username: "admin",
      password: "password123",
    });
    const token = JSON.parse(loginRes.body).token;

    // 带 token 访问 /api/runs
    const res = await httpRequest("GET", `${server.baseUrl}/api/runs`, undefined, {
      Authorization: `Bearer ${token}`,
    });
    expect(res.statusCode).toBe(200);
  });
});
