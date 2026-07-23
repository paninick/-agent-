/**
 * scripts/simulate-live-swarm.ts - 实时蜂群仿真验证
 *
 * 用真实 fetch 从公开数据源采集数据，喂给蜂群管道，验证采集桥端到端工作。
 *
 * 无 API key 的源会 graceful skip（skipped_no_key），不报错。
 * 有 API key 的源会真实调用外部 API。
 *
 * 运行方式：npx tsx scripts/simulate-live-swarm.ts
 */

import { config as loadEnv } from "dotenv";
import registrySeed from "../data/intelligence-source-registry.seed.json" with { type: "json" };
import { parseSourceRegistry, getSource } from "../src/intelligence";
import { runLiveSwarm } from "../src/intelligence/swarm/live-swarm";
import { MemoryStore } from "../src/intelligence/memory/store";
import { apparelPack } from "../src/intelligence/analysis/industryPacks/apparel";
import type { SwarmTrigger } from "../src/intelligence/spine/types";
import { CostEngine } from "../src/services/cost-engine";
import { compileIntent } from "../src/services/intent-compiler";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

async function main() {
  console.log("============================================================");
  console.log("实时蜂群仿真 - Live Swarm Simulation");
  console.log("============================================================\n");

  // === 1. 加载来源注册表 ===
  const registry = parseSourceRegistry(registrySeed);
  const registrySources = registry.sources;
  console.log(`来源注册表: ${registrySources.length} 个源\n`);

  // === 2. 构造触发器 ===
  const trigger: SwarmTrigger = {
    id: "trigger-live-swarm-demo",
    ruleId: "rule-live-demo",
    signalId: "signal-live-demo",
    firedAt: new Date().toISOString(),
    objective: "apparel cotton price cost transmission macro economic Vietnam Bangladesh",
    pack: apparelPack,
  };
  console.log(`触发器: ${trigger.id}`);
  console.log(`目标: ${trigger.objective}\n`);

  // === 3. 意图编译 ===
  const compiledTask = compileIntent(trigger.objective);
  console.log(`意图: ${compiledTask.detectedIntent} (风险: ${compiledTask.riskLevel})`);
  console.log(`假设: ${compiledTask.assumptions.length} 条\n`);

  // live-swarm 已在采集前单独执行 scout，移除工作流中的 scout 步骤避免重复
  const liveWorkflow = {
    ...compiledTask.workflow,
    steps: compiledTask.workflow.steps.filter((step) => step !== "scout"),
  };

  // === 4. 创建成本引擎 ===
  const costEngine = new CostEngine();
  costEngine.createBudget({ taskId: trigger.id, maxCostUsd: 1.0 });

  // === 5. 运行实时蜂群 ===
  const memoryStore = new MemoryStore();
  const now = new Date();

  const result = await runLiveSwarm({
    registrySources,
    trigger,
    memoryStore,
    now,
    apiKeys: {
      fredApiKey: process.env.FRED_API_KEY,
      censusApiKey: process.env.CENSUS_API_KEY,
      openSupplyHubApiKey: process.env.OPEN_SUPPLY_HUB_API_KEY,
      comtradeApiKey: process.env.UN_COMTRADE_API_KEY,
    },
    costEngine,
    workflow: liveWorkflow,
  });

  // === 6. 打印采集日志 ===
  console.log("=== 采集日志 ===");
  for (const entry of result.collectionLog) {
    const icon =
      entry.status === "collected" ? "✅" :
      entry.status === "skipped_no_key" ? "⏭️" :
      entry.status === "failed" ? "❌" :
      "🚫";
    console.log(`  ${icon} ${entry.sourceId}: ${entry.status} (${entry.recordCount} records)${entry.error ? ` - ${entry.error}` : ""}`);
  }
  console.log(`\n采集总数: ${result.rawRecordCount} 条 RawRecord\n`);

  // === 7. 打印 Scout 匹配 ===
  console.log("=== Scout 匹配 ===");
  console.log(`  候选来源: ${result.candidateSourceIds.join(", ") || "(none)"}\n`);

  // === 8. 打印蜂群结果 ===
  console.log("=== 蜂群执行结果 ===");
  for (const r of result.swarmRun.results) {
    const icon = r.status === "completed" ? "✅" : r.status === "done_with_concerns" ? "⚠️" : "❌";
    const detail = r.synthesis ? ` -> "${r.synthesis.title}"` :
      r.finding ? ` -> ${r.finding.signals.length} signals` :
      r.evidence ? ` -> evidence: ${r.evidence.subject}` :
      r.error ? ` -> ${r.error}` : "";
    console.log(`  ${icon} ${r.role}: ${r.status}${detail}`);
    if (r.concerns && r.concerns.length > 0) {
      console.log(`     concerns: ${r.concerns.join("; ")}`);
    }
  }

  // === 9. 打印综合结果 ===
  console.log("\n=== 综合简报 ===");
  if (result.swarmRun.synthesis) {
    console.log(`  标题: ${result.swarmRun.synthesis.title}`);
    console.log(`  置信度: ${result.swarmRun.synthesis.confidence}`);
    console.log(`  证据数: ${result.swarmRun.synthesis.evidenceIds?.length ?? 0}`);
    console.log(`  正文: ${result.swarmRun.synthesis.brief?.slice(0, 200)}...`);
  } else {
    console.log("  (无综合简报 - 可能采集到 0 条数据)");
  }

  // === 10. 打印后续任务 ===
  console.log("\n=== 后续任务 ===");
  if (result.swarmRun.followUps && result.swarmRun.followUps.length > 0) {
    for (const fu of result.swarmRun.followUps) {
      console.log(`  [${fu.kind}] ${fu.objective}`);
    }
  } else {
    console.log("  (无后续任务)");
  }

  // === 11. 总结 ===
  const collected = result.collectionLog.filter((e) => e.status === "collected").length;
  const skipped = result.collectionLog.filter((e) => e.status === "skipped_no_key").length;
  const failed = result.collectionLog.filter((e) => e.status === "failed").length;
  const notImpl = result.collectionLog.filter((e) => e.status === "not_implemented").length;
  const loopClosed = result.swarmRun.synthesis !== undefined && result.swarmRun.followUps !== undefined;

  console.log("\n============================================================");
  console.log(`仿真总结:`);
  console.log(`  采集: ${collected} 成功 / ${skipped} 缺key / ${failed} 失败 / ${notImpl} 未实现`);
  console.log(`  RawRecord: ${result.rawRecordCount} 条`);
  console.log(`  蜂群: ${result.swarmRun.results.length} 步执行`);
  console.log(`  闭环: ${loopClosed ? "✅ 成功" : "⚠️ 未闭环"}`);

  // 成本追踪
  const cost = result.swarmRun.costRecord;
  if (cost) {
    const withinBudget = costEngine.assertWithinBudget(trigger.id);
    console.log(`  成本: $${cost.totalCost.toFixed(6)} (预算 $1.00, ${withinBudget ? "✅ 未超支" : "⚠️ 超支"})`);
    console.log(`    - modelCost: $${cost.modelCost.toFixed(6)}`);
    console.log(`    - toolCost:  $${cost.toolCost.toFixed(6)}`);
    console.log(`    - mcpCost:   $${cost.mcpCost.toFixed(6)}`);
  }

  console.log("============================================================");
}

main().catch((error) => {
  console.error("仿真失败:", error);
  process.exit(1);
});
