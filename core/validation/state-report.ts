import type { CoverageAssessment } from "./coverage.ts";
import type { GateId, GateResult, ReadinessResult } from "./readiness.ts";
import type { DiagnosticEntry, DiagnosticsReport } from "./types.ts";

export enum ExternalCheckStatus {
  Unverified = "unverified",
  NotApplicable = "not_applicable",
}

export interface StateFinding extends DiagnosticEntry {
  readonly stage: GateId;
  readonly field?: string;
  readonly requirementId?: string;
}

export interface StateCalculation {
  readonly lines: Readonly<Record<string, number>>;
  readonly findings: readonly StateFinding[];
}

export interface StateDiagnosticsReport extends DiagnosticsReport {
  readonly validationScope: "ca540-workpaper";
  readonly profile: "workpaper";
  readonly product: { readonly formType: string; readonly taxYear: number };
  readonly readiness: ReadinessResult;
  readonly gates: readonly GateResult[];
  readonly coverage: readonly CoverageAssessment[];
  readonly documents: {
    readonly requirementsKnown: boolean;
    readonly required: readonly string[];
    readonly produced: readonly string[];
  };
  readonly externalChecks: readonly {
    readonly id: string;
    readonly status: ExternalCheckStatus;
    readonly message: string;
  }[];
  readonly entries: readonly StateFinding[];
}

export interface StateAssessment {
  readonly calculation?: StateCalculation;
  readonly report: StateDiagnosticsReport;
}

export function isStateDiagnosticsReport(
  report: DiagnosticsReport,
): report is StateDiagnosticsReport {
  return "validationScope" in report &&
    report.validationScope === "ca540-workpaper";
}
