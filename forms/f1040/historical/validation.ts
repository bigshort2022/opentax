import type { PreparationIssue } from "../../../core/types/form-definition.ts";
import { inputSchema as generalSchema } from "../nodes/inputs/general/filing/general/index.ts";
import { historicalPaperIssues, type HistoricalTaxYear } from "./pdf/builder.ts";
import { extractFilerIdentity } from "../mef/filer.ts";
import { assertLine1aWageSource, assertW2WithholdingSource } from "../2025/domains/payments/withholding/w2-withholding-reconciliation.ts";
import { assertIdentified1099IntOwner } from "../2025/domains/income/investments/f1099int/f1099int-owner-reconciliation.ts";
import { assertPositive1099OidOwner } from "../2025/domains/income/investments/f1099oid/f1099oid-owner-reconciliation.ts";
import { assertPositive1099DivOwner } from "../2025/domains/income/investments/f1099div/f1099div-owner-reconciliation.ts";
import { assertPositive1099GOwner } from "../2025/domains/income/other/f1099g/f1099g-owner-reconciliation.ts";
import { assertPositive1099MOwner } from "../2025/domains/income/business/f1099m/f1099m-owner-reconciliation.ts";
import { assertPositive1099NecOwner } from "../2025/domains/income/business/f1099nec/f1099nec-owner-reconciliation.ts";
import { assert1099BRecipientOwner } from "../2025/domains/income/investments/f1099b/f1099b-recipient-owner.ts";
import { assert1099WithholdingSource } from "../2025/domains/payments/withholding/f1099/f1099-withholding-reconciliation.ts";
import { assertScheduleCReceiptSourceIdentity } from "../2025/domains/general/return-assembly/filer-source-reconciliation.ts";

const SOURCE_OWNER_CHECKS = [
  ["1099-INT", assertIdentified1099IntOwner],
  ["1099-OID", assertPositive1099OidOwner],
  ["1099-DIV", assertPositive1099DivOwner],
  ["1099-G", assertPositive1099GOwner],
  ["1099-MISC", assertPositive1099MOwner],
  ["1099-NEC", assertPositive1099NecOwner],
] as const;

/** Calculation/source completeness is separate from signature or filing authority. */
export function historicalPreparationIssues(
  year: HistoricalTaxYear,
  inputs: Readonly<Record<string, unknown>>,
  pending: Readonly<Record<string, Record<string, unknown>>>,
): readonly PreparationIssue[] {
  const issues: PreparationIssue[] = [];
  const general = generalSchema.safeParse(inputs.general);
  if (!general.success) {
    issues.push({ code: "MISSING_FILING_SOURCE", message: "Historical preparation requires the taxpayer's filing-status and identity source", form: "1040" });
  } else {
    const filer = general.data;
    if (!filer.taxpayer_first_name?.trim() || !filer.taxpayer_last_name?.trim() || !/^\d{9}$/.test(filer.taxpayer_ssn?.replaceAll("-", "") ?? "")) {
      issues.push({ code: "MISSING_TAXPAYER_IDENTITY", message: "Paper preparation requires the identified taxpayer, not a fabricated identity", form: "1040" });
    }
    if (!filer.address_line1?.trim() || (!filer.address_foreign_country && (!filer.address_city?.trim() || !filer.address_state?.trim() || !filer.address_zip?.trim()))) {
      issues.push({ code: "MISSING_MAILING_ADDRESS", message: "Paper preparation requires a complete mailing address", form: "1040" });
    }
    if (filer.filing_status === "mfj" || filer.filing_status === "mfs") {
      if (!filer.spouse_first_name?.trim() || !filer.spouse_last_name?.trim() || !/^\d{9}$/.test(filer.spouse_ssn?.replaceAll("-", "") ?? "")) {
        issues.push({ code: "MISSING_SPOUSE_IDENTITY", message: "Married filing status requires the identified spouse", form: "1040" });
      }
    }
    if (filer.digital_assets === undefined) {
      issues.push({ code: "UNANSWERED_DIGITAL_ASSET_QUESTION", message: "Answer the actual tax year's virtual-currency/digital-asset question explicitly", form: "1040" });
    }
    if (filer.taxpayer_dob === undefined && filer.taxpayer_age_65_or_older === undefined) {
      issues.push({ code: "UNKNOWN_AGE_DEDUCTION", message: "Provide date of birth or an explicit age-65 answer for the historical deduction", form: "1040" });
    }
    if (filer.filing_status !== "mfj" && Array.isArray(inputs.schedule_e) &&
      inputs.schedule_e.some(property => property?.tsj === "S" || property?.tsj === "J")) {
      issues.push({ code: "RENTAL_SOURCE_MISMATCH", message: "Spouse or joint-spouse Schedule E ownership requires a joint return; separate returns must identify the taxpayer's own share", form: "Schedule E" });
    }
  }
  const output = pending.f1040;
  if (!output || ["line11_agi", "line15_taxable_income", "line24_total_tax", "line33_total_payments"].some((key) => typeof output[key] !== "number" || !Number.isFinite(output[key]))) {
    issues.push({ code: "INCOMPLETE_HISTORICAL_CALCULATION", message: "A partial or empty calculation is not a complete historical return", form: "1040" });
  }
  const filingFields = { ...pending.general, ...output };
  const filer = extractFilerIdentity(filingFields);
  try {
    assertW2WithholdingSource(pending, filer);
    assertLine1aWageSource(pending);
  } catch (error) {
    issues.push({ code: "WAGE_SOURCE_MISMATCH", message: error instanceof Error ? error.message : String(error), form: "W-2" });
  }
  for (const [form, check] of SOURCE_OWNER_CHECKS) {
    try {
      check(filingFields, pending);
    } catch (error) {
      issues.push({ code: "SOURCE_OWNER_MISMATCH", message: error instanceof Error ? error.message : String(error), form });
    }
  }
  try {
    assert1099BRecipientOwner(pending.f1099b, filer, year);
  } catch (error) {
    issues.push({ code: "BROKER_SOURCE_MISMATCH", message: error instanceof Error ? error.message : String(error), form: "1099-B" });
  }
  try {
    assert1099WithholdingSource(pending, filer);
  } catch (error) {
    issues.push({ code: "PAYMENT_SOURCE_MISMATCH", message: error instanceof Error ? error.message : String(error), form: "1099" });
  }
  if (filer) {
    try {
      assertScheduleCReceiptSourceIdentity(pending, filer);
    } catch (error) {
      issues.push({ code: "PROPRIETOR_SOURCE_MISMATCH", message: error instanceof Error ? error.message : String(error), form: "Schedule C" });
    }
  }
  issues.push(...historicalPaperIssues(year, pending));
  return issues;
}
