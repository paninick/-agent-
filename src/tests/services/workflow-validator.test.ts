import { describe, expect, it } from "vitest";
import { WorkflowValidator } from "../../services/workflow-validator";
import type { SwarmWorkflow, AgentRole } from "../../intelligence/spine/types";
import { DEFAULT_SWARM_WORKFLOW } from "../../intelligence/swarm/profiles";

const validator = new WorkflowValidator();

const validWorkflow: SwarmWorkflow = {
  id: "test-valid",
  name: "Valid",
  steps: ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"],
};

const validLiveWorkflow: SwarmWorkflow = {
  id: "test-live",
  name: "Live",
  steps: ["collector", "verifier", "analyst", "synthesizer", "memory"],
};

describe("WorkflowValidator", () => {
  it("accepts the default full pipeline", () => {
    const result = validator.validate(DEFAULT_SWARM_WORKFLOW);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("accepts a live workflow starting with collector", () => {
    const result = validator.validate(validLiveWorkflow);
    expect(result.valid).toBe(true);
  });

  it("rejects empty steps", () => {
    const result = validator.validate({ id: "x", name: "x", steps: [] });
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("WORKFLOW_STEPS_EMPTY");
  });

  it("rejects unknown role", () => {
    const result = validator.validate({
      id: "x",
      name: "x",
      steps: ["scout", "unknown_role" as unknown as AgentRole, "memory"],
    });
    expect(result.issues.map((i) => i.code)).toContain("WORKFLOW_UNKNOWN_ROLE");
  });

  it("rejects first step that is not scout or collector", () => {
    const result = validator.validate({
      id: "x",
      name: "x",
      steps: ["verifier", "memory"],
    });
    expect(result.issues.map((i) => i.code)).toContain("WORKFLOW_INVALID_FIRST_STEP");
  });

  it("rejects last step that is not memory", () => {
    const result = validator.validate({
      id: "x",
      name: "x",
      steps: ["scout", "collector", "analyst"],
    });
    expect(result.issues.map((i) => i.code)).toContain("WORKFLOW_INVALID_LAST_STEP");
  });

  it("rejects duplicate roles", () => {
    const result = validator.validate({
      id: "x",
      name: "x",
      steps: ["scout", "scout", "memory"],
    });
    expect(result.issues.map((i) => i.code)).toContain("WORKFLOW_DUPLICATE_ROLE");
  });

  it("rejects memory appearing in non-last position", () => {
    const result = validator.validate({
      id: "x",
      name: "x",
      steps: ["scout", "memory", "collector", "memory"],
    });
    expect(result.issues.map((i) => i.code)).toContain("WORKFLOW_MEMORY_NOT_LAST");
  });
});
