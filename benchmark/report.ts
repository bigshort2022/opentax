import { basename } from "node:path";
import type { BenchmarkDiscovery } from "./harness.ts";
import {
  parseReviewedSyntheticFixture,
  type ReviewedSyntheticFixture,
  type ReviewedAssertionEvidence,
} from "./reviewed_contract.ts";

export const LEGACY_BENCHMARK_TOLERANCE = 5;
export const PUBLISHED_LINE_TOLERANCE = 0;
export const REVIEWED_SYNTHETIC_TOLERANCE = 0;

export type NumericLineFailure = {
  readonly line: string;
  readonly expected: number;
  readonly actual: unknown;
  readonly reason: "missing" | "multi_entry" | "nonfinite" | "mismatch";
  readonly tolerance: number;
};

export type UnsupportedCheck = {
  readonly field: string;
  readonly expected: number;
  readonly kind: "unmapped_oracle";
};

export enum BenchmarkIssue {
  NumericMismatch = "numeric_mismatch",
  InvalidActual = "missing_or_invalid_actual",
  Unmapped = "unmapped_check",
  Source = "source_limitation",
  Executor = "executor_error",
  Other = "other_error",
}

export const BENCHMARK_ISSUE_TAGS: Readonly<Record<BenchmarkIssue, string>> = {
  [BenchmarkIssue.NumericMismatch]: "NUM",
  [BenchmarkIssue.InvalidActual]: "OUT",
  [BenchmarkIssue.Unmapped]: "MAP",
  [BenchmarkIssue.Source]: "SRC",
  [BenchmarkIssue.Executor]: "EXEC",
  [BenchmarkIssue.Other]: "ERR",
};

export type BenchmarkOracle = {
  readonly scope: "full_return" | "published_lines" | "reviewed_synthetic";
  readonly citations: readonly string[];
  readonly sourceIssues: readonly string[];
  readonly provenance?: ReviewedSyntheticFixture["provenance"];
};

export type AssertionEvidence = ReviewedAssertionEvidence & {
  readonly expected: number;
  readonly actual: unknown;
  readonly matched: boolean;
};

export type BenchmarkCaseResult = {
  readonly name: string;
  readonly correct: Readonly<Record<string, number>>;
  readonly lineFailures: readonly NumericLineFailure[];
  readonly unsupportedChecks: readonly UnsupportedCheck[];
  readonly errors: readonly string[];
  readonly issues: readonly BenchmarkIssue[];
  readonly ok: boolean;
  /** Null means the expected-value file could not be read or validated. */
  readonly oracle: BenchmarkOracle | null;
  readonly assertionEvidence?: readonly AssertionEvidence[];
};

/** Presence is metadata, not an independent review of the cited publication. */
export function describeBenchmarkOracle(
  fixture: Readonly<Record<string, unknown>>,
  sourceIssues: readonly string[],
): BenchmarkOracle {
  const citations: string[] = [];
  if (typeof fixture.source === "string" && fixture.source.trim()) {
    citations.push(fixture.source);
  }
  if (typeof fixture.sources === "string" && fixture.sources.trim()) {
    citations.push(fixture.sources);
  } else if (Array.isArray(fixture.sources)) {
    for (const source of fixture.sources) {
      if (typeof source === "string" && source.trim()) citations.push(source);
    }
  }
  const reviewed = fixture.oracle_scope === "reviewed_synthetic"
    ? parseReviewedSyntheticFixture(fixture)
    : undefined;
  return {
    scope: reviewed
      ? "reviewed_synthetic"
      : fixture.oracle_scope === "published_lines"
      ? "published_lines"
      : "full_return",
    citations,
    sourceIssues,
    ...(reviewed ? { provenance: reviewed.provenance } : {}),
  };
}

export function classifyBenchmarkIssues(
  lineFailures: readonly NumericLineFailure[],
  unsupportedChecks: readonly UnsupportedCheck[],
  errors: readonly string[],
): BenchmarkIssue[] {
  let mismatch = false, invalid = false;
  for (const failure of lineFailures) {
    if (failure.reason === "mismatch") mismatch = true;
    else invalid = true;
  }
  let source = false, executor = false, other = false;
  for (const error of errors) {
    if (error.startsWith("Unresolved fixture source:")) source = true;
    else if (error.startsWith("[EXECUTOR_")) executor = true;
    else other = true;
  }
  const issues: BenchmarkIssue[] = [];
  if (mismatch) issues.push(BenchmarkIssue.NumericMismatch);
  if (invalid) issues.push(BenchmarkIssue.InvalidActual);
  if (unsupportedChecks.length > 0) issues.push(BenchmarkIssue.Unmapped);
  if (source) issues.push(BenchmarkIssue.Source);
  if (executor) issues.push(BenchmarkIssue.Executor);
  if (other) issues.push(BenchmarkIssue.Other);
  return issues;
}

