import { z } from "zod";

export enum RentalUsePattern {
  RentalOnly = "rental-only",
  MainHomeConversion = "main-home-conversion",
  MixedUseNotHome = "mixed-use-not-home",
}
export enum RentalAllocationMethod {
  DirectRental = "direct-rental",
  CalendarDays = "calendar-days",
  ActualUseDays = "actual-use-days",
  DocumentedShare = "documented-share",
  ReviewedDepreciation = "reviewed-depreciation",
}
export enum RentalTransactionKind { Expense = "expense", Repayment = "repayment" }
export enum RentalRepaymentTreatment {
  DeductibleRentalExpense = "deductible-rental-expense",
  Nondeductible = "nondeductible",
  ClaimOfRight = "claim-of-right",
}
export enum RentalExpenseCategory {
  Advertising = "expense_advertising", AutoTravel = "expense_auto_travel",
  Cleaning = "expense_cleaning", Commissions = "expense_commissions",
  Insurance = "expense_insurance", LegalProfessional = "expense_legal_professional",
  Management = "expense_management", MortgageInterest = "expense_mortgage_interest",
  OtherInterest = "expense_other_interest", Repairs = "expense_repairs",
  Supplies = "expense_supplies", Taxes = "expense_taxes", Utilities = "expense_utilities",
  Depreciation = "expense_depreciation", Depletion = "expense_depletion",
  Other = "expense_other",
}
const ref = z.string().trim().min(1);
const periodSchema = z.object({from:z.string().date(),through:z.string().date()}).strict().refine(p=>p.from<=p.through,"Rental allocation period is reversed");
export const rentalExpenseAllocationSourceSchema = z.object({
  tax_year:z.number().int().min(2021).max(2026), activity_id:ref.max(64), source_reference:ref,
  use_pattern:z.nativeEnum(RentalUsePattern), rental_period:periodSchema,
  main_home_period:periodSchema.optional(),
  no_personal_use_during_rental_period:z.boolean(),
  amounts_before_ownership_allocation:z.literal(true),
  expenses:z.array(z.object({
    expense_id:ref, category:z.nativeEnum(RentalExpenseCategory), transaction_kind:z.nativeEnum(RentalTransactionKind),
    description:ref.optional(),
    source_amount:z.number().finite().nonnegative(), source_reference:ref, paid_on:z.string().date().optional(),
    expense_period:periodSchema, method:z.nativeEnum(RentalAllocationMethod), method_reference:ref,
    rental_share:z.number().min(0).max(1).optional(),
    repayment:z.object({original_income_tax_year:z.number().int().min(1900),deductible_tax_year:z.number().int(),treatment:z.nativeEnum(RentalRepaymentTreatment),decision_reference:ref}).strict().optional(),
  }).strict()),
}).strict();
export type RentalExpenseAllocationSource = z.infer<typeof rentalExpenseAllocationSourceSchema>;

const DAY = 86400000;
/** Inclusive whole-day intersections avoid leap-year and timezone assumptions. */
function overlapDays(a:{from:string;through:string},b:{from:string;through:string}):number {
  return Math.max(0,Math.round((Math.min(Date.parse(a.through),Date.parse(b.through))-Math.max(Date.parse(a.from),Date.parse(b.from)))/DAY)+1);
}

/** Pub. 527 chapters 1, 4 and 5. Source cents stay intact; aggregate reporting
 * amounts are rounded once, after allocation. This is not a depreciation engine:
 * that category requires the actual year/retirement-adjusted workpaper amount. */
