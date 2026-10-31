import { z } from "zod";
import type { ExecuteResult, NodeExecution } from "../core/runtime/executor.ts";
import { inputSchema as incomeTaxInputSchema } from "../forms/f1040/nodes/intermediate/worksheets/taxes/calculation/income_tax_calculation/index.ts";

export enum ReviewedObservable {
  TotalIncome = "line9_total_income",
  Agi = "line11_agi",
  StandardDeduction = "standard_deduction",
  TaxableIncome = "line15_taxable_income",
  OrdinaryTaxable = "ordinary_taxable",
  IncomeTax = "income_tax",
  TaxBeforeCredits = "line18_tax_before_credits",
  Eitc = "eitc",
  TotalTax = "line24_total_tax",
  TotalPayments = "line33_total_payments",
  Refund = "line35a_refund",
  AmountOwed = "line37_amount_owed",
  QbiNoContribution = "qbi_deduction_no_contribution",
  SeNoContribution = "se_tax_no_contribution",
  MedicareNoContribution = "add_medicare_tax_no_contribution",
  CtcNoContribution = "nonref_ctc_no_contribution",
  CareNoContribution = "dependent_care_credit_no_contribution",
  EducationNonrefNoContribution = "aotc_nonref_no_contribution",
  EducationRefundableNoContribution = "aotc_refundable_no_contribution",
  PtcNoContribution = "ptc_additional_no_contribution",
  PtcRepaymentNoContribution = "ptc_repayment_no_contribution",
  ActcNoContribution = "actc_no_contribution",
  ExcessSsNoContribution = "excess_ss_credit_no_contribution",
}

export enum ReviewedAuthority {
  PublishedAmount = "published_amount",
  InstructionApplication = "instruction_application",
  BenchmarkConvention = "benchmark_convention",
}

const returnLines: Partial<Record<ReviewedObservable, string>> = {
  [ReviewedObservable.TotalIncome]: "line9_total_income",
  [ReviewedObservable.Agi]: "line11_agi",
  [ReviewedObservable.StandardDeduction]: "line12a_standard_deduction",
  [ReviewedObservable.TaxableIncome]: "line15_taxable_income",
  [ReviewedObservable.IncomeTax]: "line16_income_tax",
  [ReviewedObservable.TaxBeforeCredits]: "line18_total_tax_before_credits",
  [ReviewedObservable.Eitc]: "line27_eitc",
  [ReviewedObservable.TotalTax]: "line24_total_tax",
  [ReviewedObservable.TotalPayments]: "line33_total_payments",
  [ReviewedObservable.Refund]: "line35a_refund",
  [ReviewedObservable.AmountOwed]: "line37_amount_owed",
};
const zeroContributions: Partial<Record<ReviewedObservable, readonly [string, string, string]>> = {
  [ReviewedObservable.QbiNoContribution]: ["form8995", "f1040", "line13_qbi_deduction"],
  [ReviewedObservable.SeNoContribution]: ["schedule_se", "schedule2", "line4_se_tax"],
  [ReviewedObservable.MedicareNoContribution]: ["form8959", "schedule2", "line11_additional_medicare"],
  [ReviewedObservable.CtcNoContribution]: ["f8812", "f1040", "line19_child_tax_credit"],
  [ReviewedObservable.CareNoContribution]: ["f2441", "schedule3", "line2_childcare_credit"],
  [ReviewedObservable.EducationNonrefNoContribution]: ["f8863", "schedule3", "line3_education_credit"],
  [ReviewedObservable.EducationRefundableNoContribution]: ["f8863", "f1040", "line29_refundable_aoc"],
  [ReviewedObservable.PtcNoContribution]: ["form8962", "schedule3", "line9_premium_tax_credit"],
  [ReviewedObservable.PtcRepaymentNoContribution]: ["form8962", "schedule2", "line1a_excess_advance_premium"],
  [ReviewedObservable.ActcNoContribution]: ["f8812", "f1040", "line28_actc"],
  [ReviewedObservable.ExcessSsNoContribution]: ["w2", "schedule3", "line11_excess_ss"],
};
const nonemptyText = z.string().refine((value) => value.trim().length > 0, "Text must not be blank");
const officialCitation = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return value === value.trim() && url.protocol === "https:" &&
      (url.hostname === "irs.gov" || url.hostname.endsWith(".irs.gov")) &&
      url.username === "" && url.password === "" && url.port === "";
  } catch {
    return false;
  }
}, "Authority citations must be official HTTPS IRS URLs");
const assertionSchema = z.object({
  observable: z.nativeEnum(ReviewedObservable),
  authority: z.nativeEnum(ReviewedAuthority),
  citation: officialCitation,
  basis: nonemptyText,
}).strict();

