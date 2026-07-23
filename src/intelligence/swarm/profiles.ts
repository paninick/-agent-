/**
 * swarm/profiles.ts — Agent 角色行为声明 + 默认工作流
 *
 * 吸收 ArkClaw 的 SOUL.md / IDENTITY.md / AGENTS.md 思想：
 *   - AgentRoleProfile = SOUL.md (boundaries) + IDENTITY.md (identity) + 契约面
 *   - DEFAULT_SWARM_WORKFLOW = AGENTS.md (声明式执行序列)
 *
 * 声明式而非注释式：orchestrator 执行时可对照 profile 做契约校验。
 * 行业无关 — 不含任何服装/纺织领域逻辑。
 */

import type { AgentRole, AgentRoleProfile, SwarmWorkflow, AgentToolDeclaration, AntiRationalizationEntry } from "../spine/types";
import type { MemoryAccessDeclaration } from "../memory/types";

// === 记忆访问声明 (per-role) ===
// 对应 MemoryBroker 的 3 种访问模式：preload (PUSH) / query (DIRECT) / commit (BROKERED WRITE)
// Agent 声明意图，不声明层级 — Broker 根据内容路由。

const SCOUT_ACCESS: MemoryAccessDeclaration = {
  modes: ["query"],
  readableLayers: [1, 2], // 读短期记忆 + 关联，寻找已知好源
  writableKinds: [],
};

const COLLECTOR_ACCESS: MemoryAccessDeclaration = {
  modes: ["commit"],
  writableKinds: ["fact"],
  readableLayers: [],
};

const VERIFIER_ACCESS: MemoryAccessDeclaration = {
  modes: ["query"],
  readableLayers: [0, 1], // 读工作记忆(账本)做 cross-source，读短期记忆做历史比对
  writableKinds: [],
};

const ANALYST_ACCESS: MemoryAccessDeclaration = {
  modes: ["query", "commit"],
  readableLayers: [1, 2, 3], // 读关联 + 肌肉记忆，辅助解读
  writableKinds: ["finding"],
};

const SYNTHESIZER_ACCESS: MemoryAccessDeclaration = {
  modes: ["query", "commit"],
  readableLayers: [1, 2], // 读关联记忆辅助综合
  writableKinds: ["synthesis"],
};

const DATA_JANITOR_ACCESS: MemoryAccessDeclaration = {
  modes: ["query"],
  readableLayers: [0, 1], // 读工作记忆做历史范围参考
  writableKinds: [],
};

const DEVILS_ADVOCATE_ACCESS: MemoryAccessDeclaration = {
  modes: ["query"],
  readableLayers: [1, 2, 3], // 读关联 + 肌肉记忆，寻找反例
  writableKinds: [],
};

const ADJUDICATOR_ACCESS: MemoryAccessDeclaration = {
  modes: ["query"],
  readableLayers: [1, 2], // 读关联记忆辅助裁决
  writableKinds: [],
};

const RECONCILIATION_SCORER_ACCESS: MemoryAccessDeclaration = {
  modes: ["query"],
  readableLayers: [1], // 读短期记忆做历史对比
  writableKinds: [],
};

const MEMORY_ACCESS: MemoryAccessDeclaration = {
  modes: ["commit"],
  writableKinds: ["synthesis", "finding", "signal", "fact"], // 全量写入
  readableLayers: [],
};

// === 工具声明 (per-role) ===
// 吸收 DeepSeek tool_calls：每个角色声明可用工具。
// 纯 TypeScript 模式下为声明性（orchestrator 直接调用函数）。
// LLM 驱动模式下序列化为 tools 数组传给模型。

const SCOUT_TOOLS: AgentToolDeclaration[] = [
  {
    name: "matchSources",
    description: "Multi-level source matching: exact → domain → coverage → broker → fallback. Returns ranked candidate source IDs.",
    parameters: {
      type: "object",
      properties: {
        objective: { type: "string", description: "The intelligence objective to match sources against" },
      },
      required: ["objective"],
    },
  },
  {
    name: "broker.query",
    description: "Query historical memory for previously successful sources (Layer 1 short-term memory).",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Search text" },
        tags: { type: "array", items: { type: "string" }, description: "Tag filters" },
      },
    },
  },
];

