/**
 * workflows/feedback.ts - 反馈生成 (v2 增强：Broker 闭环 + v3 真实值推算驱动)
 *
 * generateFollowUp(synthesis, findings): 根据简报置信度和发现信号生成后续任务。
 * 闭合环路：Feedback -> 再触发 Probe 或 Task。
 *
 * v2 升级（注入 broker 时）：
 *   1. 盲重试优先：confidence < 0.5 时先生成"补充采集"task（不查 Broker，快）
 *   2. 查 Broker 补充：查 Layer 2 关联记忆，看是否有相关历史发现可复用
 *   3. 反射触发：若 Layer 3 有匹配的 ReflexPathway，直接生成反射 action 作为 FollowUpTask
 *
 * v3 升级（当 synthesis.chainEstimate 存在时）：
 *   4. 压力等级 critical -> 生成紧急探针任务
 *   5. 瓶颈节点有大偏差 -> 探针该节点的未解释因素
 *   6. 全链偏差高 -> 生成"确认传导链"任务
 *
 * 规则（v1 保持不变，未注入 broker 时）：
 *   - confidence < 0.5 -> 生成"补充采集"task（证据不足）
 *   - findings 含 cost_rising / above_range 信号 -> 生成"probe 棉纱价格"后续
 *   - findings 含 demand_up 信号 -> 生成"验证供应链产能"task
 *   - 默认 -> 生成"定期复查"probe
 */

import type { SynthesisOutput, AnalysisFinding, FollowUpTask } from "../spine/types";
import type { MemoryBroker } from "../memory/broker";

let followUpCounter = 0;

function nextFollowUpId(): string {
  followUpCounter += 1;
  return `followup-${followUpCounter}`;
}

