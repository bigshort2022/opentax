import { z } from "zod";
import type {
  NodeOutput,
  NodeResult,
} from "../../../../../../../../core/types/tax-node.ts";
import { output, TaxNode } from "../../../../../../../../core/types/tax-node.ts";
import { OutputNodes } from "../../../../../../../../core/types/output-nodes.ts";
import { FilingStatus, filingStatusSchema } from "../../../../../types.ts";
import { f1040 } from "../../../../../outputs/general/return-assembly/f1040/index.ts";
import type { NodeContext } from "../../../../../../../../core/types/node-context.ts";
import { CONFIG_BY_YEAR } from "../../../../../config/index.ts";
import type { F1040Config } from "../../../../../config/index.ts";
import { lookupEic2025 } from "./table_2025.ts";
import { lookupEicFromParameters } from "./table.ts";
import { eicBirthResidencyReviewSchema } from "../../../../../../2025/domains/credits/earned-income/earned-income/eic-birth-residency.ts";

import { eicDatedResidencyReviewSchema } from "../../../../../../2025/domains/credits/earned-income/earned-income/eic-dated-residency.ts";

import { eicDeathResidencyReviewSchema } from "../../../../../../2025/domains/credits/earned-income/earned-income/eic-death-residency.ts";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const qualifyingChildDetailSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  name_control: z.string().optional(),
  ssn: z.string(),
  ssn_valid_for_employment: z.boolean().optional(),
  tin_issued_by_due_date: z.boolean().optional(),
  dob: z.string(),
  irs_relationship_code: z.string().optional(),
  months_in_home: z.number().int().min(0).max(12),
  months_lived_with_you_in_us: z.number().int().min(0).max(12),
  eic_birth_residency_review: eicBirthResidencyReviewSchema.optional(),
  eic_dated_residency_review: eicDatedResidencyReviewSchema.optional(),
  eic_death_residency_review: eicDeathResidencyReviewSchema.optional(),
  full_time_student: z.boolean().optional(),
  disabled: z.boolean().optional(),
  ip_pin: z.string().optional(),
});
export type QualifyingChildDetail = z.infer<typeof qualifyingChildDetailSchema>;

const historical2021EicAgeCategory = z.enum([
  "regular", "specified_student", "qualified_former_foster_youth",
  "qualified_homeless_youth",
]);

export const childlessEicReviewSchema = z.object({
  not_qualifying_child_of_another_taxpayer_verified: z.literal(true),
  qualifying_child_status_record_reference: z.string().trim().min(1),
  hoh_unmarried_at_year_end_verified: z.literal(true).optional(),
  // Pub. 596 (2021), Rule 11. Required below age 24: age alone cannot
  // establish whether the 19, 24, or qualified-youth 18 minimum applies.
  historical_2021_age_review: z.object({
    taxpayer: historical2021EicAgeCategory,
    spouse: historical2021EicAgeCategory.optional(),
    source_reference: z.string().trim().min(1),
  }).strict().optional(),
  // ARPA §9626 / Pub. 596 (2021), Election to use prior year earned income.
  // For a joint 2021 return this must reconcile both spouses' 2019 amounts,
  // even when they did not file jointly in 2019. It does not replace 2021 AGI.
  historical_2021_earned_income_election: z.object({
    earned_income_2019: z.number().nonnegative(),
    joint_2019_earned_income_reconciled: z.literal(true),
    source_reference: z.string().trim().min(1),
  }).strict().optional(),
}).strict();

export const childEicFilerReviewSchema = z.object({
  not_qualifying_child_of_another_taxpayer_verified: z.literal(true),
  relationship_age_residence_record_reference: z.string().trim().min(1),
}).strict();

/** Pub. 596 rule 4: any nonresident period needs a joint full-year election. */
export const eicTaxResidencyReviewSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("all_year_resident"),
    taxpayer_status_record_reference: z.string().trim().min(1),
    spouse_status_record_reference: z.string().trim().min(1).optional(),
  }).strict(),
  z.object({
    status: z.literal("joint_new_election"),
    elected_person: z.enum(["taxpayer", "spouse"]),
    elected_spouse_nonresident_at_year_end_verified: z.literal(true),
    other_spouse_citizen_or_resident_at_year_end_verified: z.literal(true),
    worldwide_income_included_verified: z.literal(true),
    status_record_reference: z.string().trim().min(1),
    signed_statement_file_name: z.string().trim().min(1),
    signed_statement_pdf_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    statement_signed_by_both_verified: z.literal(true),
  }).strict(),
  z.object({
    status: z.literal("joint_prior_election"),
    elected_person: z.enum(["taxpayer", "spouse"]),
    election_still_in_effect_verified: z.literal(true),
    at_least_one_spouse_citizen_or_resident_during_2025_verified: z.literal(
      true,
    ),
    worldwide_income_included_verified: z.literal(true),
    prior_joint_return_reference: z.string().trim().min(1),
    prior_signed_statement_reference: z.string().trim().min(1),
  }).strict(),
]);
export type EicTaxResidencyReview = z.infer<
  typeof eicTaxResidencyReviewSchema