const COLLECTOR_TOOLS: AgentToolDeclaration[] = [
  {
    name: "rawRecordToExtractedFact",
    description: "Extract structured facts (subject/claim/value/unit/period/geography) from a RawRecord.",
    parameters: {
      type: "object",
      properties: {
        rawRecord: { type: "object", description: "The raw record to extract from" },
      },
      required: ["rawRecord"],
    },
  },
  {
    name: "extractedFactToEvidence",
    description: "Convert an ExtractedFact into an EvidenceEntry with source metadata.",
    parameters: {
      type: "object",
      properties: {
        fact: { type: "object", description: "The extracted fact" },
        sourceId: { type: "string", description: "Source ID from registry" },
        kind: { type: "string", description: "Evidence kind" },
      },
      required: ["fact", "sourceId", "kind"],
    },
  },
  {
    name: "hyperbrowser.scrape_webpage",
    description: "Scrape a single webpage via Hyperbrowser MCP. Returns content in markdown/html/links/screenshot formats. Use this to obtain RawRecords from web URLs before extracting facts. The scraped URL must be recorded as the sourceId for traceability.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to scrape." },
        outputFormat: {
          type: "array",
          items: { type: "string", enum: ["markdown", "html", "links", "screenshot"] },
          description: "Output formats to include in the response. Default: [\"markdown\"]."
        },
        sessionOptions: {
          type: "object",
          properties: {
            useStealth: { type: "boolean", description: "Enable stealth mode to bypass anti-bot detection." },
            useProxy: { type: "boolean", description: "Route traffic through proxies." },
            solveCaptchas: { type: "boolean", description: "Automatically solve CAPTCHA challenges." },
            acceptCookies: { type: "boolean", description: "Automatically accept cookie banners." }
          },
          additionalProperties: false
        }
      },
      required: ["url"],
      additionalProperties: false
    },
  },
  {
    name: "hyperbrowser.extract_structured_data",
    description: "Extract structured data from one or more webpages via Hyperbrowser MCP using a natural-language prompt and optional JSON schema. Supports URL wildcards. Use this for targeted field extraction (e.g., product prices, article dates) when the schema is known upfront.",
    parameters: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: { type: "string" },
          description: "URLs to extract from. Supports wildcards (e.g. https://example.com/products/*)."
        },
        prompt: { type: "string", description: "Natural-language instructions for extraction." },
        schema: {
          type: "object",
          description: "Optional JSON schema for the extracted data structure."
        },
        sessionOptions: {
          type: "object",
          properties: {
            useStealth: { type: "boolean" },
            useProxy: { type: "boolean" },
            solveCaptchas: { type: "boolean" },
            acceptCookies: { type: "boolean" }
          },
          additionalProperties: false
        }
      },
      required: ["urls", "prompt"],
      additionalProperties: false
    },
  },
  {
    name: "hyperbrowser.crawl_webpages",
    description: "Crawl multiple pages of a site via Hyperbrowser MCP starting from a URL. Use this when evidence is spread across multiple pages (e.g., paginated lists, multi-page reports). maxPages controls crawl scope to respect rate limits.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Starting URL for the crawl." },
        outputFormat: {
          type: "array",
          items: { type: "string", enum: ["markdown", "html", "links", "screenshot"] }
        },
        followLinks: { type: "boolean", description: "Whether to follow links found on pages." },
        maxPages: { type: "number", description: "Maximum pages to crawl. Default 10." },
        ignoreSitemap: { type: "boolean", description: "Skip the site's sitemap when available." },
        sessionOptions: {
          type: "object",
          properties: {
            useStealth: { type: "boolean" },
            useProxy: { type: "boolean" },
            solveCaptchas: { type: "boolean" },
            acceptCookies: { type: "boolean" }
          },
          additionalProperties: false
        }
      },
      required: ["url"],
      additionalProperties: false
    },
  },
  // === szfiu 股市数据工具 (streamable_http, JWT Bearer) ===
  {
    name: "szfiu.cn_f10.company_profile",
    description: "获取 A 股上市公司基本信息（总股本、流通股本、注册地、主营业务、上市日期等）。对应 szfiu 服务器的 post_api_hs_f10_summary_basic + post_api_hs_f10_summary_com_info。返回的股票代码须记录为 sourceId。",
    parameters: {
      type: "object",
      properties: {
        stockCode: { type: "string", description: "A 股股票代码，如 600519（贵州茅台）。" }
      },
      required: ["stockCode"],
      additionalProperties: false
    },
  },
  {
    name: "szfiu.cn_f10.financial_statements",
    description: "获取 A 股上市公司财务报表（资产负债表/利润表/现金流量表）。对应 szfiu 服务器的 post_api_hs_f10_finance_balance / income / cash。用于采集财务 EvidenceEntry。",
    parameters: {
      type: "object",
      properties: {
        stockCode: { type: "string", description: "A 股股票代码。" },
        reportType: { type: "string", enum: ["balance", "income", "cashflow"], description: "报表类型。" },
        period: { type: "string", description: "报告期，如 2025Q4。" }
      },
      required: ["stockCode", "reportType"],
      additionalProperties: false
    },
  },
  {
    name: "szfiu.cn_f10.shareholders",
    description: "获取 A 股上市公司十大股东及持股比例。对应 szfiu 服务器的 post_api_hs_f10_summary_topten_holder_stastatistics。",
    parameters: {
      type: "object",
      properties: {
        stockCode: { type: "string", description: "A 股股票代码。" },
        period: { type: "string", description: "报告期。" }
      },
      required: ["stockCode"],
      additionalProperties: false
    },
  },
  {
    name: "szfiu.cn_f10.key_indicators",
    description: "获取 A 股关键财务指标（PE、PB、ROE、EPS 等）。对应 szfiu 服务器的 post_api_hs_f10_finance_key_indicator。",
    parameters: {
      type: "object",
      properties: {
        stockCode: { type: "string", description: "A 股股票代码。" },
        period: { type: "string", description: "报告期。" }
      },
      required: ["stockCode"],
      additionalProperties: false
    },
  },
  {
    name: "szfiu.cn_sdk.realtime_quote",
    description: "获取 A 股实时行情（最新价、涨跌幅、成交量、换手率等）。行情数据时效性高，适合作为 price signal EvidenceEntry。",
    parameters: {
      type: "object",
      properties: {
        stockCode: { type: "string", description: "A 股股票代码，如 600519。" }
      },
      required: ["stockCode"],
      additionalProperties: false
    },
  },
  {
    name: "szfiu.toolkit.search_stock",
    description: "按名称或代码模糊搜索股票，返回匹配列表（含市场、代码、名称）。用于从自然语言提及定位到精确股票代码。",
    parameters: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "搜索关键词。" },
        market: { type: "string", enum: ["cn", "hk", "us"], description: "限定市场。" }
      },
      required: ["keyword"],
      additionalProperties: false
    },
  },
];