/** Reviewed synthetic facts are not an IRS-published completed return. */
export const reviewedSyntheticExpectedSchema = z.object({
  oracle_scope: z.literal("reviewed_synthetic"),
  source: officialCitation,
  sources: z.array(officialCitation).min(1),
  correct: z.record(z.number().finite()),
  provenance: z.object({
    kind: z.literal("synthetic"),
    reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Review date must be a real calendar date"),
    assumptions: z.array(nonemptyText).min(1),
    limitations: z.array(nonemptyText).min(1),
    assertions: z.record(assertionSchema),
  }).strict(),
}).passthrough().superRefine((fixture, ctx) => {
  const issue = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  if (!fixture.sources.includes(fixture.source)) {
    issue("Primary source must be declared in sources", ["source"]);
  }
  if (new Set(fixture.sources).size !== fixture.sources.length) {
    issue("Declared sources must be unique", ["sources"]);
  }
  for (const field of ["line24_total_tax", "line35a_refund", "line37_amount_owed"]) {
    if (!Object.hasOwn(fixture.correct, field)) {
      issue("Reviewed fixtures require all final-balance values", ["correct", field]);
    }
  }
  for (const field of Object.keys(fixture.correct)) {
    const assertion = fixture.provenance.assertions[field];
    if (!assertion) {
      issue("Every expected field requires a provenance binding", ["provenance", "assertions", field]);
      continue;
    }
    const canonicalField = assertion.observable.replace(/_no_contribution$/, "");
    if (field !== canonicalField) {
      issue("Observable does not bind this expected field", ["provenance", "assertions", field, "observable"]);
    }
    if (zeroContributions[assertion.observable] && fixture.correct[field] !== 0) {
      issue("No-contribution observables support only zero expectations, not positive component disaggregation", ["correct", field]);
    }
  }
  for (const [field, assertion] of Object.entries(fixture.provenance.assertions)) {
    if (!Object.hasOwn(fixture.correct, field)) {
      issue("Orphan provenance assertion", ["provenance", "assertions", field]);
    }
    if (!fixture.sources.includes(assertion.citation)) {
      issue("Citation must match a declared source", ["provenance", "assertions", field, "citation"]);
    }
  }
});

export type ReviewedSyntheticFixture = z.infer<typeof reviewedSyntheticExpectedSchema>;
export type ReviewedAssertionEvidence = {
  field: string;
  observable: string;
  status: string;
  detail: string;
};
export type ReviewedAssertionResolution = {
  actual: Record<string, unknown>;
  evidence: readonly ReviewedAssertionEvidence[];
};

export function parseReviewedSyntheticFixture(value: unknown): ReviewedSyntheticFixture {
  return reviewedSyntheticExpectedSchema.parse(value);
}

// These inputs activate nonordinary routes in income_tax_calculation. A zero
// Schedule J calculation still selects averaging; source objects select Form 8615.
const specialRoutePresence = [
  "schedule_j_current_tax_source", "schedule_j_election_requested", "schedule_j_calculated_tax",
  "form8615_source", "form8615_reviewed_source",
] as const;
const specialRouteAmounts = [
  "qualified_dividends", "net_capital_gain", "unrecaptured_1250_gain", "rate_28_gain",
  "form4952_election", "form4952_elected_capital_gain",
  "foreign_earned_income_exclusion", "foreign_exclusion_disallowed_deductions",
  "form8814_tax", "form4972_tax", "form8978_tax", "form8621_tax",
  "form8621_1294_undistributed_ordinary", "form8621_1294_undistributed_capital",
] as const;

