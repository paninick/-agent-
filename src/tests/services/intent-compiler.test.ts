import { describe, expect, it } from "vitest";
import { compileIntent } from "../../services/intent-compiler";
import { WorkflowValidator } from "../../services/workflow-validator";

const validator = new WorkflowValidator();

describe("compileIntent", () => {
  it("detects price intelligence intent (English)", () => {
    const result = compileIntent("cotton price trend in Vietnam");
    expect(result.detectedIntent).toBe("price_intelligence");
    expect(result.workflow.steps).toEqual(["scout", "collector", "verifier", "analyst", "synthesizer", "memory"]);
    expect(result.riskLevel).toBe("medium");
    expect(validator.validate(result.workflow).valid).toBe(true);
  });

  it("detects price intelligence intent (Chinese)", () => {
    const result = compileIntent("棉花价格走势和化纤成本分析");
    expect(result.detectedIntent).toBe("price_intelligence");
    expect(validator.validate(result.workflow).valid).toBe(true);
  });

  it("detects supply chain risk intent (English)", () => {
    const result = compileIntent("tariff impact on apparel supply chain");
    expect(result.detectedIntent).toBe("supply_chain_risk");
    expect(result.riskLevel).toBe("high");
    expect(result.workflow.enableVerificationGate).toBe(true);
    expect(result.workflow.maxRetries).toBe(3);
    expect(validator.validate(result.workflow).valid).toBe(true);
  });

  it("detects supply chain risk intent (Chinese)", () => {
    const result = compileIntent("供应链风险和断供风险分析");
    expect(result.detectedIntent).toBe("supply_chain_risk");
    expect(validator.validate(result.workflow).valid).toBe(true);
  });

  it("falls back to general intelligence for unknown intent", () => {
    const result = compileIntent("最近有没有机会");
    expect(result.detectedIntent).toBe("general_intelligence");
    expect(result.riskLevel).toBe("low");
    // General intelligence uses LIVE_WORKFLOW (skip scout)
    expect(result.workflow.steps[0]).toBe("collector");
    expect(validator.validate(result.workflow).valid).toBe(true);
  });

  it("compiled workflows always pass validation", () => {
    for (const intent of ["cotton price", "tariff risk", "hello world", "棉花成本", "关税风险"]) {
      const result = compileIntent(intent);
      expect(validator.validate(result.workflow).valid).toBe(true);
    }
  });

  it("assumptions are non-empty for all intent types", () => {
    for (const intent of ["cotton", "tariff", "hello"]) {
      const result = compileIntent(intent);
      expect(result.assumptions.length).toBeGreaterThan(0);
    }
  });

  it("price/risk workflows can be stripped of scout for live mode", () => {
    // intelligence-routes.ts filters out "scout" before passing to runLiveSwarm,
    // because live-swarm.ts already runs scout separately for source matching.
    const priceResult = compileIntent("cotton price trend");
    const liveSteps = priceResult.workflow.steps.filter((s) => s !== "scout");

    expect(liveSteps[0]).toBe("collector");
    expect(liveSteps[liveSteps.length - 1]).toBe("memory");
    expect(liveSteps).not.toContain("scout");

    // The stripped workflow should still pass validation
    const strippedWorkflow = { ...priceResult.workflow, steps: liveSteps };
    expect(validator.validate(strippedWorkflow).valid).toBe(true);
  });
});