>;

export const priorEicDisallowanceReviewSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("none"),
    irs_account_record_reference: z.string().trim().min(1),
    no_nonclerical_disallowance_since_1996_verified: z.literal(true),
  }).strict(),
  z.object({
    status: z.literal("math_or_clerical_only"),
    irs_notice_reference: z.string().trim().min(1),
    no_other_disallowance_verified: z.literal(true),
  }).strict(),
  z.object({
    status: z.literal("reinstated"),
    disallowance_notice_reference: z.string().trim().min(1),
    later_allowance_notice_reference: z.string().trim().min(1),
    no_new_disallowance_verified: z.literal(true),
  }).strict(),
  z.object({
    status: z.literal("childless_exception"),
    disallowance_notice_reference: z.string().trim().min(1),
    disallowed_only_for_child_qualification_verified: z.literal(true),
    no_other_disallowance_verified: z.literal(true),
    no_active_ban_verified: z.literal(true),
  }).strict(),
  z.object({
    status: z.literal("requires_8862"),
    disallowed_year: z.number().int().min(1997).max(2024),
    disallowance_notice_reference: z.string().trim().min(1),
    notice_copy_reference: z.string().trim().min(1).optional(),
    notice_copy_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
]);

export const inputSchema = z.object({
  // Earned income from wages (W-2 Box 1), fed by w2 node
  earned_income: z.number().nonnegative().optional(),

  // Net profit from Schedule C (line 31, positive only), fed by schedule_c node
  // IRC §32(c)(2)(A)(ii): net earnings from self-employment count as earned income
  se_net_profit: z.number().nonnegative().optional(),
  // Worksheet B Part 1 line 1d: Schedule SE line 13 reduces SE earned income.
  se_tax_deduction: z.number().nonnegative().optional(),
  // Pub. 596 (2025) Rule 7, Disability Benefits: taxable employer disability
  // retirement benefits before minimum retirement age, fed by f1099r.
  disability_pension_earned_income: z.number().nonnegative().optional(),

  // Adjusted Gross Income — used for EITC phaseout when AGI > earned income
  agi: z.number().optional(),

  // Number of qualifying children (0, 1, 2, or 3+)
  qualifying_children: z.number().int().min(0).max(3).optional(),
  qualifying_child_details: z.array(qualifyingChildDetailSchema).max(3)
    .optional(),

  // Filing status — determines phaseout thresholds
  filing_status: filingStatusSchema.optional(),
  mfs_separation_reviewed: z.boolean().optional(),
  filer_has_valid_ssns: z.boolean().optional(),
  taxpayer_dob: z.string().date().optional(),
  spouse_dob: z.string().date().optional(),
  taxpayer_death_date: z.string().date().optional(),
  spouse_death_date: z.string().date().optional(),
  main_home_in_us_over_half_year: z.boolean().optional(),
  taxpayer_can_be_claimed_as_dependent: z.boolean().optional(),
  spouse_can_be_claimed_as_dependent: z.boolean().optional(),
  childless_eic_review: childlessEicReviewSchema.optional(),
  child_eic_filer_review: childEicFilerReviewSchema.optional(),
  prior_eic_disallowance_review: priorEicDisallowanceReviewSchema.optional(),
  eic_tax_residency_review: eicTaxResidencyReviewSchema.optional(),
  do_not_claim_eic: z.boolean().optional(),

  // Investment income (interest, dividends, capital gains, rents)
  // If investment_income > eitcInvestmentIncomeLimit, no EITC allowed
  investment_income: z.number().nonnegative().optional(),
  // Pub. 596 Worksheet 1 lines 1–3, routed from the filed income sources.
  investment_income_floor: z.number().nonnegative().optional(),

  // A filed Form 8862 can satisfy the reviewed prior-disallowance route.
  form8862_filed: z.boolean().optional(),
  form8862_disallowed_year: z.number().int().min(1997).max(2024).optional(),
  form8862_notice_reference: z.string().trim().min(1).optional(),
  form2555_filed: z.boolean().optional(),
});