const VERIFIER_TOOLS: AgentToolDeclaration[] = [
  {
    name: "evaluateAuthenticity",
    description: "Run all 6 validation gates (provenance/schema/range/freshness/cross_source/historical) and return AuthenticityResult.",
    parameters: {
      type: "object",
      properties: {
        evidence: { type: "object", description: "Evidence to verify" },
        ledger: { type: "array", description: "Existing evidence ledger for cross-source/historical gates" },
        pack: { type: "object", description: "Industry pack with ranges/freshness/trustedSources" },
      },
      required: ["evidence"],
    },
  },
];

const ANALYST_TOOLS: AgentToolDeclaration[] = [
  {
    name: "broker.createOrReinforceAssociation",
    description: "Create or reinforce a causal association edge (Layer 2). Use relation='causes' for causal links — these power first-principles attribution.",
    parameters: {
      type: "object",
      properties: {
        fromKey: { type: "string", description: "Cause node key" },
        toKey: { type: "string", description: "Effect node key" },
        relation: { type: "string", enum: ["supports", "contradicts", "causes", "temporal", "semantic"], description: "Association type" },
      },
      required: ["fromKey", "toKey", "relation"],
    },
  },
  {
    name: "broker.query",
    description: "Query associative memory (Layer 2) and muscle memory (Layer 3) for related patterns and reflex pathways.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Search text" },
        layers: { type: "array", items: { type: "integer" }, description: "Memory layers to search (0-3)" },
      },
    },
  },
  {
    name: "traceAttribution",
    description: "Trace first-principles root cause by reverse-traversing causes edges. Returns attribution chain with cumulative confidence.",
    parameters: {
      type: "object",
      properties: {
        symptom: { type: "string", description: "The observed symptom key to trace backwards" },
      },
      required: ["symptom"],
    },
  },
  {
    name: "broker.commit",
    description: "Commit a finding to memory. Confidence >= 0.6 persists to Layer 1; < 0.6 preloads only.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Memory kind: finding/synthesis/signal/fact" },
        key: { type: "string", description: "Memory key" },
        value: { type: "string", description: "Memory content" },
        confidence: { type: "number", description: "Confidence 0-1" },
        relatedKeys: { type: "array", items: { type: "string" }, description: "Related memory keys to build associations" },
      },
      required: ["kind", "key", "value", "confidence"],
    },
  },
];

