import { test, expect } from "bun:test";
import { buildHistoricalPdfBytes, historicalPaperIssues } from "./builder.ts";
import { HISTORICAL_TEMPLATES, historicalMapping } from "./mappings.ts";
import { PDFDocument } from "pdf-lib";
import { syntheticFiler as filer, syntheticPaperPending as syntheticPending, syntheticMixedStockRental, syntheticPub974Inputs } from "./fixtures.ts";
import { projectHistoricalForm } from "./projections.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeF1040Return } from "../../2025/return-processing/execute_return.ts";
import type { HistoricalTaxYear } from "./mappings.ts";
import { calculateOwnerForms } from "../../nodes/intermediate/forms/taxes/retirement/form5329/index.ts";
import { TS } from "../../nodes/types.ts";
import { appendScheduleBNomineeDividendStatement } from "../../2025/pdf/forms/income/investments/schedule_b/schedule_b_nominee_dividend_statement.ts";

function executedWageReturn(year: HistoricalTaxYear) {
  return executeF1040Return({
    general: {
      filing_status: "single", taxpayer_first_name: "Alex", taxpayer_middle_initial: "Q",
      taxpayer_last_name: "Example", taxpayer_ssn: filer.primarySSN, taxpayer_dob: "1985-06-15",
      address_line1: filer.address.line1, address_city: filer.address.city,
      address_state: filer.address.state, address_zip: filer.address.zip, digital_assets: false,
    },
    w2: [{
      employer_name: "Synthetic Employer", employer_ein: "120000002", employee_ssn: filer.primarySSN,
      box1_wages: 40000, box2_fed_withheld: 4500, box3_ss_wages: 40000,
      box4_ss_withheld: 2480, box5_medicare_wages: 40000, box6_medicare_withheld: 580,
    }],
  }, { taxYear: year, formType: "f1040" });
}

async function packetText(bytes: Uint8Array, format = "-layout"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "historical-readback-"));
  try {
    const path = join(dir, "return.pdf");
    await writeFile(path, bytes);
    const process = Bun.spawn(["pdftotext", format, path, "-"], { stdout: "pipe", stderr: "pipe" });
    const text = await new Response(process.stdout).text();
    expect(await process.exited).toBe(0);
    return text;
  } finally { await rm(dir, { recursive: true, force: true }); }
}


