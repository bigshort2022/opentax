import { test } from "bun:test";
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { buildMefXml } from "../../../builder.ts";
import { testFiler } from "../../../execution/test-filer.ts";
import { form4797 } from "./f4797.ts";
import { form8949 } from "../investments/f8949.ts";

test("Form 4797 investment recapture links Part III to the excess-gain Form 8949 row", () => {
  const fields = {
    investment_1245_dispositions: [{
      property_id: "investment-1245-1",
      property_description: "Investment equipment",
      acquired_on: "2022-05-01",
      sold_on: "2025-06-01",
      gross_sales_price: 15_000,
      cost_or_other_basis_plus_sale_expense: 12_000,
      depreciation_allowed_or_allowable: 5_000,
      property_held_for_investment_not_business: true as const,
      section_1245_classification_reviewed: true as const,
      direct_cash_sale_no_special_recapture_exception: true as const,
      sale_document_reference: "SALE-2025-1",
      basis_document_reference: "BASIS-2022-1",
      depreciation_schedule_reference: "DEPR-2025-1",
    }],
  };
  const row = {
    part: "F",
    description: "From Form 4797",
    source_transaction_id: "investment-1245-1",
    form4797_property_id: "investment-1245-1",
    from_form4797_investment_1245: true as const,
    date_acquired: "",
    date_sold: "",
    proceeds: 3_000,
    cost_basis: 0,
    gain_loss: 3_000,
    is_long_term: true,
  };
  const context = {
    pending: {
      form4797: fields,
      form8949: [row],
      schedule1: { line4_other_gains: 5_000 },
    },
  };
  const xml = form4797.build(fields, context);
  assertStringIncludes(
    xml,
    "<Section1245PropertyAmt>5000</Section1245PropertyAmt>",
  );
  assertStringIncludes(xml, "<NetGainAmt>3000</NetGainAmt>");
  const assetXml = form8949.build([row], context);
  assertStringIncludes(assetXml, "<PropertyDesc>From Form 4797</PropertyDesc>");
  assertEquals(assetXml.includes("<AcquiredDt>"), false);
  assertEquals(assetXml.includes("<CostOrOtherBasisAmt>"), false);
  assertThrows(
    () =>
      form4797.build(fields, {
        pending: {
          ...context.pending,
          form8949: [{ ...row, proceeds: 2_999, gain_loss: 2_999 }],
        },
      }),
    Error,
    "matching Form 8949 row",
  );
  assertThrows(
    () =>
      form4797.build(fields, {
        pending: {
          ...context.pending,
          schedule1: { line4_other_gains: 5_001 },
        },
      }),
    Error,
    "finalized Schedule 1 line 4",
  );
  assertThrows(
    () =>
      form4797.build({
        ...fields,
        investment_1245_dispositions: [{
          ...fields.investment_1245_dispositions[0],
          property_description: "Rental property longer",
        }],
      }, context),
    Error,
    "20",
  );
});

test("Form 4797: no gain or loss does not emit a document", () => {
  assertEquals(form4797.build({}), "");
  assertEquals(form4797.build({ section_1231_gain: 0 }), "");
  assertEquals(form4797.build({ junk: 999 }), "");
});