const SYNTHESIZER_TOOLS: AgentToolDeclaration[] = [
  {
    name: "synthesizeBrief",
    description: "Aggregate findings and evidence into a single intelligence brief (SynthesisOutput).",
    parameters: {
      type: "object",
      properties: {
        trigger: { type: "object", description: "The swarm trigger" },
        findings: { type: "array", description: "Analysis findings to synthesize" },
        evidenceIds: { type: "array", items: { type: "string" }, description: "Evidence IDs referenced" },
      },
      required: ["trigger", "findings"],
    },
  },
  {
    name: "broker.query",
    description: "Query associative memory for historical context to enrich the brief.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Search text" },
        layers: { type: "array", items: { type: "integer" }, description: "Memory layers to search" },
      },
    },
  },
];

const MEMORY_TOOLS: AgentToolDeclaration[] = [
  {
    name: "broker.commit",
    description: "Commit synthesis/finding/signal/fact to 4-layer neural memory. Broker routes by confidence and builds associations.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Memory kind" },
        key: { type: "string", description: "Memory key" },
        value: { type: "string", description: "Memory content" },
        confidence: { type: "number", description: "Confidence 0-1" },
        relatedKeys: { type: "array", items: { type: "string" }, description: "Related keys for association edges" },
        reflexTrigger: { type: "string", description: "Reflex extraction: trigger condition" },
        reflexAction: { type: "string", description: "Reflex extraction: action to take" },
      },
      required: ["kind", "key", "value", "confidence"],
    },
  },
  {
    name: "generateFollowUp",
    description: "Generate follow-up tasks from synthesis. Closes the loop: blind retry first, then broker reflex triggers.",
    parameters: {
      type: "object",
      properties: {
        synthesis: { type: "object", description: "The synthesis output" },
        findings: { type: "array", description: "Analysis findings" },
      },
      required: ["synthesis"],
    },
  },
];

const DATA_JANITOR_TOOLS: AgentToolDeclaration[] = [
  {
    name: "normalizeUnit",
    description: "Convert evidence units to standardized format (e.g., FRED native unit → JPY/USD).",
    parameters: { type: "object", properties: { evidence: { type: "object" } }, required: ["evidence"] },
  },
  {
    name: "rangeChecker",
    description: "Check evidence values against pack.knownRanges and flag anomalies.",
    parameters: { type: "object", properties: { evidence: { type: "object" }, pack: { type: "object" } }, required: ["evidence"] },
  },
  {
    name: "anomalyDetector",
    description: "Detect outliers exceeding 50% overflow beyond known ranges.",
    parameters: { type: "object", properties: { evidence: { type: "object" }, threshold: { type: "number" } }, required: ["evidence"] },
  },
  {
    name: "duplicateMerger",
    description: "Detect and merge duplicate evidence entries (same subject+period).",
    parameters: { type: "object", properties: { evidenceList: { type: "array" } }, required: ["evidenceList"] },
  },
];

const DEVILS_ADVOCATE_TOOLS: AgentToolDeclaration[] = [
  {
    name: "conflictScanner",
    description: "Scan evidence list for items pointing in the opposite direction of a signal.",
    parameters: { type: "object", properties: { signal: { type: "string" }, evidenceList: { type: "array" } }, required: ["signal", "evidenceList"] },
  },
  {
    name: "alternativeExplainer",
    description: "Generate alternative explanations for a signal using cross-dimension rules and multi-subject evidence.",
    parameters: { type: "object", properties: { signal: { type: "string" }, pack: { type: "object" } }, required: ["signal"] },
  },
  {
    name: "correlationChecker",
    description: "Determine whether a signal represents proven causation or mere correlation.",
    parameters: { type: "object", properties: { signal: { type: "string" }, evidenceCount: { type: "number" } }, required: ["signal", "evidenceCount"] },
  },
];

const ADJUDICATOR_TOOLS: AgentToolDeclaration[] = [
  {
    name: "confidenceAdjuster",
    description: "Adjust finding confidence based on challenge impact scores.",
    parameters: { type: "object", properties: { originalConfidence: { type: "number" }, impactScores: { type: "array" } }, required: ["originalConfidence", "impactScores"] },
  },
  {
    name: "verdictRenderer",
    description: "Render a three-state verdict (upheld/modified/rejected) with reasoning.",
    parameters: { type: "object", properties: { finding: { type: "object" }, challenges: { type: "array" } }, required: ["finding", "challenges"] },
  },
];

const RECONCILIATION_SCORER_TOOLS: AgentToolDeclaration[] = [
  {
    name: "dimensionScorer",
    description: "Score a single supply chain dimension (0-100) based on evidence and known ranges.",
    parameters: { type: "object", properties: { dimension: { type: "string" }, evidence: { type: "array" }, pack: { type: "object" } }, required: ["dimension", "evidence"] },
  },
  {
    name: "mismatchDetector",
    description: "Identify critical mismatches between evidence values and expected ranges.",
    parameters: { type: "object", properties: { evidence: { type: "array" }, pack: { type: "object" } }, required: ["evidence"] },
  },
];

