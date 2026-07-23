# Vendor Nested Repo Status

## 当前结论

`skills/ECC` 是父仓库以 gitlink 形式记录的嵌套 Git 仓库：

- 父仓库记录的 gitlink commit：`81af40761939056ab3dc54732fd4f562a27309d0`
- 当前分支：`main`
- 当前 dirty 文件：`package-lock.json`、`yarn.lock`
- dirty 类型：锁文件版本漂移，未发现 Agent OS 主项目源码变更
- `.gitmodules`：不存在，因此它不是父仓库正式声明的 submodule

## 处理决策

本轮不回滚、不提交 `skills/ECC` 内部锁文件漂移。

原因：

- `skills/ECC` 属于第三方技能仓库内容，不属于 Agent OS 主项目源码。
- 锁文件漂移可能来自此前技能安装或包管理器解析，不应在未确认上游语义时由主项目自动改写。
- 父仓库 P7 已完成提交，剩余 `git status` 中的 `m skills/ECC` 表示嵌套仓库工作区 dirty，不表示父仓库 `src/*` 或治理文档仍未收口。

## 后续处理选项

如需完全清空工作区，有三种显式路径：

1. 在 `skills/ECC` 内确认锁文件漂移来自预期依赖升级后，单独提交到该仓库，再由父仓库更新 gitlink。
2. 在 `skills/ECC` 内确认锁文件漂移无价值后，由人工显式批准回滚该嵌套仓库锁文件。
3. 将 `skills/ECC` 迁移为正式 submodule，并补充 `.gitmodules`，再定义 vendor update SOP。

## 边界

- 不读取或提交 API key / token / credential。
- 不修改 P0-P7 已封版语义。
- 不接真实 MCP。
- 不接真实外部服务。
- 不把第三方 vendor lockfile drift 混入 Agent OS 主项目实现提交。
