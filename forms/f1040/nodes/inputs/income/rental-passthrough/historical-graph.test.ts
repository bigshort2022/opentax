import { test } from "bun:test";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { executeF1040Return } from "../../../../2025/return-processing/execute_return.ts";
import { assertCurrentK1Qbi } from "../../../../2025/mef/forms/deductions/business/f8995/f8995-current-k1.ts";
import { assertHistoricalOwnerLossCoverage } from "../../../intermediate/forms/income/business/form461/historical-coverage.ts";

const general = { filing_status: "single", taxpayer_first_name: "Alex", taxpayer_last_name: "Example", taxpayer_ssn: "123456789", taxpayer_dob: "1985-06-15", address_line1: "1 Example Way", address_city: "Austin", address_state: "TX", address_zip: "78701", digital_assets: false };
const wages = [{ employer_name: "Synthetic Employer", employer_ein: "120000002", employee_ssn: general.taxpayer_ssn, box1_wages: 500000, box2_fed_withheld: 100000 }];
const partnership = (loss: number) => ({ partnership_name: "Synthetic Partnership", partnership_ein: "120000003", recipient_tin: general.taxpayer_ssn, source_tax_year: 2023, source_document_reference: "synthetic issued K1", box1_ordinary_business: -loss, ordinary_loss_limitations: { tax_year: 2023, source_reference: "synthetic outside-basis at-risk review", basis_available_for_loss: 1000000, at_risk_available_for_loss: 1000000, materially_participated: true, no_prior_suspended_losses: true, no_other_loss_or_deduction_items: true } });
const run = (extra: Record<string, unknown>) => executeF1040Return({ general, w2: wages, ...extra }, { taxYear: 2023, formType: "f1040" });

test("2023 public graph rejects a 500000 owner loss requiring Form461 instead of deducting it without limitation", () => {
  const result = run({ k1_partnership: [partnership(500000)] });
  assert(result.diagnostics.some((row) => row.message.includes("Form 461")));
});

test("2023 reviewed small owner loss reaches income with source cents", () => {
  const result = run({ k1_partnership: [partnership(1000.25)] });
  assertEquals(result.diagnostics, []);
  assertEquals(result.pending.schedule1.line5_schedule_e, -1000.25);
});

test("historical K1 nonordinary losses cannot bypass ordinary loss review", () => {
  for (const [key, source] of [
    ["k1_partnership", { partnership_name: "Synthetic Partnership", partnership_ein: "120000003", box2_rental_re: -10000 }],
    ["k1_partnership", { partnership_name: "Synthetic Partnership", partnership_ein: "120000003", box4a_guaranteed_services: -10000 }],
    ["k1_s_corp", { corporation_name: "Synthetic Corporation", corporation_ein: "120000004", box3_other_rental: -10000 }],
  ] as const) {
    const result = run({ [key]: [source] });
    assert(result.diagnostics.some((row) => row.message.includes("loss character")));
  }
});

test("historical owner loss and ScheduleC loss cannot enter a C/F-only Form461 filing", () => {
  const result = run({ k1_partnership: [partnership(100000)], schedule_c: [{ line_a_principal_business: "Synthetic consulting", line_b_business_code: "541990", line_f_accounting_method: "cash", line_g_material_participation: true, line_1_gross_receipts: 1000, line_32_at_risk: "a", part_v_other_expenses: [{ description: "Actual synthetic ordinary costs", amount: 201000 }] }] });
  assert(result.diagnostics.some((row) => row.message.includes("Form 461") && row.message.includes("K-1")));
});

