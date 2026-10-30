import { PDFDocument, StandardFonts, rgb, type PDFForm, type PDFFont } from "pdf-lib";
import type { FilerIdentity } from "../../mef/header.ts";
import { extractFilerIdentity } from "../../mef/filer.ts";
import { roundWholeDollars } from "../../whole-dollars.ts";
import { loadPdfTemplate } from "../../2025/pdf/support/template-cache.ts";
import type { PdfFieldEntry } from "../../2025/pdf/review-support/form-descriptor.ts";
import { registry } from "../../2025/registry.ts";
import { CONFIG_BY_YEAR } from "../../nodes/config/index.ts";
import { assertHistoricalOwnerLossCoverage } from "../../nodes/intermediate/forms/income/business/form461/historical-coverage.ts";
import { schedule2Part1Total, schedule2Part2Total } from "../../nodes/intermediate/aggregation/taxes/other/schedule2/index.ts";
import { inputSchema as scheduleBPartIIISchema } from "../../nodes/inputs/general/foreign/schedule_b_part_iii/index.ts";
import { scheduleBPdf } from "../../2025/pdf/forms/income/investments/schedule_b/schedule_b.ts";
import { appendScheduleBInterestAdjustmentsStatement } from "../../2025/pdf/forms/income/investments/schedule_b/schedule_b_interest_adjustments_statement.ts";
import { appendScheduleBNomineeDividendStatement } from "../../2025/pdf/forms/income/investments/schedule_b/schedule_b_nominee_dividend_statement.ts";
import { appendScheduleBForeignCountriesStatement } from "../../2025/pdf/forms/income/investments/schedule_b/schedule_b_foreign_countries_statement.ts";
import { historicalMappings, HISTORICAL_TEMPLATES, type HistoricalMapping, type HistoricalTaxYear } from "./mappings.ts";
import { projectHistoricalForm, historical8949Required, record, rows, amount, type Fields, type Pending, type PaperInstance } from "./projections.ts";
export type { HistoricalTaxYear } from "./mappings.ts";
export interface HistoricalPaperIssue { readonly code: string; readonly message: string; readonly form: string }

const ORDER = ["f1040", "schedule1", "schedule2", "schedule3", "schedule_a", "schedule_b", "schedule_c", "schedule_d", "schedule_e", "schedule_se", "form8949", "form8582", "form7203", "form6198", "form8995", "form8995a", "form8995a_schedule_a", "form8995a_schedule_b", "form8995a_schedule_c", "form8995a_schedule_d", "form8962", "form8889", "form5329", "form7206", "form8959", "form8960", "form6251", "form8880"] as const;
function meaningful(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value) || roundWholeDollars(value) !== 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.some(meaningful);
  return value !== null && typeof value === "object" && Object.values(value).some(meaningful);
}
/** A graph slot is not an attachment. Respect canonical context metadata, then
 * apply the filing/election triggers of nodes whose inputs mix context and claims. */
