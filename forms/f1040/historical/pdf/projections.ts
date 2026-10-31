import type { FilerIdentity } from "../../mef/header.ts";
import { CONFIG_BY_YEAR } from "../../nodes/config/index.ts";
import { roundWholeDollars } from "../../whole-dollars.ts";
import { TS } from "../../nodes/types.ts";
import { schedule2Pdf } from "../../2025/pdf/forms/taxes/other/schedule2.ts";
import { foreignCountryPrintFields } from "../../2025/pdf/forms/income/investments/schedule_b/schedule_b_foreign_countries_statement.ts";
import { calculateOwnerForms, inputSchema as form5329Schema } from "../../nodes/intermediate/forms/taxes/retirement/form5329/index.ts";
import { calculatePub974SingleBusinessIterative, pub974SingleBusinessSourceSchema } from "../../nodes/intermediate/forms/adjustments/health/form7206/pub974_worksheets.ts";
import { projectBusiness } from "../../2025/pdf/forms/income/business/schedule_c.ts";
import { scheduleDPdf } from "../../2025/pdf/forms/income/investments/schedule_d.ts";
import { assertEstimatedPaymentLine26 } from "../../2025/domains/payments/settlement/estimated-payment-reconciliation.ts";
import { extensionPaymentEvidenceSchema } from "../../nodes/inputs/payments/estimated/ext/index.ts";
import { assertIndependentOwnerHealth } from "../../2025/domains/adjustments/health/form7206/form7206_independent_owner_source.ts";
import { inputSchema as scheduleCSchema, projectScheduleCItems, computeNetProfit, assertScheduleCInterestExempt } from "../../nodes/inputs/income/business/schedule_c/model.ts";
import { inputSchema as scheduleESchema, projectScheduleEItems, computePropertyNet, computeExpenses, isPassiveProperty, isVacationHomeExcluded, isVacationHomeLimited, isInactivePersonalCarryover } from "../../nodes/inputs/income/rental-passthrough/schedule_e/index.ts";
import { inputSchema as passiveSchema, passiveActivity, passiveLossLimit, allocatePassiveActivityLosses } from "../../nodes/intermediate/forms/income/business/form8582/index.ts";
import { transactionSchema, assertForm8949TransactionMath } from "../../nodes/intermediate/forms/income/investments/form8949/index.ts";
import { dScreenTransactionSchema } from "../../nodes/intermediate/aggregation/income/investments/schedule_d/index.ts";
import { reportedCapitalSale } from "../../nodes/intermediate/forms/income/investments/form8949/reported-money.ts";
import { scheduleSELines } from "../../nodes/intermediate/forms/taxes/self-employment/schedule_se/calculation.ts";
import { assertOwnedScheduleSE } from "../../2025/domains/taxes/self-employment/schedule-se/schedule-se-owner-source.ts";
import { scheduleSeSpouseProprietor } from "../../2025/domains/taxes/self-employment/schedule-se/schedule-se-proprietor.ts";
import { assertPositive8995 } from "../../2025/mef/forms/deductions/business/f8995/f8995-route.ts";
import { projectReviewedStockLoss7203 } from "../../2025/domains/income/business/form7203/form7203_stock_loss_projection.ts";
import { scheduleEK1Part2Rows, type ScheduleEK1Part2Row } from "../../2025/domains/income/rental-passthrough/schedule-e/schedule-e-k1-part2.ts";
import { inputSchema as qbiASchema, calculateOneBusiness8995ALines, calculateOneSstb8995ALines, calculateScheduleCLossLines, calculateLossBusinessPhase } from "../../nodes/intermediate/forms/deductions/business/form8995a/index.ts";
import { assertSstbScheduleCSource } from "../../2025/mef/forms/deductions/business/f8995a/f8995a-sstb-source.ts";
import { assertScheduleCLossSources, assertScheduleCLossFiler } from "../../2025/mef/forms/deductions/business/f8995a/f8995a.ts";
import { qbiPercentageForPdf } from "../../2025/pdf/reviews/general/composed-returns/qbi-percentage.ts";
import { historicalMapping, type HistoricalTaxYear } from "./mappings.ts";

export type Fields = Record<string, unknown>;
export type Pending = Record<string, Fields>;
export interface PaperInstance {
  readonly fields: Fields;
  readonly pages?: readonly number[];
  readonly statements?: readonly string[];
  readonly statementOnly?: boolean;
  readonly statementTitle?: string;
}
export function record(value: unknown): Fields {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a computed paper field record");
  return value as Fields;
}
export function rows(value: unknown): Fields[] {
  return value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(record);
}
export function amount(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Paper amount must be a finite computed number");
  return value;
}
export function historical8949Required(row: Fields): boolean {
  return !((row.part === "A" || row.part === "D") && !row.adjustment_codes && row.adjustment_amount === undefined);
}
/** The executor retains one forwarded sale as an object, not a one-element array.
 * Schedule D also accepts independently sourced D-screen rows. Both documents
 * must consume the same complete, reported-dollar transaction inventory. */
