# 变更日志

> **维护者**：项目团队
> **格式**：每个版本记录日期、主要变更、原因

---

## v1.0 (2026-06-30) - 初版完整文档体系

### 建立
- [x] 00_INDEX.md - 项目入口
- [x] 01_MASTER_PLAN.md - 总体规划
- [x] 02_DATA_SOURCE_REGISTRY.md - 数据源分级注册表
- [x] 03_AGENT_SOP.md - 7 个 Agent 角色 SOP
- [x] 04_CODE_SOP.md - 代码 SOP
- [x] 05_VERIFICATION_STANDARDS.md - 验证标准
- [x] 06_USER_REQUIREMENTS.md - 用户需求
- [x] 07_BRANCH_ROADMAP.md - DeepSeek 生成流程
- [x] 10_PROBE_RESULTS.md - 实测数据记录
- [x] 20_REAL_DATA_INSIGHTS.md - 真实数据洞察
- [x] 30_DOWNLOADED_DATA_INDEX.md - 已下载数据索引

### 关键技术决策

1. **数据源优先级**：S 级（原始一手） > A+（上市公司）> A（权威）> B+（券商）> B（媒体）> C（未验证）
2. **数据真实性 > 数量**：排除 ImportGenius 等付费数据源
3. **OS Hub 限制处理**：新用户 Key 审批延迟 → 用企查查/天眼查 + 海关反推替代
4. **DeepSeek 生成 + Claude 审核**：两阶段代码生产流水线
5. **多模型协作**：Reasoner 用 Opus, Devil's Advocate 用 DeepSeek Pro（避免同源偏见）

### 实测数据里程碑

- ✓ UN Comtrade 2 个 Key 都验证可用
- ✓ FRED Key 验证可用（必须小写）
- ✓ Massive.com Key 验证可用（美股财报）
- ✓ 越南 HS60 中国占比 66.1%（颠覆性：棉花仅 25.1%）
- ✓ 美国 HS61 进口 $45.24B，中越合计 39.5%
- ✓ 美国 HS6109 T 恤市场被中美洲主导 36%

### 已知问题
- 孟加拉数据 Comtrade 未收录（需 BGMEA 替代）
- 越南 2024 数据 Comtrade 暂不可用
- Open Supply Hub API Key 申请受限
- 越南 2023 netWgt 部分缺失（0 值）

### 关键排除项
- ImportGenius (付费) → 排除
- Open Supply Hub (受限) → P1 限制
- 一切未验证群消息/匿名转载 → 禁止

### 下一步
1. 启动 DeepSeek 自动生成第一批 4 个核心脚本
2. Claude 审核 + 测试验证
3. 验证通过后入库
4. 启动第二批 8 个脚本生成

---

## 历史版本

- (无) - 这是第一个正式版本