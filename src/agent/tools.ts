import { tool } from "@openai/agents";
import { z } from "zod";
import type { LaunchInput, LaunchTask, OwnerChecklist, ReadinessItem } from "./types";

const launchArgs = z.object({
  productBrief: z.string(),
  audience: z.string().optional().default(""),
  launchDate: z.string().optional().default(""),
  constraints: z.string().optional().default(""),
  assets: z.string().optional().default("")
});

const assetHints = [
  ["docs", "Docs"],
  ["demo", "Demo"],
  ["video", "Video"],
  ["case study", "Customer proof"],
  ["faq", "FAQ"],
  ["pricing", "Pricing"],
  ["migration", "Migration guide"]
] as const;

export function extractTasks(input: LaunchInput): LaunchTask[] {
  const brief = input.productBrief.toLowerCase();
  const constraints = input.constraints.toLowerCase();
  const tasks: LaunchTask[] = [
    {
      title: "Freeze launch scope and acceptance criteria",
      lane: "Product",
      priority: "P0",
      ownerHint: "PM",
      dueOffset: "T-21d",
      evidence: "Every launch needs a shared definition of done before readiness work starts."
    },
    {
      title: "Complete release branch, rollback plan, and production smoke test",
      lane: "Engineering",
      priority: "P0",
      ownerHint: "Engineering lead",
      dueOffset: "T-10d",
      evidence: "Engineering readiness, rollback, and smoke coverage protect launch-day stability."
    },
    {
      title: "Prepare launch narrative, changelog, and customer-facing FAQ",
      lane: "Go-to-market",
      priority: "P1",
      ownerHint: "PMM",
      dueOffset: "T-7d",
      evidence: "The audience needs crisp positioning and support needs a canonical source of truth."
    },
    {
      title: "Train support and success on value prop, limits, and escalation path",
      lane: "Support",
      priority: "P1",
      ownerHint: "Support lead",
      dueOffset: "T-5d",
      evidence: "Launch plans are only actionable when customer-facing teams can answer edge cases."
    },
    {
      title: "Instrument adoption, activation, error, and rollback dashboards",
      lane: "Data",
      priority: "P1",
      ownerHint: "Data owner",
      dueOffset: "T-3d",
      evidence: "A release without measurement cannot distinguish traction from trouble."
    }
  ];

  if (brief.includes("api") || brief.includes("developer") || brief.includes("sdk")) {
    tasks.push({
      title: "Publish developer docs, sample request, and compatibility notes",
      lane: "Engineering",
      priority: "P0",
      ownerHint: "DevEx engineer",
      dueOffset: "T-7d",
      evidence: "Developer launches require tested examples and version guidance."
    });
  }

  if (brief.includes("beta") || constraints.includes("limited") || constraints.includes("allowlist")) {
    tasks.push({
      title: "Define beta eligibility, allowlist operations, and feedback intake",
      lane: "Product",
      priority: "P0",
      ownerHint: "PM",
      dueOffset: "T-14d",
      evidence: "Controlled launches need explicit enrollment and feedback loops."
    });
  }

  if (constraints.includes("legal") || constraints.includes("privacy") || brief.includes("data")) {
    tasks.push({
      title: "Close privacy, legal, and data retention review",
      lane: "Legal",
      priority: "P0",
      ownerHint: "Legal/privacy partner",
      dueOffset: "T-12d",
      evidence: "Data-sensitive launches should not depend on launch-week approvals."
    });
  }

  const availableAssetLabels = assetHints
    .filter(([needle]) => input.assets.toLowerCase().includes(needle))
    .map(([, label]) => label);

  if (availableAssetLabels.length === 0) {
    tasks.push({
      title: "Create minimum launch asset pack",
      lane: "Go-to-market",
      priority: "P1",
      ownerHint: "PMM",
      dueOffset: "T-6d",
      evidence: "No reusable assets were listed, so the launch needs at least copy, screenshots, and FAQ."
    });
  }

  return tasks;
}

