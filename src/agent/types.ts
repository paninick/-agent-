import { z } from "zod";

export const LaunchInputSchema = z.object({
  productBrief: z.string().min(12, "Describe the launch idea in at least a sentence."),
  audience: z.string().optional().default(""),
  launchDate: z.string().optional().default(""),
  constraints: z.string().optional().default(""),
  assets: z.string().optional().default("")
});

export type LaunchInput = z.infer<typeof LaunchInputSchema>;

export type LaunchTask = {
  title: string;
  lane: "Product" | "Engineering" | "Go-to-market" | "Support" | "Legal" | "Data";
  priority: "P0" | "P1" | "P2";
  ownerHint: string;
  dueOffset: string;
  evidence: string;
};

export type ReadinessItem = {
  area: string;
  score: number;
  status: "ready" | "watch" | "blocked";
  rationale: string;
};

export type OwnerChecklist = {
  owner: string;
  items: string[];
};