test("Form 4797: prior passive losses use finalized Form 8582 Part IX amounts", () => {
  const f8582 = {
    activities: [
      {
        activity_id: "id-Rental A",
        name: "Rental A",
        activity_type: "B",
        property_type: 1,
        reporting_form: "schedule_e",
        current_net: 0,
        prior_unallowed_operating: 2_000,
        prior_unallowed_4797_part1: 6_000,
        prior_unallowed_4797_part2: 2_000,
        prior_year_8582_source: {
          tax_year: 2024,
          activity_id: "id-Rental A",
          filed_part_vii_column_c: 10_000,
          source_document_reference: "2024 filed Form 8582 Part IX",
          filed_part_ix_rows: [
            { reporting_form: "schedule_e", filed_unallowed_loss: 2_000 },
            { reporting_form: "form4797_part1", filed_unallowed_loss: 6_000 },
            { reporting_form: "form4797_part2", filed_unallowed_loss: 2_000 },
          ],
        },
      },
      {
        activity_id: "id-Rental B",
        name: "Rental B",
        activity_type: "B",
        property_type: 1,
        reporting_form: "schedule_e",
        current_net: 4_000,
        prior_unallowed_operating: 0,
        prior_unallowed_4797_part1: 0,
        prior_unallowed_4797_part2: 0,
      },
    ],
    current_income: 4_000,
    prior_unallowed: 10_000,
    has_other_passive: true,
  };
  const xml = form4797.build({}, { pending: { form8582: f8582 } });
  assertStringIncludes(xml, "<PropertyDesc>PAL</PropertyDesc>");
  assertStringIncludes(
    xml,
    "<TotalPropertyGainLossAmt>-2400</TotalPropertyGainLossAmt>",
  );
  assertStringIncludes(xml, "<TotalGainLossAmt>-2400</TotalGainLossAmt>");
  assertStringIncludes(xml, "<OrdinaryLossAmt>2400</OrdinaryLossAmt>");
  assertStringIncludes(
    xml,
    "<PassiveActivityLossLiteralCd>PAL</PassiveActivityLossLiteralCd>",
  );
  assertStringIncludes(
    xml,
    "<TotalOrdinaryGainLossAmt>-3200</TotalOrdinaryGainLossAmt>",
  );
  assertThrows(
    () =>
      form4797.build({ section_1231_gain: 100 }, {
        pending: { form8582: f8582 },
      }),
    Error,
    "cannot overlap current Form 4797 transactions",
  );
});

test("Form 4797: section 1231 gain uses Part I line 7", () => {
  const xml = form4797.build({ section_1231_gain: 20_000 });
  assertStringIncludes(
    xml,
    "<TotalPropertyGainLossAmt>20000</TotalPropertyGainLossAmt>",
  );
  assertEquals(xml.includes("<TotalOrdinaryGainLossAmt>"), false);
  assertEquals(xml.includes("<TotalGainLossAmt>"), false);
});

test("Form 4797: linked passive property sale rows populate native Parts I and II", () => {
  const rows = [
    {
      activity_id: "id-Land rental",
      activity_name: "Land rental",
      part: "I",
      property_description: "Undeveloped parcel",
      acquired_on: "2023-04-01",
      sold_on: "2025-05-01",
      gross_sales_price: 20_000,
      cost_or_other_basis: 12_000,
      depreciation_allowed: 0,
    },
    {
      activity_id: "id-Land rental",
      activity_name: "Land rental",
      part: "II",
      property_description: "Short-held parcel",
      acquired_on: "2025-01-01",
      sold_on: "2025-06-01",
      gross_sales_price: 9_000,
      cost_or_other_basis: 7_000,
      depreciation_allowed: 0,
    },
  ];
  const scheduleEItem = {
    tsj: "T",
    activity_id: "id-Land rental",
    property_description: "Land rental",
    property_type: 1,
    activity_type: "B",
    fair_rental_days: 365,
    personal_use_days: 0,
    rent_income: 0,
    form_1099_payments_made: false,
    disposed_of: true,
  };
  const xml = form4797.build(
    { passive_property_sales: rows },
    { pending: { schedule_e: { schedule_es: [scheduleEItem] } } },
  );
  assertStringIncludes(xml, "<PropertySaleOrExchange>");
  assertStringIncludes(xml, "<OrdinaryGainLoss>");
  assertStringIncludes(xml, "<PropertyDesc>Undeveloped parcel</PropertyDesc>");
  assertStringIncludes(
    xml,
    "<TotalPropertyGainLossAmt>8000</TotalPropertyGainLossAmt>",
  );
  assertStringIncludes(xml, "<TotalGainLossAmt>8000</TotalGainLossAmt>");
  assertStringIncludes(
    xml,
    "<TotalOrdinaryGainLossAmt>2000</TotalOrdinaryGainLossAmt>",
  );
  assertThrows(
    () =>
      form4797.build(
        { passive_property_sales: rows },
        {
          pending: {
            schedule_e: {
              schedule_es: [{
                ...scheduleEItem,
                prior_unallowed_passive_4797_part1: 100,
              }],
            },
          },
        },
      ),
    Error,
    "matching Form 8582 sale allocation",
  );
  assertThrows(
    () =>
      form4797.build({ passive_property_sales: rows }, {
        pending: { schedule_e: { schedule_es: [] } },
      }),
    Error,
    "linked disposed Schedule E activity",
  );
});

