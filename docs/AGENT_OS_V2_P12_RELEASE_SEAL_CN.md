# P12 Release Seal — Runs API Surface (HTTP 路由暴露 Runtime Approval/Resume 工作流)

**Sealed at**: 2026-07-05  
**Phase**: P12_RUNS_API_SURFACE  
**Commit**: (pending)  
**Test count**: 292 tests / 26 files (+13 from P11)

## 概述

P12 将 `SwarmOrchestrator` + `MemoryRunStore` 的 approval/resume 工作流通过 7 个 REST 端点暴露为 HTTP API，完成了 Runtime 层与 HTTP 层的桥梁连接。

## 新增端点

| Method | Path | 状态码 | 描述 |
|--------|------|--------|------|
| POST | `/api/runs` | 201 / 400 | 创建 run（`{ intent: string }`） |
| GET | `/api/runs` | 200 | 列出所有 run |
| GET | `/api/runs/:runId` | 200 / 404 | 查询单个 run 状态 |
| POST | `/api/runs/:runId/approve` | 200 / 404 / 409 | 批准 waiting_approval run |
| POST | `/api/runs/:runId/reject` | 200 / 404 / 409 | 拒绝 waiting_approval run |
| POST | `/api/runs/:runId/resume` | 200 / 404 / 409 | 恢复 paused run 至完成 |
| GET | `/api/runs/:runId/audit` | 200 / 404 | 查看 audit 事件 |

## 设计决策

- **`createApp(gateway?, orchestrator?)`**：第二可选参数 `orchestrator` 用于测试注入，向后兼容 P11 的 `createApp(gw)` 调用。
- **错误映射**：`run_not_found` → 404，`invalid_state` → 409，`ZodError` → 400。
- **零新依赖**：延续 P11 的 `http.createServer` + `http.request` 测试模式。
- **Sealed 层不变**：`src/runtime/**`、`src/agent/**`、`src/integration/**` 等全部 untouched。

## 验证

- lint: PASS (tsc --noEmit, 0 errors)
- test: PASS (26 files / 292 tests)
- build: PASS
- verify:secrets: PASS (0 findings)
- verify:release: 提交后 READY

## Sealed Phases

P0, P1, P2, P3, P4.0, P4.1, P4.2, P5, P6, P7, P8, P9, P10, P11, P12, GOV