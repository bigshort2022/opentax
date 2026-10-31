import { test } from "bun:test";
import { assertEquals, assertThrows } from "@std/assert";
import type { ExecuteResult } from "../core/runtime/executor.ts";
import { compareExpectedNumericLines } from "./run_benchmark.ts";
import type { ReviewedSyntheticFixture } from "./reviewed_contract.ts";
import {
  parseReviewedSyntheticFixture,
  resolveReviewedAssertions,
  reviewedSyntheticExpectedSchema,
} from "./reviewed_contract.ts";

const path = new URL("./cases/f1040/2025/01-single-w2-minimal/correct.json", import.meta.url);
const original = JSON.parse(await Bun.file(path).text());
function fixture() {
  return parseReviewedSyntheticFixture(structuredClone(original));
}
type Execution = NonNullable<ExecuteResult["execution"]>;
function computed(nodeType: string, input: Record<string, unknown> = {}, outputs: { nodeType: string; fields: Record<string, unknown> }[] = []): Execution {
  return { [nodeType]: { nodeType, status: "computed", input, outputs } };
}
const ordinaryInput = {
  taxable_income: 0,
  form6251_line1b: -750,
  form6251_line2a: 0,
  filing_status: "single",
};


test("reviewed provenance rejects missing, orphan, unknown and misbound assertions", () => {
  for (const mutate of [
    (f: ReviewedSyntheticFixture) => { delete f.provenance.assertions.eitc; },
    (f: ReviewedSyntheticFixture) => { f.provenance.assertions.orphan = f.provenance.assertions.eitc; },
    (f: ReviewedSyntheticFixture) => { f.provenance.assertions.eitc = f.provenance.assertions.income_tax; },
    (f: ReviewedSyntheticFixture) => { f.correct.unknown = 0; f.provenance.assertions.unknown = f.provenance.assertions.eitc; },
    (f: ReviewedSyntheticFixture) => { f.correct.qbi_deduction = 1; },
    (f: ReviewedSyntheticFixture) => { f.correct.eitc = Infinity; },
    (f: ReviewedSyntheticFixture) => { f.provenance.assumptions = []; },
    (f: ReviewedSyntheticFixture) => { f.provenance.limitations = []; },
    (f: ReviewedSyntheticFixture) => { f.provenance.reviewed = "2025-02-30"; },
    (f: ReviewedSyntheticFixture) => { f.provenance.assertions.eitc.basis = " "; },
    (f: ReviewedSyntheticFixture) => { delete f.correct.line37_amount_owed; delete f.provenance.assertions.line37_amount_owed; },
  ]) {
    const value = fixture();
    mutate(value);
    assertThrows(() => parseReviewedSyntheticFixture(value));
  }
  const unknown = structuredClone(original);
  unknown.provenance.assertions.eitc.observable = "line999";
  assertThrows(() => parseReviewedSyntheticFixture(unknown));
});

test("reviewed citations must be declared official IRS URLs", () => {
  for (const citation of ["https://irs.gov.example.com/pub/table.pdf", "https://www.irs.gov@evil.test/table.pdf", "http://www.irs.gov/pub/table.pdf", "https://www.irs.gov/pub/undeclared.pdf"]) {
    const value = fixture();
    value.provenance.assertions.eitc.citation = citation;
    assertThrows(() => parseReviewedSyntheticFixture(value));
  }
  const value = fixture();
  value.sources.push("https://calculator.example/table");
  assertThrows(() => parseReviewedSyntheticFixture(value));
});

test("reviewed return-line comparisons preserve malformed values and accept only singleton numeric arrays", () => {
  const expectations = { income_tax: 0 };
  for (const [value, reason] of [
    [undefined, "missing"], [null, "nonfinite"], ["0", "nonfinite"],
    [[0, 0], "multi_entry"], [Infinity, "nonfinite"], [NaN, "nonfinite"],
  ] as const) {
    const result = resolveReviewedAssertions(fixture(), { line16_income_tax: value }, undefined);
    const failures = compareExpectedNumericLines(result.actual, expectations, 0);
    assertEquals(failures.map((failure) => failure.reason), [reason]);
  }
  const singleton = resolveReviewedAssertions(fixture(), { line16_income_tax: [0] }, undefined);
  assertEquals(compareExpectedNumericLines(singleton.actual, expectations, 0), []);
});

