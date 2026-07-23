import type { EvidenceEntry, IntelligenceSource } from "./types";
import { createEvidenceEntry } from "./evidenceLedger";

export interface MaterialBomInput {
  styleId: string;
  finishedUnits: number;
  fabricKgPerUnit: number;
  cuttingWasteRate: number;
  yarnToFabricYieldRate: number;
  fiberToYarnYieldRate?: number;
  accessories?: Array<{
    name: string;
    unitsPerGarment: number;
    wastageRate?: number;
  }>;
  assumptions: string[];
}

export interface MaterialRequirementResult {
  styleId: string;
  finishedUnits: number;
  netFabricKg: number;
  grossFabricKg: number;
  yarnInputKg: number;
  fiberInputKg?: number;
  accessories: Array<{
    name: string;
    requiredUnits: number;
  }>;
  assumptions: string[];
  warnings: string[];
}

export interface ObservedMaterialQuantity {
  label: string;
  material: "fabric" | "yarn" | "fiber";
  quantityKg: number;
  tolerancePct: number;
}

export interface MaterialQuantityReconciliation {
  label: string;
  material: ObservedMaterialQuantity["material"];
  expectedKg: number;
  observedKg: number;
  deltaKg: number;
  deltaPct: number;
  tolerancePct: number;
  status: "matched" | "outside_tolerance";
}

export function calculateMaterialRequirements(input: MaterialBomInput): MaterialRequirementResult {
  assertPositive(input.finishedUnits, "finishedUnits");
  assertPositive(input.fabricKgPerUnit, "fabricKgPerUnit");
  assertRate(input.cuttingWasteRate, "cuttingWasteRate");
  assertRate(input.yarnToFabricYieldRate, "yarnToFabricYieldRate");
  if (input.fiberToYarnYieldRate !== undefined) assertRate(input.fiberToYarnYieldRate, "fiberToYarnYieldRate");

  const netFabricKg = input.finishedUnits * input.fabricKgPerUnit;
  const grossFabricKg = netFabricKg / (1 - input.cuttingWasteRate);
  const yarnInputKg = grossFabricKg / input.yarnToFabricYieldRate;
  const fiberInputKg =
    input.fiberToYarnYieldRate === undefined ? undefined : yarnInputKg / input.fiberToYarnYieldRate;
  const warnings: string[] = [];

  if (input.cuttingWasteRate > 0.18) warnings.push("Cutting waste rate is high; verify marker efficiency and fabric defects.");
  if (input.yarnToFabricYieldRate < 0.9) warnings.push("Yarn-to-fabric yield is low; verify knitting/dyeing loss assumptions.");
  if ((input.assumptions ?? []).length === 0) warnings.push("No assumptions were documented.");

  return {
    styleId: input.styleId,
    finishedUnits: input.finishedUnits,
    netFabricKg: roundKg(netFabricKg),
    grossFabricKg: roundKg(grossFabricKg),
    yarnInputKg: roundKg(yarnInputKg),
    fiberInputKg: fiberInputKg === undefined ? undefined : roundKg(fiberInputKg),
    accessories: (input.accessories ?? []).map((accessory) => ({
      name: accessory.name,
      requiredUnits: Math.ceil(input.finishedUnits * accessory.unitsPerGarment * (1 + (accessory.wastageRate ?? 0)))
    })),
    assumptions: input.assumptions,
    warnings
  };
}

export function reconcileObservedMaterialQuantity(
  expected: MaterialRequirementResult,
  observed: ObservedMaterialQuantity
): MaterialQuantityReconciliation {
  const expectedKg = expectedQuantityForMaterial(expected, observed.material);
  const deltaKg = observed.quantityKg - expectedKg;
  const deltaPct = expectedKg === 0 ? 0 : deltaKg / expectedKg;

  return {
    label: observed.label,
    material: observed.material,
    expectedKg: roundKg(expectedKg),
    observedKg: roundKg(observed.quantityKg),
    deltaKg: roundKg(deltaKg),
    deltaPct: roundRate(deltaPct),
    tolerancePct: observed.tolerancePct,
    status: Math.abs(deltaPct) <= observed.tolerancePct ? "matched" : "outside_tolerance"
  };
}

export function materialRequirementToEvidence(args: {
  source: IntelligenceSource;
  result: MaterialRequirementResult;
  reconciliations?: MaterialQuantityReconciliation[];
  observedAt?: string;
}): EvidenceEntry {
  const reconciliationSummary = (args.reconciliations ?? [])
    .map((item) => `${item.material}:${item.status}:${item.deltaPct}`)
    .join("; ");

  return createEvidenceEntry({
    source: args.source,
    kind: "material_quantity",
    subject: args.result.styleId,
    claim: `BOM material model derives fabric, yarn, and fiber requirements for ${args.result.finishedUnits} finished units`,
    observedAt: args.observedAt,
    value: [
      `netFabricKg=${args.result.netFabricKg}`,
      `grossFabricKg=${args.result.grossFabricKg}`,
      `yarnInputKg=${args.result.yarnInputKg}`,
      args.result.fiberInputKg === undefined ? undefined : `fiberInputKg=${args.result.fiberInputKg}`,
      reconciliationSummary ? `reconciliation=${reconciliationSummary}` : undefined
    ]
      .filter(Boolean)
      .join("; "),
    unit: "kg and accessory native units",
    method: "manual",
    conversions: [
      "netFabricKg = finishedUnits * fabricKgPerUnit.",
      "grossFabricKg = netFabricKg / (1 - cuttingWasteRate).",
      "yarnInputKg = grossFabricKg / yarnToFabricYieldRate."
    ],
    crossChecks: ["customs_records", "supplier_shipments", "warehouse_ledger"],
    contradictions: (args.reconciliations ?? [])
      .filter((item) => item.status === "outside_tolerance")
      .map((item) => `${item.label} ${item.material} quantity outside tolerance by ${item.deltaPct}`),
    notes: [
      ...args.result.assumptions.map((assumption) => `Assumption: ${assumption}`),
      ...args.result.warnings.map((warning) => `Warning: ${warning}`),
      "反证扫描: compare against customs quantity, supplier shipment, and warehouse material ledger before accepting physical volume."
    ]
  });
}

function expectedQuantityForMaterial(expected: MaterialRequirementResult, material: ObservedMaterialQuantity["material"]) {
  if (material === "fabric") return expected.grossFabricKg;
  if (material === "yarn") return expected.yarnInputKg;
  if (expected.fiberInputKg === undefined) {
    throw new Error("fiberInputKg is unavailable because fiberToYarnYieldRate was not provided");
  }
  return expected.fiberInputKg;
}

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number`);
}

function assertRate(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) throw new Error(`${label} must be between 0 and 1`);
}

function roundKg(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundRate(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