export function allocateRentalExpenses(raw:unknown,fairRentalDays:number,personalUseDays:number) {
  const source=rentalExpenseAllocationSourceSchema.parse(raw);
  const year={from:`${source.tax_year}-01-01`,through:`${source.tax_year}-12-31`};
  const heldDays=overlapDays(source.rental_period,year);
  if (heldDays===0 || fairRentalDays>heldDays || fairRentalDays+personalUseDays>overlapDays(year,year)) throw new Error("Rental allocation use days do not reconcile to source periods");
  if (source.use_pattern===RentalUsePattern.RentalOnly && personalUseDays!==0) throw new Error("Rental-only allocation cannot omit personal-use days");
  if (source.use_pattern===RentalUsePattern.MainHomeConversion) {
    const home=source.main_home_period;
    const start=new Date(`${source.rental_period.from}T00:00:00Z`);
    const anniversary=new Date(start); anniversary.setUTCFullYear(start.getUTCFullYear()+1);
    if (Date.parse(source.rental_period.through)+DAY<anniversary.getTime()) throw new Error("Main-home conversion exception requires 12 consecutive months rented or held for rent");
    if (!source.no_personal_use_during_rental_period || !home || home.from.slice(0,4)!==String(source.tax_year) || home.through!==year.through || Date.parse(home.from)!==Date.parse(source.rental_period.through)+DAY || personalUseDays!==overlapDays(home,year)) throw new Error("Main-home conversion needs consecutive rental/home periods and complete personal-use days");
  } else if (source.main_home_period) throw new Error("Main-home period requires the main-home-conversion allocation method");
  if (source.use_pattern===RentalUsePattern.MixedUseNotHome && personalUseDays>Math.max(14,fairRentalDays*.1)) throw new Error("Dwelling used as a home requires the separate Pub. 527 vacation-home deduction limitation worksheet");
  if (source.use_pattern!==RentalUsePattern.MixedUseNotHome && !source.no_personal_use_during_rental_period) throw new Error("Rental allocation requires known personal-use classification");
  const ids=new Set<string>();
  const totals:Partial<Record<RentalExpenseCategory,number>>={};
  const otherTotals=new Map<string,number>();
  const rows=source.expenses.map(expense=>{
    if(ids.has(expense.expense_id)) throw new Error("Rental allocation repeats an expense source ID");
    ids.add(expense.expense_id);
    if(expense.category===RentalExpenseCategory.Other && !expense.description) throw new Error("Other rental expense requires a source description");
    if(expense.method!==RentalAllocationMethod.ReviewedDepreciation && expense.paid_on?.slice(0,4)!==String(source.tax_year)) throw new Error("Cash rental expense payment must belong to the deduction year");
    const repayment=expense.repayment;
    if(expense.transaction_kind===RentalTransactionKind.Repayment && !repayment) throw new Error("Rental repayment needs an explicit deductible-character and source-year decision");
    if(expense.transaction_kind!==RentalTransactionKind.Repayment && repayment) throw new Error("Rental repayment decision cannot attach to an ordinary expense");
    if(repayment && (repayment.original_income_tax_year>source.tax_year || repayment.deductible_tax_year!==source.tax_year)) throw new Error("Rental repayment source/deduction year does not reconcile");
    if(repayment?.treatment===RentalRepaymentTreatment.ClaimOfRight) throw new Error("Claim-of-right repayment needs a separate section 1341 deduction/credit computation");
    const periodDays=overlapDays(expense.expense_period,expense.expense_period);
    const eligibleRentalPeriod={from:source.rental_period.from,through:source.rental_period.through<year.through?source.rental_period.through:year.through};
    let rentalShare:number;
    if(expense.method===RentalAllocationMethod.CalendarDays) {
      if(source.use_pattern===RentalUsePattern.MixedUseNotHome) throw new Error("Mixed-use dwelling expenses need actual-use-days, not available calendar days");
      rentalShare=overlapDays(expense.expense_period,eligibleRentalPeriod)/periodDays;
    } else if(expense.method===RentalAllocationMethod.ActualUseDays) {
      if(source.use_pattern!==RentalUsePattern.MixedUseNotHome || fairRentalDays+personalUseDays===0 || expense.expense_period.from!==year.from || expense.expense_period.through!==year.through) throw new Error("Actual-use-day allocation needs a complete annual mixed-use expense and known use days");
      rentalShare=fairRentalDays/(fairRentalDays+personalUseDays);
    } else if(expense.method===RentalAllocationMethod.DocumentedShare) {
      if(expense.rental_share===undefined || expense.expense_period.through>year.through) throw new Error("Documented rental share is required; future-year coverage needs a separate prepaid-expense allocation");
      rentalShare=expense.rental_share;
    } else {
      if(expense.expense_period.from<source.rental_period.from || expense.expense_period.through>source.rental_period.through) throw new Error("Direct rental expense period extends into personal use");
      if(expense.expense_period.through>year.through || (expense.method===RentalAllocationMethod.ReviewedDepreciation && expense.expense_period.from<year.from)) throw new Error("Direct rental expense cannot deduct future coverage; depreciation must use the current-year workpaper period");
      rentalShare=1;
    }
    if(expense.category===RentalExpenseCategory.Depreciation && expense.method!==RentalAllocationMethod.ReviewedDepreciation) throw new Error("Rental depreciation requires the year-correct conversion/retirement workpaper, not daily proration of basis");
    if(expense.method===RentalAllocationMethod.ReviewedDepreciation && expense.category!==RentalExpenseCategory.Depreciation) throw new Error("Depreciation allocation applies only to depreciation");
    if(expense.rental_share!==undefined && Math.abs(expense.rental_share-rentalShare)>1e-9) throw new Error("Documented rental share differs from the selected allocation method");
    const amount=repayment?.treatment===RentalRepaymentTreatment.Nondeductible?0:expense.source_amount*rentalShare;
    totals[expense.category]=(totals[expense.category]??0)+amount;
    if(expense.category===RentalExpenseCategory.Other) otherTotals.set(expense.description!, (otherTotals.get(expense.description!)??0)+amount);
    // This remainder is not a Schedule A deduction: it can include personal
    // use, prepaid coverage or a wholly nondeductible repayment. Eligibility
    // requires separate review, not another occupancy-percent allocation.
    return {expenseId:expense.expense_id,category:expense.category,sourceAmount:expense.source_amount,rentalShare,rentalAmount:amount,personalOrNondeductibleAmount:expense.source_amount-amount};
  });
  const fields:Partial<Record<RentalExpenseCategory,number>>={};
  for(const category of Object.values(RentalExpenseCategory)) if(category!==RentalExpenseCategory.Other) fields[category]=Math.round(totals[category]??0);
  const otherLines=[...otherTotals].map(([description,amount])=>({description,amount:Math.round(amount)}));
  if(otherLines.length>6) throw new Error("Other rental expenses need an attached continuation statement");
  return {fields,otherLines,rows,heldForRentalDays:heldDays,personalUseDays};
}