test("absent, failed and unavailable producer evidence never becomes zero", () => {
  assertEquals(resolveReviewedAssertions(fixture(), {}, undefined).actual.qbi_deduction, undefined);
  for (const status of ["failed", "unavailable"] as const) {
    const execution: Execution = { form8995: { nodeType: "form8995", status } };
    const result = resolveReviewedAssertions(fixture(), {}, execution);
    assertEquals(result.actual.qbi_deduction, undefined);
    assertEquals(result.evidence.find((entry) => entry.field === "qbi_deduction")?.status, status);
  }
});

test("successful no-contribution evidence is not a private worksheet zero", () => {
  const result = resolveReviewedAssertions(fixture(), {}, computed("form8995"));
  assertEquals(result.actual.qbi_deduction, 0);
  assertEquals(result.evidence.find((entry) => entry.field === "qbi_deduction")?.status, "computed_no_contribution");
});

test("zero-activity assertions retain numeric discrepancies but reject malformed and ambiguous observations", () => {
  for (const value of [5, -5]) {
    const result = resolveReviewedAssertions(fixture(), {}, computed("form8995", {}, [
      { nodeType: "f1040", fields: { line13_qbi_deduction: value } },
    ]));
    assertEquals(compareExpectedNumericLines(result.actual, { qbi_deduction: 0 }, 0), [{
      line: "qbi_deduction", expected: 0, actual: value, reason: "mismatch", tolerance: 0,
    }]);
  }
  for (const value of [null, "0", [0], NaN, Infinity]) {
    const result = resolveReviewedAssertions(fixture(), {}, computed("form8995", {}, [
      { nodeType: "f1040", fields: { line13_qbi_deduction: value } },
    ]));
    assertEquals(result.actual.qbi_deduction, undefined);
  }
  const execution = computed("form8995", {}, [
    { nodeType: "f1040", fields: { line13_qbi_deduction: 0 } },
    { nodeType: "f1040", fields: { line13_qbi_deduction: 0 } },
  ]);
  const result = resolveReviewedAssertions(fixture(), {}, execution);
  assertEquals(result.actual.qbi_deduction, undefined);
  assertEquals(result.evidence.find((entry) => entry.field === "qbi_deduction")?.status, "ambiguous");
});

test("positive combined child and education credits are not component oracles", () => {
  for (const [producer, target, key, expected] of [
    ["f8812", "f1040", "line19_child_tax_credit", "nonref_ctc"],
    ["f8863", "schedule3", "line3_education_credit", "aotc_nonref"],
  ]) {
    const result = resolveReviewedAssertions(fixture(), {}, computed(producer, {}, [{ nodeType: target, fields: { [key]: 100 } }]));
    assertEquals(result.actual[expected], undefined);
  }
});

test("ordinary taxable requires successful parsed input, not a line15 alias", () => {
  assertEquals(resolveReviewedAssertions(fixture(), { line15_taxable_income: 9 }, undefined).actual.ordinary_taxable, undefined);
  const result = resolveReviewedAssertions(fixture(), { line15_taxable_income: 9 }, computed("income_tax_calculation", ordinaryInput));
  assertEquals(result.actual.ordinary_taxable, 0);
  for (const value of [undefined, "0", [0], NaN, Infinity, -1]) {
    assertEquals(resolveReviewedAssertions(fixture(), {}, computed("income_tax_calculation", { ...ordinaryInput, taxable_income: value })).actual.ordinary_taxable, undefined);
  }
});

