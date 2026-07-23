export * from "./types";
export * from "./sourceRegistry";
export * from "./evidenceLedger";
export * from "./officialApis";
export * from "./coverage";
export * from "./brandChainGate";
export * from "./materialReconciliation";
export * from "./visualizationReadiness";
export * from "./evidence-types";
export * from "./evidence-graph";
export * from "./adapterStandard";
export * from "./adapter-health";
export * from "./confidence-engine";
export * from "./conflict-detection";
// v3 Phase F: 买卖双方链路协同核对系统
export * from "./reconciliation";
// 行业无关核心抽象（IndustryPack / Range / FreshnessConfig 等）
export * from "./core";
// 6 道数据真实性验证门 + AuthenticityResult 编排器
// validation/index.ts 同时重导出 agents/validators，避免此处重复导出同名符号
export * from "./validation";
// === Automation Spine v1 ===
// Probe → Trigger → Swarm → Information → Verification → Analysis → Synthesis → Memory → Feedback
export * from "./spine";
export * from "./probes";
export * from "./triggers";
export * from "./collection";
export * from "./synthesis";
export * from "./memory";
export * from "./workflows";
export * from "./swarm";
// 分析层 — Industry Pack 位于 analysis 层（行业包是分析镜头，非核心边界）
// apparelPack 等行业包从这里导出
export * from "./analysis";
