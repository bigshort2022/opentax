import { z } from "zod";
import type { Form540Input } from "./input.ts";

import {
  AcceptedFormClassification,
  Applicability,
  type CoverageAssessment,
  CoverageCapability,
  type CoverageRequirement,
  coverageRequirementSchema,
} from "../../../core/validation/coverage.ts";

export enum PredicateId {
  AlwaysRequired = "always_required",
  ItemizesDeductions = "itemizes_deductions",
  ClaimedAsDependent = "claimed_as_dependent",
  OrdinaryStandardDeduction = "ordinary_standard_deduction",
  HeadOfHousehold = "head_of_household",
  SourceFactsRequired = "source_facts_required",
  OutsideOriginalResidentScope = "outside_original_resident_scope",
}

export const predicateIdSchema = z.nativeEnum(PredicateId);

/** Provenance only: assessment never fetches these resources. */
export const CA540_SOURCES = {
  form: "https://www.ftb.ca.gov/forms/2025/2025-540.pdf",
  instructions: "https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html",
  scheduleCaInstructions:
    "https://www.ftb.ca.gov/forms/2025/2025-540-ca-instructions.html",
  acceptedForms:
    "https://www.ftb.ca.gov/tax-pros/efile/individual-efile-forms.html",
  mefSchema:
    "https://www.ftb.ca.gov/tax-pros/efile/individual-ftb-xml-schemas.html",
  enrollment:
    "https://www.ftb.ca.gov/tax-pros/efile/enroll-in-efile-program.html",
} as const;

type PredicateResult = Pick<CoverageAssessment, "applicability" | "evidence">;
type CaCoverageRequirement = CoverageRequirement & {
  readonly predicateId: PredicateId;
};

/** Validate external candidate inventories before joining them to assessment/evidence. */
export function validateCoverageInventory(
  candidate: unknown,
): readonly CaCoverageRequirement[] {
  const rows = z.array(coverageRequirementSchema).parse(candidate);
  const seen = new Set<string>();
  for (const row of rows) {
    predicateIdSchema.parse(row.predicateId);
    if (seen.has(row.id)) {
      throw new Error(`Duplicate coverage requirement ID: ${row.id}`);
    }
    seen.add(row.id);
  }
  return Object.freeze(rows) as readonly CaCoverageRequirement[];
}

const computed = CoverageCapability.Computed;
const supplied = CoverageCapability.SuppliedInput;
const unsupported = CoverageCapability.Unsupported;
const always = PredicateId.AlwaysRequired;
const unknown = PredicateId.SourceFactsRequired;
const baseline = ["workpaper-baseline"] as const;
const calculationRef = "forms/ca540/2025/calculation.ts#calculateForm540";
const inputRef = "forms/ca540/2025/input.ts#form540InputSchema";

function printed(
  id: string,
  side: number,
  locator: string,
  capability: CoverageCapability = unsupported,
  predicateId: PredicateId = unknown,
  implementationRef: string | null = null,
  scenarioEvidenceIds: readonly string[] = [],
): CaCoverageRequirement {
  return {
    id: `ca540.${id}`,
    formRef: "Form 540",
    locator: `Side ${side}; ${locator}`,
    source: { url: CA540_SOURCES.form, locator: `Side ${side}; ${locator}` },
    capability,
    implementationRef,
    scenarioEvidenceIds,
    predicateId,
  };
}

