/**
 * services/intent-compiler.ts - 意图编译器
 *
 * 从 NP3 (agent-os-2) 的 TaskCompiler 模式提炼，
 * 适配 NP2 的服装情报场景 + SwarmWorkflow 类型。
 *
 * 3 种意图类型：
 *   - price_intelligence：价格/成本/棉花/化纤等 -> 完整 6 步工作流
 *   - supply_chain_risk：风险/中断/关税/制裁等 -> 完整 6 步 + 双重验证
 *   - general_intelligence：默认 -> LIVE_WORKFLOW（跳过 scout，精简 5 步）
 *
 * 正则匹配中英双语关键词。
 */

import type { AgentRole, SwarmWorkflow } from "../intelligence/spine/types";

export type DetectedIntentType = "price_intelligence" | "supply_chain_risk" | "general_intelligence";

export interface CompiledTask {
  detectedIntent: DetectedIntentType;
  workflow: SwarmWorkflow;
  assumptions: string[];
  riskLevel: "low" | "medium" | "high";
}

const FULL_PIPELINE_STEPS: AgentRole[] = ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"];
const LIVE_PIPELINE_STEPS: AgentRole[] = ["collector", "verifier", "analyst", "synthesizer", "memory"];

// 中英双语关键词
const PRICE_KEYWORDS = /price|cost|棉|cotton|化纤|fiber|yarn|纱线|fabric|面料|原料|raw material|petrochemical|石化|fiber exchange|纤维交易所/i;
const RISK_KEYWORDS = /risk|disruption|tariff|sanction|风险|中断|关税|制裁|供应链风险|supply chain risk|断供|embargo|禁运|trade war|贸易战/i;

export function compileIntent(intent: string): CompiledTask {
  const detectedIntent = detectIntentType(intent);

  switch (detectedIntent) {
    case "price_intelligence":
      return {
        detectedIntent,
        workflow: {
          id: "compiled-price-intelligence",
          name: "Price Intelligence Pipeline",
          steps: FULL_PIPELINE_STEPS,
          description: "Full pipeline for price/cost intelligence: Scout -> Collector -> Verifier -> Analyst -> Synthesizer -> Memory.",
        },
        assumptions: [
          "User wants current price/cost intelligence for apparel supply chain.",
          "Scout will match data sources covering raw materials, fibers, yarns, and fabrics.",
          "Analyst will focus on cost transmission and price propagation analysis.",
        ],
        riskLevel: "medium",
      };

    case "supply_chain_risk":
      return {
        detectedIntent,
        workflow: {
          id: "compiled-supply-chain-risk",
          name: "Supply Chain Risk Pipeline",
          steps: FULL_PIPELINE_STEPS,
          description: "Full pipeline with enhanced verification for supply chain risk intelligence.",
          enableVerificationGate: true,
          maxRetries: 3,
        },
        assumptions: [
          "User wants supply chain risk intelligence (disruption, tariff, sanction).",
          "Enhanced verification gate enabled - all evidence must pass 6-gate validation.",
          "Analyst will focus on risk propagation and severity scoring.",
        ],
        riskLevel: "high",
      };

    default:
      return {
        detectedIntent: "general_intelligence",
        workflow: {
          id: "compiled-general-intelligence",
          name: "General Intelligence Pipeline",
          steps: LIVE_PIPELINE_STEPS,
          description: "Live-collected pipeline (skip scout): Collector -> Verifier -> Analyst -> Synthesizer -> Memory.",
        },
        assumptions: [
          "Intent is general or ambiguous - using live-collected pipeline.",
          "Scout step skipped (data sources matched by live-collector).",
          "Output preserves evidence confidence and source provenance.",
        ],
        riskLevel: "low",
      };
  }
}

function detectIntentType(intent: string): DetectedIntentType {
  if (PRICE_KEYWORDS.test(intent)) {
    return "price_intelligence";
  }
  if (RISK_KEYWORDS.test(intent)) {
    return "supply_chain_risk";
  }
  return "general_intelligence";
}
