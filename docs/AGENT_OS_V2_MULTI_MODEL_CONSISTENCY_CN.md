# Agent OS v2 多模型一致性协议

更新日期：2026-07-05

## 1. 一句话原则

多模型只分工，不分裂。所有模型必须使用同一套阶段、状态、文件边界、测试口径和封版标准。

## 2. 固定模型角色

| 角色 | 模型 |
|---|---|
| PRD Owner | glm-5.2 |
| Long Context Architecture Reviewer | longcat |
| Technical Reviewer | deepseek-v4-pro |
| Code Implementer | doubao-seed-2.0-code |
| Code Reviewer | kimi-k2.7-code |
| Validation Reviewer | deepseek-v4-pro / deepseek-v4-flash |
| Documentation Writer | doubao-seed-2.0-pro |
| Release Seal Owner | glm-5.2 |

## 3. 标准节点 N0-N7

| 节点 | 含义 |
|---|---|
| N0_PRD_LOCK | 锁定需求、边界、禁止事项和验收标准。 |
| N1_LONG_CONTEXT_ARCH_REVIEW | 用长上下文检查架构一致性和跨阶段影响。 |
| N2_TECH_REVIEW | 做技术可行性、接口、类型和风险审查。 |
| N3_IMPLEMENTATION | 在允许文件范围内实现最小闭环。 |
| N4_CODE_REVIEW | 审查 bug、边界破坏、跨层 import 和测试缺口。 |
| N5_VALIDATION | 执行 lint、typecheck、test、build 和阶段专属验证。 |
| N6_DOC_SYNC | 同步 README、CHANGELOG、Runbook 和交接说明。 |
| N7_RELEASE_SEAL | 最终封版，确认阶段语义、测试和文档一致。 |

## 4. 固定状态词

- `PASS`
- `REVISE`
- `BLOCK`
- `DONE`
- `SEALED`
- `NOT_SEALED`

除非 `STATUS = BLOCK`，否则不得输出“是否继续”“请确认是否继续”“需要我继续吗”等开放式暂停语。非阻塞节点必须给出下一节点和明确动作。

## 5. 阶段语言统一

| 阶段 | 名称 |
|---|---|
| P0 | Intelligence Verification / Source Classification |
| P1 | RunStore + Approval Resume |
| P2 | Model Selection / Model Router |
| P3 | Tool Permission Governance |
| P4.0 | MCP Gateway Static Registry + Tool Descriptor |
| P4.1 | MCP Transport Interface + Fake Transport Harness |
| P4.2 | Runtime Integration / Tool Execution Adapter |
| P5 | Skill Progressive Loading + Context Budget |
| P6 | Eval / Observability |
| P7 | Business Agent Templates |
| P8 | UI / Dashboard / Protocol Adapter |

## 6. 决策语言统一

所有模型必须区分以下标签：

- `fact`：已被代码、测试、文档或外部来源证明的事实。
- `decision`：当前阶段已经作出的实现或治理选择。
- `constraint`：必须遵守的边界。
- `risk`：可能导致失败、漂移或维护成本上升的问题。
- `recommendation`：建议但不自动执行的方向。
- `todo`：明确的后续工作。
- `prohibition`：禁止事项。

## 7. 代码命名语言统一

- TypeScript 类型：`PascalCase`
- 函数：`camelCase`
- 文件名：`camelCase.ts`
- union 值：`snake_case`
- 文档：中文为主
- 代码注释：同文件内保持一致

## 8. 测试语言统一

测试必须覆盖：

- happy path
- safe failure path
- boundary protection path

如果只测 happy path，不能进入 release seal。

## 9. Handoff Packet 标准

```text
HANDOFF_PACKET

CURRENT_PHASE:
SEALED_PHASES:
CURRENT_STAGE:
CURRENT_NODE:
STATUS:
DECISION:
FILES_ALLOWED:
FILES_FORBIDDEN:
TYPES_LOCKED:
RULES_LOCKED:
TESTS_REQUIRED:
BOUNDARY_WARNINGS:
NEXT_MODEL:
NEXT_NODE:
```

