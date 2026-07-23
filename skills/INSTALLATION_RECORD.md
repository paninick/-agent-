# Skills 安装记录

> **日期**：2026-07-01 22:10
> **安装方式**：git clone + npm install -g

---

## 已安装清单（14/14 ⭐ 核心项目）

### Git 仓库（10 个）

| # | 项目 | 路径 | Stars | 用途 |
|---|------|------|-------|------|
| 1 | ECC | `skills/ECC/` | 224K | 跨 harness Agent OS（67 agents + 277 skills） |
| 2 | Superpowers | `skills/superpowers/` | 96K | 14 个开发纪律技能 |
| 3 | Anthropic Skills | `skills/anthropic-skills/` | 157K | 官方 Skills 规范 |
| 4 | mattpocock Skills | `skills/mattpocock-skills/` | 144K | grill-me + diagnose + to-prd |
| 5 | Composio Skills | `skills/composio-skills/` | 66.5K | 1000+ App 集成 |
| 6 | VoltAgent OpenClaw | `skills/openclaw-skills/` | 50.8K | 5300+ OpenClaw Skills |
| 7 | Marketing Skills | `skills/marketing-skills/` | 35.7K | 42 个营销技能 |
| 8 | Agent-Reach | `skills/agent-reach/` | 47.9K | 多平台互联网读取 |
| 9 | National Stats Source | `skills/national-stats-source/` | — | 国统局 MCP 源码 |
| 10 | Trail of Bits | `skills/trailofbits-skills/` | 4.1K | 安全审计 skills（static-analysis/variant/differential） |

### npm 全局包（3 个）

| # | 包名 | 版本 | 用途 |
|---|------|------|------|
| 1 | national-stats-mcp | 1.2.0 | 国统局数据查询 MCP |
| 2 | firecrawl | 4.29.0 | 网页抓取/爬虫/监控 |
| 3 | @smithery/cli | 4.11.1 | MCP 服务器注册表安装器 |

---

## 总计

- Git 仓库：10 个
- npm 全局包：3 个
- 总文件数：~18,000+
- 总大小：~250MB

## 后续配置

1. ECC → 需要配置到 Claude Code/Codex/Cursor
2. national-stats-mcp → 需要配置到 Claude Desktop
3. firecrawl → 需要 FIRECRAWL_API_KEY
4. Smithery CLI → 可直接使用 `npx @smithery/cli install <server>`
5. 通达信 MCP → 需要注册账号
6. 企查查/天眼查 MCP → 需要 API Key
