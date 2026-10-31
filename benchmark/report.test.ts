import { test } from "bun:test";
import { assertEquals } from "@std/assert";
import { join } from "node:path";
import type { BenchmarkDiscovery } from "./harness.ts";
import {
  BenchmarkIssue,
  buildBenchmarkReport,
  classifyBenchmarkIssues,
  describeBenchmarkOracle,
  type BenchmarkCaseResult,
} from "./report.ts";

function result(
  name: string,
  overrides: Partial<Omit<BenchmarkCaseResult, "name" | "issues" | "ok">> = {},
): BenchmarkCaseResult {
  const value = {
    name,
    correct: { line24_total_tax: 100 },
    lineFailures: [],
    unsupportedChecks: [],
    errors: [],
    oracle: describeBenchmarkOracle({ sources: [] }, []),
    ...overrides,
  };
  return {
    ...value,
    issues: classifyBenchmarkIssues(
      value.lineFailures,
      value.unsupportedChecks,
      value.errors,
    ),
    ok: value.lineFailures.length === 0 &&
      value.unsupportedChecks.length === 0 && value.errors.length === 0,
  };
}

const sourceIssue = "Unresolved fixture source: ownership is not established";
const unmapped = {
  field: "ordinary_taxable",
  expected: 100,
  kind: "unmapped_oracle" as const,
};

test("report reconciles exclusions and unexecuted cases without double-counting mixed failures", () => {
  const published = describeBenchmarkOracle({
    oracle_scope: "published_lines",
    source: "IRS Pub 17, tax table example",
  }, []);
  const limited = describeBenchmarkOracle({
    sources: "IRS Pub 17, worksheet",
  }, [sourceIssue]);
  const cases = [
    result("legacy-pass"),
    result("published-pass", { oracle: published }),
    result("mixed", {
      lineFailures: [{
        line: "line24_total_tax",
        expected: 100,
        actual: 200,
        reason: "mismatch",
        tolerance: 5,
      }],
      unsupportedChecks: [unmapped],
      errors: [sourceIssue, "[EXECUTOR_NODE_FAILURE] source: rejected"],
      oracle: limited,
    }),
    result("unmapped", { unsupportedChecks: [unmapped] }),
    result("source", { errors: [sourceIssue], oracle: limited }),
    result("command", { errors: ["opentax command failed (1)"], oracle: null }),
  ];
  const discovery: BenchmarkDiscovery = {
    found: [...cases.map(({ name }) => join("f1040", "2025", name)),
      join("f1040", "2025", "not-run")],
    excluded: [{
      case: "f1040/2025/invalid",
      reason: "Obsolete source shape",
      expires: "2099-01-31",
      approvedBy: "reviewer",
      validationError: "Source schema rejected the fixture",
    }],
  };
  const report = buildBenchmarkReport("f1040", 2025, discovery, cases);
  assertEquals(report.counts, {
    discovered: 8,
    runnable: 7,
    executed: 6,
    excludedKnownInvalid: 1,
    notRun: 1,
    passed: 2,
    failed: 4,
  });
  assertEquals(report.failureBreakdown, {
    comparedLineFailures: 1,
    errorsWithoutLineFailures: 2,
    unmappedOnly: 1,
  });
  assertEquals(report.failureCauses, {
    [BenchmarkIssue.NumericMismatch]: 1,
    [BenchmarkIssue.InvalidActual]: 0,
    [BenchmarkIssue.Unmapped]: 2,
    [BenchmarkIssue.Source]: 2,
    [BenchmarkIssue.Executor]: 1,
    [BenchmarkIssue.Other]: 1,
  });
  assertEquals(report.notRunCases, ["not-run"]);
  assertEquals(report.provenance.citationPresent, 3);
  assertEquals(report.provenance.citationMissing, 2);
  assertEquals(report.provenance.citationUnavailable, 1);
  assertEquals(report.provenance.missingCitationCases, ["legacy-pass", "unmapped"]);
  assertEquals(report.provenance.passingWithoutCitation, ["legacy-pass"]);
  assertEquals(report.oracleScopes, {
    fullReturn: 4,
    publishedLines: 1,
    reviewedSynthetic: 0,
    unavailable: 1,
  });
  assertEquals(report.publishedLineCases, [{
    name: "published-pass",
    scoredLines: ["line24_total_tax"],
  }]);
});

test("missing and malformed actuals are not reported as numeric tax discrepancies", () => {
  const cases = [result("missing", {
    lineFailures: [{
      line: "line24_total_tax",
      expected: 100,
      actual: undefined,
      reason: "missing",
      tolerance: 5,
    }, {
      line: "line35a_refund",
      expected: 0,
      actual: [0, 100],
      reason: "multi_entry",
      tolerance: 5,
    }],
  })];
  const report = buildBenchmarkReport("f1040", 2025, {
    found: [join("f1040", "2025", "missing")],
    excluded: [],
  }, cases);
  assertEquals(report.failureCauses[BenchmarkIssue.NumericMismatch], 0);
  assertEquals(report.failureCauses[BenchmarkIssue.InvalidActual], 1);
  assertEquals(report.failureBreakdown.comparedLineFailures, 1);
  assertEquals(report.failures[0].issues, [BenchmarkIssue.InvalidActual]);
});