test("historical stock loss checks Form461 after actual stock basis limitation", () => {
  const source = { corporation_name: "Synthetic Corporation", corporation_ein: "120000004", recipient_tin: general.taxpayer_ssn, source_tax_year: 2023, source_document_reference: "synthetic issued corporate K1", box1_ordinary_business: -500000, form7203_stock_loss_ledger: { shareholder_ssn: general.taxpayer_ssn, shareholder_name_as_on_k1: "Alex Example", corporation_ein: "120000004", beginning_stock_basis: 1000, beginning_basis_workpaper_reference: "synthetic basis ledger", original_shareholder: true, all_shares_one_stock_block: true, no_current_year_stock_transactions: true, no_section_1367_1_g_election: true, no_other_current_year_stock_basis_changes: true, no_other_schedule_e_activity: true, materially_participated_in_s_corporation: true, material_participation_workpaper_reference: "synthetic participation log", no_shareholder_debt_or_repayments: true, no_prior_year_suspended_losses: true, no_at_risk_or_passive_limitation: true } };
  const limited = run({ k1_s_corp: [source] });
  assertEquals(limited.diagnostics, []);
  assertEquals(limited.pending.schedule1.basis_disallowed_add_back, 499000);
  const full = run({ k1_s_corp: [{ ...source, form7203_stock_loss_ledger: { ...source.form7203_stock_loss_ledger, beginning_stock_basis: 500000 } }] });
  assert(full.diagnostics.some((row) => row.message.includes("Form 461")));
});

test("2021 public K1 QBI reconciliation includes the classified nonitemizer charitable deduction", () => {
  const source = {
    partnership_name: "Synthetic Partnership", partnership_ein: "120000003",
    recipient_tin: general.taxpayer_ssn, source_tax_year: 2021,
    source_document_reference: "synthetic 2021 issued K1",
    box1_ordinary_business: 20000,
    box20z_qbi: 20000,
    qualified_business_income_source: {
      tax_year: 2021, issuer_ein: "120000003", recipient_tin: general.taxpayer_ssn,
      issued_k1_reference: "synthetic 2021 issued K1",
      issued_section199a_statement_reference: "synthetic 2021 section199A statement",
      business_name: "Synthetic Partnership", domestic_non_sstb_trade: true,
      qualified_box1_income: 20000, statement_qbi: 20000,
      owner_level_adjustments: 0, prior_qbi_loss: 0,
    },
  };
  const result = executeF1040Return({
    general, w2: [{ ...wages[0], box1_wages: 10000, box2_fed_withheld: 1000 }],
    k1_partnership: [source],
    schedule_a: {
      cash_contributions_to_50_percent_organizations: 300,
      cash_contributions_to_daf_or_supporting_organizations: 0,
    },
  }, { taxYear: 2021, formType: "f1040" });
  assertEquals(result.diagnostics, []);
  assertEquals(result.pending.f1040.line12f_nonitemizer_charitable, 300);
  assertEquals(result.pending.f1040.line13_qbi_deduction, 3430);
  const filed = assertCurrentK1Qbi(result.pending.form8995, result.pending, 2021);
  assertEquals(filed.lines[15], 3430);
  assertThrows(() => assertCurrentK1Qbi(result.pending.form8995, {
    ...result.pending, general: { ...result.pending.general, taxpayer_ssn: "987654321" },
  }, 2021), Error, "owner/statement");
});

test("Form461 any-line half-threshold filing rule begins in 2024, not 2023", () => {
  const allowed2023 = run({ k1_partnership: [partnership(200000)] });
  assertEquals(allowed2023.diagnostics, []);
  const source = partnership(200000);
  const required2024 = executeF1040Return({
    general, w2: wages,
    k1_partnership: [{
      ...source, source_tax_year: 2024,
      ordinary_loss_limitations: { ...source.ordinary_loss_limitations, tax_year: 2024 },
    }],
  }, { taxYear: 2024, formType: "f1040" });
  assertEquals(required2024.diagnostics, []);
  assertThrows(() => assertHistoricalOwnerLossCoverage(2024, required2024.pending), Error, "Form 461");
});

for (const [taxYear, loss, profit] of [[2024, 160000, 150000], [2023, 300000, 100000]]) {
  test(`${taxYear} Form461 nets separate partnership ordinary profits against allowed ordinary losses`, () => {
    const lossSource = partnership(loss);
    const result = executeF1040Return({
      general, w2: wages,
      k1_partnership: [{
        ...lossSource, source_tax_year: taxYear,
        ordinary_loss_limitations: { ...lossSource.ordinary_loss_limitations, tax_year: taxYear },
      }, {
        partnership_name: "Synthetic Profitable Partnership", partnership_ein: "120000005",
        recipient_tin: general.taxpayer_ssn, source_tax_year: taxYear,
        source_document_reference: "synthetic profitable partnership issued K1",
        box1_ordinary_business: profit,
      }],
    }, { taxYear, formType: "f1040" });
    assertEquals(result.diagnostics, []);
    assertEquals(result.pending.schedule1.line5_schedule_e, profit - loss);
  });
}