export type EitcInput = z.infer<typeof inputSchema>;

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

function isJointFiler(status: FilingStatus | undefined): boolean {
  return status === FilingStatus.MFJ;
}

function clampChildren(children: number): number {
  // IRS treats 3+ the same
  return Math.min(children, 3);
}

// Pub. 596 (2021), Rule 11; ARPA §9621.
type HistoricalEicAgeCategory = z.infer<typeof historical2021EicAgeCategory>;

function meets2021ChildlessAgeTest(
  dob: string,
  deathDate: string | undefined,
  category: HistoricalEicAgeCategory | undefined,
): boolean | undefined {
  const minimumAge = category === "specified_student" ? 24
    : category === "qualified_former_foster_youth" ||
        category === "qualified_homeless_youth" ? 18 : 19;
  const ageDate = (age: number) => new Date(Date.UTC(
    Number(dob.slice(0, 4)) + age,
    Number(dob.slice(5, 7)) - 1,
    Number(dob.slice(8, 10)) - 1,
  )).toISOString().slice(0, 10);
  const asOf = deathDate ?? "2021-12-31";
  if (deathDate && !deathDate.startsWith("2021-")) return false;
  if (asOf < ageDate(18)) return false;
  if (category === undefined && asOf < ageDate(24)) return undefined;
  return asOf >= ageDate(minimumAge);
}

/** The 2021 Form1040 line27a checkbox certifies both youth status and DOB. */
function qualifiesFor2021YouthIndicator(
  dob: string | undefined,
  deathDate: string | undefined,
  category: HistoricalEicAgeCategory | undefined,
): boolean {
  if (dob === undefined || dob <= "1998-01-01" || dob >= "2004-01-02") {
    return false;
  }
  if (
    category !== "qualified_former_foster_youth" &&
    category !== "qualified_homeless_youth"
  ) return false;
  return meets2021ChildlessAgeTest(dob, deathDate, category) === true;
}

function meetsChildlessAgeTest(
  dob: string | undefined,
  deathDate: string | undefined,
  taxYear: number,
  historicalCategory?: HistoricalEicAgeCategory,
): boolean | undefined {
  if (dob === undefined) return false;
  if (taxYear === 2021) {
    return meets2021ChildlessAgeTest(dob, deathDate, historicalCategory);
  }
  if (deathDate === undefined) {
    return dob > `${taxYear - 65}-12-31` && dob < `${taxYear - 24}-01-02`;
  }
  if (!deathDate.startsWith(`${taxYear}-`)) return false;
  const year = Number(dob.slice(0, 4));
  const month = Number(dob.slice(5, 7));
  const day = Number(dob.slice(8, 10));
  const age25 = new Date(Date.UTC(year + 25, month - 1, day));
  age25.setUTCDate(age25.getUTCDate() - 1);
  const age65 = new Date(Date.UTC(year + 65, month - 1, day));
  return deathDate >= age25.toISOString().slice(0, 10) &&
    deathDate < age65.toISOString().slice(0, 10);
}

export function childlessEicEligible(
  input: EitcInput,
  taxYear: number,
): boolean {
  if (
    input.taxpayer_can_be_claimed_as_dependent === true ||
    input.spouse_can_be_claimed_as_dependent === true
  ) return false;
  if (
    input.filing_status === undefined ||
    input.filing_status === FilingStatus.MFS
  ) return false;
  const isJoint = isJointFiler(input.filing_status);
  const taxpayerAgeEligible = meetsChildlessAgeTest(
    input.taxpayer_dob,
    input.taxpayer_death_date,
    taxYear,
    input.childless_eic_review?.historical_2021_age_review?.taxpayer,
  );
  const spouseAgeEligible = isJoint
    ? meetsChildlessAgeTest(
      input.spouse_dob, input.spouse_death_date, taxYear,
      input.childless_eic_review?.historical_2021_age_review?.spouse,
    )
    : false;
  const ageEligible = taxpayerAgeEligible === true || spouseAgeEligible === true;
  if (
    !ageEligible &&
    (taxpayerAgeEligible === undefined || spouseAgeEligible === undefined)
  ) {
    throw new Error("2021 childless EIC below age 24 needs the reviewed student or qualified-youth age category");
  }
  if (!ageEligible || input.main_home_in_us_over_half_year !== true) {
    return false;
  }
  if (isJoint) return true;
  return input.taxpayer_can_be_claimed_as_dependent === false &&
    input.childless_eic_review
        ?.not_qualifying_child_of_another_taxpayer_verified === true &&
    (input.filing_status !== FilingStatus.HOH ||
      input.childless_eic_review.hoh_unmarried_at_year_end_verified === true);
}