export function resolveReviewedAssertions(
  fixture: ReviewedSyntheticFixture,
  actualLines: Readonly<Record<string, unknown>>,
  execution: ExecuteResult["execution"],
): ReviewedAssertionResolution {
  const actual: Record<string, unknown> = {};
  const evidence: ReviewedAssertionEvidence[] = [];
  const producers = new Map<string, NodeExecution | null>();
  if (execution) {
    for (const entry of Object.values(execution)) {
      producers.set(entry.nodeType, producers.has(entry.nodeType) ? null : entry);
    }
  }
  for (const [field, assertion] of Object.entries(fixture.provenance.assertions)) {
    const observable = assertion.observable;
    const record = (status: string, detail: string) => {
      evidence.push({ field, observable, status, detail });
    };
    const line = returnLines[observable];
    if (line) {
      const value = actualLines[line];
      const scalar = Array.isArray(value) && value.length === 1 ? value[0] : value;
      if (value !== undefined) actual[field] = value;
      if (typeof scalar === "number" && Number.isFinite(scalar)) {
        record("observed_return_line", `Actual return line ${line}; a singleton numeric array is one value, never a sum.`);
      } else {
        record(value === undefined ? "missing" : "malformed", `A finite single actual ${line} is required; no missing-to-zero conversion.`);
      }
      continue;
    }
    const contribution = zeroContributions[observable];
    const producer = contribution?.[0] ?? "income_tax_calculation";
    const entry = producers.get(producer);
    if (!entry) {
      record(entry === null ? "ambiguous" : "missing", `Expected one recorded ${producer} execution; evidence is ${entry === null ? "ambiguous" : "absent"}.`);
      continue;
    }
    if (entry.status === "failed" || entry.status === "unavailable") {
      record(entry.status, `${producer} did not supply successful execution evidence.`);
      continue;
    }
    if (contribution && entry.status === "inactive") {
      actual[field] = 0;
      record("inactive_no_contribution", `${producer} was explicitly skipped as optional without source facts; no worksheet value is asserted.`);
      continue;
    }
    if (entry.status !== "computed") {
      record("missing", `${producer} must have successfully computed this intermediate.`);
      continue;
    }
    if (!contribution) {
      const parsedInput = incomeTaxInputSchema.safeParse(entry.input);
      if (!parsedInput.success) {
        record("malformed", "Recorded input does not satisfy the income-tax calculation schema.");
        continue;
      }
      const input = parsedInput.data;
      const unsupported = specialRoutePresence.find((key) => input[key] !== undefined) ??
        specialRouteAmounts.find((key) => {
          const value = input[key];
          if (value === undefined) return false;
          const amounts = Array.isArray(value) ? value : [value];
          return amounts.some((amount) => typeof amount !== "number" || !Number.isFinite(amount) || amount !== 0);
        });
      if (unsupported) {
        record("unsupported_route", `Ordinary-only intermediate cannot resolve with ${unsupported}; no line15 alias or preferential/special-tax inference.`);
        continue;
      }
      const value = input.taxable_income;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        record("malformed", "Successful income-tax parsed input must contain finite nonnegative taxable_income.");
        continue;
      }
      actual[field] = value;
      record("computed_intermediate", "Actual successful income_tax_calculation parsed taxable_income on the ordinary-rate route; not a separately filed line.");
      continue;
    }
    const [, target, targetField] = contribution;
    const matching = [...entry.outputs, ...(entry.finalizations ?? [])].filter((output) =>
      output.nodeType === target && Object.hasOwn(output.fields, targetField)
    );
    if (matching.length > 1) {
      record("ambiguous", `Multiple ${producer} contributions to ${target}.${targetField}; no implicit aggregation or component disaggregation.`);
      continue;
    }
    if (matching.length === 1) {
      const value = matching[0].fields[targetField];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        record("malformed", `Non-finite or nonnumeric ${producer} contribution to ${target}.${targetField}.`);
        continue;
      }
      if (value !== 0) {
        if (observable !== ReviewedObservable.CtcNoContribution &&
          observable !== ReviewedObservable.EducationNonrefNoContribution) {
          actual[field] = value;
        }
        record("unexpected_contribution", `Observed nonzero ${producer} contribution ${value} to ${target}.${targetField}; combined CTC/other-dependent and AOTC/LLC credits are not disaggregated.`);
        continue;
      }
    }
    actual[field] = 0;
    record("computed_no_contribution", `Successful ${producer} emitted no nonzero contribution to ${target}.${targetField}; not proof of a private worksheet zero.`);
  }
  return { actual, evidence };
}