test("2024 Form461 nets positive S-corporation income against partnership loss before its line trigger", () => {
  const loss = partnership(160000);
  const result = executeF1040Return({
    general, w2: wages,
    k1_partnership: [{ ...loss, source_tax_year: 2024,
      ordinary_loss_limitations: { ...loss.ordinary_loss_limitations, tax_year: 2024 } }],
    k1_s_corp: [{
      corporation_name: "Synthetic Profitable Corporation", corporation_ein: "120000005",
      recipient_tin: general.taxpayer_ssn, source_tax_year: 2024,
      source_document_reference: "synthetic profitable corporate K1", box1_ordinary_business: 150000,
    }],
  }, { taxYear: 2024, formType: "f1040" });
  assertEquals(result.diagnostics, []);
  assertEquals(result.pending.schedule1.line5_schedule_e, -10000);
});

test("2024 Form461 nets post-7203 allowed stock loss with profitable partnership and C income", () => {
  const stock = {
    corporation_name: "Synthetic Loss Corporation", corporation_ein: "120000004",
    recipient_tin: general.taxpayer_ssn, source_tax_year: 2024,
    source_document_reference: "synthetic loss corporate K1", box1_ordinary_business: -300000,
    form7203_stock_loss_ledger: {
      shareholder_ssn: general.taxpayer_ssn, shareholder_name_as_on_k1: "Alex Example",
      corporation_ein: "120000004", beginning_stock_basis: 160000,
      beginning_basis_workpaper_reference: "synthetic reviewed stock basis",
      original_shareholder: true, all_shares_one_stock_block: true,
      no_current_year_stock_transactions: true, no_section_1367_1_g_election: true,
      no_other_current_year_stock_basis_changes: true, no_other_schedule_e_activity: false,
      materially_participated_in_s_corporation: true,
      material_participation_workpaper_reference: "synthetic participation log",
      no_shareholder_debt_or_repayments: true, no_prior_year_suspended_losses: true,
      no_at_risk_or_passive_limitation: true,
    },
  };
  const profit = {
    partnership_name: "Synthetic Profit Partnership", partnership_ein: "120000005",
    recipient_tin: general.taxpayer_ssn, source_tax_year: 2024,
    source_document_reference: "synthetic profit partnership K1", box1_ordinary_business: 150000,
  };
  const result = executeF1040Return({
    general, w2: wages, k1_s_corp: [stock], k1_partnership: [profit],
    schedule_c: [{
      line_a_principal_business: "Synthetic consulting", line_b_business_code: "541990",
      line_f_accounting_method: "cash", line_g_material_participation: true,
      line_1_gross_receipts: 5000,
    }],
  }, { taxYear: 2024, formType: "f1040" });
  assertEquals(result.diagnostics, []);
  assertEquals(result.pending.schedule1.basis_disallowed_add_back, 140000);
  assertEquals(result.pending.schedule1.line10_total_additional_income, -5000);
  const stillRequired = executeF1040Return({
    general, w2: wages, k1_s_corp: [stock],
    k1_partnership: [{ ...profit, box1_ordinary_business: 1000 }],
  }, { taxYear: 2024, formType: "f1040" });
  assertEquals(stillRequired.diagnostics, []);
  assertThrows(() => assertHistoricalOwnerLossCoverage(2024, stillRequired.pending), Error, "Form 461");
});

for (const kind of ["partnership", "s_corp"] as const) {
  for (const box of ["box2_rental_re", "box3_other_rental"] as const) {
    test(`2024 ${kind} ${box} income offsets the complete ScheduleE attachment line, not business-only losses`, () => {
      const loss = partnership(160000);
      const issued = {
        recipient_tin: general.taxpayer_ssn, source_tax_year: 2024,
        source_document_reference: "synthetic issued rental K1", [box]: 150000,
      };
      const source = { ...loss, source_tax_year: 2024,
        ordinary_loss_limitations: { ...loss.ordinary_loss_limitations, tax_year: 2024 } };
      const rental = kind === "partnership"
        ? { ...issued, partnership_name: "Synthetic rental partnership", partnership_ein: "120000005" }
        : { ...issued, corporation_name: "Synthetic rental corporation", corporation_ein: "120000005" };
      const result = executeF1040Return({
        general, w2: wages, k1_partnership: kind === "partnership" ? [source, rental] : [source],
        ...(kind === "s_corp" ? { k1_s_corp: [rental] } : {}),
      }, { taxYear: 2024, formType: "f1040" });
      assertEquals(result.diagnostics, []);
      assertEquals(result.pending.schedule1.line5_schedule_e, -10000);
      assertHistoricalOwnerLossCoverage(2024, result.pending);
    });
  }
}