## 9.1 Context and Session Discipline

- 不依赖单一会话长期记忆；模型上下文是工作区窗口，不是项目真相源。
- 所有节点通过 Handoff Packet 交接，不能要求下一个模型重读完整聊天历史才能继续。
- Handoff Packet 必须包含 `CURRENT_PHASE`、`SEALED_PHASES`、`CURRENT_NODE`、`STATUS`、`FILES_ALLOWED`、`FILES_FORBIDDEN`、`RULES_LOCKED`、`TESTS_REQUIRED`、`NEXT_MODEL`、`NEXT_NODE`。
- 实现模型只接收锁定后的 handoff，不重新解释完整历史，不重新定义已封版阶段。
- 长上下文审查交给 `N1_LONG_CONTEXT_ARCH_REVIEW`，普通实现节点只消费被压缩后的结论和允许文件范围。
- 跨阶段切换必须重新注入 Handoff Packet，不能依赖旧会话残留。
- 恢复旧会话后必须重新声明当前节点、当前阶段、已封版阶段和禁止文件范围。

## 9.2 Parallel Agent Discipline

- 每个代理必须绑定一个明确节点。
- 每个代理必须声明 `FILES_ALLOWED` / `FILES_FORBIDDEN`。
- 并行代理不得编辑同一文件。
- 子代理输出必须汇总为 Handoff Packet，不能直接成为项目真相源。
- 子代理不得宣布 `SEALED`。
- 子代理不得修改 Roadmap。
- 子代理不得绕过 DeepSeek `N2_TECH_REVIEW` 或 GLM `N7_RELEASE_SEAL`。
- 使用 worktree / branch 隔离并行任务；没有隔离时只能串行处理共享文件。

## 9.3 Advanced Agent Surface Discipline

- workflow 不是放行节点。
- subagent 不得宣布 `SEALED`。
- 并行 agent 必须声明 `FILES_ALLOWED` / `FILES_FORBIDDEN`。
- 并行 agent 不得编辑同一文件。
- headless / scheduled / channel / deep link 输出必须转成 Handoff Packet。
- 外部入口不得绕过 `N0`-`N7`。
- 恢复会话、深链打开、无头执行后必须重新声明 `CURRENT_PHASE` / `SEALED_PHASES` / `CURRENT_NODE` / `NEXT_MODEL` / `NEXT_NODE`。

## 9.4 Vendor Doc Freshness Discipline

- 模型看到第三方镜像文档时，必须标记 freshness / source type。
- legacy docs 只能作为 historical reference。
- 当前产品实现必须交叉校验 official current docs。
- 不允许把旧文档内容直接升级为当前 Roadmap。
- Handoff Packet 中如引用 legacy docs，必须写：

```text
SOURCE_TYPE: legacy_mirror
FRESHNESS_RISK: high
CURRENT_OFFICIAL_CHECK_REQUIRED: true
```

## 9.5 OpenAI Prompt Discipline

每个模型提示词必须包含：

- `CURRENT_PHASE`
- `SEALED_PHASES`
- `CURRENT_NODE`
- `MODEL_ROLE`
- `TASK_SCOPE`
- `FILES_ALLOWED`
- `FILES_FORBIDDEN`
- `PROHIBITIONS`
- `VALIDATION_COMMANDS`
- `OUTPUT_FORMAT`
- `HANDOFF_PACKET`

禁止低信息提示：

- 继续
- 帮我看看
- 修一下
- 你自己判断

每个模型输出必须可进入下一节点，不得在非 `BLOCK` 下开放式暂停。

如引用 OpenAI 文档，必须声明 source type：

- `official_help`
- `official_platform`
- `legacy_mirror`
- `third_party`

并声明 freshness risk。legacy mirror 默认 `FRESHNESS_RISK: high`。

## 9.6 ZCode Session Discipline