// Transcribed against all six printed sides of the official TY2025 Form 540.
// A calculated aggregate never implies preparation of its source schedule or settlement.
const printedRequirements: readonly CaCoverageRequirement[] = [
  printed(
    "return_period",
    1,
    "Amended-return checkbox; fiscal-year month and year",
  ),
  printed(
    "identity.taxpayer",
    1,
    "Taxpayer first name, initial, last name, suffix, SSN or ITIN",
    unsupported,
    always,
  ),
  printed(
    "identity.spouse",
    1,
    "Spouse/RDP first name, initial, last name, suffix, SSN or ITIN",
  ),
  printed(
    "identity.address",
    1,
    "Additional information; street or PO box; apartment/suite; private mailbox; city, state, ZIP; foreign country, province/state/county and postal code",
    unsupported,
    always,
  ),
  printed("identity.pba", 1, "Principal business activity code"),
  printed(
    "identity.birth_dates",
    1,
    "Taxpayer and spouse/RDP dates of birth",
    unsupported,
    always,
  ),
  printed(
    "identity.prior_names",
    1,
    "Taxpayer and spouse/RDP prior last names",
  ),
  printed(
    "identity.principal_residence",
    1,
    "County; same-address checkbox; principal/physical street, apartment, city, state and ZIP",
  ),
  printed(
    "filing_status",
    1,
    "Lines 1–5; filing-status choice",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "filing_status_details",
    1,
    "Federal-status-difference checkbox; separate spouse name; surviving-spouse year of death; filing-status eligibility",
  ),
  printed(
    "line6.dependent_flag",
    1,
    "Line 6: taxpayer or spouse/RDP can be claimed as dependent checkbox",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line7.personal_count",
    1,
    "Line 7: personal exemption count",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line7.personal_amount",
    1,
    "Line 7: personal exemption dollar amount",
    unsupported,
    always,
  ),
  printed(
    "line8.blind_count",
    1,
    "Line 8: blind exemption count",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line8.blind_amount",
    1,
    "Line 8: blind exemption dollar amount and doctor statement eligibility",
  ),
  printed(
    "line9.senior_count",
    1,
    "Line 9: senior exemption count",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line9.senior_amount",
    1,
    "Line 9: senior exemption dollar amount and age eligibility",
  ),
  printed(
    "identity.repeated_headers",
    2,
    "Taxpayer name and SSN/ITIN repeated on Sides 2–6",
    unsupported,
    always,
  ),
  printed(
    "line10.dependent_details",
    2,
    "Line 10: three dependent name, SSN/ITIN and relationship groups; additional-dependent statement",
  ),
  printed(
    "line10.dependent_count",
    2,
    "Line 10: dependent exemption count",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line10.dependent_amount",
    2,
    "Line 10: dependent exemption dollar amount and eligibility",
  ),
  printed(
    "line11.exemption_amount",
    2,
    "Line 11: total unphased exemption amount",
    unsupported,
    always,
  ),
  printed(
    "line12.state_wages",
    2,
    "Line 12: all-states W-2 box 16 state wages",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line13.federal_agi",
    2,
    "Line 13: federal adjusted gross income",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line14.schedule_ca_subtractions",
    2,
    "Line 14: Schedule CA Part I line 27 column B aggregate",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line15.subtotal",
    2,
    "Line 15: federal AGI less aggregate subtractions",
    computed,
    always,
    calculationRef,
    baseline,
  ),
  printed(
    "line16.schedule_ca_additions",
    2,
    "Line 16: Schedule CA Part I line 27 column C aggregate",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line17.ca_agi",
    2,
    "Line 17: California adjusted gross income",
    computed,
    always,
    calculationRef,
    baseline,
  ),
  printed(
    "line18.standard_deduction",
    2,
    "Line 18: ordinary standard deduction chart",
    computed,
    PredicateId.OrdinaryStandardDeduction,
    calculationRef,
    baseline,
  ),
  printed(
    "line18.itemized_deduction",
    2,
    "Line 18: California itemized deductions; Schedule CA Part II",
    unsupported,
    PredicateId.ItemizesDeductions,
  ),
  printed(
    "line18.dependent_standard_deduction",
    2,
    "Line 18: California Standard Deduction Worksheet for Dependents",
    unsupported,
    PredicateId.ClaimedAsDependent,
  ),
  printed(
    "line18.separate_eligibility",
    2,
    "Line 18: married/RDP separate coordinated deduction election",
  ),
  printed(
    "line19.taxable_income",
    2,
    "Line 19: taxable income under ordinary deduction assumption",
    computed,
    PredicateId.OrdinaryStandardDeduction,
    calculationRef,
    baseline,
  ),
  printed(
    "line19.ccf",
    2,
    "Line 19: Capital Construction Fund deduction notation and amount",
  ),
  printed(
    "line31.ordinary_tax",
    2,
    "Line 31: ordinary Tax Table or Tax Rate Schedule amount",
    computed,
    unknown,
    "forms/ca540/2025/tax.ts#calculateOrdinaryTax",
    [
      "single-tax-table-68494",
      "single-rate-schedule-150000",
      "workpaper-baseline",
    ],
  ),
  printed(
    "line31.tax_methods",
    2,
    "Line 31: Tax Table, Tax Rate Schedule, FTB 3800 and FTB 3803 method checkboxes and alternate tax computation",
  ),
  printed(
    "line32.exemption_credits",
    2,
    "Line 32: exemption credits and AGI Limitation Worksheet",
    computed,
    always,
    "forms/ca540/2025/credits.ts#calculateExemptionCredit",
    ["workpaper-baseline", "mixed-exemption-regression"],
  ),
  printed(
    "line33.tax_after_exemption_credits",
    2,
    "Line 33: tax less exemption credits, floored at zero",
    computed,
    always,
    calculationRef,
    baseline,
  ),
  printed(
    "line34.special_tax",
    2,
    "Line 34: supplied special tax amount",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line34.methods",
    2,
    "Line 34: Schedule G-1 and FTB 5870A checkboxes and supporting calculations",
  ),
  printed(
    "line35.tax_before_other_credits",
    2,
    "Line 35: tax before other credits",
    computed,
    always,
    calculationRef,
    baseline,
  ),
  printed(
    "line40.child_dependent_care_credit",
    2,
    "Line 40: supplied child and dependent care credit amount",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed("line43.special_credit", 2, "Line 43: credit name, code and amount"),
  printed("line44.special_credit", 2, "Line 44: credit name, code and amount"),
  printed(
    "line45.special_credits",
    3,
    "Line 45: supplied special-credit aggregate",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line46.renter_credit",
    3,
    "Line 46: supplied nonrefundable renter credit amount",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line46.renter_eligibility",
    3,
    "Line 46: Nonrefundable Renter's Credit Qualification Record",
  ),
  printed(
    "line47.nonrefundable_credits",
    3,
    "Line 47: sum of supplied credit aggregates (no independent line 43/44 input)",
    computed,
    always,
    calculationRef,
    baseline,
  ),
  printed(
    "line48.tax_after_credits",
    3,
    "Line 48: tax less supplied nonrefundable credits, floored at zero",
    computed,
    always,
    calculationRef,
    baseline,
  ),
  printed(
    "line61.amt",
    3,
    "Line 61: supplied alternative minimum tax amount",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line62.behavioral_health_tax",
    3,
    "Line 62: supplied behavioral health services tax amount",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line62.behavioral_health_worksheet",
    3,
    "Line 62: behavioral health services tax worksheet calculation",
  ),
  printed(
    "line63.other_taxes",
    3,
    "Line 63: supplied other taxes and recapture aggregate",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line63.notations",
    3,
    "Line 63: additional-tax source, recapture and interest notations and supporting calculations",
  ),
  printed(
    "line64.total_tax",
    3,
    "Line 64: aggregate total tax",
    computed,
    always,
    calculationRef,
    baseline,
  ),
  printed(
    "line71.withholding",
    3,
    "Line 71: California withholding from W-2, W-2G and 1099 source ledger",
  ),
  printed(
    "line72.estimated_payments",
    3,
    "Line 72: estimates, prior-year applied overpayment, extension and other payments; allocation statements",
  ),
  printed("line73.withholding", 3, "Line 73: Forms 592-B and 593 withholding"),
  printed(
    "line74.refundable_film_credit",
    3,
    "Line 74: refundable Program 4.0 film credit",
  ),
  printed("line75.eitc", 3, "Line 75: earned income tax credit"),
  printed("line76.yctc", 3, "Line 76: young child tax credit"),
  printed("line77.fytc", 3, "Line 77: foster youth tax credit"),
  printed(
    "line78.payments",
    3,
    "Line 78: total payments and claim-of-right credit notation",
  ),
  printed(
    "line91.use_tax",
    3,
    "Line 91: use tax amount; no-use-tax and directly-paid-to-CDTFA checkboxes",
    unsupported,
    always,
  ),
  printed(
    "line92.isr",
    3,
    "Line 92: household full-year health coverage checkbox and individual shared responsibility penalty",
    unsupported,
    always,
  ),
  printed(
    "line93.payments_balance",
    3,
    "Line 93: payments balance after use tax",
    unsupported,
    always,
  ),
  printed(
    "line94.use_tax_balance",
    3,
    "Line 94: excess use tax balance",
    unsupported,
    always,
  ),
  printed(
    "line95.payments_after_penalty",
    3,
    "Line 95: supplied payments after use tax and ISR penalty",
    supplied,
    always,
    inputRef,
    baseline,
  ),
  printed(
    "line96.isr_balance",
    3,
    "Line 96: excess ISR penalty balance",
    unsupported,
    always,
  ),
  printed(
    "line97.overpaid_tax",
    3,
    "Line 97: provisional overpayment from supplied line 95, before refund allocation",
    computed,
    always,
    calculationRef,
    baseline,
  ),
  printed(
    "line98.estimated_tax_election",
    4,
    "Line 98: overpayment applied to 2026 estimated tax",
  ),
  printed(
    "line99.available_overpayment",
    4,
    "Line 99: overpayment available this year",
    unsupported,
    always,
  ),
  printed(
    "line100.tax_due",
    4,
    "Line 100: provisional tax due from supplied line 95, not final amount due",
    computed,
    always,
    calculationRef,
    baseline,
  ),
  ...[
    400,
    401,
    403,
    405,
    406,
    407,
    408,
    413,
    422,
    423,
    424,
    431,
    438,
    439,
    445,
    447,
    448,
    449,
  ].map((code) =>
    printed(
      `contribution.${code}`,
      4,
      `Voluntary contribution code ${code}: election and amount`,
    )
  ),
  printed(
    "line110.contributions",
    4,
    "Line 110: total voluntary contributions",
  ),
  printed(
    "line111.amount_owed",
    5,
    "Line 111: amount owed including use tax, ISR balance and contributions",
    unsupported,
    always,
  ),
  printed(
    "line112.interest_penalties",
    5,
    "Line 112: interest and late filing/payment penalties",
  ),
  printed(
    "line113.estimated_penalty",
    5,
    "Line 113: estimated-tax penalty and FTB 5805/5805F attachment checkboxes",
  ),
  printed(
    "line114.total_due",
    5,
    "Line 114: final total amount due",
    unsupported,
    always,
  ),
  printed(
    "line115.refund",
    5,
    "Line 115: final refund or no amount due",
    unsupported,
    always,
  ),
  printed(
    "line116.direct_deposit",
    5,
    "Line 116: verified routing/account numbers, checking/savings choice and deposit amount",
  ),
  printed(
    "line117.direct_deposit",
    5,
    "Line 117: second routing/account numbers, checking/savings choice and deposit amount",
  ),
  printed(
    "consent.voter_information",
    5,
    "Voter registration information checkbox",
  ),
  printed(
    "consent.health_information",
    5,
    "Covered California information-sharing authorization yes/no",
  ),
  printed(
    "consent.organ_donor",
    5,
    "Organ donor election; primary taxpayer and spouse/RDP consent checkboxes",
  ),
  printed(
    "attachments",
    6,
    "Complete federal return copy, supporting schedules, statements and attachments",
    unsupported,
    always,
  ),
  printed(
    "signatures",
    6,
    "Perjury declaration; taxpayer signature and date; spouse/RDP signature",
    unsupported,
    always,
  ),
  printed("contact", 6, "One email address and preferred phone number"),
  printed(
    "paid_preparer",
    6,
    "Paid preparer name, phone, signature, firm name/address, PTIN and FEIN",
  ),
  printed(
    "third_party_designee",
    6,
    "Third-party discussion authorization yes/no; designee name and phone",
  ),
];

// Each row is one entry in the official TY2025 accepted-individual-forms table.
// Multiplicity is preserved verbatim in meaning, including per-taxpayer limits.
const acceptedForms: readonly [
  string,
  string,
  string,
  AcceptedFormClassification,
  PredicateId?,
][] = [
  [
    "form540",
    "Form 540",
    "1",
    AcceptedFormClassification.ResidentRelevant,
    always,
  ],
  ["form540_2ez", "Form 540 2EZ", "1", AcceptedFormClassification.OutsideScope],
  ["form540nr", "Form 540NR", "1", AcceptedFormClassification.OutsideScope],
  [
    "form592_b",
    "Form 592-B",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form593",
    "Form 593",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form3461", "Form 3461", "1", AcceptedFormClassification.ResidentRelevant],
  [
    "form3503",
    "Form 3503",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form3504", "Form 3504", "2", AcceptedFormClassification.ResidentRelevant],
  ["form3506", "Form 3506", "1", AcceptedFormClassification.ResidentRelevant],
  ["form3507", "Form 3507", "1", AcceptedFormClassification.ResidentRelevant],
  ["form3510", "Form 3510", "1", AcceptedFormClassification.ResidentRelevant],
  ["form3514", "Form 3514", "1", AcceptedFormClassification.ResidentRelevant],
  ["form3521", "Form 3521", "1", AcceptedFormClassification.ResidentRelevant],
  ["form3523", "Form 3523", "1", AcceptedFormClassification.ResidentRelevant],
  ["form3526", "Form 3526", "1", AcceptedFormClassification.ResidentRelevant],
  [
    "form3531",
    "Form 3531",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3532",
    "Form 3532",
    "1",
    AcceptedFormClassification.ResidentRelevant,
    PredicateId.HeadOfHousehold,
  ],
  ["form3540", "Form 3540", "1", AcceptedFormClassification.ResidentRelevant],
  [
    "form3541",
    "Form 3541",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form3547", "Form 3547", "1", AcceptedFormClassification.ResidentRelevant],
  [
    "form3548",
    "Form 3548",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3554",
    "Form 3554",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3568",
    "Form 3568",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3592",
    "Form 3592",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form3596", "Form 3596", "1", AcceptedFormClassification.ResidentRelevant],
  ["form3800", "Form 3800", "1", AcceptedFormClassification.ResidentRelevant],
  ["form3801", "Form 3801", "1", AcceptedFormClassification.ResidentRelevant],
  [
    "form3801_cr",
    "Form 3801-CR",
    "1",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form3803", "Form 3803", "10", AcceptedFormClassification.ResidentRelevant],
  [
    "form3804_cr",
    "Form 3804-CR",
    "2",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3805e",
    "Form 3805E",
    "25",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3805p",
    "Form 3805P",
    "1 per taxpayer",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form3805v", "Form 3805V", "1", AcceptedFormClassification.ResidentRelevant],
  [
    "form3805z",
    "Form 3805Z",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3807",
    "Form 3807",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3808",
    "Form 3808",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3809",
    "Form 3809",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form3814", "Form 3814", "1", AcceptedFormClassification.ResidentRelevant],
  [
    "form3820",
    "Form 3820",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3821",
    "Form 3821",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3831",
    "Form 3831",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3835",
    "Form 3835",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3840",
    "Form 3840",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form3853", "Form 3853", "1", AcceptedFormClassification.ResidentRelevant],
  ["form3870", "Form 3870", "1", AcceptedFormClassification.ResidentRelevant],
  [
    "form3872",
    "Form 3872",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3885a",
    "Form 3885A",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form3913",
    "Form 3913",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "form4197",
    "Form 4197",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form5805", "Form 5805", "1", AcceptedFormClassification.ResidentRelevant],
  ["form5805f", "Form 5805F", "1", AcceptedFormClassification.ResidentRelevant],
  [
    "form5870a",
    "Form 5870A",
    "1 per taxpayer",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["form_w2", "Form W-2", "50", AcceptedFormClassification.ResidentRelevant],
  [
    "schedule_ca_540",
    "Schedule CA (540)",
    "1",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "schedule_ca_540nr",
    "Schedule CA (540NR)",
    "1",
    AcceptedFormClassification.OutsideScope,
  ],
  [
    "schedule_d_540",
    "Schedule D (540)",
    "1",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "schedule_d_540nr",
    "Schedule D (540NR)",
    "1",
    AcceptedFormClassification.OutsideScope,
  ],
  [
    "schedule_d1",
    "Schedule D-1",
    "1",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "schedule_g1",
    "Schedule G-1",
    "1 per taxpayer",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "schedule_p_540",
    "Schedule P (540)",
    "1",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "schedule_p_540nr",
    "Schedule P (540NR)",
    "1",
    AcceptedFormClassification.OutsideScope,
  ],
  [
    "schedule_r",
    "Schedule R",
    "1 per taxpayer",
    AcceptedFormClassification.Unknown,
  ],
  [
    "schedule_s",
    "Schedule S",
    "Unbounded",
    AcceptedFormClassification.ResidentRelevant,
  ],
  [
    "schedule_rdp",
    "Schedule RDP",
    "1",
    AcceptedFormClassification.ResidentRelevant,
  ],
  ["schedule_x", "Schedule X", "1", AcceptedFormClassification.OutsideScope],
];

export const COVERAGE_INVENTORY: readonly CaCoverageRequirement[] =
  validateCoverageInventory([
    ...printedRequirements,
    ...acceptedForms.map((
      [id, formRef, maxPerReturn, classification, predicateId],
    ): CaCoverageRequirement => ({
      id: `accepted.${id}`,
      formRef,
      locator:
        "TY2025 accepted individual forms table; complete form, multiplicity and attachments",
      source: {
        url: CA540_SOURCES.acceptedForms,
        locator: `Tax year 2025 table; ${formRef} row`,
      },
      capability: unsupported,
      implementationRef: null,
      scenarioEvidenceIds: [],
      predicateId: predicateId ??
        (classification === AcceptedFormClassification.OutsideScope
          ? PredicateId.OutsideOriginalResidentScope
          : unknown),
      acceptedForm: { classification, maxPerReturn },
    })),
    {
      id: "ca540.residency",
      formRef: "Form 540",
      locator:
        "Supplied residency classification, not independently verified resident eligibility",
      source: {
        url: CA540_SOURCES.instructions,
        locator:
          "Filing Status; nonresident spouse and Form 540NR requirements",
      },
      capability: supplied,
      implementationRef: inputRef,
      scenarioEvidenceIds: baseline,
      predicateId: always,
    },
    {
      id: "ca540.source_reconciliation",
      formRef: "Form 540 / Schedule CA (540)",
      locator:
        "Federal return, W-2, California nonconformity, RDP and community-property source reconciliation",
      source: {
        url: CA540_SOURCES.scheduleCaInstructions,
        locator: "Purpose; Specific Line Instructions; Part I and Part II",
      },
      capability: unsupported,
      implementationRef: null,
      scenarioEvidenceIds: [],
      predicateId: unknown,
    },
    {
      id: "ca540.mef_schema",
      formRef: "FTB individual e-file schema",
      locator: "TY2025 official schema access and local validation",
      source: {
        url: CA540_SOURCES.mefSchema,
        locator:
          "Overview; FTA State Exchange System authorized-user access; Tax Year 2025 table",
      },
      capability: CoverageCapability.Unavailable,
      implementationRef: null,
      scenarioEvidenceIds: [],
      predicateId: always,
    },
    {
      id: "ca540.xml_mapping",
      formRef: "FTB individual e-file schema",
      locator:
        "Official Form 540 XML mapping (not implemented or substituted with IRS XML)",
      source: {
        url: CA540_SOURCES.mefSchema,
        locator: "Overview; authorized-user schema access",
      },
      capability: CoverageCapability.Unavailable,
      implementationRef: null,
      scenarioEvidenceIds: [],
      predicateId: always,
    },
    {
      id: "ca540.local_rules",
      formRef: "FTB individual e-file business rules",
      locator: "TY2025 authorized business-rule artifacts and local execution",
      source: {
        url: CA540_SOURCES.mefSchema,
        locator: "Overview; Schemas and Business Rules; Tax Year 2025 table",
      },
      capability: CoverageCapability.Unavailable,
      implementationRef: null,
      scenarioEvidenceIds: [],
      predicateId: always,
    },
    {
      id: "ca540.efile_authorization",
      formRef: "FTB 8453 / FTB 8879",
      locator:
        "Applicable original-return signature authorization, dates and retention",
      source: {
        url: CA540_SOURCES.enrollment,
        locator:
          "How to e-file; Individual e-file only; applicable signature authorization forms",
      },
      capability: unsupported,
      implementationRef: null,
      scenarioEvidenceIds: [],
      predicateId: unknown,
    },
    {
      id: "ca540.external_ftb_records",
      formRef: "FTB individual e-file",
      locator:
        "Prior-year AGI, prior filing/account history and duplicate-return checks against FTB records",
      source: {
        url: CA540_SOURCES.enrollment,
        locator:
          "Common errors with Individual e-file; prior-year AGI, previously used SSN and prior-year return records",
      },
      capability: CoverageCapability.Unavailable,
      implementationRef: null,
      scenarioEvidenceIds: [],
      predicateId: unknown,
    },
  ]);

function decision(
  applicability: Applicability,
  fact: string,
  value: string,
): PredicateResult {
  return { applicability, evidence: [{ fact, decision: value }] };
}

function booleanPredicate(
  input: Form540Input | undefined,
  fact: "usesItemizedDeductions" | "taxpayerCanBeClaimedAsDependent",
): PredicateResult {
  const value = input?.[fact];
  if (value === undefined) {
    return decision(Applicability.Unknown, fact, "missing_fact");
  }
  return decision(
    value ? Applicability.Required : Applicability.NotApplicable,
    fact,
    value ? "explicit_true" : "explicit_false",
  );
}

const predicates: Record<
  PredicateId,
  (input: Form540Input | undefined) => PredicateResult
> = {
  [PredicateId.AlwaysRequired]: () =>
    decision(
      Applicability.Required,
      "form540.original_resident_requirement",
      "intrinsic_requirement",
    ),
  [PredicateId.ItemizesDeductions]: (input) =>
    booleanPredicate(input, "usesItemizedDeductions"),
  [PredicateId.ClaimedAsDependent]: (input) =>
    booleanPredicate(input, "taxpayerCanBeClaimedAsDependent"),
  [PredicateId.OrdinaryStandardDeduction]: (input) => {
    if (
      input?.usesItemizedDeductions === undefined ||
      input?.taxpayerCanBeClaimedAsDependent === undefined
    ) {
      return decision(
        Applicability.Unknown,
        "usesItemizedDeductions,taxpayerCanBeClaimedAsDependent",
        "missing_fact",
      );
    }
    const excluded = input.usesItemizedDeductions ||
      input.taxpayerCanBeClaimedAsDependent;
    return decision(
      excluded ? Applicability.NotApplicable : Applicability.Required,
      "usesItemizedDeductions,taxpayerCanBeClaimedAsDependent",
      excluded
        ? "ordinary_standard_deduction_excluded"
        : "ordinary_standard_deduction_selected",
    );
  },
  [PredicateId.HeadOfHousehold]: (input) => {
    if (input?.filingStatus === undefined) {
      return decision(Applicability.Unknown, "filingStatus", "missing_fact");
    }
    const required = input.filingStatus === "head_of_household";
    return decision(
      required ? Applicability.Required : Applicability.NotApplicable,
      "filingStatus",
      required ? "head_of_household_selected" : "other_filing_status_selected",
    );
  },
  // Neither an aggregate amount (including zero) nor a review checkbox supplies
  // schedule eligibility, source reconciliation, elections, or attachment facts.
  [PredicateId.SourceFactsRequired]: () =>
    decision(
      Applicability.Unknown,
      "source_reconciled_applicability_facts",
      "source_reconciliation_not_represented",
    ),
  [PredicateId.OutsideOriginalResidentScope]: () =>
    decision(
      Applicability.NotApplicable,
      "product.original_resident_form540",
      "outside_original_resident_scope",
    ),
};

/** Pure, finite dispatch. Evidence never copies money, identity or free-text input. */
export function assessCoverage(
  input: Form540Input | undefined,
): readonly CoverageAssessment[] {
  return Object.freeze(COVERAGE_INVENTORY.map((row) => {
    const result = predicates[row.predicateId](input);
    return Object.freeze({
      ...row,
      applicability: result.applicability,
      evidence: Object.freeze(
        result.evidence.map((item) => Object.freeze(item)),
      ),
    });
  }));
}
