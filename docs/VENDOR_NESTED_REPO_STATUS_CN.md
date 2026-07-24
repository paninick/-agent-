# Vendor Nested Repo Status

## 当前结论

十个第三方技能仓库现在都以正式 Git submodule 声明并固定到父仓库记录的 commit。
其中 `skills/ECC`：

- 父仓库记录的 gitlink commit：`81af40761939056ab3dc54732fd4f562a27309d0`
- `.gitmodules`：已声明，URL 指向上游 `affaan-m/ECC`
- 全新递归克隆：可恢复到上述精确 commit
- 当前父仓库验收：submodule 无本地 dirty

## 处理决策

不在父仓库热修复中改写或提交任何第三方 submodule 的内容。

原因：

- `skills/ECC` 属于第三方技能仓库内容，不属于 Agent OS 主项目源码。
- 第三方内容必须由上游独立维护。
- 父仓库只记录经确认存在的固定 commit，并通过技能审计隔离未通过项。

## 后续处理选项

标准克隆与修复命令：

```bash
git clone --recurse-submodules https://github.com/paninick/-agent-.git
git submodule update --init --recursive
```

更新任一 vendor commit 必须单独审查上游差异、重新运行
`npm run verify:skills`，再由父仓库提交新的 gitlink。

## 边界

- 不读取或提交 API key / token / credential。
- 不修改 P0-P7 已封版语义。
- 不接真实 MCP。
- 不接真实外部服务。
- 不把第三方 vendor lockfile drift 混入 Agent OS 主项目实现提交。