for (const year of [2021, 2022, 2023, 2024] as const) {
  test(`${year} paper diagnoses required missing schedules synchronously`, () => {
    expect(historicalPaperIssues(year, { f1040: { line8_additional_income: 1000 } })
      .some((issue) => issue.form === "schedule1")).toBe(true);
    expect(historicalPaperIssues(year, { f1040: { line13_qbi_deduction: 1000 } })
      .some((issue) => issue.form === "form8995")).toBe(true);
  });
  test(`${year} paper never drops unsupported nonzero documents`, () => {
    expect(historicalPaperIssues(year, { f1040: {}, form9999: { tax: 100 } })
      .some((issue) => issue.form === "form9999")).toBe(true);
    expect(historicalPaperIssues(year, { f1040: {}, schedule1a: { deduction: 100 } })
      .some((issue) => issue.form === "schedule1a")).toBe(true);
  });
  test(`${year} official IRS packet prints an unsigned identified actual-year return`, async () => {
    const bytes = await buildHistoricalPdfBytes(year, syntheticPending(year), filer);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toContain(`${year}`);
    expect(pdf.getTitle()).toContain("Unsigned");
    const dir = await mkdtemp(join(tmpdir(), "historical-paper-"));
    try {
      const path = join(dir, "return.pdf");
      await writeFile(path, bytes);
      const process = Bun.spawn(["pdftotext", "-layout", path, "-"], { stdout: "pipe", stderr: "pipe" });
      const text = await new Response(process.stdout).text();
      expect(await process.exited).toBe(0);
      expect(text).toContain(String(year));
      expect(text).toContain("Alex Q");
      expect(text).toContain("Example");
      expect(text).toContain("1000");
      expect(text).toContain("321");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}


test("2021 charitable print projection keeps separate 12a/12b/12c amounts", () => {
  const source = syntheticPending(2021);
  const [page] = projectHistoricalForm(2021, "f1040", {
    f1040: { ...source.f1040, line12f_nonitemizer_charitable: 300 },
  }, filer);
  expect(page.fields.line12a_standard_or_itemized).toBe(12550);
  expect(page.fields.line12f_nonitemizer_charitable).toBe(300);
  expect(page.fields.line12c_deduction_total).toBe(12850);
  expect(source.f1040.line12c_deduction_total).toBe(12550);
});

test("historical 8949 uses fourteen-row pages without losing overflow", () => {
  const transaction = Array.from({ length: 31 }, (_, i) => ({
    part: "C", description: `Synthetic asset ${i + 1}`, date_acquired: "2023-01-01",
    date_sold: "2023-06-30", proceeds: 110, cost_basis: 100, gain_loss: 10,
    is_long_term: false,
  }));
  const pages = projectHistoricalForm(2023, "form8949", { form8949: { transaction } }, filer);
  expect(pages).toHaveLength(3);
  expect(pages.map((p) => p.fields.pdf_page1_total_gain_loss)).toEqual([140, 140, 30]);
  expect(pages[2].fields.pdf_page1_row3_description).toBe("Synthetic asset 31");
  expect(pages.every((p) => p.pages?.[0] === 0)).toBe(true);
});

test("ordinary export rejects unresolved documents while draft visibly inventories them", async () => {
  const pending = { ...syntheticPending(2023), form9999: { tax: 17 } };
  await expect(buildHistoricalPdfBytes(2023, pending, filer)).rejects.toThrow("form9999");
  const draft = await PDFDocument.load(await buildHistoricalPdfBytes(2023, pending, filer, { draft: true }));
  expect(draft.getPageCount()).toBeGreaterThan(2);
  expect(draft.getTitle()).toContain("NOT FOR FILING");
});

test("a changed cached IRS template fails explicitly and never substitutes another year", async () => {
  const dir = await mkdtemp(join(tmpdir(), "historical-template-"));
  try {
    const source = HISTORICAL_TEMPLATES[2023].f1040;
    const slug = source.url.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
    await writeFile(join(dir, `${slug}.pdf`), "%PDF-1.7 altered bytes");
    await expect(buildHistoricalPdfBytes(2023, syntheticPending(2023), filer, { cacheDir: dir })).rejects.toThrow("digest mismatch");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

for (const year of [2021, 2022, 2023, 2024] as const) {
  test(`${year} mixed rental and owner loss reconcile one Schedule E and Form 7203`, () => {
    const pending = syntheticMixedStockRental(year);
    const scheduleE = projectHistoricalForm(year, "schedule_e", pending, filer);
    expect(scheduleE).toHaveLength(2);
    expect(scheduleE[0].fields.line26).toBe(5000);
    expect(scheduleE[1].fields.k1_0_nonpassive_loss).toBe(3000);
    expect(scheduleE[1].fields.trust_line41).toBe(2000);
    const [basis] = projectHistoricalForm(year, "form7203", pending, filer);
    expect(basis.fields.line35_allowed_stock).toBe(3000);
    expect(basis.fields.line35_carryover).toBe(1000);
    expect(() => projectHistoricalForm(year, "schedule_e", {
      ...pending, schedule1: { ...pending.schedule1, line5_schedule_e: 1999 },
    }, filer)).toThrow("must match Schedule 1 line 5");
  });

  test(`${year} Schedule C other expenses use historical 27a, not current-year 27b`, () => {
    const map = historicalMapping(year, "schedule_c");
    expect(map.fields.find((e) => e.domainKey === "line27b")?.pdfField).toContain("f1_39[0]");
    expect(map.fields.some((e) => e.domainKey === "part_v_9_amount")).toBe(true);
  });
}

test("draft inventory retains parent source issues even when local amounts reconcile", async () => {
  const bytes = await buildHistoricalPdfBytes(2024, syntheticPending(2024), filer, {
    draft: true, issues: [{ code: "missing-source", form: "general", message: "Synthetic completeness review unresolved" }],
  });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(3);
});

test("historical covered-basis transactions are not duplicated on Form 8949", () => {
  const copies = projectHistoricalForm(2023, "form8949", { form8949: { transaction: [{
    part: "A", description: "Synthetic covered shares", date_acquired: "2023-01-01",
    date_sold: "2023-06-30", proceeds: 110, cost_basis: 100, gain_loss: 10, is_long_term: false,
  }] } }, filer);
  expect(copies).toEqual([]);
});

test("historical Form 8880 prints only the digit after its preprinted decimal", () => {
  const [copy] = projectHistoricalForm(2021, "form8880", { form8880: { print_line9_rate: "0.5", print_line12_credit: 500 } }, filer);
  expect(copy.fields.print_line9_rate).toBe("5");
});

test("historical itemized source rows print the actual capped totals", () => {
  const [copy] = projectHistoricalForm(2023, "schedule_a", {
    f1040: { line11_agi: 120000, line12e_itemized_deductions: 28000 },
    general: { filing_status: "single" },
    schedule_a: { line_1_medical: 10000, line_5a_state_income_tax: 18000,
      line_8a_mortgage_interest_1098: 15000, line_11_cash_contributions: 2000 },
  }, filer);
  expect(copy.fields.line_3_medical_floor).toBe(9000);
  expect(copy.fields.line_5d_salt_before_cap).toBe(18000);
  expect(copy.fields.line_5e_salt_deduction).toBe(10000);
  expect(copy.fields.line_17_itemized).toBe(28000);
});

test("spouse HSA excise packet identifies the spouse and retains both form pages", () => {
  const joint = { ...filer, filingStatus: 2 as const,
    spouse: { firstName: "Sam", lastName: "Example", ssn: "000334444", nameControl: "EXAM" } };
  const owner_entries = [{ owner: TS.S, hsa_part_vii: {
    line42_prior_excess: 0, line43_unused_contribution_room: 0,
    line44_taxable_distributions: 0, line47_current_year_excess: 1000, december_31_value: 4000,
  } }];
  const owner_forms = calculateOwnerForms({ owner_entries }).forms;
  const [copy] = projectHistoricalForm(2024, "form5329", {
    form5329: { owner_entries, owner_forms }, schedule2: { line8_form5329_tax: 60 },
  }, joint);
  expect(copy.fields.owner_ssn).toBe("000334444");
  expect(copy.fields.owner_name).toBe("Sam Example");
  expect(copy.pages).toEqual([0, 1]);
});

test("historical accepted extension payment retains actual following-year date and owner", () => {
  const pending = {
    schedule3: { line10_amount_paid_extension: 1000 },
    ext: { line_7_amount_paying: 1000, payment_evidence: {
      tax_year: 2024, primary_ssn: filer.primarySSN, payment_date: "2025-10-15", amount: 1000,
      payment_confirmation_reference: "Synthetic payment confirmation",
      extension_request_reference: "Synthetic accepted extension", extension_request_accepted_confirmed: true,
    } },
  };
  expect(projectHistoricalForm(2024, "schedule3", pending, filer)[0].fields.line10_amount_paid_extension).toBe(1000);
  expect(() => projectHistoricalForm(2023, "schedule3", pending, filer)).toThrow("historical return year and filer");
});

for (const year of [2021, 2022, 2023, 2024] as const) {
  test(`${year} real wage engine context does not invent required paper documents`, async () => {
    const { pending } = executedWageReturn(year);
    expect(pending.f1040.line1z_total_wages).toBe(40000);
    expect(pending.f1040.line25a_w2_withheld).toBe(4500);
    expect(historicalPaperIssues(year, pending)).toEqual([]);
    const bytes = await buildHistoricalPdfBytes(year, { ...pending }, filer);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
  });

  test(`${year} actual unsupported obligations remain blocked beside ordinary engine context`, () => {
    const { pending } = executedWageReturn(year);
    const obligations: readonly [string, Record<string, unknown>][] = [
      ["form461", { ...pending.form461, line2_schedule_c: -1000000 }],
      ["form4137", { ...pending.form4137, forms: [{ recipient: "taxpayer", employers: [{ name: "Synthetic tips", tips_received: 100, tips_reported: 0 }] }] }],
      ["form8919", { ...pending.form8919, forms: [{ recipient: "taxpayer", employers: [{ name: "Synthetic wages", wages: 1000 }] }] }],
      ["schedule_j_calculation", { ...pending.schedule_j_calculation, elected_farm_income: 1000 }],
      ["form8978_reporting_year", { ...pending.form8978_reporting_year, negative_form8978_line14: 100 }],
      ["schedule1a", { ...pending.schedule1a, deduction: 100 }],
    ];
    for (const [form, fields] of obligations) {
      expect(historicalPaperIssues(year, { ...pending, [form]: fields })
        .some((issue) => issue.form === form && issue.code === "historical-paper-coverage")).toBe(true);
    }
    for (const [node, field, form] of [
      ["schedule2", "line5_unreported_tip_tax", "form4137"],
      ["schedule2", "line6_uncollected_8919", "form8919"],
      ["schedule1", "line8p_excess_business_loss", "form461"],
      ["f1040", "line13b_additional_deductions", "schedule1a"],
      ["f1040", "form8978_tax", "form8978"],
      ["schedule3", "line6l_form8978_credit", "form8978"],
    ]) {
      expect(historicalPaperIssues(year, { ...pending, [node]: { ...pending[node], [field]: 100 } })
        .some((issue) => issue.form === form && issue.code === "historical-paper-coverage")).toBe(true);
    }
  });
}


for (const [year, lineTrigger] of [[2021, 262000], [2022, 270000], [2023, 289000], [2024, 152500]] as const) {
  test(`${year} Form 461 attachment follows its actual-year filing boundary`, () => {
    const { pending } = executedWageReturn(year);
    const form461 = { filing_status: "single", line2_schedule_c: -lineTrigger, line6_schedule_f: 0 };
    expect(historicalPaperIssues(year, { ...pending, form461 })
      .some((issue) => issue.form === "form461")).toBe(false);
    expect(historicalPaperIssues(year, { ...pending, form461: { ...form461, line2_schedule_c: -lineTrigger - 1 } })
      .some((issue) => issue.form === "form461" && issue.code === "historical-paper-coverage")).toBe(true);
    // Positive business income and a reviewed small loss do not themselves require the form.
    for (const net of [10000, -10000]) expect(historicalPaperIssues(year, {
      ...pending, form461: { ...form461, line2_schedule_c: net },
    }).some((issue) => issue.form === "form461")).toBe(false);
  });

  test(`${year} allocated tips cannot be hidden as ordinary W-2 context`, () => {
    const { pending } = executedWageReturn(year);
    const issues = historicalPaperIssues(year, {
      ...pending,
      form4137: { taxpayer_ssn: filer.primarySSN, w2_tip_sources: [{
        employee_ssn: filer.primarySSN, allocated_tips: 1000, ss_wages_and_tips: 40000,
      }] },
    });
    expect(issues.some((issue) => issue.form === "form4137" && issue.code === "historical-paper-coverage")).toBe(true);
  });
}

test("Marketplace repayment prints calculated Schedule 2 totals and rejects a changed Form 1040 amount", () => {
  const { pending, diagnostics } = executeF1040Return({
    general: {
      filing_status: "single", taxpayer_first_name: "Alex", taxpayer_last_name: "Example",
      taxpayer_ssn: filer.primarySSN, taxpayer_dob: "1985-06-15", digital_assets: false,
      address_line1: filer.address.line1, address_city: filer.address.city,
      address_state: "MA", address_zip: "02108",
      ptc_residence_states: ["MA"], ptc_residence_months: Array(12).fill("MA"),
    },
    w2: [{
      employer_name: "Synthetic Employer", employer_ein: "120000002", employee_ssn: filer.primarySSN,
      box1_wages: 40000, box2_fed_withheld: 4500, box3_ss_wages: 40000,
      box4_ss_withheld: 2480, box5_medicare_wages: 40000, box6_medicare_withheld: 580,
    }],
    f1095a: [{
      issuer_name: "Synthetic Marketplace", policy_number: "JAN-2023",
      recipient_ssn: filer.primarySSN, coverage_state: "MA", covered_individual_ssns: [filer.primarySSN],
      monthly_premiums: [500, ...Array(11).fill(0)],
      monthly_slcsps: [550, ...Array(11).fill(0)],
      monthly_aptcs: [400, ...Array(11).fill(0)],
    }],
  }, { taxYear: 2023, formType: "f1040" });
  expect(diagnostics).toEqual([]);
  expect(pending.form8962.excess_advance_premium).toBe(42);
  expect(pending.f1040.line17_additional_taxes).toBe(42);
  expect(historicalPaperIssues(2023, pending)).toEqual([]);
  expect(projectHistoricalForm(2023, "schedule2", pending, filer)[0].fields.line3_additional_tax).toBe(42);
  expect(historicalPaperIssues(2023, {
    ...pending, f1040: { ...pending.f1040, line17_additional_taxes: 43 },
  }).some((issue) => issue.form === "schedule2" && issue.code === "historical-paper-reconciliation")).toBe(true);
});

test("historical required-document inventory distinguishes foreign-credit context from Form 1116 obligations", () => {
  const { pending } = executedWageReturn(2023);
  expect(historicalPaperIssues(2023, pending)).toEqual([]);
  for (const form_1116 of [
    { ...pending.form_1116, foreign_tax_paid: 400 },
    { ...pending.form_1116, foreign_tax_items: [{ foreign_tax_paid: 400, foreign_gross_income: 10000, income_category: "passive" }] },
  ]) expect(historicalPaperIssues(2023, { ...pending, form_1116 })
    .some((issue) => issue.form === "form_1116")).toBe(true);
  expect(historicalPaperIssues(2023, {
    ...pending, schedule3: { ...pending.schedule3, line1_foreign_tax_credit: 400 },
  }).some((issue) => issue.form === "form_1116")).toBe(true);
});

test("actual-method home-office deduction cannot omit Form 8829", () => {
  const pending = { schedule_c: { schedule_cs: [{
    line_a_principal_business: "Synthetic consulting", line_b_business_code: "541990",
    proprietor_recipient: "T", line_f_accounting_method: "cash",
    line_g_material_participation: true, line_i_made_1099_payments: false,
    line_1_gross_receipts: 300, line_30_home_office: 100, home_office_method: "actual",
  }] }, schedule1: { line3_schedule_c: 200 } };
  expect(() => projectHistoricalForm(2023, "schedule_c", pending, filer)).toThrow("8829");
});

test("Schedule E uses signed half-dollar rounding on losses and rejects a mismatched return total", () => {
  const rental = { ...syntheticMixedStockRental(2023).schedule_e.schedule_es[0],
    activity_type: "C", rent_income: 1000, expense_repairs: 1100.5 };
  const pending = { schedule_e: { schedule_es: [rental] }, schedule1: { line5_schedule_e: -100.5 } };
  const [copy] = projectHistoricalForm(2023, "schedule_e", pending, filer);
  expect(copy.fields.property_0_line20).toBe(1101);
  expect(copy.fields.property_0_line21).toBe(-101);
  expect(copy.fields.line26).toBe(-101);
  expect(() => projectHistoricalForm(2023, "schedule_e", {
    ...pending, schedule1: { line5_schedule_e: -100 },
  }, filer)).toThrow("does not reconcile");
});

for (const year of [2021, 2022, 2023, 2024] as const) {
  test(`${year} Schedule 2 independently derives Part II totals and rejects changed Form 1040 tax`, () => {
    const pending = {
      ...syntheticPending(year),
      f1040: { ...syntheticPending(year).f1040, line23_other_taxes: 220 },
      schedule2: { uncollected_fica: 100, uncollected_fica_gtl: 20, section409a_excise: 100 },
    };
    expect(historicalPaperIssues(year, pending)).toEqual([]);
    const [copy] = projectHistoricalForm(year, "schedule2", pending, filer);
    expect(copy.fields.line13_uncollected_fica_total).toBe(120);
    expect(copy.fields.line17h_nqdc_total).toBe(100);
    expect(copy.fields.line18_other_additional_taxes).toBe(100);
    expect(copy.fields.line21_total).toBe(220);
    expect(historicalPaperIssues(year, { ...pending, f1040: { ...pending.f1040, line23_other_taxes: 219 } })
      .some((issue) => issue.form === "schedule2" && issue.code === "historical-paper-reconciliation")).toBe(true);
    expect(() => projectHistoricalForm(year, "schedule2", {
      ...pending, f1040: { ...pending.f1040, line23_other_taxes: 219 },
    }, filer)).toThrow("does not reconcile");
  });

  test(`${year} Schedule B preserves foreign countries and gross-to-net adjustment statements`, async () => {
    const pending = { ...syntheticPending(year),
      f1040: { ...syntheticPending(year).f1040, line2b_taxable_interest: 1900, line3b_ordinary_dividends: 900 },
      schedule_b: {
        print_interest_rows: [{ payer: "Synthetic bank", amount: 2000 }],
        interest_line1_subtotal: 2000, interest_nominee: 40, interest_accrued: 10,
        interest_oid_adjustment: 20, interest_bond_premium: 30,
        print_line2_total: 1900, print_line4_total: 1900,
        dividend_rows: [{ payer: "Synthetic fund", amount: 1000 }],
        dividend_line5_subtotal: 1000, dividend_nominee: 100, print_line6_total: 900,
        foreign_accounts_question: true, fincen_form114_required: true, foreign_trust_question: false,
        foreign_country_names: ["Canada", "France", "Germany", "United Kingdom", "Australia"],
      } };
    const text = await packetText(await buildHistoricalPdfBytes(year, pending, filer));
    expect(text).toContain("Canada"); expect(text).toContain("France"); expect(text).toContain("Germany");
    expect(text).toContain("United Kingdom"); expect(text).toContain("Australia");
    expect(text).toContain("See attached country statement");
    expect(text).toContain(`${year} - Foreign Countries`);
    expect(text).toContain(`${year} - Interest Adjustments`);
    expect(text).toContain(`${year} - Nominee Dividends`);
    for (const label of ["Nominee distribution", "Accrued interest", "OID adjustment", "ABP adjustment"]) expect(text).toContain(label);
    await expect(buildHistoricalPdfBytes(year, {
      ...pending, schedule_b: { ...pending.schedule_b, interest_line1_subtotal: 2001 },
    }, filer)).rejects.toThrow("does not reconcile");
  });

  test(`${year} MFS prints spouse name only in the actual filing-status name field`, async () => {
    const separate = { ...filer, filingStatus: 3 as const,
      spouse: { firstName: "Sam", lastName: "Example", ssn: "000334444", nameControl: "EXAM" } };
    const pending = syntheticPending(year);
    const text = await packetText(await buildHistoricalPdfBytes(year, {
      ...pending, f1040: { ...pending.f1040, filing_status: "mfs" },
    }, separate), "-bbox");
    const occurrences = [...text.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)"[^>]*>Sam<\/word>/g)];
    expect(occurrences).toHaveLength(1);
    const expectedTop = { 2021: 90, 2022: 96, 2023: 246, 2024: 246 }[year];
    expect(Number(occurrences[0][2])).toBeGreaterThanOrEqual(expectedTop - 2);
    expect(Number(occurrences[0][2])).toBeLessThan(expectedTop + 14);
  });

  test(`${year} QSEHRA marker is printed in the Form 8962 top margin`, async () => {
    const pending = { ...syntheticPending(year), form8962: {
      annual_premium: 6000, annual_aptc: 0, qsehra_ind: true,
    } };
    const text = await packetText(await buildHistoricalPdfBytes(year, pending, filer), "-bbox");
    const marker = text.match(/<word xMin="[^"]+" yMin="([^"]+)"[^>]*>QSEHRA<\/word>/);
    expect(marker).not.toBeNull();
    expect(Number(marker![1])).toBeLessThan(30);
  });
}

test("historical Schedule E prints the same reviewed deductible allocation as the real engine", () => {
  const property = {
    ...syntheticMixedStockRental(2023).schedule_e.schedule_es[0],
    fair_rental_days: 100, personal_use_days: 10, rent_income: 2000, ownership_percent: 50,
    expense_allocation_source: {
      tax_year: 2023, activity_id: "synthetic-rental", source_reference: "Synthetic rental allocation",
      use_pattern: "mixed-use-not-home", rental_period: { from: "2023-01-01", through: "2023-12-31" },
      no_personal_use_during_rental_period: false, amounts_before_ownership_allocation: true,
      expenses: [{
        expense_id: "insurance-2023", category: "expense_insurance", transaction_kind: "expense",
        source_amount: 1100, source_reference: "Synthetic insurance invoice", paid_on: "2023-01-01",
        expense_period: { from: "2023-01-01", through: "2023-12-31" },
        method: "actual-use-days", method_reference: "Synthetic occupancy ledger",
      }],
    },
  };
  const result = executeF1040Return({
    general: syntheticPub974Inputs(2023).general, schedule_e: [property],
  }, { taxYear: 2023, formType: "f1040" });
  expect(result.diagnostics).toEqual([]);
  expect(result.pending.schedule1.line5_schedule_e).toBe(500);
  for (const schedule_e of [result.pending.schedule_e, { schedule_es: [property] }]) {
    const [copy] = projectHistoricalForm(2023, "schedule_e", { ...result.pending, schedule_e }, filer);
    expect(copy.fields.property_0_expense_insurance).toBe(500);
    expect(copy.fields.property_0_line20).toBe(500);
    expect(copy.fields.line26).toBe(500);
  }
});

for (const year of [2021, 2022, 2023, 2024] as const) {
  test(`${year} real self-employment tax joins independently through Schedule 2 Part II`, () => {
    const inputs = syntheticPub974Inputs(year);
    const { pending, diagnostics } = executeF1040Return({
      general: inputs.general, schedule_c: inputs.schedule_c,
    }, { taxYear: year, formType: "f1040" });
    expect(diagnostics).toEqual([]);
    expect(pending.schedule2.line4_se_tax).toBeGreaterThan(0);
    const [copy] = projectHistoricalForm(year, "schedule2", pending, filer);
    expect(copy.fields.line21_total).toBe(pending.f1040.line23_other_taxes);
    expect(historicalPaperIssues(year, pending)).toEqual([]);
  });
  for (const monthly of [false, true]) test(`${year} real ${monthly ? "monthly" : "annual"} Marketplace business deduction retains identified Publication 974 worksheets`, async () => {
    const { pending, diagnostics } = executeF1040Return(syntheticPub974Inputs(year, monthly), { taxYear: year, formType: "f1040" });
    expect(diagnostics).toEqual([]);
    expect(pending.schedule1.line17_se_health_insurance).toBeGreaterThan(0);
    const copies = projectHistoricalForm(year, year < 2023 ? "schedule1" : "form7206", pending, filer);
    expect(copies.flatMap((copy) => copy.statements ?? []).join("\n")).toContain("Publication 974");
    expect(historicalPaperIssues(year, pending)).toEqual([]);
    const text = await packetText(await buildHistoricalPdfBytes(year, { ...pending }, filer));
    expect(text).toContain("Publication 974");
    expect(text).toContain("Worksheet W"); expect(text).toContain("Worksheet X");
    expect(text).toContain(filer.primarySSN);
    const forged = {
      ...pending, form7206: { ...pending.form7206,
        pub974_filing_row: { ...(pending.form7206.pub974_filing_row as Record<string, unknown>), recipient_ssn: "000334444" },
      },
    };
    expect(() => projectHistoricalForm(year, year < 2023 ? "schedule1" : "form7206", forged, filer)).toThrow("Publication 974");
  });
}

test("real foreign-source interest credit cannot omit its required Form 1116", () => {
  const { pending, diagnostics } = executeF1040Return({
    general: syntheticPub974Inputs(2023).general,
    schedule_b_part_iii: { foreign_accounts_question: false, foreign_trust_question: false },
    w2: [{ employer_name: "Synthetic Employer", employer_ein: "120000002",
      employee_ssn: filer.primarySSN, box1_wages: 40000, box2_fed_withheld: 4500 }],
    f1099int: [{
      payer_name: "Synthetic Canadian Bank", recipient_tin: filer.primarySSN,
      box1: 10000, box6: 400, foreign_source_interest_usd: 10000,
      foreign_tax_irs_country_code: "CA", foreign_tax_source_document_reference: "Synthetic issued interest statement",
    }],
  }, { taxYear: 2023, formType: "f1040" });
  expect(diagnostics).toEqual([]);
  expect(pending.schedule3.line1_foreign_tax_credit).toBe(400);
  expect(historicalPaperIssues(2023, pending).some((issue) => issue.form === "form_1116")).toBe(true);
});

test("pre-2024 Form 461 does not attach merely for a half-threshold line loss", () => {
  for (const year of [2021, 2022, 2023] as const) {
    const { pending } = executedWageReturn(year);
    expect(historicalPaperIssues(year, {
      ...pending, form461: { filing_status: "single", line2_schedule_c: -160000 },
    }).some((issue) => issue.form === "form461")).toBe(false);
  }
});

test("public investment sources retain payer gross amounts and their Schedule B reductions", async () => {
  const { pending, diagnostics } = executeF1040Return({
    general: syntheticPub974Inputs(2023).general,
    f1099int: [{
      payer_name: "Synthetic bank", recipient_tin: filer.primarySSN,
      box1: 2000, nominee_interest: 40, accrued_interest_paid: 10,
      non_taxable_oid_adjustment: 20, box11: 30, elect_bond_premium_amortization: true,
    }],
    f1099div: [{
      payerName: "Synthetic fund", recipient_tin: filer.primarySSN,
      isNominee: true, box11: false, box1a: 1000, nominee_distribution: { box1a: 100 },
    }],
    schedule_b_part_iii: {
      foreign_accounts_question: true, fincen_form114_required: true, foreign_trust_question: false,
      foreign_countries: [{ irs_code: "CA", name: "Canada" }, { irs_code: "FR", name: "France" }, { irs_code: "GM", name: "Germany" }],
    },
  }, { taxYear: 2023, formType: "f1040" });
  expect(diagnostics).toEqual([]);
  expect(pending.schedule_b.interest_line1_subtotal).toBe(2000);
  expect(pending.schedule_b.print_line2_total).toBe(1900);
  expect(pending.schedule_b.dividend_line5_subtotal).toBe(1000);
  expect(pending.schedule_b.print_line6_total).toBe(900);
  const text = await packetText(await buildHistoricalPdfBytes(2023, { ...pending }, filer));
  for (const value of ["2000", "1900", "1000", "900", "Nominee distribution", "ABP adjustment", "Canada", "France", "Germany"]) expect(text).toContain(value);
});

test("Form 8582 prints signed half-dollar losses consistently in activity and allocation worksheets", () => {
  const [copy] = projectHistoricalForm(2023, "form8582", { form8582: {
    filing_status: "single", modified_agi: 50000,
    current_loss: 100.5, rental_current_loss: 100.5,
    active_participation: true, has_active_rental: true,
    activities: [{
      activity_id: "synthetic-loss", name: "Synthetic rental loss", activity_type: "A",
      property_type: 1, reporting_form: "schedule_e", current_net: -100.5,
      prior_unallowed_operating: 0, prior_unallowed_4797_part1: 0, prior_unallowed_4797_part2: 0,
    }],
  } }, filer);
  expect(copy.fields.part4_1_loss).toBe(101);
  expect(copy.fields.part4_total_loss).toBe(101);
  expect(copy.fields.part6_1_loss).toBe(101);
  expect(copy.fields.partVIII_1_allowed).toBe(101);
});

test("Form 5329 rejects an owner-row swap before assigning the printed identity", () => {
  const owner_entries = [{ owner: TS.S, hsa_part_vii: {
    line42_prior_excess: 0, line43_unused_contribution_room: 0,
    line44_taxable_distributions: 0, line47_current_year_excess: 1000, december_31_value: 4000,
  } }];
  const owner_forms = calculateOwnerForms({ owner_entries }).forms.map((row) => ({ ...row, owner: TS.T }));
  expect(() => projectHistoricalForm(2024, "form5329", {
    form5329: { owner_entries, owner_forms }, schedule2: { line8_form5329_tax: 60 },
  }, { ...filer, filingStatus: 2, spouse: { firstName: "Sam", lastName: "Example", ssn: "000334444", nameControl: "EXAM" } }))
    .toThrow("owner-specific source");
});

test("nonactive rental opening PAL does not print phantom Form 8582 Part VI totals", () => {
  const [copy] = projectHistoricalForm(2024, "form8582", { form8582: {
    filing_status: "single", current_income: 590, prior_unallowed: 1000,
    modified_agi: 50000, has_active_rental: false, active_participation: false,
    activities: [{
      activity_id: "converted-rental", name: "Synthetic converted rental", activity_type: "B",
      property_type: 1, reporting_form: "schedule_e", current_net: 590,
      prior_unallowed_operating: 1000, prior_unallowed_4797_part1: 0, prior_unallowed_4797_part2: 0,
    }],
  } }, filer);
  expect(Object.keys(copy.fields).some((key) => key.startsWith("part6_"))).toBe(false);
  expect(copy.fields.part7_total_unallowed).toBe(410);
  expect(copy.fields.partVIII_1_loss).toBe(1000);
  expect(copy.fields.partVIII_1_unallowed).toBe(410);
  expect(copy.fields.partVIII_1_allowed).toBe(590);
});

test("Form 8582 Part VI includes only activities receiving its actual special allowance", () => {
  const activities = ["A", "B"].map((activity_type) => ({
    activity_id: `synthetic-${activity_type}`, name: `Synthetic ${activity_type}`, activity_type,
    property_type: 1, reporting_form: "schedule_e", current_net: -1000,
    prior_unallowed_operating: 0, prior_unallowed_4797_part1: 0, prior_unallowed_4797_part2: 0,
  }));
  const form8582 = { filing_status: "single", current_loss: 2000, rental_current_loss: 1000,
    modified_agi: 149000, has_active_rental: true, active_participation: true, activities };
  const [copy] = projectHistoricalForm(2024, "form8582", { form8582 }, filer);
  expect(copy.fields.line9).toBe(500);
  expect(copy.fields.part6_total_remainder).toBe(500);
  expect(copy.fields.part7_total_loss).toBe(1500);
  const [phasedOut] = projectHistoricalForm(2024, "form8582", {
    form8582: { ...form8582, modified_agi: 200000 },
  }, filer);
  expect(Object.keys(phasedOut.fields).some((key) => key.startsWith("part6_"))).toBe(false);
});

test("nominee dividend statement uses signed whole-dollar rounding without changing source cents", async () => {
  const fields = { dividend_nominee: 100.5, dividend_line5_subtotal: 1000, print_line6_total: 899.5 };
  const document = await PDFDocument.create();
  await appendScheduleBNomineeDividendStatement(document, fields, filer, 2023);
  expect(await packetText(await document.save())).toContain("-101");
  expect(fields.dividend_nominee).toBe(100.5);
});

test("an identified MFS spouse cannot become an owner on the primary taxpayer's separate paper return", () => {
  const separate = { ...filer, filingStatus: 3 as const,
    spouse: { firstName: "Sam", lastName: "Example", ssn: "000334444", nameControl: "EXAM" } };
  const owner_entries = [{ owner: TS.S, hsa_part_vii: {
    line42_prior_excess: 0, line43_unused_contribution_room: 0,
    line44_taxable_distributions: 0, line47_current_year_excess: 1000, december_31_value: 4000,
  } }];
  const excise = { form5329: { owner_entries, owner_forms: calculateOwnerForms({ owner_entries }).forms },
    schedule2: { line8_form5329_tax: 60 } };
  expect(() => projectHistoricalForm(2024, "form5329", excise, separate)).toThrow("joint return");
  expect(projectHistoricalForm(2024, "form5329", excise, { ...separate, filingStatus: 2 })[0].fields.owner_ssn).toBe(separate.spouse.ssn);
  expect(() => projectHistoricalForm(2024, "schedule_c", {
    general: { filing_status: "mfs" }, schedule1: { line3_schedule_c: 300 },
    schedule_c: { schedule_cs: [{
      proprietor_recipient: "S", line_a_principal_business: "Synthetic spouse consulting",
      line_b_business_code: "541990", line_f_accounting_method: "cash",
      line_g_material_participation: true, line_i_made_1099_payments: false, line_1_gross_receipts: 300,
    }] },
  }, separate)).toThrow("joint return");
});

test("inactive reviewed PAL remains on Schedule E and offsets another property's income by durable identity", () => {
  const base = syntheticMixedStockRental(2024).schedule_e.schedule_es[0];
  const reviewedProperty = (activity_id: string, operating: number) => ({
    ...base, activity_id, activity_type: "B",
    prior_unallowed_passive_operating: operating,
    prior_unallowed_passive_4797_part1: 0, prior_unallowed_passive_4797_part2: 0,
    prior_passive_losses_active_when_incurred: false,
    reconstructed_prior_loss_source: {
      tax_year: 2023, activity_id, provenance: "calculated-unfiled",
      evidence_reference: `Synthetic reviewed closing PAL for ${activity_id}`,
      operating, form4797_part1: 0, form4797_part2: 0,
    },
    loss_limitations_review: {
      basis_resolved: true, at_risk_resolved: true, qbi_transition_resolved: true,
      evidence_reference: `Synthetic reviewed limitations for ${activity_id}`,
    },
  });
  const inactive = { ...reviewedProperty("former-rental", 410),
    property_description: "Synthetic inactive rental", street_address: "10 Former Rental Way",
    fair_rental_days: 0, personal_use_days: 366, rent_income: 0 };
  const profitable = { ...reviewedProperty("current-rental", 0),
    property_description: "Synthetic current rental", street_address: "20 Current Rental Way",
    fair_rental_days: 366, personal_use_days: 0, rent_income: 1000 };
  for (const properties of [[inactive, profitable], [profitable, inactive]]) {
    const { pending, diagnostics } = executeF1040Return({
      general: syntheticPub974Inputs(2024).general, schedule_e: properties,
    }, { taxYear: 2024, formType: "f1040" });
    expect(diagnostics).toEqual([]);
    expect(pending.schedule1.line5_schedule_e).toBe(590);
    const [copy] = projectHistoricalForm(2024, "schedule_e", pending, filer);
    const inactiveIndex = properties.findIndex((property) => property.activity_id === "former-rental");
    const profitIndex = 1 - inactiveIndex;
    expect(copy.fields[`property_${inactiveIndex}_address`]).toContain("10 Former Rental Way");
    expect(copy.fields[`property_${inactiveIndex}_fair_rental_days`]).toBe(0);
    expect(copy.fields[`property_${inactiveIndex}_personal_use_days`]).toBe(366);
    expect(copy.fields[`property_${inactiveIndex}_line21`]).toBe(0);
    expect(copy.fields[`property_${inactiveIndex}_line22`]).toBe(410);
    expect(copy.fields[`property_${profitIndex}_line21`]).toBe(1000);
    expect(copy.fields.line26).toBe(590);
    expect(historicalPaperIssues(2024, pending)).toEqual([]);
  }
});

test("Form 461 attachment inventory nets signed owner K-1 businesses before applying annual line triggers", () => {
  for (const year of [2021, 2022, 2023, 2024] as const) {
    const { pending } = executedWageReturn(year);
    const required = (c: number, k1: number[]) => historicalPaperIssues(year, {
      ...pending, form461: { filing_status: "single", line2_schedule_c: c,
        historical_k1_business_income_loss: k1, line6_schedule_f: 0 },
      schedule1: { ...pending.schedule1, line3_schedule_c: c,
        line5_schedule_e: k1.reduce((sum, value) => sum + value, 0) },
      k1_partnership: { k1_partnerships: k1.map((value, index) => ({
        partnership_name: `Synthetic Partnership ${index + 1}`, partnership_ein: `12000000${index + 1}`,
        recipient_tin: filer.primarySSN, source_tax_year: year,
        source_document_reference: `Synthetic ${year} issued K1 ${index + 1}`, box1_ordinary_business: value,
        ...(value < 0 ? { ordinary_loss_limitations: {
          tax_year: year, source_reference: `Synthetic ${year} reviewed partnership limitations`,
          basis_available_for_loss: -value, at_risk_available_for_loss: -value,
          materially_participated: true, no_prior_suspended_losses: true, no_other_loss_or_deduction_items: true,
        } } : {}),
      })) },
    }).some((issue) => issue.form === "form461");
    expect(required(0, [350000, -400000])).toBe(false);
    expect(required(-200000, [-200000])).toBe(true);
    expect(required(500000, [-200000])).toBe(year === 2024);
    expect(historicalPaperIssues(year, { ...pending, form461: {
      filing_status: "single", historical_k1_allowed_ordinary_loss: 400000,
    } }).some((issue) => issue.form === "form461")).toBe(true);
  }
});

const capitalGroups = [["A", "1b"], ["B", "2"], ["C", "3"], ["D", "8b"], ["E", "9"], ["F", "10"]] as const;
function capitalSale(year: HistoricalTaxYear, part: string, adjusted = part === "A" || part === "D") {
  return {
    part, description: `Synthetic ${part} capital property`, source_transaction_id: `${year}-${part}`,
    recipient_ssn: filer.primarySSN, source_document_reference: `Synthetic ${year} sale ledger`,
    date_acquired: `${/^[DEF]$/.test(part) ? year - 2 : year}-01-01`,
    date_sold: `${year}-06-01`, proceeds: 100, cost_basis: 11100,
    ...(adjusted ? { adjustment_codes: "B", adjustment_amount: 7 } : {}),
  };
}
function executedCapitalReturn(year: HistoricalTaxYear, sales: Record<string, unknown>[], direct: Record<string, unknown> = {}) {
  return executeF1040Return({
    general: syntheticPub974Inputs(year).general,
    schedule_b_part_iii: { foreign_accounts_question: false, foreign_trust_question: false },
    ...(sales.length ? { f8949: sales } : {}),
    schedule_d: { line_6_carryover: 0, line_14_carryover: 0,
      opening_loss_source: { tax_year: year - 1, provenance: "reviewed-outside-evidence",
        evidence_reference: "Synthetic reviewed zero opening ST and LT losses" }, ...direct },
  }, { taxYear: year, formType: "f1040" });
}
for (const year of [2021, 2022, 2023, 2024] as const) {
  test(`${year} each single public A-F sale prints its Schedule D columns, not only net totals`, () => {
    for (const [part, line] of capitalGroups) {
      const sale = capitalSale(year, part);
      const { pending, diagnostics } = executedCapitalReturn(year, [sale]);
      expect(diagnostics).toEqual([]);
      expect(Array.isArray(pending.form8949.transaction)).toBe(false);
      const [copy] = projectHistoricalForm(year, "schedule_d", pending, filer);
      expect(copy.fields[`print_line${line}_proceeds`]).toBe(100);
      expect(copy.fields[`print_line${line}_cost`]).toBe(11100);
      expect(copy.fields[`print_line${line}_adjustment`]).toBe(sale.adjustment_amount ?? 0);
      expect(copy.fields[`print_line${line}_gain`]).toBe(-11000 + (sale.adjustment_amount ?? 0));
      const tampered = { ...pending, schedule_d: { ...pending.schedule_d,
        print_line7_st_total: Number(pending.schedule_d.print_line7_st_total) + 1 } };
      expect(() => projectHistoricalForm(year, "schedule_d", tampered, filer)).toThrow("Schedule D line 7");
    }
  });
  test(`${year} accumulated A-F rows and direct reporting fill actual annual Schedule D widgets`, async () => {
    const sales = capitalGroups.map(([part]) => capitalSale(year, part));
    for (const part of ["A", "D"]) for (const [i, proceeds, cost_basis] of [[1, 100.4, 50.4], [2, 200.4, 80.4]]) {
      sales.push({ ...capitalSale(year, part, false), source_transaction_id: `${year}-${part}-direct-${i}`, proceeds, cost_basis });
    }
    const { pending, diagnostics } = executedCapitalReturn(year, sales, {
      line_1a_proceeds: 1000, line_1a_cost: 500, line_8a_proceeds: 1200, line_8a_cost: 800,
    });
    expect(diagnostics).toEqual([]);
    const [copy] = projectHistoricalForm(year, "schedule_d", pending, filer);
    expect(copy.fields.print_line1a_proceeds).toBe(1301);
    expect(copy.fields.print_line1a_cost).toBe(631);
    expect(copy.fields.print_line1a_gain).toBe(670);
    expect(copy.fields.print_line8a_proceeds).toBe(1501);
    expect(copy.fields.print_line8a_cost).toBe(931);
    expect(copy.fields.print_line8a_gain).toBe(570);
    expect(projectHistoricalForm(year, "form8949", pending, filer)).toHaveLength(6);
    const bbox = await packetText(await buildHistoricalPdfBytes(year, pending, filer), "-bbox");
    const page = [...bbox.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map((match) => match[1])
      .find((text) => text.includes(">Capital</word>") && text.includes(">Losses</word>") && text.includes(">SCHEDULE</word>"));
    expect(page).toBeDefined();
    const words = [...page!.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)"[^>]*>([^<]*)<\/word>/g)];
    const mapping = historicalMapping(year, "schedule_d");
    for (const line of ["1a", "1b", "2", "3", "8a", "8b", "9", "10"]) {
      for (const column of ["proceeds", "cost", "gain"]) {
        const key = `print_line${line}_${column}`;
        const entry = mapping.fields.find((field) => field.domainKey === key)!;
        const [left, top, right, bottom] = mapping.fieldEvidence[entry.pdfField].rect;
        const printed = words.filter((word) => {
          const x = (Number(word[1]) + Number(word[3])) / 2, y = (Number(word[2]) + Number(word[4])) / 2;
          return x >= left && x <= right && y >= top && y <= bottom;
        }).map((word) => word[5]).join("");
        expect(printed).toBe(String(copy.fields[key]));
      }
    }
  });
  test(`${year} public Schedule D transaction sources print their required Form8949 and grouped columns`, async () => {
    const sales = capitalGroups.map(([part]) => capitalSale(year, part));
    const { pending, diagnostics } = executedCapitalReturn(year, [], { transactions: sales });
    expect(diagnostics).toEqual([]);
    const [copy] = projectHistoricalForm(year, "schedule_d", pending, filer);
    for (const [, line] of capitalGroups) expect(copy.fields[`print_line${line}_proceeds`]).toBe(100);
    expect(projectHistoricalForm(year, "form8949", pending, filer)).toHaveLength(6);
    const text = await packetText(await buildHistoricalPdfBytes(year, pending, filer));
    expect(text).toContain("Synthetic C capital property");
  });
}

for (const year of [2021, 2022, 2023, 2024] as const) {
  test(`${year} foreign-account-only sources retain Schedule B despite zero interest and dividends`, async () => {
    const source = { foreign_accounts_question: true, fincen_form114_required: true,
      foreign_trust_question: false, foreign_countries: [{ irs_code: "CA", name: "Canada" }] };
    const { pending, diagnostics } = executeF1040Return({
      general: syntheticPub974Inputs(year).general, schedule_b_part_iii: source,
      w2: [{ employer_name: "Synthetic Employer", employer_ein: "120000002",
        employee_ssn: filer.primarySSN, box1_wages: 40000, box2_fed_withheld: 4500 }],
    }, { taxYear: year, formType: "f1040" });
    expect(diagnostics).toEqual([]);
    expect(pending.f1040.line2b_taxable_interest ?? 0).toBe(0);
    expect(pending.f1040.line3b_ordinary_dividends ?? 0).toBe(0);
    expect(historicalPaperIssues(year, pending)).toEqual([]);
    const text = await packetText(await buildHistoricalPdfBytes(year, pending, filer));
    expect(text).toContain("Canada");
    for (const changes of [
      { foreign_accounts_question: false },
      { fincen_form114_required: false },
      { foreign_trust_question: true },
      { foreign_countries: [{ irs_code: "FR", name: "France" }] },
    ]) {
      const tampered = { ...pending, schedule_b: { ...pending.schedule_b, ...changes } };
      expect(historicalPaperIssues(year, tampered).some((issue) =>
        issue.form === "schedule_b" && issue.code === "historical-paper-reconciliation")).toBe(true);
      await expect(buildHistoricalPdfBytes(year, tampered, filer)).rejects.toThrow();
    }
  });
}

for (const year of [2021, 2022, 2023, 2024] as const) {
  test(`${year} a reported sale with zero net gain still attaches Schedule D`, async () => {
    const { pending, diagnostics } = executedCapitalReturn(year, [
      { ...capitalSale(year, "C"), cost_basis: 100 },
    ]);
    expect(diagnostics).toEqual([]);
    expect(pending.schedule_d.print_line16_combined).toBe(0);
    const text = await packetText(await buildHistoricalPdfBytes(year, pending, filer));
    expect(text.replace(/\s+/g, " ")).toContain("Capital Gains and Losses");
    expect(text).toContain("Synthetic C capital property");
  });
}