export function generateFollowUp(
  synthesis: SynthesisOutput,
  findings: AnalysisFinding[],
  originTaskId: string,
  now: Date = new Date(),
  broker?: MemoryBroker,
): FollowUpTask[] {
  const followUps: FollowUpTask[] = [];
  const allSignals = findings.flatMap((f) => f.signals);

  // 规则 1：置信度不足 -> 盲重试补充采集（不查 Broker，快）
  if (synthesis.confidence < 0.5) {
    followUps.push({
      id: nextFollowUpId(),
      originTaskId,
      kind: "task",
      objective: "Collect additional evidence to raise confidence above 0.5",
      rationale: `synthesis confidence is ${synthesis.confidence.toFixed(2)} (below 0.5 threshold)`,
    });
  }

  // 规则 2：成本上升信号 -> probe 原料价格
  if (allSignals.some((s) => s.includes("above_range") || s.includes("cost_rising"))) {
    followUps.push({
      id: nextFollowUpId(),
      originTaskId,
      kind: "probe",
      objective: "Probe cotton_price and yarn_price for cost trend confirmation",
      rationale: "cost-rising signal detected in findings; verify upstream raw material prices",
    });
  }

  // 规则 3：需求上升信号 -> 验证供应链
  if (allSignals.some((s) => s.includes("demand_up") || s.includes("demand"))) {
    followUps.push({
      id: nextFollowUpId(),
      originTaskId,
      kind: "task",
      objective: "Verify supply chain capacity for increased demand",
      rationale: "demand-up signal detected; assess manufacturing capacity readiness",
    });
  }

  // === v3: 基于供应链真实值推算的反应 ===
  const chainEstimate = synthesis.chainEstimate;
  if (chainEstimate) {
    // 规则 4: 压力等级 critical -> 紧急探针
    if (chainEstimate.pressureLevel === "critical") {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: `URGENT: Supply chain health critical (${chainEstimate.healthScore}/100), investigate root cause immediately`,
        rationale: `chain health score ${chainEstimate.healthScore} is below critical threshold (50); chain deviation ${(chainEstimate.chainDeviation * 100).toFixed(1)}%`,
      });
    }

    // 规则 5: 瓶颈节点有大偏差 -> 探针未解释因素
    if (chainEstimate.bottleneckNode) {
      const bottleneck = chainEstimate.nodePressure.find(
        (n) => n.nodeId === chainEstimate.bottleneckNode,
      );
      if (bottleneck && bottleneck.severity === "high") {
        followUps.push({
          id: nextFollowUpId(),
          originTaskId,
          kind: "probe",
          objective: `Probe ${chainEstimate.bottleneckNode} node for unexplained deviation (observed=${bottleneck.observed?.toFixed(1) ?? "?"}, expected=${bottleneck.expected?.toFixed(1) ?? "?"})`,
          rationale: `bottleneck node ${chainEstimate.bottleneckNode} has ${(bottleneck.deviationRate !== null ? (bottleneck.deviationRate * 100).toFixed(1) : "?")}% deviation from propagated expectation; possible profit squeeze / hoarding / unmodeled factor`,
        });
      }
    }

    // 规则 6: 全链偏差高但非 critical -> 确认传导链
    if (chainEstimate.chainDeviation > 0.15 && chainEstimate.pressureLevel !== "critical") {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: `Confirm transmission chain: verify if ${(chainEstimate.chainDeviation * 100).toFixed(1)}% chain deviation is explained by known causal factors`,
        rationale: `chain-wide deviation ${(chainEstimate.chainDeviation * 100).toFixed(1)}% exceeds 15% threshold; verify if causal attribution accounts for the gap between observed and expected values`,
      });
    }

    // 规则 7: 来源分歧大 -> 交叉验证
    const highDisagreementNodes = chainEstimate.nodePressure.filter(
      (n) => n.sourceDisagreement > 0.3,
    );
    for (const node of highDisagreementNodes) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "probe",
        objective: `Cross-verify ${node.nodeId} data sources (disagreement=${(node.sourceDisagreement * 100).toFixed(1)}%)`,
        rationale: `source disagreement for ${node.nodeId} exceeds 30%; conflicting evidence needs resolution`,
      });
    }

    // === v3 Phase E: 基于 riskSignals / reversePropagation / resonance 的反应 ===

    // 规则 10: 风险信号 -> 针对性探针
    const riskSignals = chainEstimate.riskSignals ?? [];
    // 逆推不一致 -> 验证下游品牌反馈的可靠性
    if (riskSignals.includes("reverse_consistency_low")) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: "Verify brand retail feedback reliability: reverse propagation consistency is low, check if brand pricing reflects actual cost structure",
        rationale: "reverse propagation consistency below 50%; brand feedback may not reflect true supply chain state",
      });
    }
    // 节点逆推偏差大 -> 探针该节点是否隐瞒/囤货
    const reverseMismatchNodes = riskSignals
      .filter((s) => s.endsWith("_reverse_mismatch"))
      .map((s) => s.replace("_reverse_mismatch", ""));
    for (const nodeId of reverseMismatchNodes.slice(0, 2)) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "probe",
        objective: `Probe ${nodeId} for hidden deviation: reverse propagation shows mismatch between brand-implied and observed values`,
        rationale: `${nodeId} has >25% deviation between reverse-implied and observed values; possible hoarding, unreported inventory, or unmodeled cost factor`,
      });
    }

    // 规则 11: 多节点共振 -> 紧急联动反应
    const resonance = chainEstimate.resonance;
    if (resonance && resonance.hasAlert) {
      // 强共振/临界共振 -> 生成最高优先级应急任务
      const criticalPatterns = resonance.patterns.filter(
        (p) => p.level === "strong" || p.level === "critical",
      );
      for (const pattern of criticalPatterns.slice(0, 2)) {
        followUps.push({
          id: nextFollowUpId(),
          originTaskId,
          kind: "task",
          objective: `RESONANCE ALERT [${pattern.level.toUpperCase()}]: ${pattern.recommendedAction}`,
          rationale: `${pattern.patternType} detected: ${pattern.resonatingNodes.length} nodes resonating (${pattern.resonatingNodes.join(", ")}); confidence=${(pattern.confidence * 100).toFixed(0)}%`,
        });
      }
      // 中等共振 -> 生成监控任务
      const moderatePatterns = resonance.patterns.filter(
        (p) => p.level === "moderate",
      );
      if (moderatePatterns.length > 0 && criticalPatterns.length === 0) {
        followUps.push({
          id: nextFollowUpId(),
          originTaskId,
          kind: "task",
          objective: `Monitor resonance pattern: ${moderatePatterns[0].patternType}`,
          rationale: `moderate resonance detected (${moderatePatterns[0].resonatingNodes.length} nodes); escalate if pattern intensifies: ${moderatePatterns[0].recommendedAction}`,
        });
      }
    }

    // 规则 12: 覆盖率低 -> 补充数据采集
    if (riskSignals.includes("low_propagation_coverage")) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: "Collect missing node data to improve propagation coverage",
        rationale: `propagation coverage is ${(chainEstimate.coverage * 100).toFixed(0)}% (below 50%); insufficient data for reliable chain analysis`,
      });
    }

    // 规则 13: 全链偏差 -> 传导链验证
    if (riskSignals.includes("chain_wide_deviation")) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: "Investigate chain-wide deviation: check if unmodeled external factor is affecting all nodes simultaneously",
        rationale: `chain-wide deviation exceeds 25%; possibly a macro factor (FX shock, policy change, pandemic) not captured in transmission paths`,
      });
    }

    // === v3 Phase F: 基于买卖双方对账的反应 ===

    // 规则 14: 数量 mismatch > 3% -> 冻结结算 + 人工核查
    if (riskSignals.some((s) => s.startsWith("reconciliation_mismatch_"))) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: "URGENT: Freeze settlement and initiate manual review for reconciliation mismatches",
        rationale: `reconciliation mismatches detected (${chainEstimate.reconciliation?.mismatchCount ?? 0} items); freeze payments pending resolution`,
      });
    }

    // 规则 15: 价格异常 -> 成本拆解验证
    if (allSignals.some((s) => s.includes("reconciliation_price_mismatch") || s.includes("reconciliation_price_warning"))) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: "Perform price cost breakdown verification: decompose quote into fabric+accessories+labor+overhead+logistics+tax+profit",
        rationale: "price reconciliation anomaly detected; verify if quote increase exceeds raw material increase + reasonable processing fee",
      });
    }

    // 规则 16: 交期延误 -> 反查延误原因
    if (allSignals.some((s) => s.includes("reconciliation_delivery_mismatch") || s.includes("reconciliation_delivery_warning"))) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "probe",
        objective: "Investigate delivery delay root cause: check raw material / production scheduling / QC / logistics / customs / payment",
        rationale: "delivery reconciliation anomaly detected; trace delay through each stage of the supply chain",
      });
    }

    // 规则 17: 需求真实性 < 60 -> 要求定金 + 不备料
    if (allSignals.some((s) => s.includes("demand_credibility") && s.includes("below_range"))) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: "Demand credibility low: require deposit and halt raw material procurement",
        rationale: "demand credibility score below 60; require advance payment and suspend material commitment",
      });
    }

    // 规则 18: 供应真实性 < 60 -> 小单测试 + 跟单
    if (allSignals.some((s) => s.includes("supply_credibility") && s.includes("below_range"))) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: "Supply credibility low: switch to small batch testing with close monitoring",
        rationale: "supply credibility score below 60; reduce order size and increase production tracking frequency",
      });
    }

    // 规则 19: 异常闭环未关闭 -> 催办
    if (chainEstimate.reconciliation && chainEstimate.reconciliation.activeAnomalies > 0) {
      followUps.push({
        id: nextFollowUpId(),
        originTaskId,
        kind: "task",
        objective: `Escalate ${chainEstimate.reconciliation.activeAnomalies} unclosed anomalies: review and close resolved items`,
        rationale: `${chainEstimate.reconciliation.activeAnomalies} active anomalies remain unclosed; escalate for timely resolution`,
      });
    }
  }

  // 规则 8 (v2)：反射触发 - 若 broker Layer 3 有匹配的 ReflexPathway，直接生成反射 action
  if (broker) {
    const reflexes = broker.listReflexes();
    for (const reflex of reflexes) {
      // 若反射的 trigger 与 synthesis 标题相关，生成反射 action 作为后续任务
      const triggerLower = reflex.trigger.toLowerCase();
      const titleLower = synthesis.title.toLowerCase();
      const triggerKeywords = triggerLower.split(/[\s,]+/).filter((w) => w.length > 2);
      if (triggerKeywords.some((kw) => titleLower.includes(kw))) {
        // 避免重复生成相同 objective（但允许反射覆盖系统生成的同 objective 任务）
        const existing = followUps.find((fu) => fu.objective === reflex.action);
        if (!existing || !existing.rationale.includes("reflex")) {
          if (existing) {
            // 替换系统生成的同 objective 任务为反射版本
            existing.rationale = `reflex pathway triggered (hitCount=${reflex.hitCount}, confidence=${reflex.confidence.toFixed(2)})`;
          } else {
            followUps.push({
              id: nextFollowUpId(),
              originTaskId,
              kind: "task",
              objective: reflex.action,
              rationale: `reflex pathway triggered (hitCount=${reflex.hitCount}, confidence=${reflex.confidence.toFixed(2)})`,
            });
          }
        }
      }
    }
  }

  // 规则 9：默认 -> 定期复查
  if (followUps.length === 0) {
    followUps.push({
      id: nextFollowUpId(),
      originTaskId,
      kind: "probe",
      objective: "Schedule periodic re-probe for ongoing monitoring",
      rationale: "no critical signals; default to periodic surveillance",
    });
  }

  return followUps;
}
