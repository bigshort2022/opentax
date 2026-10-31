import { test } from "bun:test";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { executeF1040Return } from "../../../../../../2025/return-processing/execute_return.ts";
import { calculatePub974SingleBusinessIterative, pub974SingleBusinessSourceSchema } from "./pub974_worksheets.ts";
import { FilingStatus } from "../../../../../types.ts";
import { assertOneScheduleC8995 } from "../../../../../../2025/mef/forms/deductions/business/f8995/f8995-route.ts";

const general = { filing_status: "single", taxpayer_first_name: "Alex", taxpayer_last_name: "Example", taxpayer_ssn: "123456789", taxpayer_dob: "1985-06-15", address_line1: "1 Example Way", address_city: "Austin", address_state: "TX", address_zip: "78701", digital_assets: false, qbi_no_prior_loss_or_suspended_loss_confirmed: true, qbi_not_patron_of_specified_cooperative_confirmed: true };
const business = { business_reference: "SYNTHETIC-C", proprietor_recipient: "T", line_a_principal_business: "Synthetic consulting", line_c_business_name: "Synthetic Consulting", line_b_business_code: "541990", line_f_accounting_method: "cash", line_g_material_participation: true, line_1_gross_receipts: 40000, qbi_no_other_adjustments_confirmed: true };
function sources(monthly: boolean) {
  const premiums = Array(12).fill(1000);
  const slcsps = Array.from({ length: 12 }, (_, i) => monthly ? 1100 + i : 1100);
  const aptcs = Array(12).fill(500);
  const policy = Array.from({ length: 12 }, (_, i) => ({ form1095a_policy_number: "SYNTHETIC-POLICY", month: i + 1, premium: premiums[i], aptc: aptcs[i] }));
  const pub974 = { owner_identity: { recipient: "T", recipient_ssn: general.taxpayer_ssn }, worksheet_w: { specified_policy_months: policy.map((row) => ({ form1095a_policy_number: row.form1095a_policy_number, month: row.month, specified_premium: row.premium, attributable_aptc: row.aptc })), nonspecified_premium_deduction: 0, one_establishing_business_verified: true, business: { kind: "self_employed", establishing_business_reference: "SYNTHETIC-C", establishing_business_earned_income: 40000, all_profitable_business_earned_income: 40000, schedule1_line15_se_tax_deduction: 2826, establishing_business_schedule1_line16_retirement_deduction: 0, form2555_attributable_exclusion: 0 } }, worksheet_x: { special_adjustment_cases_reviewed_absent: true, form1040_line9_total_income: 40000, form1040_line2a_tax_exempt_interest: 0, form1040_nontaxable_social_security: 0, form2555_lines45_and_50: 0, schedule1_adjustments_except_line17: 2826, required_filing_dependents_modified_agi: 0, household_size: 1, fpl_region: "contiguous", filing_status: FilingStatus.Single }, form1095a_policy_months: policy, no_other_se_income_sources_verified: true, form8962_source: { monthly_premiums: premiums, monthly_slcsps: slcsps, monthly_aptcs: aptcs } };
  return { pub974, inputs: { general, schedule_c: [business], f1095a: [{ issuer_name: "Synthetic Marketplace", policy_number: "SYNTHETIC-POLICY", recipient_ssn: general.taxpayer_ssn, monthly_premiums: premiums, monthly_slcsps: slcsps, monthly_aptcs: aptcs }], form7206: { marketplace_ptc_premium_overlap: true, pub974_single_business: pub974 } } };
}
for (const taxYear of [2021, 2022, 2023, 2024]) {
  for (const monthly of [false, true]) {
    test(`${taxYear} public ScheduleC/1095A graph reconciles ${monthly ? "monthly" : "annual"} Pub974 and identified worksheet`, () => {
      const { pub974, inputs } = sources(monthly);
      const result = executeF1040Return(inputs, { taxYear, formType: "f1040" });
      assertEquals(result.diagnostics, []);
      const expected = calculatePub974SingleBusinessIterative(taxYear, pub974SingleBusinessSourceSchema.parse(pub974));
      assert(expected.schedule1_line17_deduction > 0);
      assertEquals(result.pending.schedule1.line17_se_health_insurance, expected.schedule1_line17_deduction);
      assertEquals(result.pending.form8962.total_premium_tax_credit, expected.form8962_fields.total_premium_tax_credit);
      assertEquals(result.pending.form7206.pub974_filing_row, expected.filing_row);
      assertEquals(expected.filing_row?.recipient_ssn, general.taxpayer_ssn);
      assertEquals(result.pending.form8962.monthly_ptc_rows !== undefined, monthly);
      const qbi = assertOneScheduleC8995(result.pending.form8995, result.pending, taxYear);
      assertEquals(qbi.lines[15], result.pending.f1040.line13_qbi_deduction);
      assertThrows(() => assertOneScheduleC8995(result.pending.form8995, {
        ...result.pending,
        form7206: { ...result.pending.form7206, pub974_filing_row: {
          ...expected.filing_row, recipient_ssn: "987654321",
        } },
      }, taxYear), Error, "Publication 974");
      assertThrows(() => assertOneScheduleC8995(result.pending.form8995, {
        ...result.pending,
        form8962: { ...result.pending.form8962, total_premium_tax_credit: 1 },
      }, taxYear), Error, "Publication 974");
    });
  }
}
test("historical Pub974 cannot file an unidentified proprietor deduction", () => {
  const { inputs } = sources(false);
  const { owner_identity: _owner, ...unowned } = inputs.form7206.pub974_single_business;
  const result = executeF1040Return({ ...inputs, form7206: { marketplace_ptc_premium_overlap: true, pub974_single_business: unowned } }, { taxYear: 2023, formType: "f1040" });
  assert(result.diagnostics.some((row) => row.message.includes("owner identity")));
});