test("ordinary taxable excludes preferential, exclusion, averaging and special routes", () => {
  const routes = {
    qualified_dividends: [10], net_capital_gain: 10, unrecaptured_1250_gain: 10,
    rate_28_gain: 10, form4952_election: 10, form4952_elected_capital_gain: 10,
    foreign_earned_income_exclusion: 10, foreign_exclusion_disallowed_deductions: 10,
    schedule_j_election_requested: true, schedule_j_calculated_tax: 0,
    schedule_j_current_tax_source: {}, form8615_source: {}, form8615_reviewed_source: {},
    form8814_tax: 10, form4972_tax: [10], form8978_tax: 10, form8621_tax: 10,
    form8621_1294_undistributed_ordinary: 10, form8621_1294_undistributed_capital: 10,
  };
  for (const [field, value] of Object.entries(routes)) {
    const result = resolveReviewedAssertions(fixture(), {}, computed("income_tax_calculation", { ...ordinaryInput, [field]: value }));
    assertEquals(result.actual.ordinary_taxable, undefined, field);
  }
});


test("explicit optional education inactivity is evidence without invented student inputs", () => {
  const execution: Execution = {
    f8863: { nodeType: "f8863", status: "inactive", input: {} },
  };
  const result = resolveReviewedAssertions(fixture(), {}, execution);
  assertEquals(result.actual.aotc_nonref, 0);
  assertEquals(result.actual.aotc_refundable, 0);
  assertEquals(result.evidence.find((entry) => entry.field === "aotc_nonref")?.status, "inactive_no_contribution");
  assertEquals(resolveReviewedAssertions(fixture(), {}, {}).actual.aotc_nonref, undefined);
  assertEquals(resolveReviewedAssertions(fixture(), {}, {
    income_tax_calculation: { nodeType: "income_tax_calculation", status: "inactive", input: {} },
  }).actual.ordinary_taxable, undefined);
});

test("duplicate producer records and output/finalization candidates remain ambiguous", () => {
  const duplicate: Execution = {
    first: { nodeType: "form8995", status: "computed", input: {}, outputs: [] },
    second: { nodeType: "form8995", status: "computed", input: {}, outputs: [] },
  };
  assertEquals(resolveReviewedAssertions(fixture(), {}, duplicate).actual.qbi_deduction, undefined);
  const finalization: Execution = {
    form8995: {
      nodeType: "form8995", status: "computed", input: {}, outputs: [],
      finalizations: [{ nodeType: "f1040", fields: { line13_qbi_deduction: 2 } }],
    },
  };
  assertEquals(compareExpectedNumericLines(
    resolveReviewedAssertions(fixture(), {}, finalization).actual,
    { qbi_deduction: 0 },
    0,
  )[0].actual, 2);
  const ambiguous: Execution = {
    form8995: {
      nodeType: "form8995", status: "computed", input: {},
      outputs: [{ nodeType: "f1040", fields: { line13_qbi_deduction: 0 } }],
      finalizations: [{ nodeType: "f1040", fields: { line13_qbi_deduction: 0 } }],
    },
  };
  assertEquals(resolveReviewedAssertions(fixture(), {}, ambiguous).actual.qbi_deduction, undefined);
});

test("reviewed schema rejects malformed authority and reports invalid URLs without throwing from safeParse", () => {
  for (const mutate of [
    (value: typeof original) => { value.oracle_scope = "published_lines"; },
    (value: typeof original) => { value.provenance.kind = "published"; },
    (value: typeof original) => { value.provenance.assertions.eitc.authority = "engine"; },
    (value: typeof original) => { value.provenance.assertions.eitc.citation = "not a URL"; },
    (value: typeof original) => { value.source = "not a URL"; },
    (value: typeof original) => { value.sources = []; },
    (value: typeof original) => { value.sources.push(value.sources[0]); },
    (value: typeof original) => { value.source = "https://www.irs.gov/pub/undeclared.pdf"; },
  ]) {
    const value = structuredClone(original);
    mutate(value);
    assertEquals(reviewedSyntheticExpectedSchema.safeParse(value).success, false);
  }
});


test("ordinary input cannot be supplied by failed or unavailable execution", () => {
  for (const status of ["failed", "unavailable"] as const) {
    const result = resolveReviewedAssertions(fixture(), { line15_taxable_income: 0 }, {
      income_tax_calculation: { nodeType: "income_tax_calculation", status },
    });
    assertEquals(result.actual.ordinary_taxable, undefined);
  }
});