export function buildBenchmarkReport(
  form: string,
  year: number,
  discovery: BenchmarkDiscovery,
  results: readonly BenchmarkCaseResult[],
) {
  const failureBreakdown = {
    comparedLineFailures: 0,
    errorsWithoutLineFailures: 0,
    unmappedOnly: 0,
  };
  const failureCauses: Record<BenchmarkIssue, number> = {
    [BenchmarkIssue.NumericMismatch]: 0,
    [BenchmarkIssue.InvalidActual]: 0,
    [BenchmarkIssue.Unmapped]: 0,
    [BenchmarkIssue.Source]: 0,
    [BenchmarkIssue.Executor]: 0,
    [BenchmarkIssue.Other]: 0,
  };
  const provenance = {
    citationPresent: 0,
    citationMissing: 0,
    citationUnavailable: 0,
    missingCitationCases: [] as string[],
    passingWithoutCitation: [] as string[],
    sourceLimitedCases: [] as string[],
  };
  const oracleScopes = { fullReturn: 0, publishedLines: 0, reviewedSynthetic: 0, unavailable: 0 };
  const publishedLineCases: { name: string; scoredLines: string[] }[] = [];
  const reviewedSyntheticCases: {
    name: string;
    declaredFields: string[];
    scoredFields: string[];
    evidence: readonly AssertionEvidence[];
  }[] = [];
  const caseProvenance: { name: string; oracle: BenchmarkOracle | null }[] = [];
  const failures: Pick<
    BenchmarkCaseResult,
    "name" | "lineFailures" | "unsupportedChecks" | "errors" | "issues"
  >[] = [];
  const executedNames = new Set<string>();
  let passed = 0;
  for (const result of results) {
    executedNames.add(result.name);
    if (result.ok) passed++;
    else {
      failures.push({
        name: result.name,
        lineFailures: result.lineFailures,
        unsupportedChecks: result.unsupportedChecks,
        errors: result.errors,
        issues: result.issues,
      });
      if (result.lineFailures.length > 0) failureBreakdown.comparedLineFailures++;
      else if (result.errors.length > 0) failureBreakdown.errorsWithoutLineFailures++;
      else failureBreakdown.unmappedOnly++;
    }
    for (const issue of result.issues) failureCauses[issue]++;
    const oracle = result.oracle;
    caseProvenance.push({ name: result.name, oracle });
    if (oracle === null) {
      provenance.citationUnavailable++;
      oracleScopes.unavailable++;
      continue;
    }
    if (oracle.citations.length > 0) provenance.citationPresent++;
    else {
      provenance.citationMissing++;
      provenance.missingCitationCases.push(result.name);
      if (result.ok) provenance.passingWithoutCitation.push(result.name);
    }
    if (oracle.sourceIssues.length > 0) {
      provenance.sourceLimitedCases.push(result.name);
    }
    if (oracle.scope === "published_lines") {
      oracleScopes.publishedLines++;
      publishedLineCases.push({
        name: result.name,
        scoredLines: Object.keys(result.correct),
      });
    } else if (oracle.scope === "reviewed_synthetic") {
      oracleScopes.reviewedSynthetic++;
      reviewedSyntheticCases.push({
        name: result.name,
        declaredFields: Object.keys(oracle.provenance?.assertions ?? {}),
        scoredFields: Object.keys(result.correct),
        evidence: result.assertionEvidence ?? [],
      });
    } else oracleScopes.fullReturn++;
  }
  const notRunCases = discovery.found.map((directory) => basename(directory))
    .filter((name) => !executedNames.has(name));
  failures.sort((a, b) => a.name.localeCompare(b.name));
  caseProvenance.sort((a, b) => a.name.localeCompare(b.name));
  publishedLineCases.sort((a, b) => a.name.localeCompare(b.name));
  reviewedSyntheticCases.sort((a, b) => a.name.localeCompare(b.name));
  provenance.missingCitationCases.sort();
  provenance.passingWithoutCitation.sort();
  provenance.sourceLimitedCases.sort();
  return {
    form,
    year,
    counts: {
      discovered: discovery.found.length + discovery.excluded.length,
      runnable: discovery.found.length,
      executed: results.length,
      excludedKnownInvalid: discovery.excluded.length,
      notRun: notRunCases.length,
      passed,
      failed: results.length - passed,
    },
    failureBreakdown,
    failureCauses,
    failing: failures.map(({ name }) => name),
    failures,
    excludedCases: discovery.excluded,
    notRunCases,
    provenance,
    oracleScopes,
    publishedLineCases,
    reviewedSyntheticCases,
    caseProvenance,
    validationLimits: {
      currency: "USD",
      fullReturnAbsoluteTolerance: LEGACY_BENCHMARK_TOLERANCE,
      publishedLineAbsoluteTolerance: PUBLISHED_LINE_TOLERANCE,
      reviewedSyntheticAbsoluteTolerance: REVIEWED_SYNTHETIC_TOLERANCE,
      independentSourceVerification: false,
      fullReturnCertification: false,
      executorFailureAmounts: "partial_or_unavailable",
    },
  };
}