test("Form 4797: retained sales cannot release unsupported prior Parts I and II PAL", () => {
  const sales = [
    {
      activity_id: "id-Land rental",
      activity_name: "Land rental",
      part: "I",
      property_description: "Long-held parcel",
      acquired_on: "2023-04-01",
      sold_on: "2025-05-01",
      gross_sales_price: 20_000,
      cost_or_other_basis: 12_000,
      depreciation_allowed: 0,
      entire_activity_interest_disposed: false,
    },
    {
      activity_id: "id-Land rental",
      activity_name: "Land rental",
      part: "II",
      property_description: "Short-held parcel",
      acquired_on: "2025-01-01",
      sold_on: "2025-06-01",
      gross_sales_price: 9_000,
      cost_or_other_basis: 7_000,
      depreciation_allowed: 0,
      entire_activity_interest_disposed: false,
    },
  ];
  const context = {
    pending: {
      schedule_e: {
        schedule_es: [{
          tsj: "T",
          activity_id: "id-Land rental",
          property_description: "Land rental",
          property_type: 1,
          activity_type: "B",
          fair_rental_days: 365,
          personal_use_days: 0,
          rent_income: 0,
          form_1099_payments_made: false,
          disposed_of: true,
          prior_unallowed_passive_operating: 1_000,
          prior_unallowed_passive_4797_part1: 3_000,
          prior_unallowed_passive_4797_part2: 1_000,
        }],
      },
      form8582: {
        activities: [{
          activity_id: "id-Land rental",
          name: "Land rental",
          activity_type: "B",
          property_type: 1,
          reporting_form: "schedule_e",
          current_net: 0,
          prior_unallowed_operating: 1_000,
          prior_unallowed_4797_part1: 3_000,
          prior_unallowed_4797_part2: 1_000,
        }],
        current_income: 0,
        prior_unallowed: 5_000,
        has_other_passive: true,
        has_current_4797_transaction: true,
        current_4797_sale_gains: [
          {
            activity_id: "id-Land rental",
            activity_name: "Land rental",
            part: "I",
            gain: 8_000,
            entire_activity_interest_disposed: false,
          },
          {
            activity_id: "id-Land rental",
            activity_name: "Land rental",
            part: "II",
            gain: 2_000,
            entire_activity_interest_disposed: false,
          },
        ],
      },
    },
  };
  // Aggregate Form 8582 amounts cannot authenticate a disposition. This
  // mixed-character prior loss is outside the sourced operating-only route.
  assertThrows(
    () => form4797.build({ passive_property_sales: sales }, context),
    Error,
    "Schedule E prior passive loss with current disposition needs section 469(g) review",
  );
});

test("Form 4797: an active-rental allowance cannot authorize an unsupported disposition", () => {
  const sale = {
    activity_id: "id-Rental house",
    activity_name: "Rental house",
    part: "I",
    property_description: "Retained parcel",
    acquired_on: "2023-04-01",
    sold_on: "2025-05-01",
    gross_sales_price: 12_000,
    cost_or_other_basis: 10_000,
    depreciation_allowed: 0,
    entire_activity_interest_disposed: false,
  };
  const context = {
    pending: {
      schedule_e: {
        schedule_es: [{
          tsj: "T",
          activity_id: "id-Rental house",
          property_description: "Rental house",
          property_type: 1,
          activity_type: "A",
          fair_rental_days: 365,
          personal_use_days: 0,
          rent_income: 0,
          form_1099_payments_made: false,
          disposed_of: true,
          prior_unallowed_passive_operating: 1_000,
          prior_unallowed_passive_4797_part1: 3_000,
          prior_passive_losses_active_when_incurred: true,
        }],
      },
      form8582: {
        activities: [{
          activity_id: "id-Rental house",
          name: "Rental house",
          activity_type: "A",
          property_type: 1,
          reporting_form: "schedule_e",
          current_net: 0,
          prior_unallowed_operating: 1_000,
          prior_active_participation: true,
          prior_unallowed_4797_part1: 3_000,
          prior_unallowed_4797_part2: 0,
        }],
        prior_unallowed: 4_000,
        rental_prior_eligible_loss: 4_000,
        has_active_rental: true,
        active_participation: true,
        has_current_4797_transaction: true,
        current_4797_sale_gains: [{
          activity_id: "id-Rental house",
          activity_name: "Rental house",
          part: "I",
          gain: 2_000,
          entire_activity_interest_disposed: false,
        }],
        modified_agi: 200_000,
      },
    },
  };
  assertThrows(
    () => form4797.build({ passive_property_sales: [sale] }, context),
    Error,
    "Schedule E prior passive loss with current disposition needs section 469(g) review",
  );
});