export function childEicFilerEligible(input: EitcInput): boolean {
  if (
    input.taxpayer_can_be_claimed_as_dependent === true ||
    input.spouse_can_be_claimed_as_dependent === true
  ) return false;
  if (input.filing_status === FilingStatus.MFJ) return true;
  if (input.filing_status === FilingStatus.MFS) {
    return input.mfs_separation_reviewed === true;
  }
  return input.filing_status !== undefined &&
    input.child_eic_filer_review
        ?.not_qualifying_child_of_another_taxpayer_verified === true;
}

export function priorEicDisallowanceEligible(
  input: EitcInput,
  children: number,
): boolean {
  const review = input.prior_eic_disallowance_review;
  if (review === undefined) return false;
  if (review.status === "childless_exception") {
    return children === 0 && input.form8862_filed !== true;
  }
  if (review.status !== "requires_8862") {
    return input.form8862_filed !== true;
  }
  return input.form8862_filed === true &&
    input.form8862_disallowed_year === review.disallowed_year &&
    input.form8862_notice_reference ===
      review.disallowance_notice_reference;
}

export function eicTaxResidencyEligible(input: EitcInput): boolean {
  const review = input.eic_tax_residency_review;
  if (!review) return false;
  if (review.status === "all_year_resident") {
    return input.filing_status !== FilingStatus.MFJ ||
      review.spouse_status_record_reference !== undefined;
  }
  return input.filing_status === FilingStatus.MFJ;
}

type EicLookup = (amount: number, children: number, joint: boolean) => number;

// Annual config supplies the table's maximum-credit rounding convention.
// The published 2025 lookup remains authoritative for that year.
function eicLookupForYear(taxYear: number, cfg: F1040Config): EicLookup {
  if (taxYear === 2025) return lookupEic2025;
  return (amount, children, joint) =>
    lookupEicFromParameters(
      cfg.eitcByChildren, amount, children, joint, cfg.eitcMaximumRounding,
    );
}

// EIC Worksheet A line 4 / Worksheet B line 6: AGI is looked up only from the
// phaseout start amount for the filer's status and child count.
function agiComparisonThreshold(
  cfg: F1040Config,
  children: number,
  joint: boolean,
): number {
  const params = cfg.eitcByChildren[Math.min(children, 3)];
  return joint ? params.phaseoutStartMfj : params.phaseoutStart;
}

// The joint prior-election review attests residence "during 2025".
function assertResidencyReviewForYear(
  input: EitcInput,
  taxYear: number,
): void {
  if (
    taxYear !== 2025 &&
    input.eic_tax_residency_review?.status === "joint_prior_election"
  ) {
    throw new Error(
      `TY${taxYear} EIC does not yet support the joint prior-election residency review`,
    );
  }
}

// Pub. 596 (2025) ch. 5: EIC denied or reduced for any year after 1996, other
// than for a math or clerical error, requires Form 8862, so a claim cannot
// proceed without that answer.
function requirePriorDisallowanceAnswer(
  input: EitcInput,
  credit: number,
): number {
  if (credit > 0 && input.prior_eic_disallowance_review === undefined) {
    throw new Error(
      "EIC needs general.prior_eic_disallowance_review: whether EIC was disallowed or reduced for a year after 1996 decides if Form 8862 is required",
    );
  }
  return credit;
}

function computeEitc(
  input: EitcInput,
  investmentIncomeLimit: number,
  lookupEic: EicLookup,
  cfg: F1040Config,
  taxYear: number,
): number {
  return requirePriorDisallowanceAnswer(
    input,
    tentativeEitc(input, investmentIncomeLimit, lookupEic, cfg, taxYear),
  );
}

