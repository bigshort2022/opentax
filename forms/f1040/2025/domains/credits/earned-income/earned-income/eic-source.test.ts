import { test } from "bun:test";
import { assertThrows } from "@std/assert";
import { assertEicSource } from "./eic-source.ts";

test("export rejects a positive EIC attached to a filed Form 2555", () => {
  assertThrows(
    () =>
      assertEicSource("single", 500, true, {
        eitc: {
          credit_amount: 500,
          qualifying_children: 0,
          investment_income_floor: 0,
        },
        form2555: { filing_details: { foreign_wages: 1 } },
      }),
    Error,
    "cannot accompany a filed Form 2555",
  );
});

test("export rejects a positive EIC without its matching calculation", () => {
  assertThrows(
    () => assertEicSource("single", 500, true, {}),
    Error,
    "needs its matching calculation source",
  );
});

test("export rejects a positive EIC without reviewed prior history", () => {
  assertThrows(
    () =>
      assertEicSource("single", 500, true, {
        general: { filing_status: "single" },
        eitc: {
          credit_amount: 500,
          qualifying_children: 0,
          investment_income_floor: 0,
        },
      }),
    Error,
    "reviewed prior-disallowance history",
  );
});

test("export rejects EIC when K-1 Form 4797 line 10 passive character is unknown", () => {
  for (const amount of [12_000, -500]) {
    assertThrows(
      () =>
        assertEicSource("single", 500, true, {
          eitc: {
            credit_amount: 500,
            qualifying_children: 0,
            investment_income_floor: 0,
          },
          form4797: {
            k1_box11_line10_rows: [{
              partnership_name: "Sample Partnership",
              partnership_ein: "123456789",
              source_document_reference: "reviewed-k1",
              code: "R",
              gain_loss: amount,
              statement_reference: "box11-statement",
              recipient_tin: "123456789",
              character_workpaper_reference: "ordinary-character-workpaper",
            }],
          },
        }),
      Error,
      "needs passive-activity classification for partnership K-1 Form 4797 line 10 amounts",
    );
  }
});

test("export rejects passive K-1 Form 4797 line 10 without finalized loss facts", () => {
  for (const gainLoss of [500, -500]) {
    assertThrows(
      () =>
        assertEicSource("single", 100, true, {
          eitc: {
            credit_amount: 100,
            qualifying_children: 0,
            investment_income_floor: 0,
          },
          form4797: {
            k1_box11_line10_rows: [{
              partnership_name: "Sample Partnership",
              partnership_ein: "123456789",
              source_document_reference: "reviewed-k1",
              code: "R",
              gain_loss: gainLoss,
              statement_reference: "box11-statement",
              recipient_tin: "123456789",
              character_workpaper_reference: "ordinary-character-workpaper",
              eic_activity_review: {
                classification: "passive",
                activity_statement_reference: "activity-statement",
                participation_workpaper_reference: "participation-review",
                partnership_not_publicly_traded_verified: true,
                ...(gainLoss < 0
                  ? {
                    no_current_or_prior_unallowed_loss_for_activity_verified:
                      true,
                  }
                  : {}),
              },
            }],
          },
        }),
      Error,
      "needs a finalized Form 8582 loss allocation",
    );
  }
});

test("export rejects a positive EIC with a matching over-limit Worksheet 1 total", () => {
  assertThrows(
    () =>
      assertEicSource("single", 500, true, {
        f1040: { line2a_tax_exempt: 11_951 },
        eitc: {
          credit_amount: 500,
          qualifying_children: 0,
          investment_income_floor: 11_951,
        },
      }),
    Error,
    "investment income exceeds the 2025 limit",
  );
});

test("EIC export reconciles allocated passive rental income before reviewing filer history", () => {
  for (const taxYear of [2025,2026]) {
    const pending = {
      eitc:{credit_amount:500,qualifying_children:0,investment_income_floor:10000},
      agi_aggregator:{eic_passive_schedule_e_income:10000},
      schedule_e:{schedule_es:[{
        tsj:"T",activity_id:"rental",property_description:"Synthetic rental",
        property_type:1,activity_type:"B",fair_rental_days:365,personal_use_days:0,
        rent_income:12000,form_1099_payments_made:false,
        expense_allocation_source:{
          tax_year:taxYear,activity_id:"rental",source_reference:"Synthetic expense ledger",
          use_pattern:"rental-only",rental_period:{from:`${taxYear}-01-01`,through:`${taxYear}-12-31`},
          no_personal_use_during_rental_period:true,amounts_before_ownership_allocation:true,
          expenses:[{expense_id:"insurance",category:"expense_insurance",transaction_kind:"expense",
            source_amount:4000,source_reference:"Synthetic insurer",paid_on:`${taxYear}-01-01`,
            expense_period:{from:`${taxYear}-01-01`,through:`${taxYear}-12-31`},
            method:"documented-share",rental_share:0.5,method_reference:"Reviewed rental-unit share"}],
        },
      }]},
    };
    assertThrows(()=>assertEicSource("single",500,true,pending,taxYear),
      Error,"reviewed prior-disallowance history");
    assertThrows(()=>assertEicSource("single",500,true,pending,taxYear===2025?2026:2025),
      Error,"allocation year/activity");
  }
});

test("EIC investment income retains the finalized allowance from an inactive personal property", () => {
  const inactive = {
    tsj:"T",activity_id:"inactive",property_description:"Former rental",
    property_type:1,activity_type:"B",fair_rental_days:0,personal_use_days:366,
    rent_income:0,form_1099_payments_made:false,
    prior_unallowed_passive_operating:410,
    prior_unallowed_passive_4797_part1:0,prior_unallowed_passive_4797_part2:0,
    reconstructed_prior_loss_source:{
      tax_year:2023,activity_id:"inactive",provenance:"calculated-unfiled",
      evidence_reference:"Reviewed synthetic PAL",operating:410,form4797_part1:0,form4797_part2:0,
    },
    loss_limitations_review:{
      basis_resolved:true,at_risk_resolved:true,qbi_transition_resolved:true,
      evidence_reference:"Reviewed synthetic limitations",
    },
  };
  const profit = {
    tsj:"T",activity_id:"profitable",property_description:"Current rental",
    property_type:1,activity_type:"B",fair_rental_days:366,personal_use_days:0,
    rent_income:1000,form_1099_payments_made:false,
  };
  assertThrows(()=>assertEicSource("single",500,true,{
    eitc:{credit_amount:500,qualifying_children:0,investment_income_floor:590},
    agi_aggregator:{eic_passive_schedule_e_income:1000,pal_final_allowed_loss:410},
    schedule_e:{schedule_es:[inactive,profit]},
  },2024),Error,"reviewed prior-disallowance history");
});