test("Form 4797: sourced retained sales preserve operating-only PAL on Schedule E", () => {
  for (const activityType of ["A", "B"] as const) {
    const sale = {
      activity_id: "retained-rental",
      activity_name: "Retained rental",
      part: "II",
      property_description: "Short-held parcel",
      acquired_on: "2025-01-01",
      sold_on: "2025-06-01",
      gross_sales_price: 8_000,
      cost_or_other_basis: 5_000,
      depreciation_allowed: 0,
      entire_activity_interest_disposed: false,
      buyer_unrelated: true,
      fully_taxable: true,
      installment_method: false,
      disposition_document_reference: "Synthetic 2025 partial parcel closing",
    };
    const prior = {
      tax_year: 2024,
      activity_id: sale.activity_id,
      filed_part_vii_column_c: 8_000,
      source_document_reference: "Synthetic filed 2024 Form 8582 Part VII",
    };
    const property = {
      tsj: "T",
      activity_id: sale.activity_id,
      property_description: sale.activity_name,
      property_type: 1,
      activity_type: activityType,
      fair_rental_days: 365,
      personal_use_days: 0,
      rent_income: 0,
      form_1099_payments_made: false,
      expense_taxes: 5_000,
      disposed_of: true,
      passive_property_sales: [sale],
      prior_unallowed_passive_operating: 8_000,
      prior_passive_losses_active_when_incurred: activityType === "A",
      prior_year_8582_source: prior,
    };
    const passive = {
      activities: [{
        activity_id: sale.activity_id,
        name: sale.activity_name,
        activity_type: activityType,
        property_type: 1,
        reporting_form: "schedule_e",
        current_net: -5_000,
        prior_unallowed_operating: 8_000,
        prior_active_participation: activityType === "A",
        prior_year_8582_source: prior,
        prior_unallowed_4797_part1: 0,
        prior_unallowed_4797_part2: 0,
      }],
      current_loss: 5_000,
      prior_unallowed: 8_000,
      has_other_passive: activityType === "B",
      ...(activityType === "A"
        ? {
          rental_current_loss: 5_000,
          rental_prior_eligible_loss: 8_000,
          has_active_rental: true,
          active_participation: true,
          filing_status: "single",
          modified_agi: 140_000,
        }
        : {}),
      has_current_4797_transaction: true,
      current_4797_sale_gains: [{
        activity_id: sale.activity_id,
        activity_name: sale.activity_name,
        part: sale.part,
        gain: 3_000,
        entire_activity_interest_disposed: false,
      }],
    };
    const context = {
      pending: {
        schedule_e: { schedule_es: [property] },
        form8582: passive,
      },
    };
    const xml = form4797.build({ passive_property_sales: [sale] }, context);
    assertStringIncludes(xml, "<PropertyDesc>Short-held parcel</PropertyDesc>");
    assertStringIncludes(
      xml,
      "<TotalOrdinaryGainLossAmt>3000</TotalOrdinaryGainLossAmt>",
    );
    // Operating PAL stays on Schedule E; it is not a second Form 4797 loss.
    assertEquals(xml.includes("<PassiveActivityLossLiteralCd>"), false);
    assertThrows(
      () => form4797.build({ passive_property_sales: [sale] }, {
        pending: {
          ...context.pending,
          schedule_e: {
            schedule_es: [{ ...property, prior_year_8582_source: undefined }],
          },
        },
      }),
      Error,
      "section 469(g) review",
    );
    assertThrows(
      () => form4797.build({ passive_property_sales: [sale] }, {
        pending: {
          ...context.pending,
          form8582: { ...passive, current_4797_sale_gains: [] },
        },
      }),
      Error,
      "matching Form 8582 sale allocation",
    );
  }
});

test("Form 4797: Form 6252 section 1231 gain appears on line 4 and line 7", () => {
  const xml = form4797.build({
    section_1231_gain: 8_000,
    gain_form6252: 8_000,
  });
  assertStringIncludes(
    xml,
    "<GainInstallmentSalesFrm6252Amt>8000</GainInstallmentSalesFrm6252Amt>",
  );
  assertStringIncludes(
    xml,
    "<TotalPropertyGainLossAmt>8000</TotalPropertyGainLossAmt>",
  );
  assertThrows(
    () => form4797.build({ section_1231_gain: 7_000, gain_form6252: 8_000 }),
    Error,
    "included in its line 7",
  );
});