export function checkReadiness(input: LaunchInput, tasks = extractTasks(input)): ReadinessItem[] {
  const lower = `${input.productBrief} ${input.constraints} ${input.assets}`.toLowerCase();
  const hasAudience = input.audience.trim().length > 3;
  const hasDate = input.launchDate.trim().length > 3;
  const hasAssets = input.assets.trim().length > 10;
  const hasRiskSignals = ["migration", "pricing", "security", "privacy", "api", "dependency"].some((risk) =>
    lower.includes(risk)
  );
  const p0Count = tasks.filter((task) => task.priority === "P0").length;

  return [
    {
      area: "Launch definition",
      score: hasAudience && hasDate ? 4 : 2,
      status: hasAudience && hasDate ? "ready" : "blocked",
      rationale: hasAudience && hasDate ? "Audience and timing are present." : "Audience or launch date is missing."
    },
    {
      area: "Execution complexity",
      score: p0Count > 3 || hasRiskSignals ? 2 : 3,
      status: p0Count > 3 || hasRiskSignals ? "watch" : "ready",
      rationale: hasRiskSignals ? "The brief contains signals that need explicit mitigation." : "The task profile is manageable."
    },
    {
      area: "Asset readiness",
      score: hasAssets ? 3 : 1,
      status: hasAssets ? "watch" : "blocked",
      rationale: hasAssets ? "Assets exist but still need channel mapping." : "No launch assets were listed."
    },
    {
      area: "Measurement",
      score: lower.includes("metric") || lower.includes("dashboard") || lower.includes("analytics") ? 4 : 2,
      status: lower.includes("metric") || lower.includes("dashboard") || lower.includes("analytics") ? "ready" : "watch",
      rationale: lower.includes("metric") || lower.includes("dashboard") || lower.includes("analytics")
        ? "Measurement has been mentioned."
        : "Success metrics should be named before launch."
    }
  ];
}

export function generateOwnerChecklists(input: LaunchInput, tasks = extractTasks(input)): OwnerChecklist[] {
  const grouped = new Map<string, string[]>();
  for (const task of tasks) {
    const existing = grouped.get(task.ownerHint) ?? [];
    existing.push(`${task.priority} ${task.dueOffset}: ${task.title}`);
    grouped.set(task.ownerHint, existing);
  }

  grouped.set("Launch captain", [
    "Run launch readiness review 48 hours before ship.",
    "Confirm owners have accepted P0 tasks.",
    "Publish launch-room decision log and escalation path.",
    "Call go/no-go and capture follow-up questions."
  ]);

  if (!input.audience.trim()) {
    grouped.get("PM")?.push("Define primary audience and excluded segments.");
  }

  return Array.from(grouped, ([owner, items]) => ({ owner, items }));
}

export function draftChannelCopy(input: LaunchInput) {
  const audience = input.audience.trim() || "target users";
  const launchDate = input.launchDate.trim() || "the planned launch window";
  const firstSentence = input.productBrief.split(/[.!?]/)[0]?.trim() || "A new product update";

  return {
    internalSlack: `Launch Desk draft: ${firstSentence} is targeted for ${launchDate}. We are preparing this for ${audience}; reply with blocker, owner, and ETA if your area is not launch-ready.`,
    customerEmail: `Subject: New for ${audience}\n\nWe are preparing ${firstSentence.toLowerCase()} to help ${audience} move faster with fewer launch-day surprises. We will share availability, setup steps, and support resources as the release approaches.`,
    changelog: `Coming ${launchDate}: ${firstSentence}. This release focuses on ${audience}, with rollout notes, known limits, and measurement guidance included in the launch pack.`,
    social: `${firstSentence} is on deck for ${audience}. Follow the launch for availability, examples, and practical rollout guidance.`
  };
}

export const extractTasksFromBriefTool = tool({
  name: "extract_tasks_from_brief",
  description: "Extract prioritized release tasks from the launch brief, constraints, and available assets.",
  parameters: launchArgs,
  async execute(args) {
    return JSON.stringify(extractTasks(args), null, 2);
  }
});

export const checkLaunchReadinessTool = tool({
  name: "check_launch_readiness",
  description: "Score launch readiness against a practical engineering launch rubric.",
  parameters: launchArgs,
  async execute(args) {
    return JSON.stringify(checkReadiness(args), null, 2);
  }
});

export const generateOwnerChecklistsTool = tool({
  name: "generate_owner_checklists",
  description: "Generate owner-specific checklists for launch execution.",
  parameters: launchArgs,
  async execute(args) {
    return JSON.stringify(generateOwnerChecklists(args), null, 2);
  }
});

export const draftChannelCopyTool = tool({
  name: "draft_channel_copy",
  description: "Draft launch copy for Slack, customer email, changelog, and social channels.",
  parameters: launchArgs,
  async execute(args) {
    return JSON.stringify(draftChannelCopy(args), null, 2);
  }
});

export const launchDeskTools = [
  extractTasksFromBriefTool,
  checkLaunchReadinessTool,
  generateOwnerChecklistsTool,
  draftChannelCopyTool
];
