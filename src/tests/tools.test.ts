import { describe, expect, it } from "vitest";
import { checkReadiness, draftChannelCopy, extractTasks, generateOwnerChecklists } from "../agent/tools";
import type { LaunchInput } from "../agent/types";

const input: LaunchInput = {
  productBrief: "Launch a developer API beta for data export with privacy-sensitive audit logs.",
  audience: "Enterprise data engineers",
  launchDate: "2026-07-30",
  constraints: "Legal review and limited beta allowlist required.",
  assets: "API docs, FAQ, demo video, dashboard"
};

describe("Launch Desk tools", () => {
  it("extracts prioritized tasks with domain-specific additions", () => {
    const tasks = extractTasks(input);
    expect(tasks.some((task) => task.title.includes("developer docs"))).toBe(true);
    expect(tasks.some((task) => task.lane === "Legal")).toBe(true);
    expect(tasks.filter((task) => task.priority === "P0").length).toBeGreaterThan(2);
  });

  it("checks readiness against the launch rubric", () => {
    const readiness = checkReadiness(input);
    expect(readiness).toHaveLength(4);
    expect(readiness.some((item) => item.status === "watch")).toBe(true);
  });

  it("creates checklists grouped by owner", () => {
    const checklists = generateOwnerChecklists(input);
    expect(checklists.some((group) => group.owner === "Launch captain")).toBe(true);
    expect(checklists.flatMap((group) => group.items).some((item) => item.includes("P0"))).toBe(true);
  });

  it("drafts copy for multiple launch channels", () => {
    const copy = draftChannelCopy(input);
    expect(copy.internalSlack).toContain("Launch Desk draft");
    expect(copy.customerEmail).toContain("Subject:");
    expect(copy.changelog).toContain("2026-07-30");
  });
});
