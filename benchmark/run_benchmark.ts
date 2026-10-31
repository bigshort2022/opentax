#!/usr/bin/env bun
import { writeSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as sys from "../scripts/support/sys.ts";
/**
 * run_benchmark.ts — Run all cases through the tax engine and compare to correct values.
 * Run: bun benchmark/run_benchmark.ts
 */

import { basename, dirname, join } from "node:path";
import { fileURLToPath as fromFileUrl } from "node:url";
import { getReturnCommand } from "../cli/commands/return.ts";
import {
  parseReviewedSyntheticFixture,
  resolveReviewedAssertions,
} from "./reviewed_contract.ts";
import {
  BenchmarkOracleScope,
  benchmarkExitCode,
  benchmarkExpectedSchema,
  benchmarkInputSchema,
  benchmarkReturnSchema,
  benchmarkSourceIssues,
  createdReturnSchema,
  discoverBenchmarkCases,
  type KnownInvalidCases,
  readCaseBaseline,
} from "./harness.ts";
import {
  BENCHMARK_ISSUE_TAGS,
  type BenchmarkCaseResult,
  type BenchmarkOracle,
  buildBenchmarkReport,
  classifyBenchmarkIssues,
  describeBenchmarkOracle,
  formatBenchmarkSummary,
  LEGACY_BENCHMARK_TOLERANCE,
  type NumericLineFailure,
  PUBLISHED_LINE_TOLERANCE,
  REVIEWED_SYNTHETIC_TOLERANCE,
  type UnsupportedCheck,
} from "./report.ts";

const SCRIPT_DIR = dirname(fromFileUrl(import.meta.url));
const TAX_DIR = join(SCRIPT_DIR, "..");

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getFlag(flag: string, defaultVal: string): string {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : defaultVal;
}

const formFlag = getFlag("--form", "f1040");
const yearFlag = getFlag("--year", "2025");
const jsonFlag = args.includes("--json");

const CASES_DIR = join(SCRIPT_DIR, "cases", formFlag, yearFlag);

const RED = "\x1b[31m",
  GRN = "\x1b[32m",
  YEL = "\x1b[33m",
  DIM = "\x1b[2m",
  RST = "\x1b[0m";
const CLEAR_LINE = "\x1b[2K\r";

export function taxCommandOutputOrThrow(
  code: number,
  stdoutText: string,
  stderrText: string,
  args: readonly string[],
): string {
  if (code !== 0) {
    throw new Error(
      `opentax command failed (${code}): bun cli/main.ts ${
        args.join(" ")
      }\n${stderrText}${stdoutText}`,
    );
  }
  if (stderrText.length > 0) {
    console.error(stderrText);
  }
  return stdoutText;
}

async function tax(...args: string[]): Promise<string> {
  const { code, stdout, stderr } = await new sys.Command(process.execPath, {
    args: [
      join(TAX_DIR, "cli/main.ts"),
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stdoutText = new TextDecoder().decode(stdout);
  const stderrText = new TextDecoder().decode(stderr);
  return taxCommandOutputOrThrow(code, stdoutText, stderrText, args);
}

function displayScalar(val: unknown): number {
  const actual = singleNumericActual(val);
  return typeof actual === "number" ? actual : NaN;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function singleNumericActual(
  value: unknown,
): number | NumericLineFailure["reason"] {
  if (Array.isArray(value)) {
    if (value.length === 0) return "missing";
    if (value.length > 1) return "multi_entry";
    return isFiniteNumber(value[0]) ? value[0] : "nonfinite";
  }
  return isFiniteNumber(value) ? value : "nonfinite";
}

/** The CLI omits the inactive balance side; other missing values remain missing. */
export function benchmarkActualLines(
  lines: Readonly<Record<string, unknown>>,
  summary: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const actual = { ...summary, ...lines };
  const refund = singleNumericActual(actual.line35a_refund);
  const owed = singleNumericActual(actual.line37_amount_owed);
  const noRefund = !("line35a_refund" in actual);
  const noOwed = !("line37_amount_owed" in actual);
  // A return has a refund or an amount owed, never both; the blank side is zero.
  if (noRefund && typeof owed === "number" && owed >= 0) actual.line35a_refund = 0;
  if (noOwed && typeof refund === "number" && refund >= 0) {
    actual.line37_amount_owed = 0;
  }
  if (noRefund && noOwed) {
    const tax = singleNumericActual(actual.line24_total_tax);
    const payments = singleNumericActual(actual.line33_total_payments);
    if (typeof tax === "number" && tax === payments) {
      actual.line35a_refund = 0;
      actual.line37_amount_owed = 0;
    }
  }
  return actual;
}

export function compareExpectedNumericLines(
  actual: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
  tolerance = LEGACY_BENCHMARK_TOLERANCE,
): NumericLineFailure[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error("Benchmark tolerance must be finite and nonnegative");
  }
  let numericCount = 0;
  const failures: NumericLineFailure[] = [];
  for (const [line, expectedValue] of Object.entries(expected)) {
    if (typeof expectedValue !== "number") continue;
    if (!Number.isFinite(expectedValue)) {
      throw new Error(`Nonfinite expected benchmark value: ${line}`);
    }
    numericCount++;
    if (!(line in actual)) {
      failures.push({
        line,
        expected: expectedValue,
        actual: undefined,
        reason: "missing",
        tolerance,
      });
      continue;
    }
    const actualValue = singleNumericActual(actual[line]);
    if (typeof actualValue === "string") {
      failures.push({
        line,
        expected: expectedValue,
        actual: actual[line],
        reason: actualValue,
        tolerance,
      });
      continue;
    }
    if (Math.abs(actualValue - expectedValue) > tolerance) {
      failures.push({
        line,
        expected: expectedValue,
        actual: actualValue,
        reason: "mismatch",
        tolerance,
      });
    }
  }
  if (numericCount === 0) {
    throw new Error("No numeric expected benchmark values");
  }
  return failures;
}

// ── Table layout ─────────────────────────────────────────────────────────────

// Exact public summary keys: cli/commands/return.ts ReturnSummary/extractSummary.
// Additional exact raw output keys: forms/f1040/nodes/outputs/general/return-assembly/f1040/index.ts inputSchema.
// Unreviewed fixtures never infer aliases, aggregation or intermediate mappings.
const SUMMARY_FIELDS = new Set([
  "line1z_total_wages",
  "line9_total_income",
  "line11_agi",
  "line15_taxable_income",
  "line24_total_tax",
  "line33_total_payments",
  "line35a_refund",
  "line37_amount_owed",
]);
const RAW_FIELDS = new Set([
  "line1a_wages",
  "line7_capital_gain",
  "line10_adjustments",
  "line16_income_tax",
  "line27_eitc",
]);
const METADATA_FIELDS = new Set([
  "case",
  "scenario",
  "year",
  "inputs",
  "notes",
  "source",
  "sources",
]);

export function classifyFixtureExpectations(
  fixture: Readonly<Record<string, unknown>>,
) {
  if (fixture.oracle_scope === BenchmarkOracleScope.ReviewedSynthetic) {
    const reviewed = parseReviewedSyntheticFixture(fixture);
    return {
      expectedLines: reviewed.correct,
      unsupportedChecks: [] as UnsupportedCheck[],
      metadata: Object.keys(fixture).filter((key) => key !== "correct"),
    };
  }
  const wrapped = fixture.correct !== undefined;
  const expected = wrapped ? fixture.correct : fixture;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    throw new Error("Invalid fixture expectations object");
  }
  const expectedLines: Record<string, number> = {};
  const unsupportedChecks: UnsupportedCheck[] = [];
  const metadata = wrapped
    ? Object.keys(fixture).filter((key) => key !== "correct")
    : [];
  for (const [field, value] of Object.entries(expected)) {
    if (!wrapped && METADATA_FIELDS.has(field)) {
      metadata.push(field);
      continue;
    }
    if (typeof value !== "number") {
      if (!METADATA_FIELDS.has(field)) {
        throw new Error(`Nonnumeric expected benchmark value: ${field}`);
      }
      metadata.push(field);
      continue;
    }
    if (!Number.isFinite(value)) {
      throw new Error(`Nonfinite expected benchmark value: ${field}`);
    }
    if (SUMMARY_FIELDS.has(field) || RAW_FIELDS.has(field)) {
      expectedLines[field] = value;
    } else {unsupportedChecks.push({
        field,
        expected: value,
        kind: "unmapped_oracle",
      });}
  }
  return { expectedLines, unsupportedChecks, metadata };
}

const COLS = [
  { label: "#", width: 3, align: "r" },
  { label: "Case", width: 58, align: "l" },
  { label: "AGI", width: 10, align: "r" },
  { label: "Taxable", width: 10, align: "r" },
  { label: "TotalTax", width: 10, align: "r" },
  { label: "Payments", width: 10, align: "r" },
  { label: "Refund", width: 10, align: "r" },
  { label: "Owed", width: 10, align: "r" },
  { label: "Result", width: 6, align: "c" },
  { label: "Issues", width: 24, align: "l" },
] as const;

function pad(s: string, w: number, align: "l" | "r" | "c"): string {
  if (align === "r") return s.padStart(w);
  if (align === "l") return s.padEnd(w);
  const total = w - s.length;
  const l = Math.floor(total / 2), r = total - l;
  return " ".repeat(l) + s + " ".repeat(r);
}

function border(
  left: string,
  mid: string,
  right: string,
  fill: string,
): string {
  return left + COLS.map((c) => fill.repeat(c.width + 2)).join(mid) + right;
}

const TOP = border("┌", "┬", "┐", "─");
const HDR_DIV = border("├", "┼", "┤", "─");
const BOT = border("└", "┴", "┘", "─");

function tableRow(cells: string[]): string {
  return "│" +
    cells.map((c, i) => " " + pad(c, COLS[i].width, COLS[i].align) + " ").join(
      "│",
    ) + "│";
}

function headerRow(): string {
  return tableRow(COLS.map((c) => c.label));
}

// ── Case runner ───────────────────────────────────────────────────────────────

type CaseResult = BenchmarkCaseResult & {
  engAgi: number;
  engTi: number;
  engTax: number;
  engPay: number;
  engRef: number;
  engOwe: number;
};

async function runCase(
  name: string,
  caseDir: string,
  correct: Readonly<Record<string, unknown>>,
  oracle: BenchmarkOracle,
): Promise<CaseResult> {
  const inputFile = join(caseDir, "input.json");
  const caseData = benchmarkInputSchema.parse(
    JSON.parse(await fs.readFile(inputFile, "utf8")),
  );
  const rid = createdReturnSchema.parse(JSON.parse(
    await tax("return", "create", "--year", String(caseData.year), "--json"),
  )).returnId;
  for (const f of caseData.forms) {
    await tax(
      "form",
      "add",
      "--returnId",
      rid,
      "--node_type",
      f.node_type,
      JSON.stringify(f.data),
      "--json",
    );
  }

  const reviewed = correct.oracle_scope === BenchmarkOracleScope.ReviewedSynthetic
    ? parseReviewedSyntheticFixture(correct)
    : undefined;
  // Reuse the product command once; capture is internal, transient and opt-in.
  const captured = reviewed
    ? await getReturnCommand({
      returnId: rid,
      baseDir: join(process.cwd(), ".state", "returns"),
      captureExecution: true,
    })
    : undefined;
  const eng = benchmarkReturnSchema.parse(captured ?? JSON.parse(
    await tax("return", "get", "--returnId", rid, "--json"),
  ));
  const l = eng.lines ?? {};
  const sm = eng.summary ?? {};
  // Raw lines take precedence: summary normalization must not hide malformed values.
  const actualLines = benchmarkActualLines(l, sm);
  const errors: string[] = [
    ...oracle.sourceIssues,
    ...(eng.warnings ?? []).filter((warning: string) =>
      warning.startsWith("[EXECUTOR_")
    ),
  ];

  const engAgi = displayScalar(actualLines.line11_agi);
  const engTi = displayScalar(actualLines.line15_taxable_income);
  const engTax = displayScalar(actualLines.line24_total_tax);
  const engPay = displayScalar(actualLines.line33_total_payments);
  const engRef = displayScalar(actualLines.line35a_refund);
  const engOwe = displayScalar(actualLines.line37_amount_owed);

  const { expectedLines: c, unsupportedChecks } = reviewed
    ? { expectedLines: reviewed.correct, unsupportedChecks: [] }
    : classifyFixtureExpectations(correct);
  const resolved = reviewed
    ? resolveReviewedAssertions(reviewed, actualLines, captured?.execution)
    : undefined;
  const lineFailures = Object.keys(c).length > 0
    ? compareExpectedNumericLines(
      resolved?.actual ?? actualLines,
      c,
      reviewed
        ? REVIEWED_SYNTHETIC_TOLERANCE
        : correct.oracle_scope === BenchmarkOracleScope.PublishedLines
        ? PUBLISHED_LINE_TOLERANCE
        : LEGACY_BENCHMARK_TOLERANCE,
    )
    : [];
  const failedFields = resolved
    ? new Set(lineFailures.map((failure) => failure.line))
    : undefined;
  const assertionEvidence = resolved?.evidence.map((entry) => ({
    ...entry,
    expected: c[entry.field],
    actual: resolved.actual[entry.field] ?? null,
    matched: !failedFields?.has(entry.field),
  }));
  if (Object.keys(c).length === 0 && unsupportedChecks.length === 0) {
    errors.push("No numeric expected benchmark values");
  }
  const ok = lineFailures.length === 0 && errors.length === 0 &&
    unsupportedChecks.length === 0;

  return {
    name,
    engAgi,
    engTi,
    engTax,
    engPay,
    engRef,
    engOwe,
    correct: c,
    lineFailures,
    unsupportedChecks,
    errors,
    ok,
    oracle,
    issues: classifyBenchmarkIssues(lineFailures, unsupportedChecks, errors),
    ...(assertionEvidence ? { assertionEvidence } : {}),
  };
}

function colorNum(
  eng: number,
  cor: number | undefined,
  width: number,
  tolerance: number,
): string {
  if (!Number.isFinite(eng)) return `${DIM}${"N/A".padStart(width)}${RST}`;
  const s = Math.round(eng).toLocaleString().padStart(width);
  if (cor === undefined) return `${DIM}${s}${RST}`;
  return Math.abs(eng - cor) <= tolerance ? `${GRN}${s}${RST}` : `${RED}${s}${RST}`;
}

function resultRow(r: CaseResult, idx: number): string {
  const numW = COLS[2].width; // all number columns share this width
  const tolerance = r.oracle?.scope === "reviewed_synthetic"
    ? REVIEWED_SYNTHETIC_TOLERANCE
    : r.oracle?.scope === "published_lines"
    ? PUBLISHED_LINE_TOLERANCE
    : LEGACY_BENCHMARK_TOLERANCE;
  const nums = [
    colorNum(r.engAgi, r.correct.line11_agi, numW, tolerance),
    colorNum(r.engTi, r.correct.line15_taxable_income, numW, tolerance),
    colorNum(r.engTax, r.correct.line24_total_tax, numW, tolerance),
    colorNum(r.engPay, r.correct.line33_total_payments, numW, tolerance),
    colorNum(r.engRef, r.correct.line35a_refund, numW, tolerance),
    colorNum(r.engOwe, r.correct.line37_amount_owed, numW, tolerance),
  ];
  const result = r.ok ? `${GRN} PASS ${RST}` : `${RED} FAIL ${RST}`;
  // Plain cells use pad(); pre-padded colored cells are inserted directly.
  return "│" +
    ` ${pad(String(idx + 1), COLS[0].width, "r")} │` +
    ` ${pad(r.name, COLS[1].width, "l")} │` +
    nums.map((n) => ` ${n} `).join("│") + "│" +
    ` ${result} │ ` +
    pad(r.issues.map((issue) => BENCHMARK_ISSUE_TAGS[issue]).join(",") || "-", COLS[9].width, "l") +
    " │";
}

// ── Progress + streaming output (all on stdout) ───────────────────────────────

const encoder = new TextEncoder();
const write = (s: string) => writeSync(1, encoder.encode(s));

function progressLine(done: number, total: number, running: number): string {
  const BAR_W = 30;
  const filled = total > 0 ? Math.round((done / total) * BAR_W) : 0;
  const bar = GRN + "█".repeat(filled) + RST + DIM +
    "░".repeat(BAR_W - filled) + RST;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const spin = running > 0
    ? `  ${YEL}▶${RST} ${DIM}${running} running${RST}`
    : "";
  return `${CLEAR_LINE}  ${bar}  ${DIM}${done}/${total}${RST} ${pct}%${spin}`;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

const CONCURRENCY = 8;

async function runAll(casesDir: string, caseNames: readonly string[]): Promise<CaseResult[]> {
  const allResults: CaseResult[] = [];
  let idx = 0, done = 0, printed = 0;
  const total = caseNames.length;

  // Print header once
  write("\n" + TOP + "\n" + headerRow() + "\n" + HDR_DIV + "\n");
  write(progressLine(0, total, 0));

  async function worker() {
    while (idx < caseNames.length) {
      const name = caseNames[idx++];
      const activeCount = Math.min(CONCURRENCY, total - done);

      let result: CaseResult;
      let oracle: BenchmarkOracle | null = null;
      try {
        const caseDir = join(casesDir, name);
        const correct = JSON.parse(
          await fs.readFile(join(caseDir, "correct.json"), "utf8"),
        );
        benchmarkExpectedSchema.parse(correct);
        oracle = describeBenchmarkOracle(correct, benchmarkSourceIssues(correct));
        result = await runCase(name, caseDir, correct, oracle);
      } catch (error) {
        const errors = [
          ...(oracle?.sourceIssues ?? []),
          error instanceof Error ? error.message : String(error),
        ];
        result = {
          name,
          engAgi: NaN,
          engTi: NaN,
          engTax: NaN,
          engPay: NaN,
          engRef: NaN,
          engOwe: NaN,
          correct: {},
          lineFailures: [],
          unsupportedChecks: [],
          errors,
          issues: classifyBenchmarkIssues([], [], errors),
          ok: false,
          oracle,
        };
      }
      done++;
      allResults.push(result);

      // Clear progress bar, print completed row, redraw progress bar
      const row = resultRow(result, printed++);
      write(CLEAR_LINE);
      write(row + "\n");
      if (done < total) write(progressLine(done, total, activeCount - 1));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  write(CLEAR_LINE);
  return allResults;
}

export async function runBenchmark(
  casesDir: string,
  known: KnownInvalidCases,
  json = false,
): Promise<number> {
  const discovery = await discoverBenchmarkCases(casesDir, undefined, known);
  const names = discovery.found.map((path) => path.slice(casesDir.length + 1));
  const results = await runAll(casesDir, names);
  const report = buildBenchmarkReport(
    basename(dirname(casesDir)),
    Number(basename(casesDir)),
    discovery,
    results,
  );
  write(BOT + "\n\n" + formatBenchmarkSummary(report) + "\n");
  if (json) console.log(JSON.stringify(report));
  return benchmarkExitCode(
    report.counts.executed,
    report.counts.failed + report.counts.notRun,
  );
}

if (import.meta.main) {
  process.exitCode = await runBenchmark(CASES_DIR, {
    casesRoot: join(SCRIPT_DIR, "cases"),
    baseline: await readCaseBaseline(TAX_DIR),
    today: new Date().toISOString().slice(0, 10),
  }, jsonFlag);
}