test("Form 4797: Form 8824 section 1231 gain appears on line 5 and line 7", () => {
  const xml = form4797.build({
    section_1231_gain: 8_000,
    gain_form8824: 8_000,
  });
  assertStringIncludes(xml, "<GainLossForm8824Amt>8000</GainLossForm8824Amt>");
  assertStringIncludes(
    xml,
    "<TotalPropertyGainLossAmt>8000</TotalPropertyGainLossAmt>",
  );
});

test("Form 4797: partnership and S-corp K-1 amounts retain line 2 source rows", () => {
  const xml = form4797.build({
    section_1231_gain: 7_000,
    k1_1231_rows: [
      {
        source: "partnership",
        entity_name: "Partner One",
        source_ein: "123456789",
        source_document_reference: "K-1 P1",
        recipient_tin: "111223333",
        gain_loss: 10_000,
      },
      {
        source: "s_corp",
        entity_name: "Corp Two",
        source_ein: "987654321",
        source_document_reference: "K-1 C2",
        recipient_tin: "111223333",
        gain_loss: -3_000,
      },
    ],
  });
  assertStringIncludes(xml, "<PropertyDesc>K-1 1065 123456789</PropertyDesc>");
  assertStringIncludes(
    xml,
    "<PropertyDesc>K-1 1120-S 987654321</PropertyDesc>",
  );
  assertStringIncludes(
    xml,
    "<DateAcquiredInheritedCd>FROM SCHEDULE K-1 F1120S</DateAcquiredInheritedCd>",
  );
  assertStringIncludes(xml, "<GainOrLossAmt>10000</GainOrLossAmt>");
  assertStringIncludes(xml, "<GainOrLossAmt>-3000</GainOrLossAmt>");
  assertStringIncludes(
    xml,
    "<TotalPropertyGainLossAmt>7000</TotalPropertyGainLossAmt>",
  );
});

test("Form 4797: prior section 1231 loss recaptures only the smaller gain", () => {
  const xml = form4797.build({
    section_1231_gain: 20_000,
    nonrecaptured_1231_loss: 5_000,
  });
  assertStringIncludes(
    xml,
    "<NonrecapturedNet1231LossesAmt>5000</NonrecapturedNet1231LossesAmt>",
  );
  assertStringIncludes(xml, "<TotalGainLossAmt>15000</TotalGainLossAmt>");
  assertStringIncludes(
    xml,
    "<PropGainNonrecapturedLossAmt>5000</PropGainNonrecapturedLossAmt>",
  );
  assertStringIncludes(
    xml,
    "<TotalOrdinaryGainLossAmt>5000</TotalOrdinaryGainLossAmt>",
  );
  assertStringIncludes(xml, "<OtherGainLossAmt>5000</OtherGainLossAmt>");
});

test("Form 4797: prior loss exceeding current gain recaptures all current gain", () => {
  const xml = form4797.build({
    section_1231_gain: 3_000,
    nonrecaptured_1231_loss: 8_000,
  });
  assertStringIncludes(xml, "<TotalGainLossAmt>0</TotalGainLossAmt>");
  assertStringIncludes(
    xml,
    "<PropGainNonrecapturedLossAmt>3000</PropGainNonrecapturedLossAmt>",
  );
  assertStringIncludes(xml, "<OtherGainLossAmt>3000</OtherGainLossAmt>");
});

test("Form 4797: section 1231 loss flows through Part II lines 11, 17, and 18b", () => {
  const xml = form4797.build({ section_1231_gain: -4_000 });
  assertStringIncludes(
    xml,
    "<TotalPropertyGainLossAmt>-4000</TotalPropertyGainLossAmt>",
  );
  assertStringIncludes(xml, "<OrdinaryLossAmt>4000</OrdinaryLossAmt>");
  assertStringIncludes(
    xml,
    "<TotalOrdinaryGainLossAmt>-4000</TotalOrdinaryGainLossAmt>",
  );
  assertStringIncludes(xml, "<OtherGainLossAmt>-4000</OtherGainLossAmt>");
});

