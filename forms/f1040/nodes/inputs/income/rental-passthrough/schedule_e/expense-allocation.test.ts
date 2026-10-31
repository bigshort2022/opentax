import { test, expect } from "bun:test";
import { allocateRentalExpenses, RentalAllocationMethod, RentalUsePattern, RentalExpenseCategory, RentalTransactionKind } from "./expense-allocation.ts";
import { projectScheduleEItems, scheduleE } from "./index.ts";
import { form8582 } from "../../../../intermediate/forms/income/business/form8582/index.ts";

const source = {tax_year:2024,activity_id:"synthetic-rental",source_reference:"reviewed conversion evidence",use_pattern:RentalUsePattern.MainHomeConversion,rental_period:{from:"2022-01-01",through:"2024-06-30"},main_home_period:{from:"2024-07-01",through:"2024-12-31"},no_personal_use_during_rental_period:true,amounts_before_ownership_allocation:true,expenses:[{expense_id:"insurance-2024",category:RentalExpenseCategory.Insurance,transaction_kind:RentalTransactionKind.Expense,source_amount:3660,source_reference:"2024 synthetic insurer",paid_on:"2024-01-01",expense_period:{from:"2024-01-01",through:"2024-12-31"},method:RentalAllocationMethod.CalendarDays,method_reference:"coverage period and conversion date"}]};
const row = {tsj:"T",activity_id:"synthetic-rental",property_description:"Synthetic house",property_type:1,activity_type:"B",fair_rental_days:182,personal_use_days:184,rent_income:6000,form_1099_payments_made:false,expense_allocation_source:source};

test("2024 rental to main-home conversion allocates leap-year annual costs without source mutation",()=>{
  const before=JSON.stringify(source);
  const allocated=allocateRentalExpenses(source,182,184);
  expect(allocated.fields.expense_insurance).toBe(1820);
  expect(allocated.rows[0].rentalShare).toBe(182/366);
  expect(JSON.stringify(source)).toBe(before);
  const result=scheduleE.compute({taxYear:2024,formType:"f1040"},scheduleE.inputSchema.parse({schedule_es:[row]}));
  expect(result.outputs.find(o=>o.nodeType==="schedule1")?.fields.line5_schedule_e).toBe(4180);
});

test("allocated fields reconcile, never double count and never assume missing personal allocation",()=>{
  const ctx={taxYear:2024,formType:"f1040"};
  const result=scheduleE.compute(ctx,scheduleE.inputSchema.parse({schedule_es:[{...row,expense_insurance:1820}]}));
  expect(result.outputs.find(o=>o.nodeType==="schedule1")?.fields.line5_schedule_e).toBe(4180);
  expect(()=>scheduleE.compute(ctx,scheduleE.inputSchema.parse({schedule_es:[{...row,expense_insurance:3660}]}))).toThrow("allocation");
  expect(()=>scheduleE.compute(ctx,scheduleE.inputSchema.parse({schedule_es:[{...row,expense_allocation_source:undefined}]}))).toThrow("allocation");
  expect(()=>allocateRentalExpenses({...source,rental_period:{from:"2024-01-01",through:"2024-06-30"}},182,184)).toThrow("12 consecutive");
});

test("repayments require an explicit year and deductible-character decision",()=>{
  const expense={...source.expenses[0],transaction_kind:RentalTransactionKind.Repayment};
  expect(()=>allocateRentalExpenses({...source,expenses:[expense]},182,184)).toThrow("repayment");
  expect(()=>allocateRentalExpenses({...source,expenses:[{...expense,repayment:{original_income_tax_year:2023,deductible_tax_year:2023,treatment:"deductible-rental-expense",decision_reference:"reviewed legal decision"}}]},182,184)).toThrow("year");
});

test("reviewed prior-year rental obligation paid now uses cash timing, not an automatic repayment deduction",()=>{
  const expense={...source.expenses[0],category:RentalExpenseCategory.LegalProfessional,source_amount:1200,method:RentalAllocationMethod.DirectRental,expense_period:{from:"2023-12-01",through:"2023-12-31"}};
  expect(allocateRentalExpenses({...source,expenses:[expense]},182,184).fields.expense_legal_professional).toBe(1200);
  const repayment={...expense,transaction_kind:RentalTransactionKind.Repayment,repayment:{original_income_tax_year:2023,deductible_tax_year:2024,treatment:"nondeductible",decision_reference:"reviewed return of untaxed deposit"}};
  const allocated=allocateRentalExpenses({...source,expenses:[repayment]},182,184);
  expect(allocated.fields.expense_legal_professional).toBe(0);
  expect(allocated.rows[0].sourceAmount).toBe(1200);
  expect(allocated.rows[0].personalOrNondeductibleAmount).toBe(1200);
});

