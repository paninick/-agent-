import { describe, expect, it } from "vitest";
import { CostEngine } from "../../services/cost-engine";

describe("CostEngine", () => {
  it("adds cost line items to the correct category bucket", () => {
    const engine = new CostEngine();
    engine.createBudget({ taskId: "task_1", maxCostUsd: 1 });

    const record = engine.addCost({
      taskId: "task_1",
      category: "modelCost",
      amountUsd: 0.12,
      sourceId: "scout",
    });

    expect(record.modelCost).toBe(0.12);
    expect(record.totalCost).toBe(0.12);
  });

  it("accumulates multiple line items across categories", () => {
    const engine = new CostEngine();
    engine.createBudget({ taskId: "task_2", maxCostUsd: 5 });

    engine.addCost({ taskId: "task_2", category: "modelCost", amountUsd: 0.3, sourceId: "collector" });
    engine.addCost({ taskId: "task_2", category: "mcpCost", amountUsd: 0.05, sourceId: "verifier" });
    engine.addCost({ taskId: "task_2", category: "modelCost", amountUsd: 0.2, sourceId: "analyst" });

    const record = engine.getRecord("task_2")!;
    expect(record.modelCost).toBe(0.5);
    expect(record.mcpCost).toBe(0.05);
    expect(record.totalCost).toBe(0.55);
  });

  it("assertWithinBudget reads saved budget (P0 fix: not re-passed by caller)", () => {
    const engine = new CostEngine();
    engine.createBudget({ taskId: "task_3", maxCostUsd: 0.1 });

    engine.addCost({ taskId: "task_3", category: "modelCost", amountUsd: 0.05, sourceId: "step1" });
    expect(engine.assertWithinBudget("task_3")).toBe(true);

    engine.addCost({ taskId: "task_3", category: "modelCost", amountUsd: 0.06, sourceId: "step2" });
    expect(engine.assertWithinBudget("task_3")).toBe(false);
  });

  it("returns true for tasks without a budget (unlimited)", () => {
    const engine = new CostEngine();
    expect(engine.assertWithinBudget("unknown_task")).toBe(true);
  });

  it("estimates model cost from per-1k pricing and token usage", () => {
    const engine = new CostEngine();
    const cost = engine.estimateModelCost(0.004, 0.012, { inputTokens: 2000, outputTokens: 1000 });
    // 0.004 * 2000 / 1000 + 0.012 * 1000 / 1000 = 0.008 + 0.012 = 0.02
    expect(cost).toBe(0.02);
  });

  it("handles undefined pricing (returns 0)", () => {
    const engine = new CostEngine();
    const cost = engine.estimateModelCost(undefined, undefined, { inputTokens: 5000, outputTokens: 2000 });
    expect(cost).toBe(0);
  });

  it("getBudget returns the saved maxCostUsd", () => {
    const engine = new CostEngine();
    engine.createBudget({ taskId: "task_4", maxCostUsd: 2.5 });
    expect(engine.getBudget("task_4")).toBe(2.5);
    expect(engine.getBudget("unknown")).toBeUndefined();
  });
});