function unsupportedDocumentRequired(year: HistoricalTaxYear, key: string, fields: Fields): boolean {
  const node = registry[key];
  switch (key) {
    case "form_1116":
    case "form461":
    case "schedule1a":
    case "form4137":
    case "form8919":
    case "schedule_j_calculation":
    case "form8978_reporting_year": {
      const parsed = node?.inputSchema.safeParse(fields);
      if (!parsed?.success) return meaningful(fields);
      // Never discard new/unrecognized filed values while recognizing context.
      const source = record(parsed.data);
      if (Object.entries(fields).some(([field, value]) => !(field in source) && meaningful(value))) return true;
      if (key === "form_1116") return ["foreign_tax_items", "foreign_tax_redeterminations", "prior_year_carryovers", "carryover_reviews"]
        .some((field) => rows(source[field]).length > 0);
      if (key === "form461") {
        // Owner/Schedule E coverage is checked once against the final graph below.
        if (source.historical_k1_business_income_loss !== undefined) return false;
        const sum = (value: unknown): number => Array.isArray(value)
          ? value.reduce((total: number, item: unknown) => total + amount(item), 0)
          : amount(value);
        const c = sum(source.line2_schedule_c), f = sum(source.line6_schedule_f);
        const cfg = CONFIG_BY_YEAR[year];
        const threshold = source.filing_status === "mfj" ? cfg.eblThresholdMfj : cfg.eblThresholdSingle;
        // 2021-2023 Form 461 says not to attach when line16 is zero/positive.
        // The separate half-single-threshold line trigger first applies in 2024.
        return c + f < -threshold || (year >= 2024 &&
          (c < -cfg.eblThresholdSingle / 2 || f < -cfg.eblThresholdSingle / 2));
      }
      if (key === "form4137") return rows(source.forms).length > 0 ||
        rows(source.w2_tip_sources).some((row) => amount(row.allocated_tips) > 0);
      if (key === "form8919") return rows(source.forms).length > 0;
      if (key === "schedule_j_calculation") return source.elected_farm_income !== undefined;
      if (key === "form8978_reporting_year") return amount(source.negative_form8978_line14) > 0;
      // Schedule 1-A does not exist in these years. Recognized qualification
      // context is not a claim; an emitted additional deduction is checked below.
      return false;
    }
    default: {
      const context = node?.contextFields ?? [];
      return Object.entries(fields).some(([field, value]) => !context.includes(field) && meaningful(value));
    }
  }
}
function included(key: string, pending: Pending, mapping: HistoricalMapping): boolean {
  const fields = pending[mapping.pendingKey];
  if (key === "f1040") return true;
  if (key === "schedule_e") return rows(fields?.schedule_es).length > 0 || rows(pending.k1_partnership?.k1_partnerships).length > 0 || rows(pending.k1_s_corp?.k1_s_corps).length > 0 || !!pending.form7203;
  if (key === "form8949") return [pending.schedule_d?.transaction ?? fields?.transaction, pending.schedule_d?.transactions]
    .some((source) => rows(source).some(historical8949Required));
  if (key === "schedule_d" && [fields?.transaction, fields?.transactions, pending.form8949?.transaction]
    .some((source) => rows(source).length > 0)) return true;
  if (!fields) return false;
  if (key === "schedule_b") return scheduleBPdf.includeWhen!(fields, pending);
  if (key === "schedule2") return Object.values(fields).some(meaningful);
  if (key === "schedule_c") return rows(fields.schedule_cs).length > 0;
  if (key === "form7203") return meaningful(fields);
  if (key === "form8582") return rows(fields.activities).some((r) => amount(r.current_net) < 0 || amount(r.prior_unallowed_operating) > 0) || amount(fields.current_loss) > 0 || amount(fields.prior_unallowed) > 0;
  if (key === "schedule_se") return amount(pending.schedule2?.line4_se_tax) > 0;
  if (key === "form8889") return rows(fields.forms).length > 0;
  if (key === "form5329") return rows(fields.owner_forms).length > 0;
  if (key === "form7206") return amount(pending.schedule1?.line17_se_health_insurance) > 0 || amount(fields.line14) > 0 || rows(fields.independent_plan_filing_rows).length > 0;
  if (key === "form8962") return fields.annual_premium !== undefined || fields.annual_aptc !== undefined || Array.isArray(fields.monthly_ptc_rows);
  if (key === "form6251") return amount(fields.line11_amt) > 0;
  if (key === "form8880") return amount(fields.print_line12_credit) > 0;
  if (key === "form8959") return amount(fields.line18_total_tax) > 0 || amount(fields.line24_total_withheld) > 0;
  if (key === "form8960") return amount(fields.line17_niit) > 0;
  if (key === "form8995") return amount(fields.qbi_deduction) > 0 || fields.line15 !== undefined || fields.owned_s_corp_loss_source !== undefined || fields.current_k1_qbi_sources !== undefined;
  if (key === "form8995a") return amount(pending.f1040?.line13_qbi_deduction) > 0 || !!fields.business_filing_details || !!fields.sstb_filing_details || rows(fields.schedule_c_qbi_businesses).length > 0 || rows(fields.aggregation_groups).length > 0;
  if (key.startsWith("form8995a_")) return meaningful(fields);
  if (key === "schedule_a") return amount(pending.f1040?.line12e_itemized_deductions) > 0 || fields.force_itemized === true;
  return mapping.fields.some((entry) => meaningful(fields[entry.domainKey])) || mapping.unmapped.some((entry) => meaningful(fields[entry]));
}
const JOINS: readonly [string, string, string, string][] = [
  ["f1040", "line8_additional_income", "schedule1", "line10_total_additional_income"],
  ["f1040", "line10_adjustments", "schedule1", "line26_total_adjustments"],
  ["f1040", "line20_nonrefundable_credits", "schedule3", "line8_total"],
  ["f1040", "line31_additional_payments", "schedule3", "line15_total"],
  ["schedule2", "line11_additional_medicare", "form8959", "line18_total_tax"],
  ["schedule2", "line12_niit", "form8960", "line17_niit"],
  ["schedule2", "line2_amt", "form6251", "line11_amt"],
  ["schedule2", "line1a_excess_advance_premium", "form8962", "excess_advance_premium"],
  ["schedule3", "line9_premium_tax_credit", "form8962", "net_premium_tax_credit"],
  ["schedule3", "line4_retirement_savings_credit", "form8880", "print_line12_credit"],
];
function inventoryIssues(year: HistoricalTaxYear, pending: Pending): HistoricalPaperIssue[] {
  const mappings = historicalMappings(year), issues: HistoricalPaperIssue[] = [];
  const add = (form: string, message: string, code = "historical-paper-coverage") => issues.push({ form, message, code });
  try {
    assertHistoricalOwnerLossCoverage(year, pending);
  } catch (error) {
    add("form461", error instanceof Error ? error.message : String(error), "historical-owner-loss-coverage");
  }
  for (const [key, fields] of Object.entries(pending)) {
    if (key === "schedule_b_part_iii") {
      const source = scheduleBPartIIISchema.safeParse(fields);
      const printed = scheduleBPartIIISchema.safeParse(pending.schedule_b);
      if (!source.success || !printed.success || JSON.stringify(source.data) !== JSON.stringify(printed.data)) {
        add("schedule_b", "Foreign-account and trust declarations must reconcile to the printed Schedule B source", "historical-paper-reconciliation");
      }
      continue;
    }
    if (/^(form_?\d|schedule)/.test(key) && !(key === "form7206" && year < 2023) &&
      !Object.values(mappings).some((m) => m.pendingKey === key) && unsupportedDocumentRequired(year, key, fields)) {
      add(key, `${year} ${key} has a filing/election obligation but no reviewed historical printable document`);
    }
  }
  for (const [from, fromKey, to, toKey] of JOINS) {
    const value = pending[from]?.[fromKey];
    if (typeof value !== "number" || value === 0) continue;
    if (!pending[to] || typeof pending[to][toKey] !== "number") add(to, `${from}.${fromKey} requires ${to}.${toKey}`);
    else if (roundWholeDollars(value) !== roundWholeDollars(pending[to][toKey] as number)) add(to, `${from}.${fromKey} differs from ${to}.${toKey}`, "historical-paper-reconciliation");
  }
  // The graph publishes Schedule 2 totals to Form 1040, not back to itself.
  // Derive each independently from the actual source lines; never copy the 1040
  // amount into a missing schedule total merely to make a join pass.
  for (const [target, totalKey, calculate] of [
    ["line17_additional_taxes", "line3_additional_tax", schedule2Part1Total],
    ["line23_other_taxes", "line21_total", schedule2Part2Total],
  ] as const) {
    try {
      const total = calculate(pending.schedule2 ?? {}), actual = pending.f1040?.[target];
      if (total !== 0 || actual !== undefined) {
        if (typeof actual !== "number") add("schedule2", `Schedule 2 ${totalKey} requires computed Form 1040 ${target}`);
        else if (roundWholeDollars(actual) !== roundWholeDollars(total)) add("schedule2", `Form 1040 ${target} differs from independently calculated Schedule 2 ${totalKey}`, "historical-paper-reconciliation");
      }
      const retained = pending.schedule2?.[totalKey];
      if (retained !== undefined && (typeof retained !== "number" || roundWholeDollars(retained) !== roundWholeDollars(total))) add("schedule2", `Retained ${totalKey} differs from its source lines`, "historical-paper-reconciliation");
    } catch (error) {
      add("schedule2", error instanceof Error ? error.message : String(error));
    }
  }
  const f = pending.f1040;
  for (const key of ["line9_total_income", "line11_agi", "line15_taxable_income", "line16_income_tax", "line24_total_tax", "line33_total_payments"]) {
    if (typeof f?.[key] !== "number" || !Number.isFinite(f[key])) add("f1040", `${key} is unresolved; missing calculation is not a zero return`, "historical-paper-unresolved");
  }
  if (amount(f?.line13_qbi_deduction) > 0 && !pending.form8995 && !pending.form8995a) add("form8995", "Form 1040 QBI deduction requires Form 8995 or Form 8995-A");
  if (amount(pending.schedule1?.line3_schedule_c) !== 0 && !rows(pending.schedule_c?.schedule_cs).length) add("schedule_c", "Schedule 1 business income requires an identified Schedule C");
  if (amount(pending.schedule_c?.line_30_home_office) > 0 || rows(pending.schedule_c?.schedule_cs)
    .some((business) => amount(business.line_30_home_office) > 0 && business.home_office_method !== "simplified")) add("form8829", "Actual-method home-office deduction requires unsupported historical Form 8829");
  if (amount(pending.schedule1?.line5_schedule_e) !== 0 && !pending.schedule_e && !pending.form7203 && !pending.k1_partnership && !pending.k1_s_corp) add("schedule_e", "Schedule 1 rental/pass-through income requires Schedule E");
  if (amount(pending.schedule2?.line4_se_tax) > 0 && !pending.schedule_se) add("schedule_se", "Self-employment tax requires Schedule SE");
  if (amount(pending.schedule2?.line8_form5329_tax) > 0 && !pending.form5329) add("form5329", "Additional account tax requires its owner-specific Form 5329");
  if (amount(pending.schedule1?.line13_hsa_deduction) > 0 && !rows(pending.form8889?.forms).length) add("form8889", "HSA deduction requires owner-specific Form 8889");
  if (amount(pending.schedule1?.line17_se_health_insurance) > 0 && !pending.form7206) add("form7206", year >= 2023 ? "Self-employed health insurance requires its applicable owner Form 7206 or Publication 974 worksheet" : "Self-employed health insurance requires its retained deduction worksheet");
  if (year < 2023 && pending.form7206) {
    const worksheet = pending.form7206;
    const total = worksheet.pub974_filing_row
      ? amount(record(worksheet.pub974_filing_row).line14)
      : worksheet.independent_plan_filing_rows
        ? rows(worksheet.independent_plan_filing_rows).reduce((sum, row) => sum + amount(row.line14), 0)
        : amount(worksheet.line14);
    if (total > 0 && roundWholeDollars(total) !== roundWholeDollars(amount(pending.schedule1?.line17_se_health_insurance))) add("schedule1", "Pre-2023 health-insurance worksheet does not reconcile to Schedule 1 line 17", "historical-paper-reconciliation");
  }
  if (amount(f?.line12e_itemized_deductions) > 0 && !pending.schedule_a) add("schedule_a", "Itemized deduction requires Schedule A");
  if (amount(f?.line36_applied_to_2026_estimated_tax) > 0) add("f1040", "Historical estimated-tax application must identify the following year, not fixed 2026");
  for (const [form, field, required] of [
    ["schedule1", "line4_other_gains", "form4797"],
    ["schedule1", "line6_schedule_f", "schedule_f"],
    ["schedule_a", "line_9_investment_interest", "form4952"],
    ["schedule_a", "line_15_casualty_theft_loss", "form4684"],
    ["schedule_a", "line_12_noncash_contributions", "form8283"],
    ["schedule1", "line8p_excess_business_loss", "form461"],
    ["schedule2", "line5_unreported_tip_tax", "form4137"],
    ["schedule2", "line6_uncollected_8919", "form8919"],
    ["f1040", "line1c_unreported_tips", "form4137"],
    ["f1040", "line1g_wages_8919", "form8919"],
    ["f1040", "line13b_additional_deductions", "schedule1a"],
    ["f1040", "form8978_tax", "form8978"],
    ["f1040", "form8978_schedule2_line17z_reduction", "form8978"],
    ["schedule3", "line6l_form8978_credit", "form8978"],
    ["schedule3", "line1_foreign_tax_credit", "form_1116"],
  ]) if (amount(pending[form]?.[field]) > (required === "form8283" ? 500 : 0) && !mappings[required]) add(required, `${form}.${field} requires ${required}`);
  if (pending.income_tax_calculation?.schedule_j_calculated_tax !== undefined) add("schedule_j", "An elected income-averaging calculation requires Schedule J, including a zero-tax election");
  for (const [key, mapping] of Object.entries(mappings)) {
    if (!included(key, pending, mapping)) continue;
    for (const field of mapping.unmapped) if (meaningful(pending[mapping.pendingKey]?.[field])) add(mapping.pendingKey, `${year} ${mapping.pendingKey}.${field} requires an additional historical print mapping`);
  }
  return issues;
}
/** Pure document/amount diagnostics. No download, XML assembly or electronic credential is involved. */
export function historicalPaperIssues(year: HistoricalTaxYear, pending: Readonly<Record<string, Record<string, unknown>>>): readonly HistoricalPaperIssue[] {
  const normalized: Pending = { ...pending }, issues = inventoryIssues(year, normalized);
  const filer = extractFilerIdentity({ ...pending.general, ...pending.f1040 });
  for (const [key, mapping] of Object.entries(historicalMappings(year))) {
    if (!included(key, normalized, mapping)) continue;
    if (!filer && ["schedule_c", "schedule_e", "schedule_se", "form7203", "form8889", "form5329", "form8995", "form8995a"].includes(key)) continue;
    try {
      for (const instance of projectHistoricalForm(year, key, normalized, filer)) {
        for (const field of mapping.unmapped) if (meaningful(instance.fields[field])) throw new Error(`${field} has no historical printed representation`);
      }
    } catch (error) {
      issues.push({ code: "historical-paper-projection", form: mapping.pendingKey, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return issues;
}
function resolve(source: Fields, path: string): unknown {
  let value: unknown = source;
  for (const key of path.split(".")) { if (value === null || typeof value !== "object") return undefined; value = (value as Fields)[key]; }
  return value;
}
function fillEntry(form: PDFForm, font: PDFFont, entry: PdfFieldEntry, value: unknown, statements: string[]): void {
  if (value === undefined || value === null) return;
  if (entry.kind === "text") {
    if (typeof value !== "number" && typeof value !== "string") throw new Error(`${entry.domainKey} is not printable text or an amount`);
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${entry.domainKey} is not finite`);
    const field = form.getTextField(entry.pdfField);
    let text = typeof value === "number" ? roundWholeDollars(value).toString() : value;
    if (typeof value === "number" && value === 0 && !entry.printZero) return;
    const rect = field.acroField.getWidgets()[0].getRectangle();
    const max = field.getMaxLength();
    let size = Math.min(10, rect.height - 2);
    if (text.length && font.widthOfTextAtSize(text, size) > rect.width - 3) size = Math.max(5, size * (rect.width - 3) / font.widthOfTextAtSize(text, size));
    if ((max !== undefined && text.length > max) || font.widthOfTextAtSize(text, size) > rect.width - 3) {
      if (typeof value === "number") throw new Error(`${entry.domainKey} exceeds its printed numeric field capacity`);
      statements.push(`${entry.domainKey}: ${text}`); text = "See statement"; size = 6;
      if (max !== undefined && text.length > max) throw new Error(`${entry.domainKey} exceeds its printed field capacity`);
    }
    field.setFontSize(size); field.setText(text);
    if (field.getText() !== text) throw new Error(`${entry.domainKey}: PDF text readback differs`);
  } else if (entry.kind === "radio") {
    const selected = entry.valueMap[String(value)];
    if (!selected) throw new Error(`${entry.domainKey}: unsupported printed radio value`);
    form.getRadioGroup(entry.pdfField).select(selected);
  } else {
    if (entry.kind === "checkbox" && typeof value !== "boolean") throw new Error(`${entry.domainKey}: checkbox needs a boolean`);
    const checked = entry.kind === "checkbox" ? value === true : String(value) === entry.whenValue;
    const box = form.getCheckBox(entry.pdfField); checked ? box.check() : box.uncheck();
    if (box.isChecked() !== checked) throw new Error(`${entry.domainKey}: PDF checkbox readback differs`);
  }
}
async function appendStatements(document: PDFDocument, title: string, lines: readonly string[], filer?: FilerIdentity): Promise<void> {
  if (!lines.length) return;
  const font = await document.embedFont(StandardFonts.Helvetica), bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([612, 792]), y = 690;
  const header = () => { page.drawText(title, { x: 36, y: 748, size: 12, font: bold }); if (filer) page.drawText(`${filer.fullName ?? filer.nameLine1}  ${filer.primarySSN}`, { x: 36, y: 726, size: 10, font }); };
  header();
  for (const line of lines) {
    const words = line.replaceAll(/[\r\n]+/g, " ").split(" ");
    let wrapped = "";
    const emit = () => { if (y < 45) { page = document.addPage([612, 792]); y = 690; header(); } page.drawText(wrapped, { x: 36, y, size: 9, font }); y -= 13; wrapped = ""; };
    for (const word of words) {
      const next = wrapped ? `${wrapped} ${word}` : word;
      if (font.widthOfTextAtSize(next, 9) > 536 && wrapped) emit();
      if (font.widthOfTextAtSize(word, 9) <= 536) wrapped = wrapped ? `${wrapped} ${word}` : word;
      else for (const character of word) {
        if (font.widthOfTextAtSize(wrapped + character, 9) > 536) emit();
        wrapped += character;
      }
    }
    if (wrapped) emit(); y -= 4;
  }
}
async function fillHistoricalTemplate(year: HistoricalTaxYear, mapping: HistoricalMapping, instance: PaperInstance, filer: FilerIdentity | undefined, cacheDir: string): Promise<{ bytes: Uint8Array; statements: string[] }> {
  const source = HISTORICAL_TEMPLATES[year][mapping.template];
  if (!source || source.year !== year) throw new Error(`Missing pinned ${year} IRS template ${mapping.template}`);
  const bytes = await loadPdfTemplate(source.url, cacheDir, source.sha256);
  const document = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }), form = document.getForm();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const selected = instance.pages ?? document.getPageIndices(), statements = [...(instance.statements ?? [])];
  for (const [name, evidence] of Object.entries(mapping.fieldEvidence)) {
    const field = form.getField(name), widget = field.acroField.getWidgets()[0], r = widget.getRectangle();
    const page = document.getPages()[evidence.page];
    if (!page) throw new Error(`${mapping.template}: pinned field page is absent`);
    const actual = [r.x, page.getHeight() - r.y - r.height, r.x + r.width, page.getHeight() - r.y];
    if (actual.some((v, i) => Math.abs(v - evidence.rect[i]) > 0.2)) throw new Error(`${mapping.template}: widget ${name} differs from reviewed historical geometry`);
  }
  for (const entry of mapping.fields) {
    if (!selected.includes(mapping.fieldEvidence[entry.pdfField].page)) continue;
    fillEntry(form, font, entry, instance.fields[entry.domainKey] ?? (entry.kind === "text" && entry.fallbackDomainKey ? instance.fields[entry.fallbackDomainKey] : undefined), statements);
  }
  if (filer) {
    const joint = filer.filingStatus === 2, separate = filer.filingStatus === 3;
    const spouseName = filer.spouse ? [filer.spouse.firstName, filer.spouse.middleInitial, filer.spouse.lastName].filter(Boolean).join(" ") : undefined;
    const identity: Fields = {
      ...filer,
      spouse: joint || separate ? filer.spouse : undefined,
      spouseFirstNameWithInitial: joint && filer.spouse ? [filer.spouse.firstName, filer.spouse.middleInitial].filter(Boolean).join(" ") : undefined,
      jointSpouseLastName: joint ? filer.spouse?.lastName : undefined,
      mfsSpouseName: separate ? spouseName : undefined,
      nameShownOnForm1040: joint && spouseName ? `${filer.fullName ?? filer.nameLine1} and ${spouseName}` : filer.fullName ?? filer.nameLine1,
    };
    for (const entry of mapping.filerFields) if (selected.includes(mapping.fieldEvidence[entry.pdfField].page)) fillEntry(form, font, entry, resolve(identity, entry.domainKey), statements);
  }
  for (const field of mapping.unmapped) if (meaningful(instance.fields[field])) throw new Error(`${year} ${mapping.pendingKey}.${field} has no historical printed representation`);
  form.updateFieldAppearances(font); form.flatten();
  if (mapping.pendingKey === "form8962" && instance.fields.qsehra_ind === true) {
    const annotation = mapping.qsehraAnnotation;
    if (!annotation) throw new Error(`${year} Form 8962 QSEHRA needs its reviewed top-margin annotation`);
    const page = document.getPages()[annotation.page];
    page.drawText("QSEHRA", { x: annotation.x, y: page.getHeight() - annotation.top, size: 10, font });
  }
  const output = await PDFDocument.create();
  for (const page of await output.copyPages(document, [...selected])) output.addPage(page);
  return { bytes: await output.save(), statements };
}
/** Build an unsigned paper review packet, never a MeF envelope or a signed return. */
export async function buildHistoricalPdfBytes(year: HistoricalTaxYear, pending: Record<string, unknown>, filer: FilerIdentity | undefined, options: { readonly draft?: boolean; readonly cacheDir?: string; readonly issues?: readonly HistoricalPaperIssue[] } = {}): Promise<Uint8Array> {
  const normalized: Pending = Object.fromEntries(Object.entries(pending).map(([key, value]) => [key, record(value)]));
  const issues = [...inventoryIssues(year, normalized), ...(options.issues ?? [])], mappings = historicalMappings(year);
  if (!filer) issues.push({ code: "historical-paper-identity", form: "f1040", message: "An unsigned paper return requires the actual identified filer, address and filing status" });
  const sourceIdentity = extractFilerIdentity({ ...normalized.general, ...normalized.f1040 });
  if (filer && sourceIdentity && (sourceIdentity.primarySSN !== filer.primarySSN.replaceAll("-", "") || sourceIdentity.filingStatus !== filer.filingStatus ||
    sourceIdentity.spouse?.ssn.replaceAll("-", "") !== filer.spouse?.ssn.replaceAll("-", ""))) {
    issues.push({ code: "historical-paper-identity", form: "f1040", message: "Printed filer differs from the computed return identity or filing status" });
  }
  if (!options.draft && issues.length) throw new Error(issues.map((i) => `${i.form}: ${i.message}`).join("\n"));
  const projected: { key: string; mapping: HistoricalMapping; instances: readonly PaperInstance[] }[] = [];
  for (const key of ORDER) {
    const mapping = mappings[key];
    if (!mapping || !included(key, normalized, mapping)) continue;
    try {
      const instances = projectHistoricalForm(year, key, normalized, filer);
      if (!instances.length && meaningful(normalized[mapping.pendingKey])) throw new Error("Required source has no printable instances");
      for (const instance of instances) for (const field of mapping.unmapped) if (meaningful(instance.fields[field])) throw new Error(`${year} ${mapping.pendingKey}.${field} has no historical printed representation`);
      projected.push({ key, mapping, instances });
    } catch (error) {
      if (!options.draft) throw error;
      issues.push({ code: "historical-paper-projection", form: mapping.pendingKey, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const merged = await PDFDocument.create();
  for (const { key, mapping, instances } of projected) for (const instance of instances) {
    if (instance.statementOnly) {
      await appendStatements(merged, instance.statementTitle ?? `${year} ${key} supporting worksheet`, instance.statements ?? [], filer);
      continue;
    }
    // A fetch/integrity failure remains an explicit failure even in draft mode.
    const filled = await fillHistoricalTemplate(year, mapping, instance, filer, options.cacheDir ?? ".pdf-cache/historical");
    const pdf = await PDFDocument.load(filled.bytes);
    for (const page of await merged.copyPages(pdf, pdf.getPageIndices())) merged.addPage(page);
    await appendStatements(merged, `${year} ${key} supporting statement`, filled.statements, filer);
    if (key === "schedule_b") {
      await appendScheduleBInterestAdjustmentsStatement(merged, instance.fields, filer, year);
      await appendScheduleBNomineeDividendStatement(merged, instance.fields, filer, year);
      await appendScheduleBForeignCountriesStatement(merged, instance.fields, filer, year);
    }
  }
  if (options.draft) {
    const uniqueIssues = [...new Map(issues.map((i) => [`${i.code}:${i.form}:${i.message}`, i])).values()];
    await appendStatements(merged, `${year} DRAFT - NOT FOR FILING: unresolved items`, uniqueIssues.length ? uniqueIssues.map((i) => `${i.code} / ${i.form}: ${i.message}`) : ["Diagnostic draft requested. Not signed, submitted or accepted."], filer);
    const font = await merged.embedFont(StandardFonts.HelveticaBold);
    for (const page of merged.getPages()) { page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: 23, color: rgb(1, 0.9, 0.9) }); page.drawText("DRAFT - NOT FOR FILING", { x: 150, y: 7, size: 16, font, color: rgb(0.75, 0, 0) }); }
  }
  if (merged.getPageCount() === 0) throw new Error("Historical paper packet contains no printable IRS form");
  merged.setTitle(`Federal Form 1040 ${year} - ${options.draft ? "DRAFT - NOT FOR FILING" : "Unsigned paper review copy"}`);
  merged.setSubject("Preparation only; not signed, mailed, transmitted or accepted");
  return merged.save();
}