test("shared projection is pure, repeatable and applies ownership only in the consumer", () => {
  const input = scheduleE.inputSchema.parse({schedule_es:[{...row,ownership_percent:50}]});
  const before = JSON.stringify(input);
  const projected = projectScheduleEItems(input.schedule_es, 2024);
  expect(projected[0].expense_insurance).toBe(1820);
  expect(projected[0].ownership_percent).toBe(50);
  expect(projectScheduleEItems(projected, 2024)).toEqual(projected);
  const result = scheduleE.compute({taxYear:2024,formType:"f1040"}, input);
  expect(result.outputs.find(o=>o.nodeType==="schedule1")?.fields.line5_schedule_e).toBe(2090);
  expect(result.outputs.find(o=>o.nodeType==="agi_aggregator")?.fields.eic_passive_schedule_e_income).toBe(2090);
  expect(JSON.stringify(input)).toBe(before);
});

function inactiveRow(taxYear: number) {
  return {
    ...row, expense_allocation_source:undefined, fair_rental_days:0,
    personal_use_days:taxYear===2024?366:365, rent_income:0,
    prior_unallowed_passive_operating:10000,
    prior_unallowed_passive_4797_part1:0, prior_unallowed_passive_4797_part2:0,
    prior_passive_losses_active_when_incurred:true,
    reconstructed_prior_loss_source:{
      tax_year:taxYear-1, activity_id:row.activity_id,
      provenance:"calculated-unfiled", evidence_reference:"Reviewed synthetic conversion-year closing PAL",
      operating:10000, form4797_part1:0, form4797_part2:0,
    },
    loss_limitations_review:{
      basis_resolved:true, at_risk_resolved:true, qbi_transition_resolved:true,
      evidence_reference:"Reviewed synthetic limitations",
    },
  };
}

test("conversion-year PAL survives a fully personal following year with truthful use days", () => {
  for (const taxYear of [2023,2024]) {
    const conversionYear = taxYear - 1;
    const conversion = scheduleE.compute({taxYear:conversionYear,formType:"f1040"},
      scheduleE.inputSchema.parse({schedule_es:[{...row,fair_rental_days:181,
        expense_allocation_source:{...source,tax_year:conversionYear,
          rental_period:{from:`${conversionYear-2}-01-01`,through:`${conversionYear}-06-30`},
          main_home_period:{from:`${conversionYear}-07-01`,through:`${conversionYear}-12-31`},
          expenses:[{...source.expenses[0],source_amount:16000,
            paid_on:`${conversionYear}-06-30`,method:RentalAllocationMethod.DirectRental,
            expense_period:{from:`${conversionYear}-01-01`,through:`${conversionYear}-06-30`},
          }],
        },
      }]}));
    const conversionPassive = conversion.outputs.find(o=>o.nodeType==="form8582");
    const conversionLoss = form8582.compute({taxYear:conversionYear,formType:"f1040"},
      form8582.inputSchema.parse(conversionPassive?.fields));
    expect(conversionLoss.carryforwards?.[`suspended_pal_8582:${row.activity_id}`]).toBe(10000);
    const input = scheduleE.inputSchema.parse({schedule_es:[inactiveRow(taxYear)]});
    const before = JSON.stringify(input);
    expect(projectScheduleEItems(input.schedule_es,taxYear)).toEqual(input.schedule_es);
    const result = scheduleE.compute({taxYear,formType:"f1040"},input);
    expect(result.outputs.find(o=>o.nodeType==="schedule1")?.fields.line5_schedule_e).toBe(0);
    const passive = result.outputs.find(o=>o.nodeType==="form8582");
    expect(passive?.fields.prior_unallowed).toBe(10000);
    expect(passive?.fields.activities).toEqual([expect.objectContaining({
      activity_id:row.activity_id,activity_type:"B",current_net:0,
      prior_unallowed_operating:10000,prior_active_participation:true,
      reconstructed_prior_loss_source:input.schedule_es[0].reconstructed_prior_loss_source,
    })]);
    const retained = form8582.compute({taxYear,formType:"f1040"},
      form8582.inputSchema.parse(passive?.fields));
    expect(retained.carryforwards?.[`suspended_pal_8582:${row.activity_id}`]).toBe(10000);
    expect(JSON.stringify(input)).toBe(before);
  }
});

test("inactive carryover exception cannot hide income, expenses, sales or unsupported deductions", () => {
  for (const changed of [
    {rent_income:1}, {royalties_income:1}, {expense_insurance:1},
    {expense_mortgage_interest:1}, {expense_taxes:1},
    {expense_other_lines:[{description:"Current expense",amount:1}]},
    {expense_depreciation_amt:1}, {section_179:1}, {section_1231_gain_loss:1},
    {qbi_override:1}, {operating_expenses_carryover:1},
    {disallowed_mortgage_interest_8990:1}, {disallowed_other_interest_8990:1},
    {disposed_of:true}, {placed_in_service:true}, {activity_type:"A"},
    {activity_id:undefined}, {loss_limitations_review:undefined},
    {reconstructed_prior_loss_source:undefined},
    {reconstructed_prior_loss_source:{...inactiveRow(2023).reconstructed_prior_loss_source,activity_id:"another-property"}},
  ]) {
    const input = scheduleE.inputSchema.parse({schedule_es:[{...inactiveRow(2023),...changed}]});
    expect(()=>projectScheduleEItems(input.schedule_es,2023)).toThrow();
    expect(()=>scheduleE.compute({taxYear:2023,formType:"f1040"},input)).toThrow();
  }
});