const rentalProperty = {
  tsj: "T", activity_id: "synthetic-rental", property_description: "Synthetic rental",
  property_type: 1, activity_type: "C", fair_rental_days: 365, personal_use_days: 0,
  form_1099_payments_made: false, street_address: "456 Example Street",
  city: "Boston", state: "MA", zip: "02108",
};
function ownerAndProperties(loss: number, properties: Record<string, unknown>[], taxYear = 2024) {
  const source = partnership(loss);
  return executeF1040Return({
    general, w2: wages, k1_partnership: [{ ...source, source_tax_year: taxYear,
      ordinary_loss_limitations: { ...source.ordinary_loss_limitations, tax_year: taxYear } }],
    schedule_e: properties,
  }, { taxYear, formType: "f1040" });
}
test("2024 PartI rental profit offsets line5 after ownership allocation but cannot erase business-only EBL", () => {
  const small = ownerAndProperties(160000, [{ ...rentalProperty, rent_income: 300000, ownership_percent: 50 }]);
  assertEquals(small.diagnostics, []);
  assertEquals(small.pending.schedule1.line5_schedule_e, -10000);
  assertHistoricalOwnerLossCoverage(2024, small.pending);
  const large = ownerAndProperties(400000, [{ ...rentalProperty, rent_income: 300000 }]);
  assert(large.diagnostics.some((row) => row.message.includes("Form 461")));
});
test("unknown rental business classifications retain separate post-limit activity bounds", () => {
  const result = ownerAndProperties(1000, [
    { ...rentalProperty, activity_id: "profit", rent_income: 400000 },
    { ...rentalProperty, activity_id: "loss", rent_income: 0, expense_repairs: 400000 },
  ]);
  assertEquals(result.diagnostics, []);
  assertEquals(result.pending.schedule1.line5_schedule_e, -1000);
  assertThrows(() => assertHistoricalOwnerLossCoverage(2024, result.pending), Error, "business classification");
});

for (const kind of ["partnership", "s_corp"] as const) {
  test(`2024 sourced passive ${kind} income remains reconciled beside PartI rental income`, () => {
    const ein = "120000005", reference = "synthetic passive issued K1";
    const activityStatement = "synthetic passive activity statement", participation = "synthetic participation workpaper";
    const rental = {
      ...(kind === "partnership"
        ? { partnership_name: "Synthetic passive partnership", partnership_ein: ein }
        : { corporation_name: "Synthetic passive corporation", corporation_ein: ein }),
      source_tax_year: 2024, recipient_tin: general.taxpayer_ssn,
      source_document_reference: reference, box2_rental_re: 150000,
      eic_passive_activity_review: {
        box2: "passive", recipient_tin: general.taxpayer_ssn,
        partnership_not_publicly_traded_verified: true,
        activity_statement_reference: activityStatement,
        participation_workpaper_reference: participation,
      },
      passive_income_source: {
        tax_year: 2024, issuer_ein: ein, recipient_tin: general.taxpayer_ssn,
        issued_k1_reference: reference, activity_statement_reference: activityStatement,
        participation_workpaper_reference: participation,
        entity_status_record: {
          issuer_ein: ein, tax_year: 2024, publicly_traded_partnership: false,
          source_document_reference: "synthetic entity status",
        },
        activities: [{
          activity_id: "passive-issued-rental", activity_name: "Synthetic passive rental",
          income_box: "box2", current_income: 150000, ownership_acquired_on: "2024-01-01",
          acquisition_document_reference: "synthetic acquisition record",
          not_grouped_with_prior_activity: true, prior_unallowed_operating: 0,
          prior_unallowed_4797_part1: 0, prior_unallowed_4797_part2: 0,
        }],
      },
    };
    const loss = partnership(160000);
    const ordinary = { ...loss, source_tax_year: 2024,
      ordinary_loss_limitations: { ...loss.ordinary_loss_limitations, tax_year: 2024 } };
    const result = executeF1040Return({
      general, w2: wages, k1_partnership: kind === "partnership" ? [ordinary, rental] : [ordinary],
      ...(kind === "s_corp" ? { k1_s_corp: [rental] } : {}),
      schedule_e: [{ ...rentalProperty, rent_income: 1000 }],
    }, { taxYear: 2024, formType: "f1040" });
    assertEquals(result.diagnostics, []);
    assertEquals(result.pending.schedule1.line5_schedule_e, -9000);
    assertHistoricalOwnerLossCoverage(2024, result.pending);
    assertThrows(() => assertHistoricalOwnerLossCoverage(2024, {
      ...result.pending, form8582: {
        ...result.pending.form8582,
        activities: [{ ...(result.pending.form8582.activities as Record<string, unknown>[])[0], current_net: 149999 }],
      },
    }), Error, "reconcile");
  });
}