export type BenchmarkReport = ReturnType<typeof buildBenchmarkReport>;

export function formatBenchmarkSummary(report: BenchmarkReport): string {
  const { counts, failureBreakdown, provenance, oracleScopes, validationLimits } = report;
  const lines = [
    `Benchmark ${report.form}:${report.year}`,
    `  Corpus: ${counts.discovered} discovered = ${counts.runnable} runnable + ${counts.excludedKnownInvalid} known-invalid exclusions.`,
    `  Execution: ${counts.executed} executed; ${counts.notRun} runnable cases not executed.`,
    `  Results: ${counts.passed} PASS / ${counts.failed} FAIL (executed cases only).`,
    "",
    "Failure groups (disjoint; sum to FAIL):",
    `  ${failureBreakdown.comparedLineFailures} with compared-line failures`,
    `  ${failureBreakdown.errorsWithoutLineFailures} with errors but no compared-line failures`,
    `  ${failureBreakdown.unmappedOnly} with unmapped checks only`,
    "Failure causes (overlapping case counts; do not sum):",
  ];
  for (const [issue, count] of Object.entries(report.failureCauses)) {
    lines.push(`  ${issue}: ${count}`);
  }
  lines.push(
    "",
    "Citation metadata (executed cases; presence is not source verification):",
    `  ${provenance.citationPresent} present / ${provenance.citationMissing} missing / ${provenance.citationUnavailable} unavailable.`,
    `  ${provenance.passingWithoutCitation.length} passing cases have no citation; ${provenance.sourceLimitedCases.length} cases declare unresolved source limitations.`,
  );
  if (provenance.passingWithoutCitation.length > 0) {
    lines.push(`  Passing without citation: ${provenance.passingWithoutCitation.join(", ")}`);
  }
  lines.push(
    "",
    `Scoring: ${oracleScopes.fullReturn} full-return cases use an inclusive absolute $${validationLimits.fullReturnAbsoluteTolerance} legacy tolerance; ${oracleScopes.publishedLines} published-line and ${oracleScopes.reviewedSynthetic} reviewed-synthetic cases use exact dollar equality.`,
    `  ${oracleScopes.unavailable} cases have unavailable oracle metadata.`,
    "Limits: no independent IRS-source verification or full-return certification. Published-line cases verify only their scored lines.",
    "  Green means within the applicable comparison tolerance, not IRS approval. Unscored columns are dim; N/A means unavailable or invalid.",
    "  EXEC rows may show partial/default amounts after a node rejection; do not treat them as complete returns.",
    "Issue tags: NUM=numeric mismatch; OUT=missing/invalid actual; MAP=unmapped check; SRC=source limitation; EXEC=executor error; ERR=other execution/scoring error.",
  );
  if (report.publishedLineCases.length > 0) {
    lines.push("", "Published-line checks (only these keys are scored):");
    for (const published of report.publishedLineCases) {
      lines.push(`  ${published.name}: ${published.scoredLines.join(", ") || "none compared"}`);
    }
  }
  if (report.reviewedSyntheticCases.length > 0) {
    lines.push("", "Reviewed synthetic assertions (exact; not published completed returns):");
    for (const reviewed of report.reviewedSyntheticCases) {
      const matched = reviewed.evidence.filter((entry) => entry.matched).length;
      lines.push(`  ${reviewed.name}: ${matched}/${reviewed.scoredFields.length} compared assertions match; ${reviewed.scoredFields.length}/${reviewed.declaredFields.length} declared assertions compared.`);
      for (const entry of reviewed.evidence) {
        lines.push(
          `    ${entry.field}: ${entry.matched ? "MATCH" : "FAIL"}; expected=${entry.expected}; actual=${JSON.stringify(entry.actual)}; ${entry.status}`,
          `      ${entry.observable}: ${entry.detail}`,
        );
      }
    }
    lines.push("  No-contribution evidence does not certify unused worksheets or synthetic eligibility.");
  }
  if (report.excludedCases.length > 0) {
    lines.push("", "Known-invalid exclusions (not executed; outside PASS/FAIL):");
    for (const excluded of report.excludedCases) {
      lines.push(
        `  ${excluded.case} (expires ${excluded.expires}; approved by ${excluded.approvedBy})`,
        `    Baseline: ${excluded.reason}`,
        `    Validation: ${excluded.validationError}`,
      );
    }
  }
  if (report.notRunCases.length > 0) {
    lines.push("", `Runnable but not executed: ${report.notRunCases.join(", ")}`);
  }
  return lines.join("\n") + "\n";
}
