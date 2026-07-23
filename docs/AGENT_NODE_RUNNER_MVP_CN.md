# Agent Node Runner MVP

## 定位

Agent Node Runner MVP 是 Agent OS v2 的本地半自动节点编排辅助器。

它只负责：
- 生成节点提示词。
- 检查节点输出字段。
- 检查 Git diff 是否越过节点文件边界。
- 运行本地验证命令并记录结果。

它不是 Agent OS runtime，不是 P4.1 MCP Transport，不是模型 API 调用器，不是 ZCode / Codex UI 控制器，也不是自动封版系统。

## 不实现内容

- 不调用 OpenAI / Claude / DeepSeek / GLM / Doubao 等真实模型 API。
- 不读取 API key、token、cookie、credential 或 Secret Manager。
- 不连接真实 MCP server。
- 不创建 `.mcp.json`。
- 不控制 ZCode、Codex、Claude Code 或浏览器 UI。
- 不自动 approve、seal、merge、commit、push、deploy。
- 不引入 npm 依赖，不修改 `package.json`。

## 配置

配置文件位于：

```text
.agent-os/node-runner.config.json
```

核心字段：
- `projectRoot`: 项目根目录。
- `currentPhase`: 当前阶段。
- `currentRun`: 当前节点流程目录，供人工和跨工具 handoff 对齐。
- `documentedDirtyFiles`: 已由 release/governance 文档确认的既存 dirty path。`check-diff` 会报告这些路径，但不把它们归因于当前节点修改。
- `sealedPhases`: 已封版阶段。
- `nodes`: N0-N7 节点配置。
- `model`: 节点推荐模型。
- `writeAllowed`: 当前节点是否允许写文件。
- `promptTemplate`: 节点 prompt 模板。
- `allowedFiles`: 节点允许修改的文件。
- `forbiddenFiles`: 节点禁止修改的文件。
- `requiredOutputFields`: 节点输出必须包含的字段。
- `validationCommands`: N5 验证命令列表。

配置语义边界：

- `node-runner.config.json` 是本地 operator convenience 文件，用来生成 prompt、检查输出字段、检查 diff 边界和运行验证命令。
- 它不是已封版阶段的唯一真相源，不得覆盖 README、CHANGELOG、release seal 文档、runbook 或 release registry 输出。
- 当 release seal 文档与 runner config 发生漂移时，以 release seal / runbook / changelog 为准，并通过后续节点同步 runner config。
- `node-runner.yaml` 是人工/跨工具可读参考；当前脚本实际读取 `node-runner.config.json`。
- `documentedDirtyFiles` 不是修改许可，不等于 `allowedFiles`；它只用于避免既存 vendor drift 阻断当前节点 diff gate。

## 推荐流程

1. 生成节点提示词：

```bash
node scripts/agent-node-runner.mjs make-prompt --run <run> --node N1_LONG_CONTEXT_ARCH_REVIEW
```

2. 用户把生成的 `.prompt.md` 复制给对应模型。

3. 用户把模型输出保存为：

```text
.agent-os/runs/<run>/<node>.output.md
```

4. 检查节点输出：

```bash
node scripts/agent-node-runner.mjs check-output --run <run> --node N1_LONG_CONTEXT_ARCH_REVIEW
```

5. 对写代码节点检查 diff 边界：

```bash
node scripts/agent-node-runner.mjs check-diff --node N3_IMPLEMENTATION
```

6. 运行验证命令：

```bash
node scripts/agent-node-runner.mjs run-validation --run <run>
```

## 关键人工确认点

- N3 diff 必须人工确认没有越界修改。
- N5 validation 必须人工确认 lint/typecheck/test/build/verify:intelligence 的结果。
- N7 release seal 必须由 Release Seal Owner 判断，不允许 runner 自动封版。

## File-Based Planning 兼容模式

Agent Node Runner 可以吸收第三方 `planning-with-files` 的文件化计划思想，但当前不安装该外部 Skill，不启用 hooks，不引入 completion gate，也不把它作为项目真相源。

推荐在每个 run 目录中维护：

```text
.agent-os/runs/<run>/task_plan.md
.agent-os/runs/<run>/findings.md
.agent-os/runs/<run>/progress.md
```

语义边界：

- `task_plan.md` 是人工计划文件，不等于 P1 `TaskPlan` 类型。
- `findings.md` 是审查发现记录，不等于 N5 validation 结果。
- `progress.md` 是节点推进记录，不等于 P1 `Run.status`。
- 这些文件只能辅助 Handoff Packet，不能绕过 `check-output`、`check-diff`、`run-validation` 或 N7 release seal。

## 输出状态

`check-output` 接受以下 `STATUS`：

```text
PASS
REVISE
BLOCK
DONE
SEALED
NOT_SEALED
ENV_BLOCK
```

其中 `BLOCK`、`REVISE`、`ENV_BLOCK` 会停止流程并返回退出码 2。

## 当前限制

- Runner 只使用 Node.js 内置模块。
- Runner 只做静态文件和命令检查。
- `check-diff` 只检查 tracked / staged diff，不检查未跟踪文件。
- `check-diff` 会把 `documentedDirtyFiles` 中的路径写入 `DOCUMENTED_DIRTY_FILES_IGNORED`，但不会把它们作为当前节点越界修改。
- 路径匹配只支持精确路径和 `/**` 前缀规则。
- `--run` 支持完整 run 目录名，也支持能匹配目录后缀的短别名；例如 `p9-node-runner-config-sync` 可匹配 `2026-07-05-p9-node-runner-config-sync`。
- Runner config 同步不等于阶段封版；N7 release seal 仍是唯一封版判断节点。