test("suspended current rental loss is not an allowed Form461 business loss", () => {
  const result = ownerAndProperties(1000, [{
    ...rentalProperty, activity_type: "A", rent_income: 0, expense_repairs: 400000,
    first_year_activity_source: {
      activity_id: rentalProperty.activity_id, activity_name: rentalProperty.property_description,
      activity_acquired_on: "2024-01-01", acquisition_document_reference: "synthetic rental acquisition",
      not_grouped_with_prior_activity: true,
    },
  }]);
  assertEquals(result.diagnostics, []);
  assertEquals(result.pending.schedule1.line5_schedule_e, -1000);
  assertHistoricalOwnerLossCoverage(2024, result.pending);
});

test("allowed prior PAL is netted with the same activity's income once, not a separate unknown business loss", () => {
  const result = ownerAndProperties(200000, [{
    ...rentalProperty, activity_type: "A", rent_income: 100000,
    prior_unallowed_passive_operating: 100000, prior_passive_losses_active_when_incurred: true,
    prior_unallowed_passive_4797_part1: 0, prior_unallowed_passive_4797_part2: 0,
    reconstructed_prior_loss_source: {
      tax_year: 2022, activity_id: rentalProperty.activity_id, provenance: "reviewed-outside-evidence",
      evidence_reference: "synthetic reviewed opening PAL", operating: 100000,
      form4797_part1: 0, form4797_part2: 0,
    },
    loss_limitations_review: {
      basis_resolved: true, at_risk_resolved: true, qbi_transition_resolved: true,
      evidence_reference: "synthetic opening loss limitation review",
    },
  }], 2023);
  assertEquals(result.diagnostics, []);
  assertEquals(result.pending.schedule1.line5_schedule_e, -200000);
  assertHistoricalOwnerLossCoverage(2023, result.pending);
});

test("unsupported vacation-home use cannot supply rental income to an owner-loss return", () => {
  const result = ownerAndProperties(160000, [{
    ...rentalProperty, rent_income: 300000, fair_rental_days: 10, personal_use_days: 356,
    expense_allocation_source: {
      tax_year: 2024, activity_id: rentalProperty.activity_id,
      source_reference: "Synthetic rental and personal-use calendar",
      use_pattern: "mixed-use-not-home",
      rental_period: { from: "2024-01-01", through: "2024-12-31" },
      no_personal_use_during_rental_period: false,
      amounts_before_ownership_allocation: true,
      expenses: [],
    },
  }]);
  assert(result.diagnostics.some((row) =>
    row.nodeType === "schedule_e" && row.code === "EXECUTOR_NODE_FAILURE"));
});

test("final rental coverage applies without a K1, including classification-sensitive offsetting properties", () => {
  for (const taxYear of [2023, 2024]) {
    const result = executeF1040Return({
      general, w2: wages, schedule_e: [
        { ...rentalProperty, activity_id: "positive", rent_income: 400000 },
        { ...rentalProperty, activity_id: "negative", rent_income: 0, expense_repairs: 400000 },
      ],
    }, { taxYear, formType: "f1040" });
    assertEquals(result.diagnostics, []);
    assertThrows(() => assertHistoricalOwnerLossCoverage(taxYear, result.pending), Error, "business classification");
  }
});