export function historicalCapitalTransactions(pending: Pending) {
  const originals = rows(pending.form8949?.transaction).map((row) => transactionSchema.parse(row));
  const routed = pending.schedule_d?.transaction === undefined ? originals
    : rows(pending.schedule_d.transaction).map((row) => transactionSchema.parse(row));
  if (originals !== routed) {
    const inventory = new Map<string, number>();
    for (const row of routed) { const key = JSON.stringify(row); inventory.set(key, (inventory.get(key) ?? 0) + 1); }
    for (const row of originals) {
      const key = JSON.stringify(row), count = inventory.get(key) ?? 0;
      if (!count) throw new Error("Form 8949 source row differs from its forwarded Schedule D transaction");
      inventory.set(key, count - 1);
    }
  }
  const transactions = [...routed, ...rows(pending.schedule_d?.transactions).map((raw) => {
    const row = dScreenTransactionSchema.parse(raw);
    return { ...row, gain_loss: row.proceeds - row.cost_basis + (row.adjustment_amount ?? 0),
      is_long_term: /^[D-F]$/.test(row.part) };
  })];
  return transactions.map((row) => {
    if (!/^[A-F]$/.test(row.part)) throw new Error("Historical Form 8949 permits only boxes A-F");
    assertForm8949TransactionMath(row);
    if (row.is_long_term !== /^[D-F]$/.test(row.part)) throw new Error("Form 8949 holding period differs from reporting box");
    return reportedCapitalSale(row);
  });
}
export function reconcile(actual: unknown, expected: number, label: string): void {
  if (typeof actual !== "number" || !Number.isFinite(actual) || !Number.isFinite(expected) || roundWholeDollars(actual) !== roundWholeDollars(expected)) throw new Error(`${label}: printed amount does not reconcile to the computed return`);
}
function owner(filer: FilerIdentity | undefined, spouse: boolean): { name: string; ssn: string } {
  if (!filer || (spouse && !filer.spouse)) throw new Error("Paper form needs its identified taxpayer/owner");
  if (spouse && filer.filingStatus !== 2) throw new Error("A spouse-specific paper owner requires a joint return");
  return spouse
    ? { name: [filer.spouse!.firstName, filer.spouse!.middleInitial, filer.spouse!.lastName].filter(Boolean).join(" "), ssn: filer.spouse!.ssn.replaceAll("-", "") }
    : { name: filer.fullName ?? filer.nameLine1, ssn: filer.primarySSN.replaceAll("-", "") };
}
function statementRows(title: string, values: readonly Fields[]): string[] {
  return values.length ? [title, ...values.map((row) => Object.entries(row).filter(([, v]) => v !== undefined).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("; "))] : [];
}
function passiveProjection(pending: Pending) {
  const input = passiveSchema.parse(pending.form8582 ?? {});
  const activities = input.activities ?? [];
  if (activities.some((a) => a.prior_unallowed_4797_part1 || a.prior_unallowed_4797_part2) || input.current_loss_forms || input.current_4797_sale_gains?.length) throw new Error("Historical Form 8582 requires separately printable Form 4797 character worksheets for property dispositions");
  const p = passiveActivity(input);
  const limit = passiveLossLimit(p);
  const allocation = allocatePassiveActivityLosses(activities.map((a) => ({ currentNet: roundWholeDollars(a.current_net), priorUnallowed: roundWholeDollars(a.prior_unallowed_operating), specialEligible: a.activity_type === "A", priorSpecialEligible: a.prior_active_participation === true })), roundWholeDollars(limit.allowed));
  return { input, activities, p, limit, allocation };
}
function project8582(pending: Pending): PaperInstance {
  const { input, activities, p, limit, allocation } = passiveProjection(pending);
  const fields: Fields = {};
  const statements: string[] = [];
  for (const [type, part, prefix] of [["A", "4", "1"], ["B", "5", "2"]] as const) {
    const selected = activities.filter((a) => a.activity_type === type);
    const totals = { income: 0, loss: 0, prior: 0, gain: 0, overall_loss: 0 };
    selected.forEach((a, i) => {
      const net = roundWholeDollars(a.current_net), prior = roundWholeDollars(a.prior_unallowed_operating);
      const row = { name: a.name, income: Math.max(0, net), loss: Math.max(0, -net), prior, gain: Math.max(0, net - prior), overall_loss: Math.max(0, prior - net) };
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += row[key];
      if (i < 5) for (const [key, value] of Object.entries(row)) fields[`part${part}_${i + 1}_${key}`] = value;
      else statements.push(...statementRows(`Form 8582 Part ${part} continuation`, [row]));
    });
    for (const [key, value] of Object.entries(totals)) fields[`part${part}_total_${key}`] = value;
    fields[`line${prefix}a`] = totals.income;
    fields[`line${prefix}b`] = totals.loss;
    fields[`line${prefix}c`] = totals.prior;
    fields[`line${prefix}d`] = totals.income - totals.loss - totals.prior;
  }
  fields.line3 = p.currentIncome - p.currentLoss - p.priorUnallowed;
  const special = Math.max(0, limit.allowed - p.currentIncome);
  if (amount(fields.line3) < 0 && amount(fields.line1d) < 0 && p.activeParticipation && (input.filing_status !== "mfs" || p.mfsLivedApartAllYear === true)) {
    fields.line4 = Math.min(Math.max(0, -amount(fields.line1d)), -amount(fields.line3));
    fields.line5 = input.filing_status === "mfs" ? 75000 : 150000;
    if (input.modified_agi === undefined) throw new Error("Form 8582 special allowance requires known modified AGI");
    fields.line6 = Math.max(0, input.modified_agi);
    fields.line7 = Math.max(0, amount(fields.line5) - amount(fields.line6));
    fields.line8 = Math.min(input.filing_status === "mfs" ? 12500 : 25000, amount(fields.line7) / 2);
    fields.line9 = special;
  }
  if (amount(fields.line3) >= 0) return { fields, statements };
  fields.line10 = p.currentIncome;
  fields.line11 = limit.allowed;
  const specialTotal = allocation.specialEligibleLosses.reduce((a, b) => a + b, 0);
  const specialAllowance = allocation.specialByActivity.reduce((a, b) => a + b, 0);
  const postTotal = allocation.postSpecialLosses.reduce((a, b) => a + b, 0);
  let part6 = 0, part7 = 0, part8 = 0;
  const table = (part: string, index: number, row: Fields) => {
    if (index < 5) for (const [key, value] of Object.entries(row)) fields[`part${part}_${index + 1}_${key}`] = value;
    else statements.push(...statementRows(`Form 8582 Part ${part} continuation`, [row]));
  };
  activities.forEach((a, i) => {
    const form = a.reporting_form?.startsWith("k1") ? "Schedule E, Part II" : "Schedule E, Part I";
    if (specialAllowance > 0 && allocation.specialEligibleLosses[i] > 0) table("6", part6++, { name: a.name, form, loss: allocation.specialEligibleLosses[i], ratio: (allocation.specialEligibleLosses[i] / specialTotal).toFixed(6), allowance: allocation.specialByActivity[i], remainder: allocation.postSpecialLosses[i] });
    if (allocation.postSpecialLosses[i] > 0) table("7", part7++, { name: a.name, form, loss: allocation.postSpecialLosses[i], ratio: (allocation.postSpecialLosses[i] / postTotal).toFixed(6), unallowed: allocation.suspended[i] });
    const grossLoss = Math.max(0, -a.current_net) + a.prior_unallowed_operating;
    if (grossLoss > 0) table("VIII", part8++, { name: a.name, form, loss: grossLoss, unallowed: allocation.suspended[i], allowed: allocation.allowed[i] });
  });
  for (const [part, totals] of [["6", { loss: specialTotal, allowance: specialAllowance, remainder: specialTotal - specialAllowance }], ["7", { loss: postTotal, unallowed: limit.suspended }], ["8", { loss: p.currentLoss + p.priorUnallowed, unallowed: limit.suspended, allowed: limit.allowed }]] as const) {
    // Part VI is completed only for an actual Part II special allowance.
    // Its remainder excludes nonactive activities that belong only in Part VII.
    if (part === "6" && part6 === 0) continue;
    for (const [key, value] of Object.entries(totals)) fields[`part${part}_total_${key}`] = value;
  }
  return { fields, statements };
}
const expenseKeys = ["advertising", "auto_travel", "cleaning", "commissions", "insurance", "legal_professional", "management", "mortgage_interest", "other_interest", "repairs", "supplies", "taxes", "utilities"] as const;
function projectRentals(year: HistoricalTaxYear, pending: Pending, filer?: FilerIdentity) {
  const input = scheduleESchema.parse(pending.schedule_e ?? {});
  const passive = pending.form8582 ? passiveProjection(pending) : undefined;
  const allowed = new Map(passive?.activities.map((a, i) => [a.activity_id, passive.allocation.allowed[i]]) ?? []);
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const items = projectScheduleEItems(input.schedule_es, year)
    .filter((item) => !isVacationHomeExcluded(item) || isInactivePersonalCarryover(item, daysInYear));
  const statements: string[] = [];
  const properties = items.map((item) => {
    if (!item.street_address || !item.city || !item.state || !item.zip) throw new Error(`Schedule E ${item.property_description} needs its identified property address`);
    const share = (item.ownership_percent ?? 100) / 100;
    const money = (n: number | undefined) => roundWholeDollars((n ?? 0) * share);
    if (isVacationHomeLimited(item) && computeExpenses(item) > item.rent_income + (item.royalties_income ?? 0)) throw new Error("Vacation-home expense limitation needs a reviewed allocated expense worksheet before printing Schedule E");
    const net = roundWholeDollars(computePropertyNet(item));
    const loss = isPassiveProperty(item) ? allowed.get(item.activity_id ?? "") : Math.max(0, -net);
    if (isPassiveProperty(item) && (net < 0 || (item.prior_unallowed_passive_operating ?? 0) > 0) && loss === undefined) throw new Error("Schedule E loss has no activity-matched Form 8582 allowance");
    const fields: Fields = { address: `${item.street_address}, ${item.city}, ${item.state} ${item.zip}`, type: item.property_type, fair_rental_days: item.fair_rental_days, personal_use_days: item.personal_use_days, qualified_joint_venture: item.qualified_joint_venture, line3: money(item.rent_income), line4: money(item.royalties_income), line18: money((item.expense_depreciation ?? 0) + (item.expense_depletion ?? 0)), line19: money((item.expense_other_lines ?? []).reduce((n, x) => n + x.amount, 0) + (item.operating_expenses_carryover ?? 0)), line20: money(computeExpenses(item)), line21: net, line22: loss ?? 0 };
    for (const key of expenseKeys) fields[`expense_${key}`] = money(item[`expense_${key}`]);
    statements.push(...statementRows(`Schedule E ${item.property_description}: line 19`, (item.expense_other_lines ?? []).map((r) => ({ description: r.description, amount: money(r.amount) }))));
    return fields;
  });
  const k1s: (ScheduleEK1Part2Row & { nonpassiveLoss?: number })[] = scheduleEK1Part2Rows(pending);
  for (const source of rows(pending.k1_partnership?.k1_partnerships)) {
    const loss = -amount(source.box1_ordinary_business);
    if (loss <= 0) continue;
    const review = record(source.ordinary_loss_limitations);
    if (source.source_tax_year !== year || review.tax_year !== year ||
      review.materially_participated !== true || review.no_prior_suspended_losses !== true ||
      review.no_other_loss_or_deduction_items !== true ||
      amount(review.basis_available_for_loss) < loss || amount(review.at_risk_available_for_loss) < loss ||
      !source.source_document_reference || !review.source_reference ||
      typeof source.partnership_ein !== "string" || typeof source.partnership_name !== "string" ||
      ![filer?.primarySSN.replaceAll("-", ""), filer?.spouse?.ssn.replaceAll("-", "")].includes(String(source.recipient_tin))) {
      throw new Error("Partnership ordinary loss needs matching owner, year, basis, at-risk and participation evidence");
    }
    k1s.push({ name: source.partnership_name, code: "P", ein: source.partnership_ein, passiveIncome: 0, nonpassiveIncome: 0, nonpassiveLoss: loss });
  }
  const total = (key: string) => properties.reduce((n, p) => n + amount(p[key]), 0);
  const propertyNet = properties.reduce((n, p) => n + Math.max(0, amount(p.line21)) - amount(p.line22), 0);
  const otherK1Net = k1s.reduce((n, r) => n + r.passiveIncome + r.nonpassiveIncome - (r.passiveLoss ?? 0) - (r.nonpassiveLoss ?? 0), 0);
  const stock = pending.form7203
    ? projectReviewedStockLoss7203(pending.form7203, pending, filer, year, propertyNet + otherK1Net)
    : undefined;
  if (stock) {
    if (stock.note) throw new Error("Historical shareholder debt requires a separately reviewed printable debt inventory");
    k1s.push({ name: stock.source.corporation_name, code: "S", ein: stock.ledger.corporation_ein, basisRequired: true, passiveIncome: 0, nonpassiveIncome: 0, nonpassiveLoss: stock.allowed });
  }
  const k1Net = otherK1Net - (stock?.allowed ?? 0);
  if (properties.length || k1s.length) reconcile(pending.schedule1?.line5_schedule_e, propertyNet + k1Net, "Schedule E line 26/41 to Schedule 1 line 5");
  const copies: PaperInstance[] = [];
  for (let start = 0; start < properties.length; start += 3) {
    const fields: Fields = { payments_made: items.some((i) => i.form_1099_payments_made), forms_1099_filed: items.every((i) => !i.form_1099_payments_made || i.form_1099_filed), line19_description: statements.length ? "See attached statement" : undefined };
    properties.slice(start, start + 3).forEach((p, i) => { for (const [k, v] of Object.entries(p)) fields[`property_${i}_${k}`] = v; });
    if (start === 0) Object.assign(fields, { line23a: total("line3"), line23b: total("line4"), line23c: total("expense_mortgage_interest"), line23d: total("line18"), line23e: total("line20"), line24: properties.reduce((n, p) => n + Math.max(0, amount(p.line21)), 0), line25: total("line22"), line26: propertyNet });
    copies.push({ fields, pages: [0], statements: start === 0 ? statements : [] });
  }
  for (let start = 0; start < k1s.length; start += 4) {
    const fields: Fields = { k1_prior_year_losses: false };
    k1s.slice(start, start + 4).forEach((r, i) => Object.assign(fields, { [`k1_${i}_name`]: r.name, [`k1_${i}_code`]: r.code, [`k1_${i}_ein`]: r.ein, [`k1_${i}_basis_required`]: r.basisRequired, [`k1_${i}_passive_income`]: r.passiveIncome, [`k1_${i}_passive_loss`]: r.passiveLoss, [`k1_${i}_nonpassive_income`]: r.nonpassiveIncome, [`k1_${i}_nonpassive_loss`]: r.nonpassiveLoss }));
    if (start === 0) Object.assign(fields, { k1_total_passive_income: k1s.reduce((n, r) => n + r.passiveIncome, 0), k1_total_nonpassive_income: k1s.reduce((n, r) => n + r.nonpassiveIncome, 0), k1_total_passive_loss: k1s.reduce((n, r) => n + (r.passiveLoss ?? 0), 0), k1_total_nonpassive_loss: k1s.reduce((n, r) => n + (r.nonpassiveLoss ?? 0), 0), k1_line30: k1s.reduce((n, r) => n + r.passiveIncome + r.nonpassiveIncome, 0), k1_line31: k1s.reduce((n, r) => n + (r.passiveLoss ?? 0) + (r.nonpassiveLoss ?? 0), 0), k1_line32: k1Net, trust_line41: propertyNet + k1Net });
    copies.push({ fields, pages: [1] });
  }
  return { copies, stock };
}
function project8962(fields: Fields): PaperInstance {
  const projected: Fields = { ...fields, pdf_fpl_alaska: fields.fpl_region === "alaska", pdf_fpl_hawaii: fields.fpl_region === "hawaii", pdf_fpl_other: fields.fpl_region === "contiguous", pdf_applicable_figure: typeof fields.applicable_figure === "number" ? fields.applicable_figure.toFixed(4) : undefined, pdf_net_premium_tax_credit: fields.net_premium_tax_credit };
  const monthly = rows(fields.monthly_ptc_rows), allocations = rows(fields.shared_policy_allocations);
  projected.pdf_line9_yes = allocations.length > 0 || fields.alternative_marriage_primary !== undefined || fields.alternative_marriage_spouse !== undefined;
  projected.pdf_line9_no = !projected.pdf_line9_yes;
  projected.pdf_line10_yes = monthly.length === 0; projected.pdf_line10_no = monthly.length > 0;
  projected.pdf_line34_yes = allocations.length > 0 && allocations.length <= 4; projected.pdf_line34_no = allocations.length > 4;
  const columns = ["premium", "slcsp", "contribution", "max_assistance", "allowed_credit", "aptc"];
  const monthCodes = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const seen = new Set<number>();
  for (const row of monthly) {
    const index = monthCodes.findIndex((m) => String(row.month_code).toLowerCase().startsWith(m.toLowerCase()));
    if (index < 0 || seen.has(index)) throw new Error("Form 8962 monthly rows need unique calendar months");
    seen.add(index);
    for (const column of columns) projected[`pdf_month_${index + 1}_${column}`] = row[column];
  }
  if (!monthly.length) ["annual_premium", "annual_slcsp", "annual_applicable_contribution", "annual_max_ptc", "annual_ptc_allowed", "annual_aptc"].forEach((key, i) => { projected[`pdf_annual_${columns[i]}`] = fields[key]; });
  allocations.slice(0, 4).forEach((r, i) => { for (const [key, value] of Object.entries(r)) projected[`pdf_allocation_${i + 1}_${key}`] = key.endsWith("_pct") && typeof value === "number" ? value.toFixed(2) : value; });
  for (const who of ["primary", "spouse"]) if (fields[`alternative_marriage_${who}`]) for (const [key, value] of Object.entries(record(fields[`alternative_marriage_${who}`]))) projected[`pdf_marriage_${who}_${key}`] = value;
  if (monthly.length) { reconcile(fields.total_premium_tax_credit, monthly.reduce((n, r) => n + amount(r.allowed_credit), 0), "Form 8962 line 24"); reconcile(fields.total_advance_ptc, monthly.reduce((n, r) => n + amount(r.aptc), 0), "Form 8962 line 25"); }
  return { fields: projected, statements: statementRows("Form 8962 Part IV allocation continuation", allocations.slice(4)) };
}
function healthInsuranceCopies(year: HistoricalTaxYear, pending: Pending, filer?: FilerIdentity): PaperInstance[] {
  const source = pending.form7206;
  if (!source) throw new Error("Self-employed health-insurance deduction requires its retained source worksheet");
  if (source.pub974_single_business) {
    const input = pub974SingleBusinessSourceSchema.parse(source.pub974_single_business);
    const result = calculatePub974SingleBusinessIterative(year, input), row = result.filing_row;
    const identity = owner(filer, false);
    if (!row || row.recipient !== "T" || row.recipient_ssn !== identity.ssn ||
      JSON.stringify(row) !== JSON.stringify(source.pub974_filing_row)) throw new Error("Publication 974 filing worksheet differs from its identified owner/source calculation");
    const businesses = projectScheduleCItems(scheduleCSchema.parse(pending.schedule_c));
    const business = input.worksheet_w.business;
    if (business.kind !== "self_employed" || businesses.length !== 1 ||
      businesses[0].business_reference !== row.business_reference ||
      businesses[0].proprietor_recipient !== TS.T ||
      computeNetProfit(businesses[0]) !== business.establishing_business_earned_income) throw new Error("Publication 974 worksheet needs its matching sole-proprietor business");
    reconcile(pending.schedule1?.line17_se_health_insurance, row.line14, "Publication 974 deduction to Schedule 1 line 17");
    reconcile(pending.form8962?.total_premium_tax_credit, amount(result.form8962_fields.total_premium_tax_credit), "Publication 974 premium credit to Form 8962 line 24");
    return [{
      fields: { ...row, recipient_name: identity.name },
      statementOnly: true, statementTitle: `${year} Publication 974 - Self-Employed Health Insurance`,
      statements: [
        `Publication 974 owner: ${identity.name}; SSN: ${identity.ssn}; business: ${row.business_reference}`,
        ...statementRows("Worksheet W", [record(row.worksheet_w)]),
        ...statementRows("Worksheet X", [record(row.worksheet_x)]),
        `Iterations: ${row.iterations}; attributable specified-policy PTC: ${row.attributable_specified_ptc}`,
        `Final self-employed health-insurance deduction, Schedule 1 line 17: ${row.line14}`,
      ],
    }];
  }
  if (source.independent_schedule_c_plans) assertIndependentOwnerHealth(pending, year, filer);
  const forms = source.independent_plan_filing_rows ? rows(source.independent_plan_filing_rows) : [source];
  const copies = forms.map((fields) => {
    const ssn = String(fields.recipient_ssn ?? "").replaceAll("-", "");
    const identity = owner(filer, ssn === filer?.spouse?.ssn.replaceAll("-", ""));
    if (ssn !== identity.ssn || typeof fields.line14 !== "number") throw new Error("Self-employed health-insurance worksheet needs computed lines and its identified owner");
    const printed: Fields = { ...fields, recipient_name: identity.name, recipient_ssn: identity.ssn, line6_pct: typeof fields.line6 === "number" ? `${fields.line6 * 100}%` : undefined };
    return { fields: printed };
  });
  reconcile(pending.schedule1?.line17_se_health_insurance, copies.reduce((total, row) => total + amount(row.fields.line14), 0), "Owner health-insurance deductions to Schedule 1 line 17");
  return copies;
}
export function projectHistoricalForm(year: HistoricalTaxYear, key: string, pending: Pending, filer?: FilerIdentity): readonly PaperInstance[] {
  const mapping = historicalMapping(year, key), raw = pending[mapping.pendingKey] ?? {};
  if (key === "f1040") {
    const f: Fields = { ...pending.general, ...raw, ...pending.eitc };
    if (year === 2021) { f.line12a_standard_or_itemized = raw.line12c_deduction_total; f.line12c_deduction_total = amount(raw.line12c_deduction_total) + amount(raw.line12f_nonitemizer_charitable); }
    f.taxpayer_can_be_claimed = f.taxpayer_can_be_claimed_as_dependent; f.spouse_can_be_claimed = f.spouse_can_be_claimed_as_dependent; f.spouse_itemizes = f.mfs_spouse_itemizing; f.taxpayer_age_65 = f.taxpayer_age_65_or_older; f.spouse_age_65 = f.spouse_age_65_or_older;
    f.line7_capital_gain = amount(raw.line7_capital_gain) + amount(raw.line7a_cap_gain_distrib);
    f.print_schedule_d_not_required = !pending.schedule_d && amount(raw.line7a_cap_gain_distrib) > 0;
    const formerSpouse = assertEstimatedPaymentLine26({ ...f, taxpayer_ssn: f.taxpayer_ssn ?? filer?.primarySSN, spouse_ssn: f.spouse_ssn ?? filer?.spouse?.ssn }, pending, year);
    if (formerSpouse) throw new Error("Historical joint-payment allocation requires its former-spouse SSN write-in and signed allocation statement");
    return [{ fields: f }];
  }
  if (key === "schedule_c") {
    const input = scheduleCSchema.parse(raw);
    const copies = projectScheduleCItems(input).map((item) => {
      assertScheduleCInterestExempt(item, CONFIG_BY_YEAR[year].smallBizGrossReceipts);
      if (amount(item.line_30_home_office) > 0 && item.home_office_method !== "simplified") throw new Error("Actual-method Schedule C home-office deduction requires unsupported historical Form 8829");
      const identity = owner(filer, item.proprietor_recipient === "S");
      const fields: Fields = { ...projectBusiness(item, 0, pending.general?.filing_status ?? pending.f1040?.filing_status), proprietor_name: identity.name, proprietor_ssn: identity.ssn };
      rows(fields.part_v_other_expenses).forEach((row, i) => {
        fields[`part_v_${i + 1}_description`] = row.description;
        fields[`part_v_${i + 1}_amount`] = row.amount;
      });
      return { fields, statements: statementRows(`Schedule C ${item.line_c_business_name ?? item.line_a_principal_business}: Part V continuation`, rows(fields.part_v_statement_rows)) };
    });
    reconcile(pending.schedule1?.line3_schedule_c, copies.reduce((total, copy) => total + amount(copy.fields.line31), 0), "Schedules C line 31 to Schedule 1 line 3");
    return copies;
  }
  if (key === "schedule_e") return projectRentals(year, pending, filer).copies;
  if (key === "schedule_a") {
    const f: Fields = { ...raw }, n = (key: string) => Math.round(amount(raw[key]));
    const agi = amount(pending.f1040?.line11_agi);
    const floor = Math.round(Math.max(0, Math.round(agi)) * 0.075);
    const stateTax = n("line_5a_state_income_tax") + n("retirement_state_local_withholding") + n("line_5a_sales_tax");
    const salt = stateTax + n("line_5b_real_estate_tax") + n("line_5c_personal_property_tax");
    const status = pending.general?.filing_status ?? pending.f1040?.filing_status;
    const saltDeduction = Math.min(salt, CONFIG_BY_YEAR[year].saltCap / (status === "mfs" ? 2 : 1));
    if (n("form8396_interest_credit_reduction") !== 0) throw new Error("Historical mortgage credit reduction requires its Form 8396 and reviewed reporting-line source");
    const insurance = year === 2021 ? n("line_8d_mortgage_insurance_allowed") : 0;
    const mortgage = n("line_8a_mortgage_interest_1098") + n("line_8b_mortgage_interest_no_1098") + n("line_8c_points_no_1098") + insurance;
    const charity = n("line_11_cash_contributions") + n("line_12_noncash_contributions") + n("line_13_contribution_carryover");
    const otherTax = rows(raw.line_6_other_tax_items);
    if (n("line_6_other_taxes") > 0 && !otherTax.length) throw new Error("Schedule A line 6 needs its reviewed tax-type descriptions");
    if (n("line_16_other_deductions") > 0) throw new Error("Schedule A line 16 requires the deduction-specific source statement and applicable supporting form");
    const total = Math.max(0, n("line_1_medical") - floor) + saltDeduction + n("line_6_other_taxes") + mortgage + n("line_9_investment_interest") + charity + n("line_15_casualty_theft_loss");
    reconcile(pending.f1040?.line12e_itemized_deductions, total, "Schedule A line 17 to Form 1040 itemized deduction");
    Object.assign(f, { agi, line_3_medical_floor: floor, line_4_medical_deduction: Math.max(0, n("line_1_medical") - floor), line_5a_state_income_tax: stateTax, line_5a_sales_tax: undefined, print_line_5a_sales_tax_election: n("line_5a_sales_tax") > 0, line_5d_salt_before_cap: salt, line_5e_salt_deduction: saltDeduction, line_7_taxes: saltDeduction + n("line_6_other_taxes"), line_8d_mortgage_insurance_allowed: insurance, line_8e_mortgage_interest: mortgage, line_10_interest: mortgage + n("line_9_investment_interest"), line_14_charity: charity, line_17_itemized: total, print_line_6_other_tax_description: otherTax.map((r) => `${r.type}: ${r.amount}`).join("; "), print_line_18_itemize_election: raw.force_itemized === true, print_line_8_mortgage_use_warning: raw.home_mortgage_nonqualifying_use_review !== undefined });
    return [{ fields: f }];
  }
  if (key === "form8582") return [project8582(pending)];
  if (key === "schedule_se") {
    const owned = assertOwnedScheduleSE(pending, year, filer);
    if (owned) return owned.instances.map((row) => ({ fields: { ...row, owner_name: owner(filer, row.recipient === "S").name } }));
    const identity = owner(filer, scheduleSeSpouseProprietor(pending, raw));
    return [{ fields: { ...raw, ...scheduleSELines(raw, CONFIG_BY_YEAR[year].ssWageBase), owner_name: identity.name, owner_ssn: identity.ssn } }];
  }
  if (key === "form8949") {
    const txs = historicalCapitalTransactions(pending).filter(historical8949Required);
    const copies: PaperInstance[] = [], identity = owner(filer, false);
    for (const part of ["A", "B", "C", "D", "E", "F"]) {
      const selected = txs.filter((t) => t.part === part), page = /^[A-C]$/.test(part) ? 1 : 2;
      for (let start = 0; start < selected.length; start += 14) {
        const chunk = selected.slice(start, start + 14), fields: Fields = { pdf_part: part, [`page${page}_name`]: identity.name, [`page${page}_ssn`]: identity.ssn };
        chunk.forEach((tx, index) => { for (const column of ["description", "date_acquired", "date_sold", "proceeds", "cost_basis", "adjustment_codes", "adjustment_amount", "gain_loss"] as const) { const value = tx[column]; fields[`pdf_page${page}_row${index + 1}_${column}`] = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}` : value; } });
        for (const column of ["proceeds", "cost_basis", "adjustment_amount", "gain_loss"] as const) fields[`pdf_page${page}_total_${column}`] = chunk.reduce((n, tx) => n + (tx[column] ?? 0), 0);
        copies.push({ fields, pages: [page - 1] });
      }
    }
    return copies;
  }
  if (key === "form8962") return [project8962(raw)];
  if (key === "form8889") {
    const forms = rows(raw.forms);
    for (const [form, target, source] of [["schedule1", "line13_hsa_deduction", "print_line13_deduction"], ["schedule2", "line17c_hsa_penalty", "print_line17b_penalty"], ["schedule2", "line17d_hsa_eligibility_tax", "print_line21"]]) {
      const total = forms.reduce((n, fields) => n + amount(fields[source]), 0);
      if (total !== 0 || pending[form]?.[target] !== undefined) reconcile(pending[form]?.[target], total, `Owner Forms 8889 to ${form}.${target}`);
    }
    return forms.map((fields) => {
      const id = owner(filer, fields.owner === "spouse");
      if (typeof fields.beneficiary_ssn !== "string" || fields.beneficiary_ssn.replaceAll("-", "") !== id.ssn) throw new Error("Form 8889 beneficiary does not match its filer");
      return { fields: { ...fields, beneficiary_name: id.name, beneficiary_ssn: id.ssn } };
    });
  }
  if (key === "form5329") {
    const calculated = calculateOwnerForms(form5329Schema.parse({ owner_entries: raw.owner_entries }));
    if (JSON.stringify(calculated.forms) !== JSON.stringify(raw.owner_forms)) throw new Error("Form 5329 printed owner rows differ from their owner-specific source");
    if (calculated.total !== 0 || pending.schedule2?.line8_form5329_tax !== undefined) reconcile(pending.schedule2?.line8_form5329_tax, calculated.total, "Owner Forms 5329 to Schedule 2 line 8");
    return calculated.forms.map((fields) => {
      const id = owner(filer, fields.owner === TS.S);
      const healthTax = amount(fields.print_hsa_line49) + amount(fields.print_archer_line41);
      reconcile(fields.print_total_tax, healthTax, "Form 5329 health-only printed tax");
      return { fields: { ...fields, owner_name: id.name, owner_ssn: id.ssn }, pages: [0, 1] };
    });
  }
  if (key === "form7203") {
    const p = projectRentals(year, pending, filer).stock;
    if (!p) throw new Error("Form 7203 has no reconciled stock-loss source");
    const id = owner(filer, p.ledger.shareholder_ssn === filer?.spouse?.ssn);
    return [{ fields: { shareholder_name: id.name, shareholder_ssn: id.ssn, corporation_name: p.source.corporation_name, corporation_ein: p.ledger.corporation_ein, ...(year === 2021 ? { stock_block_description: "Original shareholder - single stock block" } : { original_shareholder: true }), line1_beginning_basis: p.basis, line2_cash_capital_contribution: p.contribution, line5_basis_before_distributions: p.availableBasis, line7_basis_after_distributions: p.availableBasis, line10_basis_before_loss: p.availableBasis, line11_allowable_stock_loss: p.allowedStock, line14_basis_decrease: p.allowedStock, line15_ending_basis: p.availableBasis - p.allowedStock, line35_current_loss: p.currentLoss, line35_allowed_stock: p.allowedStock, line35_carryover: p.carryover, line47_current_loss: p.currentLoss, line47_allowed_stock: p.allowedStock, line47_carryover: p.carryover } }];
  }
  if (key === "form8995") {
    if (typeof raw.line15 === "number" && amount(raw.qbi_deduction) === 0) return [{ fields: { ...raw, line1_ein: raw.line1_ein ?? raw.line1_ssn } }];
    const p = assertPositive8995(raw, pending, year), fields: Fields = {};
    for (const [line, value] of Object.entries(p.lines)) fields[`line${line}`] = value;
    p.businesses.slice(0, 5).forEach((r, i) => { const prefix = ["line1", "line1ii", "line1iii", "line1iv", "line1v"][i]; Object.assign(fields, { [`${prefix}_business_name`]: r.businessName, [`${prefix}_ein`]: r.tin.value, [`${prefix}_qbi`]: r.qbi }); });
    return [{ fields, statements: statementRows("Form 8995 additional businesses (included in line 2)", p.businesses.slice(5).map((r) => ({ name: r.businessName, tin: r.tin.value, qbi: r.qbi }))) }];
  }
  if (key.startsWith("form8995a")) {
    const input = qbiASchema.parse(raw), parent = qbiASchema.parse(pending.form8995a);
    if (JSON.stringify(input) !== JSON.stringify(parent)) throw new Error("Form 8995-A companion must retain its matching parent source");
    if (input.aggregation_groups?.length || input.patron_of_specified_cooperative) throw new Error("Historical QBI aggregation/cooperative activity requires its separately reviewed supporting schedules");
    if (input.schedule_c_qbi_businesses?.some((business) => business.qbi < 0)) {
      assertScheduleCLossSources(input, pending, year);
      assertScheduleCLossFiler(input, pending, filer, year);
      const companion = qbiASchema.parse(pending.form8995a_schedule_c);
      if (JSON.stringify(input) !== JSON.stringify(companion)) throw new Error("Form 8995-A loss needs matching Schedule C source");
      const result = calculateScheduleCLossLines(input, year);
      reconcile(pending.f1040?.line13_qbi_deduction, result.parent.line39, "Form 8995-A loss parent line 39");
      const copies: PaperInstance[] = [];
      if (key === "form8995a_schedule_c") {
        for (let start = 0; start < result.schedule.rows.length; start += 3) {
          const fields: Fields = {};
          result.schedule.rows.slice(start, start + 3).forEach((row, i) => Object.assign(fields, { [`row${i + 1}_name`]: row.name, [`row${i + 1}_a`]: row.line1a, [`row${i + 1}_b`]: row.line1b, [`row${i + 1}_c`]: row.line1c }));
          if (start === 0) for (const n of [2, 3, 4, 5, 6] as const) fields[`line${n}`] = result.schedule[`line${n}`];
          copies.push({ fields });
        }
        return copies;
      }
      if (key !== "form8995a") throw new Error("Unexpected companion for QBI loss calculation");
      const first = result.businessLines.find((row) => row.business === result.positive) ?? result.businessLines[0];
      const businesses = [first, ...result.businessLines.filter((row) => row !== first)];
      for (let start = 0; start < businesses.length; start += 3) {
        const chunk = businesses.slice(start, start + 3);
        const phases = chunk.map(({ parent }) => calculateLossBusinessPhase(input.taxable_income, parent.line3, parent.line10, input.filing_status, year));
        const phase = phases.find((p) => p !== undefined);
        const fields: Fields = start === 0 ? { ...result.parent, line27: result.parent.line16, line40: 0 } : {};
        if (phase) Object.assign(fields, { line20: Math.round(input.taxable_income), line21: phase.threshold, line22: phase.excess, line23: phase.range, line24: qbiPercentageForPdf(phase.ratio) });
        chunk.forEach(({ business, parent }, i) => {
          const suffix = ["", "_b", "_c"][i], phase = phases[i];
          const phaseFields = phase ? { line12: phase.line12, line17: phase.line17, line18: phase.line18, line19: phase.line19, line25: phase.line25, line26: phase.line26 } : {};
          fields[`business_name${suffix}`] = business.business_name; fields[`business_ein${suffix}`] = business.ein;
          for (const [k, value] of Object.entries({ ...parent, ...phaseFields })) fields[`${k}${suffix}`] = value;
        });
        copies.push({ fields, pages: start > 0 && !phase ? [0] : [0, 1] });
      }
      return copies;
    }
    if (input.sstb_filing_details) {
      const companion = qbiASchema.parse(pending.form8995a_schedule_a);
      if (JSON.stringify(input) !== JSON.stringify(companion)) throw new Error("SSTB Form 8995-A needs matching Schedule A source");
      assertSstbScheduleCSource(input, pending, year, filer?.primarySSN, filer);
      const lines = calculateOneSstb8995ALines(input, year);
      reconcile(pending.f1040?.line13_qbi_deduction, lines.line39, "SSTB Form 8995-A line 39");
      if (key === "form8995a_schedule_a") return [{ fields: {
        business_name: lines.source.business_name, business_ein: lines.source.ein,
        line2: lines.source.business_qbi, line3: lines.source.business_w2_wages, line4: lines.source.business_ubia,
        line5: lines.line33, line6: lines.threshold, line7: lines.line33 - lines.threshold, line8: lines.phaseInRange,
        line9: qbiPercentageForPdf(lines.phaseIn), line10: qbiPercentageForPdf(lines.applicable),
        line11: lines.line2, line12: lines.applicableWages, line13: lines.applicableUbia,
      } }];
      if (key !== "form8995a") throw new Error("Unexpected companion for SSTB QBI calculation");
      return [{ fields: { ...lines, business_name: lines.source.business_name, business_ein: lines.source.ein, specified_service: true,
        line17: lines.line3, line18: lines.line10, line20: lines.line33, line21: lines.threshold,
        line22: lines.line33 - lines.threshold, line23: lines.phaseInRange, line24: qbiPercentageForPdf(lines.phaseIn),
        line27: lines.line16, line40: 0,
      } }];
    }
    if (key !== "form8995a") throw new Error("Historical QBI companion has no matching applicable calculation");
    const lines = calculateOneBusiness8995ALines(input, year), details = input.business_filing_details;
    if (!details) throw new Error("Form 8995-A requires identified business filing details");
    reconcile(pending.f1040?.line13_qbi_deduction, lines.line39, "Form 8995-A line 39");
    const fields: Fields = { ...lines, business_name: details.business_name, business_ein: details.ein, line27: lines.line16, line40: 0 };
    if (lines.phaseInRequired) Object.assign(fields, { line17: lines.line3, line18: lines.line10, line20: lines.line33, line21: lines.patronThreshold, line22: lines.line33 - (lines.patronThreshold ?? 0), line23: lines.patronPhaseInRange, line24: qbiPercentageForPdf(lines.phaseIn ?? 0) });
    else for (const line of [17, 18, 19, 20, 21, 22, 23, 24, 25, 26]) fields[`line${line}`] = undefined;
    return [{ fields }];
  }
  if (key === "form8880") {
    const rate = String(raw.print_line9_rate);
    if (!/^0\.[0125]$/.test(rate)) throw new Error("Form 8880 needs its computed decimal credit rate");
    return [{ fields: { ...raw, print_line9_rate: rate.slice(-1) } }];
  }
  if (key === "schedule_d") {
    const transactions = historicalCapitalTransactions(pending);
    const fields = scheduleDPdf.projectFields!(raw, {
      ...pending, form8949: { ...pending.form8949, transaction: transactions },
    });
    for (const line of ["1a", "8a"]) {
      const proceeds = amount(fields[`print_line${line}_proceeds`]), cost = amount(fields[`print_line${line}_cost`]);
      reconcile(proceeds, amount(raw[`line_${line}_proceeds`]), `Schedule D line ${line} proceeds`);
      reconcile(cost, amount(raw[`line_${line}_cost`]), `Schedule D line ${line} cost`);
      reconcile(amount(fields[`print_line${line}_gain`]), proceeds - cost, `Schedule D line ${line} gain`);
    }
    const st = ["1a", "1b", "2", "3"].reduce((sum, line) => sum + amount(fields[`print_line${line}_gain`]), 0)
      + amount(fields.line_4_other_st) + amount(fields.line_5_k1_st) - amount(fields.line_6_carryover);
    const lt = ["8a", "8b", "9", "10"].reduce((sum, line) => sum + amount(fields[`print_line${line}_gain`]), 0)
      + amount(fields.line_11_form2439) + amount(fields.line_12_k1_lt)
      + amount(fields.print_line13_cap_gain_distrib) - amount(fields.line_14_carryover);
    reconcile(raw.print_line7_st_total, st, "Schedule D line 7");
    reconcile(raw.print_line15_lt_total, lt, "Schedule D line 15");
    reconcile(raw.print_line16_combined, st + lt, "Schedule D line 16");
    const loss = amount(raw.print_line21_loss), combined = amount(raw.print_line16_combined);
    reconcile(pending.f1040?.line7_capital_gain, combined < 0 ? loss : combined, "Schedule D to Form 1040 line 7");
    if (loss < 0) fields.print_line21_loss = -loss;
    return [{ fields }];
  }
  if (key === "schedule2") {
    const fields = schedule2Pdf.projectFields!(raw, pending);
    for (const [printed, target] of [
      ["line3_additional_tax", "line17_additional_taxes"],
      ["line21_total", "line23_other_taxes"],
    ]) {
      const total = amount(fields[printed]);
      if (total !== 0 || pending.f1040?.[target] !== undefined) reconcile(pending.f1040?.[target], total, `Schedule 2 ${printed} to Form 1040 ${target}`);
    }
    return [{ fields }];
  }
  if (key === "schedule3" && (amount(raw.line10_amount_paid_extension) > 0 || amount(pending.ext?.line_7_amount_paying) > 0)) {
    const evidence = extensionPaymentEvidenceSchema.parse(pending.ext?.payment_evidence);
    const primary = filer?.primarySSN ?? pending.general?.taxpayer_ssn;
    const spouse = filer?.spouse?.ssn ?? pending.general?.spouse_ssn;
    if (evidence.tax_year !== year || evidence.primary_ssn.replaceAll("-", "") !== String(primary ?? "").replaceAll("-", "") ||
      (evidence.spouse_ssn !== undefined && evidence.spouse_ssn.replaceAll("-", "") !== String(spouse ?? "").replaceAll("-", ""))) throw new Error("Extension payment evidence must match the historical return year and filer");
    reconcile(raw.line10_amount_paid_extension, evidence.amount, "Schedule 3 extension payment");
    reconcile(pending.ext?.line_7_amount_paying, evidence.amount, "Retained extension payment amount");
    return [{ fields: raw }];
  }
  if (key === "form7206") return healthInsuranceCopies(year, pending, filer);
  if (key === "schedule1" && year < 2023 && amount(raw.line17_se_health_insurance) > 0) {
    const copies = healthInsuranceCopies(year, pending, filer);
    return [{ fields: raw, statements: copies.flatMap((row) => row.statements ?? statementRows(`${year} self-employed health-insurance deduction supporting worksheet (Form 7206 not yet introduced)`, [row.fields])) }];
  }
  if (key === "schedule_b") {
    if (raw.print_line4_total !== undefined) reconcile(pending.f1040?.line2b_taxable_interest, amount(raw.print_line4_total), "Schedule B line 4");
    if (raw.print_line6_total !== undefined) reconcile(pending.f1040?.line3b_ordinary_dividends, amount(raw.print_line6_total), "Schedule B line 6");
    const names = raw.foreign_country_names;
    if (names !== undefined && (!Array.isArray(names) || names.some((name) => typeof name !== "string" || !name.trim()))) throw new Error("Schedule B foreign country names must be nonempty");
    const fields = { ...raw, ...(Array.isArray(names) ? foreignCountryPrintFields(names, year === 2021 ? 1 : 2) : {}) };
    const adjustments = ["interest_nominee", "interest_accrued", "interest_oid_adjustment", "interest_bond_premium"].reduce((sum, key) => sum + amount(raw[key]), 0);
    if (adjustments > 0 && (typeof raw.interest_line1_subtotal !== "number" || typeof raw.print_line2_total !== "number" ||
      Math.abs(amount(raw.interest_line1_subtotal) - adjustments - amount(raw.print_line2_total)) > 0.000001)) throw new Error("Schedule B adjustment statement does not reconcile");
    if (amount(raw.dividend_nominee) > 0 && (typeof raw.dividend_line5_subtotal !== "number" || typeof raw.print_line6_total !== "number" ||
      Math.abs(amount(raw.dividend_line5_subtotal) - amount(raw.dividend_nominee) - amount(raw.print_line6_total)) > 0.000001)) throw new Error("Schedule B nominee dividends do not reconcile");
    if (!filer && (adjustments > 0 || amount(raw.dividend_nominee) > 0 ||
      fields.print_foreign_country_line1 === "See attached country statement")) throw new Error("Schedule B supporting statements require the identified filer");
    return [{ fields, statements: [...statementRows("Schedule B additional interest payers (included in line 2)", rows(raw.print_interest_rows).slice(14)), ...statementRows("Schedule B additional dividend payers (included in line 6)", rows(raw.dividend_rows).slice(15)), ...statementRows("Schedule B seller-financed interest", rows(raw.seller_financed_rows))] }];
  }
  return [{ fields: raw }];
}