test("Form 4797: Form 4684 business loss reaches line 14 and Schedule 1 total", () => {
  const xml = form4797.build({ ordinary_gain_form4684: -20_000 });
  assertStringIncludes(
    xml,
    "<NetGainLossForm4684Amt>-20000</NetGainLossForm4684Amt>",
  );
  assertStringIncludes(
    xml,
    "<TotalOrdinaryGainLossAmt>-20000</TotalOrdinaryGainLossAmt>",
  );
  assertStringIncludes(xml, "<OtherGainLossAmt>-20000</OtherGainLossAmt>");
  assertEquals(xml.includes("<TotalPropertyGainLossAmt>"), false);
});

test("Form 4797: source amounts reconcile even when the ordinary total is zero", () => {
  const xml = form4797.build({
    section_1231_gain: -4_000,
    ordinary_gain_form4684: 4_000,
  });
  assertStringIncludes(xml, "<OrdinaryLossAmt>4000</OrdinaryLossAmt>");
  assertStringIncludes(
    xml,
    "<NetGainLossForm4684Amt>4000</NetGainLossForm4684Amt>",
  );
  assertStringIncludes(
    xml,
    "<TotalOrdinaryGainLossAmt>0</TotalOrdinaryGainLossAmt>",
  );
});

test("Form 4797: line 8 requires a current positive section 1231 gain", () => {
  assertThrows(
    () => form4797.build({ nonrecaptured_1231_loss: 5_000 }),
    Error,
    "line 8",
  );
  assertThrows(
    () =>
      form4797.build({
        section_1231_gain: -2_000,
        nonrecaptured_1231_loss: 5_000,
      }),
    Error,
    "line 8",
  );
});

test("Form 4797: ordinary and recapture aggregates need source detail", () => {
  assertThrows(
    () => form4797.build({ ordinary_gain: 8_000 }),
    Error,
    "source-line and property detail",
  );
  assertThrows(
    () => form4797.build({ recapture_1245: 3_000 }),
    Error,
    "source-line and property detail",
  );
  assertThrows(
    () => form4797.build({ recapture_1250: 1_500 }),
    Error,
    "source-line and property detail",
  );
  assertThrows(
    () => form4797.build({ recapture_form6252: 10_000 }),
    Error,
    "source-line and property detail",
  );
  assertThrows(
    () => buildMefXml({ form4797: { ordinary_gain: 8_000 } }, testFiler()),
    Error,
    "source-line and property detail",
  );
});

test("Form 4797: amounts must be whole dollars", () => {
  assertThrows(
    () => form4797.build({ section_1231_gain: 1.5 }),
    Error,
    "whole-dollar",
  );
  assertThrows(
    () =>
      form4797.build({ section_1231_gain: 100, nonrecaptured_1231_loss: -1 }),
    Error,
    "negative",
  );
});

test("Form 4797 detects an allocated rental loss before releasing passive sale income", () => {
  const fields = {passive_property_sales:[{
    activity_id:"allocated-rental",activity_name:"Synthetic rental",part:"II",
    property_description:"Short-held parcel",acquired_on:"2025-01-01",sold_on:"2025-06-01",
    gross_sales_price:9000,cost_or_other_basis:7000,depreciation_allowed:0,
  }]};
  const pending = {schedule_e:{schedule_es:[{
    tsj:"T",activity_id:"allocated-rental",property_description:"Synthetic rental",
    property_type:1,activity_type:"B",fair_rental_days:365,personal_use_days:0,
    rent_income:0,form_1099_payments_made:false,disposed_of:true,
    expense_allocation_source:{
      tax_year:2025,activity_id:"allocated-rental",source_reference:"Synthetic expense ledger",
      use_pattern:"rental-only",rental_period:{from:"2025-01-01",through:"2025-12-31"},
      no_personal_use_during_rental_period:true,amounts_before_ownership_allocation:true,
      expenses:[{expense_id:"insurance",category:"expense_insurance",transaction_kind:"expense",
        source_amount:2000,source_reference:"Synthetic insurer",paid_on:"2025-01-01",
        expense_period:{from:"2025-01-01",through:"2025-12-31"},
        method:"documented-share",rental_share:0.5,method_reference:"Reviewed rental-unit share"}],
    },
  }]}};
  assertThrows(()=>form4797.build(fields,{pending,taxYear:2025}),
    Error,"matching Form 8582 sale allocation");
  assertThrows(()=>form4797.build(fields,{pending,taxYear:2026}),
    Error,"allocation year/activity");
});
