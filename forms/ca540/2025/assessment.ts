import type { ZodIssue } from "zod";
import {
  deriveLocalReadiness,
  GateId,
  type GateResult,
  GateStatus,
} from "../../../core/validation/readiness.ts";
import {
  ExternalCheckStatus,
  type StateAssessment,
  type StateCalculation,
  type StateDiagnosticsReport,
  type StateFinding,
} from "../../../core/validation/state-report.ts";
import { calculateForm540 } from "./calculation.ts";
import { assessCoverage } from "./coverage.ts";
import {
  Ca540DiagnosticCode,
  form540Finding,
  reviewFindings,
} from "./diagnostics.ts";
import { type Form540Input, form540InputSchema } from "./input.ts";

const EXTERNAL_CHECKS: StateDiagnosticsReport["externalChecks"] = [
  {
    id: "ftb_records",
    status: ExternalCheckStatus.Unverified,
    message:
      "FTB account history, prior-year AGI matching, and duplicate-return checks are not verified locally.",
  },
  {
    id: "provider_approval",
    status: ExternalCheckStatus.Unverified,
    message:
      "Approved-provider compatibility and official PATS qualification are unverified.",
  },
  {
    id: "transmission_acceptance",
    status: ExternalCheckStatus.Unverified,
    message:
      "No return has been transmitted; FTB acceptance and payment are not authorized or verified.",
  },
];

function gateResults(
  input: Form540Input | undefined,
  calculation: StateCalculation | undefined,
  findings: readonly StateFinding[],
): GateResult[] {
  const codes: Record<GateId, string[]> = {
    [GateId.Scope]: [],
    [GateId.Inputs]: [],
    [GateId.Calculation]: [],
    [GateId.Review]: [],
    [GateId.RequiredDocuments]: [],
    [GateId.MefSchema]: [],
    [GateId.LocalRules]: [],
  };
  for (const finding of findings) {
    const stageCodes = codes[finding.stage];
    if (!stageCodes.includes(finding.ruleNumber)) {
      stageCodes.push(finding.ruleNumber);
    }
  }
  const statuses: Readonly<Record<GateId, GateStatus>> = {
    [GateId.Scope]: GateStatus.Unsupported,
    [GateId.Inputs]: input ? GateStatus.Passed : GateStatus.Failed,
    [GateId.Calculation]: codes[GateId.Calculation].length > 0
      ? GateStatus.Failed
      : calculation
      ? GateStatus.Passed
      : GateStatus.NotRun,
    [GateId.Review]: !input
      ? GateStatus.NotRun
      : codes[GateId.Review].length > 0
      ? GateStatus.Failed
      : GateStatus.Passed,
    [GateId.RequiredDocuments]:
      findings.some((finding) =>
          finding.stage === GateId.RequiredDocuments &&
          finding.category === "unsupported"
        )
        ? GateStatus.Unsupported
        : GateStatus.NotRun,
    [GateId.MefSchema]: GateStatus.Unavailable,
    [GateId.LocalRules]: GateStatus.Unavailable,
  };
  return Object.values(GateId).map((id) => ({
    id,
    status: statuses[id],
    diagnosticCodes: codes[id],
  }));
}

function invalidInputFindings(issues: readonly ZodIssue[]): StateFinding[] {
  const fields = new Set<string>();
  for (const issue of issues) {
    const root = issue.path[0];
    const child = issue.path[1];
    let field = "ca540";
    if (
      typeof root === "string" && Object.hasOwn(form540InputSchema.shape, root)
    ) {
      field = root;
      if (
        root === "review" && typeof child === "string" &&
        Object.hasOwn(form540InputSchema.shape.review.shape, child)
      ) field = `review.${child}`;
    }
    fields.add(field);
  }
  return [...fields].map((field) => ({
    ...form540Finding(Ca540DiagnosticCode.InputInvalid),
    field,
    message:
      `The workpaper field ${field} is missing or invalid; inspect its schema and source facts.`,
  }));
}

/** Inspect one loaded snapshot; no writes, network calls, or filing authorization. */
export function assessForm540(entries: readonly unknown[]): StateAssessment {
  let input: Form540Input | undefined;
  let calculation: StateCalculation | undefined;
  const findings: StateFinding[] = [];
  if (entries.length !== 1) {
    findings.push(form540Finding(Ca540DiagnosticCode.InputCount));
  } else {
    const parsed = form540InputSchema.safeParse(entries[0]);
    if (!parsed.success) {
      findings.push(...invalidInputFindings(parsed.error.issues));
    } else {
      input = parsed.data;
      try {
        const computed = calculateForm540(input);
        if (
          Object.values(computed.lines).some((amount) =>
            !Number.isSafeInteger(amount)
          )
        ) {
          throw new RangeError("Unsafe workpaper calculation");
        }
        calculation = computed;
        findings.push(...computed.findings);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        findings.push(
          ...reviewFindings(input),
          form540Finding(Ca540DiagnosticCode.CalculationRange),
        );
      }
    }
  }
  findings.push(
    form540Finding(Ca540DiagnosticCode.Scope),
    form540Finding(Ca540DiagnosticCode.RequiredDocumentsUnknown),
    form540Finding(Ca540DiagnosticCode.SchemaUnavailable),
    form540Finding(Ca540DiagnosticCode.RulesUnavailable),
  );
  const gates = gateResults(input, calculation, findings);
  const readiness = deriveLocalReadiness(gates);
  const summary = {
    total: gates.length,
    passed: 0,
    rejected: 0,
    alerts: 0,
    skipped: 0,
  };
  for (const gate of gates) {
    if (gate.status === GateStatus.Passed) summary.passed++;
    else if (
      gate.status === GateStatus.Failed ||
      gate.status === GateStatus.Unsupported
    ) summary.rejected++;
    else summary.skipped++;
  }
  return {
    calculation,
    report: {
      validationScope: "ca540-workpaper",
      profile: "workpaper",
      product: { formType: "ca540", taxYear: 2025 },
      entries: findings,
      summary,
      canFile: readiness.canFile,
      readiness,
      gates,
      coverage: assessCoverage(input),
      documents: { requirementsKnown: false, required: [], produced: [] },
      externalChecks: EXTERNAL_CHECKS,
    },
  };
}
