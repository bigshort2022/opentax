import { FilingStatus, type FilerIdentity } from "../../mef/header.ts";
import type { HistoricalTaxYear } from "./mappings.ts";

/** Synthetic identities and already-computed amounts for PDF layout review, not tax oracles. */
export const syntheticFiler: FilerIdentity = {
  primarySSN: "000112222", firstNameWithInitial: "Alex Q", lastName: "Example",
  fullName: "Alex Q Example", nameLine1: "ALEX Q EXAMPLE", nameControl: "EXAM",
  filingStatus: FilingStatus.Single,
  address: { line1: "123 Example Street", city: "Boston", state: "MA", zip: "02108" },
};
export function syntheticPaperPending(year: HistoricalTaxYear) {
  return { f1040: {
    filing_status: "single", digital_assets: false,
    line2b_taxable_interest: 1000, line9_total_income: 1000, line11_agi: 1000,
    line12c_deduction_total: { 2021: 12550, 2022: 12950, 2023: 13850, 2024: 14600 }[year],
    line15_taxable_income: 0, line16_income_tax: 0, line24_total_tax: 0,
    line25b_withheld_1099: 321, line25d_total_withholding: 321,
    line33_total_payments: 321, line34_overpayment: 321, line35a_refund: 321,
  } };
}
export function syntheticMixedStockRental(year: HistoricalTaxYear) {
  const ledger = {
    shareholder_ssn: syntheticFiler.primarySSN, shareholder_name_as_on_k1: "Alex Q Example",
    corporation_ein: "120000001", beginning_stock_basis: 3000,
    beginning_basis_workpaper_reference: `Synthetic ${year - 1} closing stock ledger`,
    original_shareholder: true, all_shares_one_stock_block: true,
    no_current_year_stock_transactions: true, no_section_1367_1_g_election: true,
    no_other_current_year_stock_basis_changes: true, no_other_schedule_e_activity: false,
    materially_participated_in_s_corporation: true,
    material_participation_workpaper_reference: `Synthetic ${year} participation log`,
    no_shareholder_debt_or_repayments: true, no_prior_year_suspended_losses: true,
    no_at_risk_or_passive_limitation: true,
  };
  return {
    ...syntheticPaperPending(year),
    general: { filing_status: "single", taxpayer_ssn: syntheticFiler.primarySSN },
    f1040: { ...syntheticPaperPending(year).f1040, line8_additional_income: 2000, line9_total_income: 3000, line11_agi: 3000 },
    schedule1: { line5_schedule_e: 2000, line10_total_additional_income: 2000 },
    schedule_e: { schedule_es: [{
      tsj: "T", activity_id: "synthetic-rental", property_description: "Synthetic rental",
      property_type: 1, activity_type: "A", fair_rental_days: 365, personal_use_days: 0,
      rent_income: 5000, form_1099_payments_made: false,
      street_address: "456 Example Street", city: "Boston", state: "MA", zip: "02108",
    }] },
    k1_s_corp: { k1_s_corps: [{ corporation_name: "Synthetic S Corp", corporation_ein: ledger.corporation_ein,
      source_document_reference: `Synthetic ${year} issued K-1`, source_tax_year: year,
      box1_ordinary_business: -4000, form7203_stock_loss_ledger: ledger,
    }] },
    form7203: { stock_basis_beginning: 3000, ordinary_loss: 4000 },
  };
}

/** Public, synthetic Marketplace/sole-proprietor inputs, not a precomputed packet. */
export function syntheticPub974Inputs(year: HistoricalTaxYear, monthly = false) {
  const policyNumber = `SYNTHETIC-${year}-POLICY`;
  const premiums = Array<number>(12).fill(1000);
  const slcsps = Array.from({ length: 12 }, (_, i) => monthly ? 1100 + i : 1100);
  const aptcs = Array<number>(12).fill(500);
  const policy = premiums.map((premium, i) => ({
    form1095a_policy_number: policyNumber, month: i + 1, premium, aptc: aptcs[i],
  }));
  const pub974 = {
    owner_identity: { recipient: "T", recipient_ssn: syntheticFiler.primarySSN },
    worksheet_w: {
      specified_policy_months: policy.map((row) => ({
        form1095a_policy_number: row.form1095a_policy_number, month: row.month,
        specified_premium: row.premium, attributable_aptc: row.aptc,
      })),
      nonspecified_premium_deduction: 0, one_establishing_business_verified: true,
      business: {
        kind: "self_employed", establishing_business_reference: "SYNTHETIC-C",
        establishing_business_earned_income: 40000, all_profitable_business_earned_income: 40000,
        schedule1_line15_se_tax_deduction: 2826,
        establishing_business_schedule1_line16_retirement_deduction: 0, form2555_attributable_exclusion: 0,
      },
    },
    worksheet_x: {
      special_adjustment_cases_reviewed_absent: true, form1040_line9_total_income: 40000,
      form1040_line2a_tax_exempt_interest: 0, form1040_nontaxable_social_security: 0,
      form2555_lines45_and_50: 0, schedule1_adjustments_except_line17: 2826,
      required_filing_dependents_modified_agi: 0, household_size: 1,
      fpl_region: "contiguous", filing_status: "single",
    },
    form1095a_policy_months: policy, no_other_se_income_sources_verified: true,
    form8962_source: { monthly_premiums: premiums, monthly_slcsps: slcsps, monthly_aptcs: aptcs },
  };
  return {
    general: {
      filing_status: "single", taxpayer_first_name: "Alex", taxpayer_middle_initial: "Q",
      taxpayer_last_name: "Example", taxpayer_ssn: syntheticFiler.primarySSN, taxpayer_dob: "1985-06-15",
      address_line1: syntheticFiler.address.line1, address_city: syntheticFiler.address.city,
      address_state: "MA", address_zip: "02108", digital_assets: false,
      ptc_residence_states: ["MA"], ptc_residence_months: Array(12).fill("MA"),
      qbi_no_prior_loss_or_suspended_loss_confirmed: true,
      qbi_not_patron_of_specified_cooperative_confirmed: true,
    },
    schedule_c: [{
      business_reference: "SYNTHETIC-C", proprietor_recipient: "T",
      line_a_principal_business: "Synthetic consulting", line_b_business_code: "541990",
      line_c_business_name: "Synthetic Consulting", qbi_no_other_adjustments_confirmed: true,
      line_f_accounting_method: "cash", line_g_material_participation: true,
      line_i_made_1099_payments: false, line_1_gross_receipts: 40000,
    }],
    f1095a: [{
      issuer_name: "Synthetic Marketplace", policy_number: policyNumber, coverage_state: "MA",
      recipient_ssn: syntheticFiler.primarySSN, covered_individual_ssns: [syntheticFiler.primarySSN],
      monthly_premiums: premiums, monthly_slcsps: slcsps, monthly_aptcs: aptcs,
    }],
    form7206: { marketplace_ptc_premium_overlap: true, pub974_single_business: pub974 },
  };
}
