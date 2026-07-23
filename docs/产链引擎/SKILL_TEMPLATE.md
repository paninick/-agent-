---
name: <skill-name>
display_name: <中文显示名称>
description: <一句话描述，说明此 Skill 的核心功能>
version: 1.0.0
author: <作者名>
category: <数据采集 | 数据分析 | 因果校准 | 报告生成 | 其他>
discipline: <经济学 | 地理学 | 政治学 | 社会学 | 环境科学 | 技术学 | 跨学科>
industry_scope: <all | textile | electronics | agriculture | energy | pharmaceutical | custom>
triggers:
  - <关键词1>
  - <关键词2>
  - <关键词3>
preconditions:
  - <前置条件1，如：网络连接正常>
  - <前置条件2，如：API Key 已配置>
data_quality_level: <A+ | A | B | C>
external_dependencies:
  - <依赖的 MCP Server 或外部 API>
output_schema:
  type: object
  properties:
    <field1>:
      type: <string | number | boolean | array>
      description: <字段说明>
    <field2>:
      type: <string | number>
      description: <字段说明>
references:
  - <外部文档链接>
---

# <Skill 显示名称>

## 概述

<用 2-3 句话简要说明此 Skill 的作用、适用场景和核心价值。>

## 触发条件

当用户提出以下类型的请求时，自动激活此 Skill：

- `<关键词1>`
- `<关键词2>`
- `<包含关键词的自然语言描述>`

## 前置条件

执行此 Skill 前，必须确保：

1. ✅ <条件1>
2. ✅ <条件2>
3. ✅ <条件3>

如果任一条件不满足，应返回明确的错误提示，引导用户解决。

## 输入参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `<param1>` | string | 是 | - | <参数说明> |
| `<param2>` | number | 否 | 0 | <参数说明> |
| `<param3>` | array | 否 | [] | <参数说明> |

## 执行步骤

### Step 1: <步骤名称>

<详细描述第一步的操作，包括：>
- 调用的工具或 API
- 传入的参数
- 预期的返回格式

**示例调用：**
```json
{
  "tool": "<tool_name>",
  "arguments": {
    "<arg1>": "<value1>"
  }
}
```

### Step 2: <步骤名称>

<详细描述第二步的操作。>

### Step 3: <步骤名称>

<详细描述第三步的操作。>

## 输出结果

执行成功后，返回符合 `output_schema` 定义的 JSON 对象：

```json
{
  "<field1>": "<value1>",
  "<field2>": <value2>,
  "<field3>": [<item1>, <item2>]
}
```

## 数据质量说明

- **可信度等级**：<A+ | A | B | C>
- **数据来源**：<具体来源名称>
- **更新频率**：<实时 / 每日 / 每周 / 每月>
- **交叉验证要求**：<如有，说明需要哪些 A 级源进行验证>

## 错误处理

| 错误场景 | 错误码 | 处理方式 |
|---------|--------|---------|
| <场景1> | ERR_<CODE1> | <处理建议> |
| <场景2> | ERR_<CODE2> | <处理建议> |
| 网络超时 | ERR_TIMEOUT | 重试 3 次，间隔 2 秒 |
| API 限流 | ERR_RATE_LIMIT | 等待 60 秒后重试 |

## 使用示例

### 示例 1：基础用法

**用户输入：**
> <典型的用户提问>

**Skill 执行：**
1. 解析用户意图，提取关键参数
2. 调用 <工具/API>
3. 返回结果

**输出：**
```json
{
  "<field1>": "<example_value1>",
  "<field2>": <example_value2>
}
```

### 示例 2：带参数的用法

**用户输入：**
> <带特定参数的用户提问>

**Skill 执行：**
<详细说明>

**输出：**
```json
{
  "<field1>": "<example_value1>",
  "<field2>": <example_value2>
}
```

## 注意事项

- ⚠️ <重要提醒1>
- ⚠️ <重要提醒2>
- 💡 <最佳实践建议>

## 版本历史

| 版本 | 日期 | 变更说明 | 作者 |
|------|------|---------|------|
| 1.0.0 | 2026-07-02 | 初始版本 | <作者名> |

## 相关 Skill

- [`<related_skill_1>`](./<related_skill_1>.md) - <简短描述>
- [`<related_skill_2>`](./<related_skill_2>.md) - <简短描述>

---

*本模板遵循产链引擎 v3 Skill 规范 v1.0*
*最后更新：2026-07-02*