test("2021 reviewed unemployment with full PTC retains a valid zero-deduction Pub974 QBI source", () => {
  const { inputs, pub974 } = sources(false);
  const evidence = {
    recipient: "taxpayer", received_or_approved: true,
    source_reference: "synthetic 2021 approved unemployment determination",
    no_one_can_claim_recipient: true,
  };
  const result = executeF1040Return({
    ...inputs,
    f1095a: inputs.f1095a.map((policy) => ({
      ...policy, unemployment_compensation_2021: evidence,
    })),
    form7206: {
      marketplace_ptc_premium_overlap: true,
      pub974_single_business: {
        ...pub974, form8962_source: {
          ...pub974.form8962_source, unemployment_compensation_2021: evidence,
        },
      },
    },
  }, { taxYear: 2021, formType: "f1040" });
  assertEquals(result.diagnostics, []);
  assertEquals(result.pending.form8962.total_premium_tax_credit, 12000);
  assertEquals(result.pending.schedule1.line17_se_health_insurance ?? 0, 0);
  const filed = assertOneScheduleC8995(result.pending.form8995, result.pending, 2021);
  assertEquals(filed.lines[15], result.pending.f1040.line13_qbi_deduction);
});

test("2021 Pub974 single-business QBI uses the separate classified cash-charity deduction", () => {
  const { inputs } = sources(false);
  const result = executeF1040Return({
    ...inputs,
    schedule_a: {
      cash_contributions_to_50_percent_organizations: 300,
      cash_contributions_to_daf_or_supporting_organizations: 0,
    },
  }, { taxYear: 2021, formType: "f1040" });
  assertEquals(result.diagnostics, []);
  assertEquals(result.pending.f1040.line12f_nonitemizer_charitable, 300);
  const filed = assertOneScheduleC8995(result.pending.form8995, result.pending, 2021);
  assertEquals(filed.lines[15], result.pending.f1040.line13_qbi_deduction);
  assertThrows(() => assertOneScheduleC8995(result.pending.form8995, {
    ...result.pending,
    f1040: { ...result.pending.f1040, line12f_nonitemizer_charitable: 0 },
  }, 2021), Error, "source reconciliation");
});