/** 10 类 Agent 角色的行为声明 */
export const AGENT_ROLE_PROFILES: Record<AgentRole, AgentRoleProfile> = {
  scout: {
    role: "scout",
    identity: "Scout — identifies which data sources are relevant to the objective and produces a candidate source list",
    boundaries: [
      "must not fetch actual data (only identifies sources)",
      "must not fabricate source IDs not in the registry",
    ],
    permittedInputs: ["objective", "registrySources"],
    permittedOutputs: ["candidateSourceIds"],
    memoryAccess: SCOUT_ACCESS,
    knowledgeBase: [
      "source registry: all registered IntelligenceSource entries with id/name/tier/coverage/coverage_domain",
      "source tiering: S/A+/A/B/C tiers indicate trust level",
    ],
    reasoningEffort: "high",
    toolset: SCOUT_TOOLS,
    // --- Superpowers 融合字段 ---
    modelTier: "fast",
    skillType: "flexible",
    antiRationalizations: [
      { excuse: "Sources are obvious, no need to match", rebuttal: "Matching ensures no source is overlooked - even obvious sources need explicit selection" },
      { excuse: "Broker memory has no good sources", rebuttal: "Broker is a supplementary signal, not the only matching tier - fallback tier always provides candidates" },
    ],
    redFlags: [
      "candidate list empty and fallback not attempted",
    ],
    verificationChecklist: [
      "candidate list is non-empty",
      "all candidate IDs exist in registry",
    ],
  },
  collector: {
    role: "collector",
    identity: "Collector — transforms RawRecords into structured ExtractedFacts and EvidenceEntries. Can acquire RawRecords from web URLs via Hyperbrowser MCP tools, and from A股/港股/美股 金融市场 via szfiu MCP tools (F10 基本面 + SDK 行情).",
    boundaries: [
      "must not invent data absent from the RawRecord",
      "must not skip source matching (source must exist in registry)",
      "must not assign authenticity scores (that is Verifier's role)",
      "when using hyperbrowser.* tools, must record the scraped URL as sourceId for traceability",
      "when using szfiu.* tools, must record the stock code + report period as sourceId for traceability",
    ],
    permittedInputs: ["rawRecords", "registrySources", "evidenceKind", "urls", "stockCodes"],
    permittedOutputs: ["evidence"],
    memoryAccess: COLLECTOR_ACCESS,
    knowledgeBase: [
      "EvidenceEntry structure: id/sourceId/sourceTier/kind/subject/claim/observedAt/value/unit/period/geography/method",
      "ExtractedFact structure: subject/claim/value/unit/period/geography extracted from RawRecord.raw",
      "Hyperbrowser MCP tools (hyperbrowser.scrape_webpage / extract_structured_data / crawl_webpages) acquire web content that becomes RawRecord.raw; the URL becomes sourceId",
      "Hyperbrowser sessionOptions: useStealth bypasses anti-bot, solveCaptchas handles CAPTCHA, useProxy routes via proxy pool — use only when the target site requires it",
      "szfiu MCP tools (szfiu.cn_f10.* / szfiu.cn_sdk.* / szfiu.toolkit.*) acquire A股 F10 基本面和 SDK 行情数据；stockCode + period 组合成为 sourceId",
      "szfiu F10 工具对应服务器实际工具名: company_profile → post_api_hs_f10_summary_basic/com_info, financial_statements → post_api_hs_f10_finance_balance/income/cash, shareholders → post_api_hs_f10_summary_topten_holder_stastatistics, key_indicators → post_api_hs_f10_finance_key_indicator",
      "szfiu 行情数据时效性高 (realtime_quote)，适合作为 price signal；F10 财务数据按报告期发布，注意 freshness gate 的 maxAgeDays 设置",
    ],
    reasoningEffort: "high",
    toolset: COLLECTOR_TOOLS,
    // --- Superpowers 融合字段 ---
    modelTier: "fast",
    skillType: "rigid",
    antiRationalizations: [
      { excuse: "Raw data can be used directly", rebuttal: "Must match through source registry - sourceId is mandatory for traceability" },
      { excuse: "Missing fields don't matter", rebuttal: "EvidenceEntry must be complete - missing fields break downstream gates" },
    ],
    redFlags: [
      "evidence produced without sourceId",
      "evidenceList empty but rawRecords non-empty",
    ],
    verificationChecklist: [
      "every evidence entry has sourceId",
      "evidenceList non-empty (when rawRecords non-empty)",
    ],
  },
  verifier: {
    role: "verifier",
    identity: "Verifier — runs all 6 authenticity gates and stamps the evidence with an AuthenticityResult",
    boundaries: [
      "must never skip any of the 6 gates",
      "must not modify the evidence content (only annotates authenticity)",
      "must not produce analysis findings (that is Analyst's role)",
    ],
    permittedInputs: ["evidence", "ledger", "registrySources", "pack"],
    permittedOutputs: ["evidence", "authenticity"],
    memoryAccess: VERIFIER_ACCESS,
    knowledgeBase: [
      "6 validation gates: provenance / schema_match / range_plausibility / freshness / cross_source / historical",
      "each gate returns 0-1 score; 0=FAIL(blocking), 0.4=WARN, 0.7=PASS, 1.0=STRONG",
      "authenticityScore = geometricMean(6 gates)",
      "IndustryPack provides: knownRanges, freshnessMaxAgeDays, trustedSourceIds, evidenceSchema",
    ],
    reasoningEffort: "high",
    toolset: VERIFIER_TOOLS,
    // --- Superpowers 融合字段 ---
    modelTier: "standard",
    skillType: "rigid",
    antiRationalizations: [
      { excuse: "This source is trusted, skip gates", rebuttal: "6 gates must never be skipped - trust does not override verification" },
      { excuse: "Score is close enough", rebuttal: "geometricMean cannot be rounded or approximated - exact calculation required" },
    ],
    redFlags: [
      "any gate skipped",
      "authenticityScore undefined",
    ],
    verificationChecklist: [
      "all 6 gates executed",
      "authenticityScore computed",
    ],
  },
  analyst: {
    role: "analyst",
    identity: "Analyst — interprets verified evidence and produces structured AnalysisFindings with signals",
    boundaries: [
      "must not analyze evidence that has not passed through the Verifier",
      "must not assign authenticity scores (only interpret existing ones)",
      "must not synthesize the final brief (that is Synthesizer's role)",
    ],
    permittedInputs: ["evidence", "pack"],
    permittedOutputs: ["finding"],
    memoryAccess: ANALYST_ACCESS,
    knowledgeBase: [
      "signal taxonomy: cost_rising / demand_up / above_range / below_range / stable / anomaly",
      "causal reasoning: identify A→B relationships and build causes edges via broker.createOrReinforceAssociation",
      "IndustryPack.knownRanges for range-based signal detection",
      "first-principles attribution: trace causes chain backwards to find root cause with no upstream",
    ],
    reasoningEffort: "max",
    toolset: ANALYST_TOOLS,
    // --- Superpowers 融合字段 ---
    modelTier: "capable",
    skillType: "flexible",
    antiRationalizations: [
      { excuse: "Signal is obvious, no need for causal reasoning", rebuttal: "Causal chains require evidence - every causes edge must trace to observed signals" },
      { excuse: "Existing associations are sufficient", rebuttal: "Each run should check for new causal edges - conditions change between runs" },
    ],
    redFlags: [
      "analyzed unverified evidence",
      "confidence is 0 but signals present",
    ],
    verificationChecklist: [
      "only annotated evidence analyzed",
      "finding has signals",
      "confidence > 0",
    ],
  },
  synthesizer: {
    role: "synthesizer",
    identity: "Synthesizer — aggregates findings and evidence into a single intelligence brief (SynthesisOutput)",
    boundaries: [
      "must not omit any finding from the brief",
      "must not assign confidence higher than the max finding confidence",
      "must not write to memory (that is Memory's role)",
    ],
    permittedInputs: ["trigger", "findings", "evidenceIds"],
    permittedOutputs: ["synthesis"],
    memoryAccess: SYNTHESIZER_ACCESS,
    knowledgeBase: [
      "SynthesisOutput structure: id/triggerId/title/brief/findings/evidenceIds/confidence/generatedAt",
      "confidence = min(findings.confidence) — never higher than weakest finding",
      "brief should be concise, actionable, and reference evidence by id",
    ],
    reasoningEffort: "high",
    toolset: SYNTHESIZER_TOOLS,
    // --- Superpowers 融合字段 ---
    modelTier: "standard",
    skillType: "flexible",
    antiRationalizations: [
      { excuse: "Findings are all similar", rebuttal: "Must not omit any finding - each finding represents distinct evidence" },
      { excuse: "Higher confidence looks better", rebuttal: "Must not exceed weakest finding confidence - synthesis is only as strong as its weakest link" },
    ],
    redFlags: [
      "finding omitted from synthesis",
      "confidence exceeds max finding confidence",
    ],
    verificationChecklist: [
      "all findings included in synthesis",
      "confidence <= min(finding confidence)",
    ],
  },
  memory: {
    role: "memory",
    identity: "Memory — persists the synthesis to long-term store and generates follow-up tasks to close the loop",
    boundaries: [
      "must not alter the synthesis content when persisting",
      "must generate at least one follow-up task (the loop must close)",
      "must not start new probes directly (only proposes follow-ups)",
    ],
    permittedInputs: ["synthesis", "findings", "memoryStore"],
    permittedOutputs: ["memoryEntry", "followUp"],
    memoryAccess: MEMORY_ACCESS,
    knowledgeBase: [
      "MemoryEntry structure: id/key/kind(finding|synthesis|signal|fact)/value/sourceTaskId/createdAt/tags",
      "FollowUpTask structure: id/originTaskId/kind(probe|task)/objective/rationale",
      "MemoryBroker.commit routes by confidence: >=0.6 persists to Layer 1, <0.6 preloads only",
      "ReflexPathway extraction: same trigger→action 3 times → muscle memory",
    ],
    reasoningEffort: "high",
    toolset: MEMORY_TOOLS,
    // --- Superpowers 融合字段 ---
    modelTier: "fast",
    skillType: "rigid",
    antiRationalizations: [
      { excuse: "Synthesis already stored, no need for follow-up", rebuttal: "The loop must close - at least one follow-up task is mandatory" },
      { excuse: "Hardcoded industry is fine", rebuttal: "TODO must be fixed - industry must be read from pack dynamically" },
    ],
    redFlags: [
      "followUp empty",
      "industry hardcoded as apparel",
    ],
    verificationChecklist: [
      "memoryEntry written to store",
      "followUp non-empty",
    ],
  },
  data_janitor: {
    role: "data_janitor",
    identity: "Data Janitor — cleans, normalizes, and validates raw evidence before analysis. Unit conversion, anomaly detection, range positioning.",
    boundaries: [
      "must not discard evidence without logging the reason",
      "must not fabricate values that don't exist in the raw data",
      "must flag anomalies rather than silently fixing them",
    ],
    permittedInputs: ["evidenceList", "pack"],
    permittedOutputs: ["cleaningLog", "janitorOutput", "evidence", "evidenceList"],
    memoryAccess: DATA_JANITOR_ACCESS,
    knowledgeBase: [
      "pack.knownRanges: min/max/unit for 120+ industry metrics",
      "unit normalization: FRED native units, CNY/ton, USD/month, percentage",
      "anomaly threshold: value >50% outside known range = anomaly, >200% = outlier",
      "range positioning: percentile 0-100 within [min, max]",
    ],
    reasoningEffort: "high",
    toolset: DATA_JANITOR_TOOLS,
    modelTier: "fast",
    skillType: "rigid",
    antiRationalizations: [
      { excuse: "Data looks clean enough", rebuttal: "Every evidence item must be checked against knownRanges — assumptions break downstream gates" },
      { excuse: "Unit is close enough", rebuttal: "Unit normalization is mandatory for cross-source comparison — approximate units cause false conflicts" },
    ],
    redFlags: [
      "cleaningLog empty but evidenceList has numeric values",
      "anomalyCount > evidenceList.length (impossible)",
    ],
    verificationChecklist: [
      "cleaningLog records all transformations",
      "normalizedEvidence has same count as input (minus duplicates)",
    ],
  },
  devils_advocate: {
    role: "devils_advocate",
    identity: "Devil's Advocate — challenges every conclusion with counter-arguments to ensure robustness.",
    boundaries: [
      "must challenge every finding, not just weak ones",
      "must provide evidence for challenges, not fabricate counter-evidence",
      "must not reject findings (that is Adjudicator's role)",
    ],
    permittedInputs: ["finding", "evidenceList", "pack"],
    permittedOutputs: ["challenges"],
    memoryAccess: DEVILS_ADVOCATE_ACCESS,
    knowledgeBase: [
      "4 challenge types: alternative_explanation, conflicting_evidence, insufficient_data, correlation_not_causation",
      "impactScore: 0-1 scale measuring how much a challenge weakens the finding",
      "overallWeakness: weighted average of all impact scores",
    ],
    reasoningEffort: "max",
    toolset: DEVILS_ADVOCATE_TOOLS,
    modelTier: "capable",
    skillType: "flexible",
    antiRationalizations: [
      { excuse: "Finding is obviously correct", rebuttal: "Every finding must be challenged — confirmation bias is the enemy of intelligence" },
      { excuse: "No counter-evidence exists", rebuttal: "insufficient_data is a valid challenge — absence of evidence is evidence of weakness" },
    ],
    redFlags: [
      "zero challenges for a finding with signals",
      "impactScore > 1 or < 0",
    ],
    verificationChecklist: [
      "every signal in every finding has at least one challenge",
      "all impactScores are 0-1",
    ],
  },
  adjudicator: {
    role: "adjudicator",
    identity: "Adjudicator — weighs evidence and challenges to render a final verdict on each finding.",
    boundaries: [
      "must consider all challenges before ruling",
      "must provide reasoning for each verdict",
      "must not ignore high-impact challenges (>=0.6 must lead to rejection or strong modification)",
    ],
    permittedInputs: ["finding", "challenges", "evidenceList"],
    permittedOutputs: ["verdict"],
    memoryAccess: ADJUDICATOR_ACCESS,
    knowledgeBase: [
      "3 verdict states: upheld (maintain confidence), modified (reduce proportionally), rejected (near-zero confidence)",
      "overallVerdict: strong (>=60% upheld), moderate, weak (>25% rejected), insufficient (>50% rejected)",
      "adjustedConfidence must never exceed originalConfidence",
    ],
    reasoningEffort: "max",
    toolset: ADJUDICATOR_TOOLS,
    modelTier: "capable",
    skillType: "flexible",
    antiRationalizations: [
      { excuse: "Most challenges are low-impact", rebuttal: "Even one high-impact challenge (>=0.6) must trigger rejection — averages hide critical weaknesses" },
      { excuse: "Adjusted confidence looks too low", rebuttal: "Confidence must reflect evidence strength — inflating it defeats the purpose of adjudication" },
    ],
    redFlags: [
      "high-impact challenge (>=0.6) but finding upheld",
      "adjustedConfidence > originalConfidence",
    ],
    verificationChecklist: [
      "every signal has a verdict",
      "reasoning non-empty for each verdict",
    ],
  },
  reconciliation_scorer: {
    role: "reconciliation_scorer",
    identity: "Reconciliation Scorer — measures consistency across 10 supply chain dimensions.",
    boundaries: [
      "must score all 10 dimensions",
      "must not fabricate data for unscored dimensions — use insufficient_data status",
      "must flag insufficient_data honestly rather than guessing",
    ],
    permittedInputs: ["evidenceList", "pack", "reconciliations"],
    permittedOutputs: ["reconciliationScores"],
    memoryAccess: RECONCILIATION_SCORER_ACCESS,
    knowledgeBase: [
      "10 dimensions: product/quantity/price/delivery/quality/inventory/financial/tax/demand/capacity",
      "score: 0-100 based on in-range rate and mismatch rate",
      "status: matched (low mismatch), warning (some), mismatch (high), insufficient_data (no evidence)",
      "overallHealth: average of scored dimensions (excluding insufficient_data)",
    ],
    reasoningEffort: "high",
    toolset: RECONCILIATION_SCORER_TOOLS,
    modelTier: "standard",
    skillType: "rigid",
    antiRationalizations: [
      { excuse: "No evidence for this dimension", rebuttal: "insufficient_data is the correct status — never fabricate a score" },
      { excuse: "Most dimensions are fine", rebuttal: "overallHealth must reflect reality — one critical mismatch should lower the score significantly" },
    ],
    redFlags: [
      "fewer than 10 dimensions scored",
      "score > 100 or < 0",
    ],
    verificationChecklist: [
      "all 10 dimensions present in output",
      "overallHealth is 0-100",
    ],
  },
};

/**
 * 默认蜂群工作流 — 完整闭环序列。
 * orchestrator 按此顺序执行角色。
 */
export const DEFAULT_SWARM_WORKFLOW: SwarmWorkflow = {
  id: "default-full-pipeline",
  name: "Full Intelligence Pipeline (10 agents)",
  steps: [
    "scout", "collector", "data_janitor",
    "verifier", "analyst", "devils_advocate",
    "adjudicator", "reconciliation_scorer", "synthesizer", "memory",
  ],
  description:
    "3-phase pipeline: " +
    "Phase 1 (Collection+Cleaning): Scout → Collector → Data Janitor. " +
    "Phase 2 (Analysis+Debate): Verifier → Analyst → Devil's Advocate. " +
    "Phase 3 (Adjudication+Synthesis): Adjudicator → Reconciliation Scorer → Synthesizer → Memory. " +
    "Closes with Feedback follow-up tasks.",
};

/** 按角色名取 profile */
export function getRoleProfile(role: AgentRole): AgentRoleProfile {
  return AGENT_ROLE_PROFILES[role];
}