function tentativeEitc(
  input: EitcInput,
  investmentIncomeLimit: number,
  lookupEic: EicLookup,
  cfg: F1040Config,
  taxYear: number,
): number {
  if (input.do_not_claim_eic === true) return 0;
  const currentEarnedIncome = (input.earned_income ?? 0) +
    (input.disability_pension_earned_income ?? 0) +
    (input.se_net_profit ?? 0) - (input.se_tax_deduction ?? 0);
  const priorIncomeElection =
    input.childless_eic_review?.historical_2021_earned_income_election;
  if (
    priorIncomeElection &&
    priorIncomeElection.earned_income_2019 <= currentEarnedIncome
  ) {
    throw new Error("2021 EIC prior-year election requires 2019 earned income greater than 2021 earned income");
  }
  const earnedIncome = priorIncomeElection?.earned_income_2019 ?? currentEarnedIncome;
  const agi = input.agi ?? currentEarnedIncome;
  const children = clampChildren(input.qualifying_children ?? 0);
  const isJoint = isJointFiler(input.filing_status);

  if (input.filer_has_valid_ssns !== true) return 0;
  if (!eicTaxResidencyEligible(input)) return 0;
  if (input.form2555_filed === true) return 0;
  if (
    input.prior_eic_disallowance_review !== undefined &&
    !priorEicDisallowanceEligible(input, children)
  ) return 0;

  // A separate return can use the 2025 separated-spouse rule only with a
  // qualifying child and reviewed residence/separation facts.
  if (
    input.filing_status === FilingStatus.MFS &&
    (children === 0 || input.mfs_separation_reviewed !== true)
  ) return 0;

  if (children === 0 && !childlessEicEligible(input, taxYear)) return 0;
  if (children > 0 && !childEicFilerEligible(input)) return 0;

  // Investment income disqualifier (IRC §32(i))
  if (
    Math.max(input.investment_income ?? 0, input.investment_income_floor ?? 0) >
      investmentIncomeLimit
  ) return 0;

  // Must have earned income
  if (earnedIncome <= 0) return 0;

  // Worksheet A/B: look up earned income first. AGI gets a second lookup only
  // at or above the worksheet threshold, then the smaller credit controls.
  const earnedCredit = lookupEic(earnedIncome, children, isJoint);
  if (agi < agiComparisonThreshold(cfg, children, isJoint)) {
    return earnedCredit;
  }
  return Math.min(earnedCredit, lookupEic(agi, children, isJoint));
}

function buildOutput(credit: number): NodeOutput[] {
  if (credit <= 0) return [];
  return [output(f1040, { line27_eitc: credit })];
}

// ─── Node Class ───────────────────────────────────────────────────────────────

class EitcNode extends TaxNode<typeof inputSchema> {
  readonly nodeType = "eitc";
  readonly inputSchema = inputSchema;
  readonly outputNodes = new OutputNodes([f1040]);

  compute(ctx: NodeContext, rawInput: EitcInput): NodeResult {
    const cfg = CONFIG_BY_YEAR[ctx.taxYear];
    if (!cfg) throw new Error(`No f1040 config for year ${ctx.taxYear}`);

    const input = inputSchema.parse(rawInput);
    assertResidencyReviewForYear(input, ctx.taxYear);
    if (
      ctx.taxYear !== 2021 &&
      (input.childless_eic_review?.historical_2021_age_review ||
        input.childless_eic_review?.historical_2021_earned_income_election)
    ) {
      throw new Error("Historical EIC age and 2019 earned-income elections are only available in 2021");
    }
    const credit = computeEitc(
      input,
      cfg.eitcInvestmentIncomeLimit,
      eicLookupForYear(ctx.taxYear, cfg),
      cfg,
      ctx.taxYear,
    );
    return {
      outputs: [
        ...buildOutput(credit),
        {
          nodeType: this.nodeType,
          fields: {
            credit_amount: credit,
            investment_income_floor: input.investment_income_floor ?? 0,
            qualifying_children: input.qualifying_children ?? 0,
            qualifying_child_details: input.qualifying_child_details ?? [],
            ...(ctx.taxYear === 2021 &&
                input.childless_eic_review?.historical_2021_earned_income_election
              ? {
                historical_2021_elected_earned_income:
                  input.childless_eic_review.historical_2021_earned_income_election.earned_income_2019,
              }
              : {}),
            ...(ctx.taxYear === 2021 && credit > 0 &&
                (qualifiesFor2021YouthIndicator(
                  input.taxpayer_dob, input.taxpayer_death_date,
                  input.childless_eic_review?.historical_2021_age_review?.taxpayer,
                ) || (isJointFiler(input.filing_status) &&
                  qualifiesFor2021YouthIndicator(
                    input.spouse_dob, input.spouse_death_date,
                    input.childless_eic_review?.historical_2021_age_review?.spouse,
                  )))
              ? { historical_2021_qualified_youth: true }
              : {}),
          },
        },
      ],
    };
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const eitc = new EitcNode();