- ZCode Goal / Command / Skill / Subagent / Plugin 输出都必须转成 Handoff Packet。
- ZCode `/goal` 不是 Agent OS v2 节点，不得作为 release gate。
- `/goal resume` 不等于 P1 `resumeRun(runId)`；恢复 ZCode 会话后必须重新声明 `CURRENT_PHASE` / `SEALED_PHASES` / `CURRENT_NODE` / `NEXT_MODEL` / `NEXT_NODE`。
- ZCode Goal 自动校验不等于 N5 validation，也不等于 N7 release seal。
- ZCode Command 可以承载节点提示词，但不得替代 `scripts/agent-node-runner.mjs` 的输出字段检查和 diff 边界检查。
- ZCode Skill 可以包装节点流程，但不能成为 canonical source。
- ZCode Subagent 必须绑定节点和文件边界；子智能体输出不得直接进入 `SEALED`。
- ZCode Plugin 启停会改变 Agent 能力面；跨节点或恢复会话后必须重贴 Handoff Packet，避免上下文污染。
- 引用 ZCode 官方文档时，Handoff Packet 应包含：

```text
SOURCE_TYPE: vendor_official_docs
VENDOR: ZCode
RUNTIME_INTEGRATION_ALLOWED: false
HANDOFF_REQUIRED: true
```

## 9.7 File-Based Planning Discipline

- 长任务必须优先把计划、发现、进度写入当前 run 目录，而不是依赖单一会话记忆。
- 默认文件名：
  - `.agent-os/runs/<run>/task_plan.md`
  - `.agent-os/runs/<run>/findings.md`
  - `.agent-os/runs/<run>/progress.md`
- 这些文件是 Handoff Packet 的补充材料，不是 release gate。
- `task_plan.md` 不等于 P1 `TaskPlan` 类型。
- `progress.md` 不等于 P1 `Run.status`。
- `findings.md` 不等于 N5 validation 结果。
- 任何模型恢复上下文时，必须先读取当前 run 目录下的 Handoff Packet 和计划文件，再继续输出。
- 引用第三方 planning-with-files 模式时，Handoff Packet 应包含：

```text
SOURCE_TYPE: third_party_open_source
REFERENCE: OthmanAdi/planning-with-files
INSTALLED: false
HOOKS_ENABLED: false
CANONICAL_SOURCE: false
```

## 10. Prompt 模板

```text
你正在参与 Agent OS v2 项目。
当前已封版：
当前阶段：
当前节点：
你的角色：
允许范围：
禁止范围：
必须遵守：
请输出：
STATUS:
BLOCKING_ISSUES:
NON_BLOCKING_ISSUES:
REQUIRED_ACTION:
NEXT_NODE:
HANDOFF_PACKET:
```

## 11. 常见漂移类型

- 阶段漂移：把未来阶段能力提前实现。
- 术语漂移：同一概念出现不同名字。
- 文件边界漂移：修改了当前阶段未授权文件。
- import 漂移：静态层跨层 import runtime、governance 或 intelligence。
- 真实 API 越界：在 mock 或 registry 阶段接入真实服务。
- 文档生产承诺漂移：文档承诺已经实现但代码未实现。
- 测试只测 happy path：没有覆盖失败和边界保护。
- 同义重复字段：用 boolean 重复表达 status 已经表达的语义。
- 多个真相源：README、Runbook、vendor 文件各写一套规则。

## 12. BLOCK 判定标准

出现以下情况必须 `BLOCK`：

- 修改已封版主语义。
- 跨层 import。
- 提前接真实 API / MCP / key。
- 新增未来阶段能力。
- 测试无法证明边界。
- 文档与代码矛盾。
- 运行时状态机被误改。

`BLOCK` 必须附带阻塞原因、受影响文件、最小修复动作和下一节点。

## 13. 封版标准

只有 `N7_RELEASE_SEAL` 可以输出 `SEALED`。其他节点只能说“建议进入 release seal”。

进入 `N7_RELEASE_SEAL` 前必须满足：

- 阶段范围未漂移。
- 允许文件和禁止文件被遵守。
- 类型、状态词、测试口径和文档一致。
- 验收命令或文档型验收清单已完成。
- Handoff Packet 可被下一个模型直接使用。
