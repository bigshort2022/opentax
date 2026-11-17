import { GateId } from "../../../core/validation/readiness.ts";
import type { StateFinding } from "../../../core/validation/state-report.ts";
import type { Form540Input } from "./input.ts";

export enum Ca540DiagnosticCode {
  InputCount = "CA540_INPUT_COUNT",
  InputInvalid = "CA540_INPUT_INVALID",
  CalculationRange = "CA540_CALCULATION_RANGE",
  ResidencyUnsupported = "CA540_RESIDENCY_UNSUPPORTED",
  ReviewResidency = "CA540_REVIEW_RESIDENCY",
  ReviewFilingStatus = "CA540_REVIEW_FILING_STATUS",
  ReviewIncome = "CA540_REVIEW_INCOME_RECONCILIATION",
  ItemizedUnsupported = "CA540_DEDUCTIONS_ITEMIZED_UNSUPPORTED",
  DependentDeductionUnsupported = "CA540_DEDUCTION_DEPENDENT_UNSUPPORTED",
  ReviewDeduction = "CA540_REVIEW_STANDARD_DEDUCTION",
  ReviewCreditsTaxes = "CA540_REVIEW_CREDITS_TAXES",
  ReviewPayments = "CA540_REVIEW_PAYMENTS",
  Scope = "CA540_SCOPE_NOT_FILING_READY",
  RequiredDocumentsUnknown = "CA540_REQUIRED_DOCUMENTS_UNKNOWN",
  SchemaUnavailable = "CA540_MEF_SCHEMA_UNAVAILABLE",
  RulesUnavailable = "CA540_LOCAL_RULES_UNAVAILABLE",
}

type FindingTemplate = Omit<
  StateFinding,
  "ruleNumber" | "severity" | "formRef"
>;
const FINDINGS: Readonly<Record<Ca540DiagnosticCode, FindingTemplate>> = {
  [Ca540DiagnosticCode.InputCount]: {
    stage: GateId.Inputs,
    category: "missing_data",
    field: "ca540",
    message: "Provide exactly one California Form 540 workpaper input.",
  },
  [Ca540DiagnosticCode.InputInvalid]: {
    stage: GateId.Inputs,
    category: "incorrect_data",
    field: "ca540",
    message:
      "The California workpaper input is incomplete or invalid; inspect the input schema and required facts.",
  },
  [Ca540DiagnosticCode.CalculationRange]: {
    stage: GateId.Calculation,
    category: "math_error",
    message:
      "Workpaper arithmetic exceeds the supported safe whole-dollar range; no calculated amounts are available.",
  },
  [Ca540DiagnosticCode.ResidencyUnsupported]: {
    stage: GateId.Scope,
    category: "unsupported",
    field: "residency",
    message: "Form 540 only supports full-year California residents.",
  },
  [Ca540DiagnosticCode.ReviewResidency]: {
    stage: GateId.Review,
    category: "missing_data",
    field: "review.fullYearCaliforniaResidence",
    message: "Full-year California residence has not been reviewed.",
  },
  [Ca540DiagnosticCode.ReviewFilingStatus]: {
    stage: GateId.Review,
    category: "missing_data",
    field: "review.filingStatusEligibility",
    message: "California filing-status eligibility has not been reviewed.",
  },
  [Ca540DiagnosticCode.ReviewIncome]: {
    stage: GateId.Review,
    category: "missing_data",
    field: "review.federalAndCaliforniaIncomeReconciled",
    message:
      "Federal income and Schedule CA adjustments have not been reconciled.",
  },
  [Ca540DiagnosticCode.ItemizedUnsupported]: {
    stage: GateId.RequiredDocuments,
    category: "unsupported",
    field: "usesItemizedDeductions",
    message: "California itemized deductions are not supported.",
  },
  [Ca540DiagnosticCode.DependentDeductionUnsupported]: {
    stage: GateId.RequiredDocuments,
    category: "unsupported",
    field: "taxpayerCanBeClaimedAsDependent",
    message: "The dependent standard-deduction worksheet is not supported.",
  },
  [Ca540DiagnosticCode.ReviewDeduction]: {
    stage: GateId.Review,
    category: "missing_data",
    field: "review.standardDeductionEligibility",
    message: "The standard-deduction assumption has not been reviewed.",
  },
  [Ca540DiagnosticCode.ReviewCreditsTaxes]: {
    stage: GateId.Review,
    category: "missing_data",
    field: "review.creditsAndTaxesReviewed",
    message: "Additional credits and taxes have not been reviewed.",
  },
  [Ca540DiagnosticCode.ReviewPayments]: {
    stage: GateId.Review,
    category: "missing_data",
    field: "review.paymentsUseTaxAndPenaltyReviewed",
    message:
      "Payments, use tax, and the health-coverage penalty have not been reviewed.",
  },
  [Ca540DiagnosticCode.Scope]: {
    stage: GateId.Scope,
    category: "unsupported",
    message:
      "This calculation worksheet is not a filing-readiness validation; complete return preparation is unsupported.",
  },
  [Ca540DiagnosticCode.RequiredDocumentsUnknown]: {
    stage: GateId.RequiredDocuments,
    category: "missing_document",
    message:
      "Required supporting documents cannot be determined from aggregate workpaper inputs; complete source facts and schedule applicability are unverified.",
  },
  [Ca540DiagnosticCode.SchemaUnavailable]: {
    stage: GateId.MefSchema,
    category: "unsupported",
    message:
      "Official FTB California XML schema validation is unavailable; no state filing XML has been prepared or validated.",
  },
  [Ca540DiagnosticCode.RulesUnavailable]: {
    stage: GateId.LocalRules,
    category: "unsupported",
    message:
      "The official FTB local business-rule inventory and evaluation are unavailable; no official rule pass is claimed.",
  },
};

/** Static templates intentionally never interpolate taxpayer input or raw errors. */
export function form540Finding(code: Ca540DiagnosticCode): StateFinding {
  return {
    ruleNumber: code,
    severity: "reject",
    formRef: "Form 540",
    ...FINDINGS[code],
  };
}

export function reviewFindings(input: Form540Input): StateFinding[] {
  const findings: StateFinding[] = [];
  if (input.residency !== "full_year_ca") {
    findings.push(form540Finding(Ca540DiagnosticCode.ResidencyUnsupported));
  }
  if (!input.review.fullYearCaliforniaResidence) {
    findings.push(form540Finding(Ca540DiagnosticCode.ReviewResidency));
  }
  if (!input.review.filingStatusEligibility) {
    findings.push(form540Finding(Ca540DiagnosticCode.ReviewFilingStatus));
  }
  if (!input.review.federalAndCaliforniaIncomeReconciled) {
    findings.push(form540Finding(Ca540DiagnosticCode.ReviewIncome));
  }
  if (input.usesItemizedDeductions) {
    findings.push(form540Finding(Ca540DiagnosticCode.ItemizedUnsupported));
  }
  if (input.taxpayerCanBeClaimedAsDependent) {
    findings.push(
      form540Finding(Ca540DiagnosticCode.DependentDeductionUnsupported),
    );
  }
  if (!input.review.standardDeductionEligibility) {
    findings.push(form540Finding(Ca540DiagnosticCode.ReviewDeduction));
  }
  if (!input.review.creditsAndTaxesReviewed) {
    findings.push(form540Finding(Ca540DiagnosticCode.ReviewCreditsTaxes));
  }
  if (!input.review.paymentsUseTaxAndPenaltyReviewed) {
    findings.push(form540Finding(Ca540DiagnosticCode.ReviewPayments));
  }
  return findings;
}
