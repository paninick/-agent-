/**
 * server/auth.ts — #3 JWT 用户认证
 *
 * 务实方案：
 *   - 单用户模式（管理员凭据从环境变量读取，不维护用户表）
 *   - POST /api/auth/login 验证凭据后颁发 JWT
 *   - authMiddleware 验证 Authorization: Bearer <token>
 *   - AUTH_ENABLED=true 时启用，否则跳过（开发模式友好）
 *
 * 环境变量：
 *   - AUTH_ENABLED: "true" 启用认证（默认不启用）
 *   - JWT_SECRET: HMAC 签名密钥（启用时必需）
 *   - ADMIN_USERNAME: 管理员用户名（默认 "admin"）
 *   - ADMIN_PASSWORD: 管理员密码（启用时必需）
 *   - JWT_EXPIRES_IN: 过期时间（默认 "24h"）
 */

import { Router, type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

export interface AuthConfig {
  enabled: boolean;
  secret: string;
  adminUsername: string;
  adminPassword: string;
  expiresIn: string;
}

/** 从环境变量读取认证配置。enabled=false 时返回禁用状态。 */
export function readAuthConfig(): AuthConfig {
  const enabled = process.env.AUTH_ENABLED === "true";
  return {
    enabled,
    secret: process.env.JWT_SECRET ?? "",
    adminUsername: process.env.ADMIN_USERNAME ?? "admin",
    adminPassword: process.env.ADMIN_PASSWORD ?? "",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "24h",
  };
}

/** 启动时校验认证配置 — 返回缺失项列表（空数组表示通过）。 */
export function validateAuthConfig(config: AuthConfig): string[] {
  const errors: string[] = [];
  if (!config.enabled) return errors;
  if (!config.secret) errors.push("JWT_SECRET 未设置");
  if (!config.adminPassword) errors.push("ADMIN_PASSWORD 未设置");
  return errors;
}

export interface LoginBody {
  username?: string;
  password?: string;
}

export interface AuthTokenPayload {
  sub: string;
  role: "admin";
  iat?: number;
  exp?: number;
}

/** 颁发 JWT */
export function signToken(payload: Omit<AuthTokenPayload, "iat" | "exp">, config: AuthConfig): string {
  return jwt.sign(payload, config.secret, { expiresIn: config.expiresIn as jwt.SignOptions["expiresIn"] });
}

/** 验证 JWT — 成功返回 payload，失败返回 null */
export function verifyToken(token: string, config: AuthConfig): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.secret) as JwtPayload;
    if (typeof decoded.sub !== "string") return null;
    return {
      sub: decoded.sub,
      role: "admin",
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}

/**
 * 认证中间件 — 验证 Authorization: Bearer <token>。
 * 仅当 config.enabled=true 时执行验证；否则直接放行。
 */
export function createAuthMiddleware(config: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.enabled) {
      next();
      return;
    }
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({
        ok: false,
        error: "missing_token",
        message: "Authorization: Bearer <token> 头缺失",
      });
      return;
    }
    const token = header.slice(7);
    const payload = verifyToken(token, config);
    if (!payload) {
      res.status(401).json({
        ok: false,
        error: "invalid_token",
        message: "JWT 无效或已过期",
      });
      return;
    }
    (req as Request & { user?: AuthTokenPayload }).user = payload;
    next();
  };
}

/** 创建认证路由 — POST /api/auth/login（公开）+ GET /api/auth/verify（需认证） */
export function createAuthRouter(config: AuthConfig): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(config);

  router.post("/login", (req, res) => {
    const { username, password } = (req.body ?? {}) as LoginBody;
    if (!username || !password) {
      res.status(400).json({
        ok: false,
        error: "invalid_input",
        message: "username 和 password 必填",
      });
      return;
    }
    if (username !== config.adminUsername || password !== config.adminPassword) {
      res.status(401).json({
        ok: false,
        error: "invalid_credentials",
        message: "用户名或密码错误",
      });
      return;
    }
    const token = signToken({ sub: username, role: "admin" }, config);
    res.json({
      ok: true,
      token,
      tokenType: "Bearer",
      expiresIn: config.expiresIn,
    });
  });

  /** 验证当前 token 是否有效 */
  router.get("/verify", authMiddleware, (req, res) => {
    const user = (req as Request & { user?: AuthTokenPayload }).user;
    if (!user) {
      res.status(401).json({ ok: false, error: "no_user" });
      return;
    }
    res.json({ ok: true, user: { sub: user.sub, role: user.role } });
  });

  return router;
}
