import { z } from "zod";

export enum GateId {
  Scope = "scope",
  Inputs = "inputs",
  Calculation = "calculation",
  Review = "review",
  RequiredDocuments = "required_documents",
  MefSchema = "mef_schema",
  LocalRules = "local_rules",
}

export enum GateStatus {
  Passed = "passed",
  Failed = "failed",
  Unsupported = "unsupported",
  NotRun = "not_run",
  Unavailable = "unavailable",
}

export enum LocalReadiness {
  Ready = "ready",
  Blocked = "blocked",
  Indeterminate = "indeterminate",
}

export const gateResultSchema = z.object({
  id: z.nativeEnum(GateId),
  status: z.nativeEnum(GateStatus),
  diagnosticCodes: z.array(z.string().min(1)).readonly(),
}).strict();
export type GateResult = z.infer<typeof gateResultSchema>;

export const readinessResultSchema = z.object({
  status: z.nativeEnum(LocalReadiness),
  canFile: z.boolean(),
  missingGateIds: z.array(z.nativeEnum(GateId)).readonly(),
}).strict().superRefine((result, context) => {
  if (
    result.canFile !== (result.status === LocalReadiness.Ready) ||
    result.status === LocalReadiness.Ready && result.missingGateIds.length > 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Inconsistent local-readiness result",
    });
  }
});
export type ReadinessResult = z.infer<typeof readinessResultSchema>;

const REQUIRED_GATES = Object.freeze(Object.values(GateId));
const VALID_GATES: Readonly<Record<GateId, true>> = {
  [GateId.Scope]: true,
  [GateId.Inputs]: true,
  [GateId.Calculation]: true,
  [GateId.Review]: true,
  [GateId.RequiredDocuments]: true,
  [GateId.MefSchema]: true,
  [GateId.LocalRules]: true,
};
const VALID_STATUSES: Readonly<Record<GateStatus, true>> = {
  [GateStatus.Passed]: true,
  [GateStatus.Failed]: true,
  [GateStatus.Unsupported]: true,
  [GateStatus.NotRun]: true,
  [GateStatus.Unavailable]: true,
};

/** Combines local evidence; never evaluates tax rules or authorizes filing. */
export function deriveLocalReadiness(
  gates: readonly GateResult[],
): ReadinessResult {
  const seen = new Set<GateId>();
  let blocked = false;
  let incomplete = false;
  for (const gate of gates) {
    if (
      !Object.hasOwn(VALID_GATES, gate.id) ||
      !Object.hasOwn(VALID_STATUSES, gate.status) ||
      seen.has(gate.id)
    ) {
      throw new TypeError("Invalid or duplicate local-readiness gate");
    }
    seen.add(gate.id);
    if (
      gate.status === GateStatus.Failed ||
      gate.status === GateStatus.Unsupported
    ) {
      blocked = true;
    } else if (gate.status !== GateStatus.Passed) {
      incomplete = true;
    }
  }
  const missingGateIds = REQUIRED_GATES.filter((id) => !seen.has(id));
  const status = blocked
    ? LocalReadiness.Blocked
    : incomplete || missingGateIds.length > 0
    ? LocalReadiness.Indeterminate
    : LocalReadiness.Ready;
  return { status, canFile: status === LocalReadiness.Ready, missingGateIds };
}