test("allocated mortgage interest and taxes require separately reviewed Schedule A inputs", () => {
  for (const category of [RentalExpenseCategory.MortgageInterest,RentalExpenseCategory.Taxes] as const) {
    const allocatedSource = {...source,expenses:[{...source.expenses[0],category,source_amount:36600}]};
    const property = {...row,expense_allocation_source:allocatedSource,
      main_home_or_second_home:true,occupancy_percent:184/366*100};
    const input = scheduleE.inputSchema.parse({schedule_es:[property]});
    expect(allocateRentalExpenses(allocatedSource,182,184).fields[category]).toBe(18200);
    expect(()=>projectScheduleEItems(input.schedule_es,2024)).toThrow("separately reviewed Schedule A");
    expect(()=>scheduleE.compute({taxYear:2024,formType:"f1040"},input)).toThrow("separately reviewed Schedule A");
    const separate = scheduleE.inputSchema.parse({schedule_es:[{...property,main_home_or_second_home:false}]});
    const result = scheduleE.compute({taxYear:2024,formType:"f1040"},separate);
    expect(result.outputs.some(o=>o.nodeType==="schedule_a")).toBe(false);
    expect(projectScheduleEItems(separate.schedule_es,2024)[0][category]).toBe(18200);
  }
});

test("nondeductible repayment remainder is never treated as eligible personal interest", () => {
  const allocatedSource = {...source,expenses:[{
    ...source.expenses[0],category:RentalExpenseCategory.MortgageInterest,
    transaction_kind:RentalTransactionKind.Repayment,source_amount:36600,
    repayment:{original_income_tax_year:2023,deductible_tax_year:2024,
      treatment:"nondeductible",decision_reference:"Reviewed nondeductible repayment"},
  }]};
  const input = scheduleE.inputSchema.parse({schedule_es:[{...row,
    expense_allocation_source:allocatedSource,main_home_or_second_home:true,occupancy_percent:184/366*100,
  }]});
  expect(()=>scheduleE.compute({taxYear:2024,formType:"f1040"},input)).toThrow("separately reviewed Schedule A");
});

test("legacy 2025 personal expense routing remains unchanged without allocation evidence", () => {
  const input = scheduleE.inputSchema.parse({schedule_es:[{...row,
    expense_allocation_source:undefined,personal_use_days:183,
    main_home_or_second_home:true,occupancy_percent:50,
    expense_mortgage_interest:10000,expense_taxes:2000,
  }]});
  expect(projectScheduleEItems(input.schedule_es,2025)).toEqual(input.schedule_es);
  const result = scheduleE.compute({taxYear:2025,formType:"f1040"},input);
  expect(result.outputs.find(o=>o.nodeType==="schedule_a")?.fields).toEqual({
    line_8a_mortgage_interest_1098:5000,line_5b_real_estate_tax:1000,
  });
});

test("inactive personal carryover offsets another property's passive income without current deductions", () => {
  const input = scheduleE.inputSchema.parse({schedule_es:[
    {...inactiveRow(2024),prior_unallowed_passive_operating:410,
      reconstructed_prior_loss_source:{...inactiveRow(2024).reconstructed_prior_loss_source,operating:410}},
    {...row,activity_id:"profitable",expense_allocation_source:undefined,
      fair_rental_days:366,personal_use_days:0,rent_income:1000},
  ]});
  const result = scheduleE.compute({taxYear:2024,formType:"f1040"},input);
  const gross = Number(result.outputs.find(o=>o.nodeType==="schedule1")?.fields.line5_schedule_e);
  const passive = form8582.compute({taxYear:2024,formType:"f1040"},
    form8582.inputSchema.parse(result.outputs.find(o=>o.nodeType==="form8582")?.fields));
  const allowed = Number(passive.outputs.find(o=>o.nodeType==="schedule1")?.fields.line5_schedule_e);
  expect(gross).toBe(1000);
  expect(allowed).toBe(-410);
  expect(gross+allowed).toBe(590);
});

test("top-level filed prior-year record remains year-bound with an empty property inventory", () => {
  const input = scheduleE.inputSchema.parse({filed_2024_form8582_record:{
    tax_year:2024,accepted_return_reference:"Synthetic accepted return",
    source_document_reference:"Synthetic filed worksheet",activities:[{
      activity_id:"retained",filed_part_vii_column_c:410,reporting_part:"viii",
      rows:[{reporting_form:"schedule_e",filed_unallowed_loss:410}],
    }],
  }});
  expect(()=>scheduleE.compute({taxYear:2024,formType:"f1040"},input)).toThrow();
});
