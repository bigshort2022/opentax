import { test } from "bun:test";
import * as fs from "node:fs/promises";
import * as sys from "../scripts/support/sys.ts";
import { assertEquals } from "@std/assert";
import { dirname, join } from "node:path";
import { fileURLToPath as fromFileUrl } from "node:url";
import type { CaseBaseline } from "./harness.ts";
import { BenchmarkIssue, type BenchmarkReport } from "./report.ts";

const root = dirname(fromFileUrl(import.meta.url));
const validForms = [
  {
    node_type: "start",
    data: {
      general: {
        filing_status: "single",
        taxpayer_first_name: "Synthetic",
        taxpayer_last_name: "Example",
      },
    },
  },
  { node_type: "w2", data: { box1_wages: 120000, box2_fed_withheld: 10000 } },
];

for (
  const scenario of [
    "pass",
    "published-line",
    "mismatch",
    "invalid-input",
    "executor-error",
    "missing-case",
    "unsupported",
    "source-gap",
    "excluded",
  ] as const
) {
  test(`benchmark reports real execution and discovery boundaries: ${scenario}`, async () => {
    const temporary = await sys.makeTempDir();
    const casesRoot = join(temporary, "cases");
    const yearRoot = join(casesRoot, "f1040", "2025");
    const caseDir = join(yearRoot, "synthetic");
    const runtime = join(temporary, "runtime");
    try {
      await fs.mkdir(caseDir, { recursive: true });
      await fs.mkdir(runtime);
      const forms = scenario === "invalid-input"
        ? [{ node_type: "__nonexistent_node", data: {} }]
        : scenario === "executor-error"
        ? [...validForms, {
          node_type: "f1099int",
          data: { payer_name: "Synthetic Bank", box1: 3500 },
        }]
        : scenario === "published-line"
        ? [{
          node_type: "start",
          data: { general: { filing_status: "mfj" } },
        }, {
          node_type: "w2",
          data: { box1_wages: 56800, box2_fed_withheld: 4000 },
        }]
        : validForms;
      await fs.writeFile(
        join(caseDir, "input.json"),
        JSON.stringify({ year: 2025, forms }),
      );
      // Synthetic Single return: 120,000 wages - 15,750 standard deduction;
      // 1,192.50 + 4,386 + 12,072.50 + 216 = 17,867 tax, less 10,000 paid.
      const correct = scenario === "mismatch"
        ? { line11_agi: 1, line33_total_payments: 1 }
        : scenario === "unsupported"
        ? { line1a_wages: 120000, ordinary_taxable: 123 }
        : { line1a_wages: 120000 };
      const expected = scenario === "published-line"
        ? {
          oracle_scope: "published_lines",
          source: "IRS Pub 17 (2025), Tax Table example: MFJ taxable income $25,300; line 16 tax $2,562",
          synthetic_inputs: "Wages and withholding are synthetic; only the cited tax-table line is scored",
          correct: { line16_income_tax: 2562 },
        }
        : {
          ...(scenario === "source-gap"
            ? { reconciliation: { source_limitations: ["W-2 spouse owner absent"] } }
            : {}),
          correct: {
            line24_total_tax: 17867,
            line35a_refund: 0,
            line37_amount_owed: 7867,
            ...correct,
          },
        };
      await fs.writeFile(join(caseDir, "correct.json"), JSON.stringify(expected));
      const baseline: CaseBaseline = [];
      if (scenario === "missing-case") {
        await fs.mkdir(join(yearRoot, "incomplete"));
      } else if (scenario === "excluded") {
        const invalid = join(yearRoot, "invalid");
        await fs.mkdir(invalid);
        await fs.writeFile(join(invalid, "input.json"), JSON.stringify({
          year: 2025,
          forms: [{ node_type: "f1099int", data: { box1_interest: 3500 } }],
        }));
        await fs.writeFile(join(invalid, "correct.json"), JSON.stringify(expected));
        baseline.push({
          case: "f1040/2025/invalid",
          reason: "Synthetic obsolete input",
          expires: "2099-01-31",
          approvedBy: "test-reviewer",
        });
      }
      const script = `import { runBenchmark } from ${JSON.stringify(join(root, "run_benchmark.ts"))};
        process.exitCode = await runBenchmark(${JSON.stringify(yearRoot)}, ${JSON.stringify({
        casesRoot,
        baseline,
        today: "2025-01-01",
      })}, true);`;
      const { code, stdout } = await new sys.Command(process.execPath, {
        args: ["-e", script],
        cwd: runtime,
        stdout: "piped",
        stderr: "piped",
      }).output();
      const jsonLine = new TextDecoder().decode(stdout).split("\n")
        .find((line) => line.startsWith("{"));
      if (scenario === "missing-case" || scenario === "invalid-input") {
        assertEquals(code, 1);
        assertEquals(jsonLine, undefined);
        return;
      }
      if (!jsonLine) throw new Error("Benchmark omitted JSON summary");
      const report: BenchmarkReport = JSON.parse(jsonLine);
      const passing = scenario === "pass" || scenario === "published-line" || scenario === "excluded";
      assertEquals(code, passing ? 0 : 1);
      assertEquals(report.counts, {
        discovered: scenario === "excluded" ? 2 : 1,
        runnable: 1,
        executed: 1,
        excludedKnownInvalid: scenario === "excluded" ? 1 : 0,
        notRun: 0,
        passed: passing ? 1 : 0,
        failed: passing ? 0 : 1,
      });
      if (scenario === "pass" || scenario === "excluded") {
        assertEquals(report.provenance.passingWithoutCitation, ["synthetic"]);
        assertEquals(report.excludedCases.map((entry) => entry.case),
          scenario === "excluded" ? ["f1040/2025/invalid"] : []);
      } else if (scenario === "published-line") {
        assertEquals(report.oracleScopes, { fullReturn: 0, publishedLines: 1, unavailable: 0 });
        assertEquals(report.provenance.citationPresent, 1);
        assertEquals(report.publishedLineCases, [{ name: "synthetic", scoredLines: ["line16_income_tax"] }]);
      } else {
        assertEquals(report.failing, ["synthetic"]);
        if (scenario === "mismatch") {
          assertEquals(report.failures[0].lineFailures.map((failure) => failure.line),
            ["line11_agi", "line33_total_payments"]);
          assertEquals(report.failureCauses[BenchmarkIssue.NumericMismatch], 1);
        } else if (scenario === "unsupported") {
          assertEquals(report.failureBreakdown.unmappedOnly, 1);
          assertEquals(report.failures[0].issues, [BenchmarkIssue.Unmapped]);
        } else if (scenario === "source-gap") {
          assertEquals(report.failureBreakdown.errorsWithoutLineFailures, 1);
          assertEquals(report.failures[0].issues, [BenchmarkIssue.Source]);
          assertEquals(report.provenance.sourceLimitedCases, ["synthetic"]);
        } else {
          assertEquals(report.failureCauses[BenchmarkIssue.Executor], 1);
          assertEquals(report.failures[0].issues.includes(BenchmarkIssue.Executor), true);
        }
      }
    } finally {
      await sys.remove(temporary, { recursive: true });
    }
  });
}
