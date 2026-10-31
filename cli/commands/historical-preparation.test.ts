import { test } from "bun:test";
import { assertEquals, assertRejects } from "@std/assert";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReturnCommand, getReturnCommand } from "./return.ts";
import { formAddCommand, formUpdateCommand } from "./form.ts";
import { validateReturnCommand } from "./validate.ts";
import { exportMefCommand } from "./export.ts";

async function withStore(run: (baseDir: string) => Promise<void>): Promise<void> {
  const baseDir = await mkdtemp(join(tmpdir(), "opentax-historical-"));
  try { await run(baseDir); } finally { await rm(baseDir, { recursive: true }); }
}

test("unsupported year fails before creating any return record", () => withStore(async (baseDir) => {
  await assertRejects(() => createReturnCommand({ year: 1900, baseDir }));
  assertEquals(await readdir(baseDir), []);
}));

test("historical source rejection preserves the entire saved return", () => withStore(async (baseDir) => {
  const { returnId } = await createReturnCommand({ year: 2023, baseDir });
  const path = join(baseDir, returnId, "return.json");
  const before = await readFile(path, "utf8");
  for (const [nodeType, data] of [
    ["schedule1a", { qualified_tips: 1000 }],
    ["f8949", { part: "I", description: "Synthetic token", date_acquired: "2022-01-01", date_sold: "2023-01-03", proceeds: 200, cost_basis: 300 }],
    ["start", { general: { filing_status: "single", taxpayer_last_nam: "Misspelled" } }],
  ] as const) {
    await assertRejects(() => formAddCommand({ returnId, baseDir, nodeType, dataJson: JSON.stringify(data) }));
    assertEquals(await readFile(path, "utf8"), before);
  }
}));

test("historical calculation uses its own standard deduction without a signature PIN", () => withStore(async (baseDir) => {
  // Final 2021/2024 Form 1040 page 1 standard-deduction sidebars: single under 65.
  for (const [year, taxableIncome] of [[2021, 27450], [2024, 25400]] as const) {
    const { returnId } = await createReturnCommand({ year, baseDir });
    await formAddCommand({ returnId, baseDir, nodeType: "general", dataJson: JSON.stringify({ filing_status: "single", taxpayer_age_65_or_older: false }) });
    await formAddCommand({ returnId, baseDir, nodeType: "w2", dataJson: JSON.stringify({ box1_wages: 40000, box2_fed_withheld: 0 }) });
    const result = await getReturnCommand({ returnId, baseDir });
    assertEquals(result.summary.line15_taxable_income, taxableIncome);
    assertEquals(result.paperPreparation?.readyForPaper, false);
  }
}));

test("an empty historical record is not a complete paper or electronic return", () => withStore(async (baseDir) => {
  const { returnId } = await createReturnCommand({ year: 2022, baseDir });
  const { report } = await validateReturnCommand({ returnId, baseDir });
  assertEquals(report.canFile, false);
  assertEquals(report.paperPreparation?.readyForPaper, false);
  assertEquals(report.entries.some((entry) => entry.ruleNumber === "MISSING_FILING_SOURCE"), true);
  await assertRejects(() => exportMefCommand({ returnId, baseDir, draft: true }), Error, "does not support MeF");
}));

test("wrong-year dispositions cannot replace saved direct or composite sources", () => withStore(async (baseDir) => {
  const sale = { part: "C", description: "Synthetic token", date_acquired: "2022-01-01", date_sold: "2023-01-03", proceeds: 200, cost_basis: 300 };
  for (const [nodeType, valid, invalid] of [
    ["f8949", sale, { ...sale, date_sold: "2024-01-03" }],
    ["f1099b", { ...sale, part: "A" }, { ...sale, part: "A", date_sold: "2024-01-03" }],
    ["schedule_d", { transactions: [sale] }, { transactions: [{ ...sale, date_sold: "2023-02-31" }] }],
    ["start", { f8949: [sale] }, { f8949: [{ ...sale, date_acquired: "2024-01-01" }] }],
  ] as const) {
    const { returnId } = await createReturnCommand({ year: 2023, baseDir });
    const path = join(baseDir, returnId, "return.json");
    const empty = await readFile(path, "utf8");
    await assertRejects(() => formAddCommand({ returnId, baseDir, nodeType, dataJson: JSON.stringify(invalid) }));
    assertEquals(await readFile(path, "utf8"), empty);
    const { id } = await formAddCommand({ returnId, baseDir, nodeType, dataJson: JSON.stringify(valid) });
    const saved = await readFile(path, "utf8");
    await assertRejects(() => formUpdateCommand({ returnId, baseDir, entryId: id, dataJson: JSON.stringify(invalid) }));
    assertEquals(await readFile(path, "utf8"), saved);
  }
}));

test("historical paper requires the issued wage owner, including zero withholding and separate spouses", () => withStore(async (baseDir) => {
  for (const [status, withholding, blocked] of [
    ["single", 4500, true], ["single", 0, true], ["mfs", 4500, true], ["mfj", 4500, false],
  ] as const) {
    const { returnId } = await createReturnCommand({ year: 2023, baseDir });
    await formAddCommand({ returnId, baseDir, nodeType: "general", dataJson: JSON.stringify({
      filing_status: status, taxpayer_first_name: "Alex", taxpayer_last_name: "Example",
      taxpayer_ssn: "111223333", taxpayer_dob: "1985-06-15", digital_assets: false,
      address_line1: "100 Example Street", address_city: "Boston", address_state: "MA", address_zip: "02108",
      ...(status === "single" ? {} : {
        spouse_first_name: "Sam", spouse_last_name: "Example", spouse_ssn: "222334444",
        spouse_dob: "1985-06-15", spouse_age_65_or_older: false,
      }),
    }) });
    await formAddCommand({ returnId, baseDir, nodeType: "w2", dataJson: JSON.stringify({
      employer_name: "Synthetic Employer", employer_ein: "120000002", employee_ssn: "222334444",
      box1_wages: 40000, box2_fed_withheld: withholding, box3_ss_wages: 40000,
      box4_ss_withheld: 2480, box5_medicare_wages: 40000, box6_medicare_withheld: 580,
    }) });
    const { report } = await validateReturnCommand({ returnId, baseDir });
    assertEquals(report.entries.some((entry) => entry.ruleNumber === "WAGE_SOURCE_MISMATCH"), blocked);
    if (blocked) assertEquals(report.paperPreparation?.readyForPaper, false);
  }
}));

test("historical 1099 income and payments cannot belong to an unrelated recipient", () => withStore(async (baseDir) => {
  for (const [nodeType, source, recipientKey] of [
    ["f1099int", { payer_name: "Synthetic Bank", recipient_tin: "999887777", box1: 100 }, "recipient_tin"],
    ["f1099oid", { payer_name: "Synthetic Bank", recipient_tin: "999887777", box1_oid: 100 }, "recipient_tin"],
    ["f1099div", { payerName: "Synthetic Fund", recipient_tin: "999887777", isNominee: false, box11: false, box1a: 100 }, "recipient_tin"],
    ["f1099g", { payer_name: "Synthetic State", recipient_tin: "999887777", box_1_unemployment: 100 }, "recipient_tin"],
    ["f1099m", { payer_name: "Synthetic Payer", payer_tin: "120000002", recipient_tin: "999887777", box4_federal_withheld: 25 }, "recipient_tin"],
    ["f1099nec", { payer_name: "Synthetic Payer", payer_tin: "120000002", recipient_ssn: "999887777", box4_federal_withheld: 25 }, "recipient_ssn"],
  ] as const) {
    const { returnId } = await createReturnCommand({ year: 2023, baseDir });
    await formAddCommand({ returnId, baseDir, nodeType: "general", dataJson: JSON.stringify({
      filing_status: "single", taxpayer_first_name: "Alex", taxpayer_last_name: "Example",
      taxpayer_ssn: "111223333", taxpayer_dob: "1985-06-15", digital_assets: false,
      address_line1: "100 Example Street", address_city: "Boston", address_state: "MA", address_zip: "02108",
    }) });
    const { id } = await formAddCommand({ returnId, baseDir, nodeType, dataJson: JSON.stringify(source) });
    const wrong = await validateReturnCommand({ returnId, baseDir });
    assertEquals(wrong.report.entries.some((entry) => entry.ruleNumber === "SOURCE_OWNER_MISMATCH"), true, nodeType);
    assertEquals(wrong.report.paperPreparation?.readyForPaper, false);
    await formUpdateCommand({ returnId, baseDir, entryId: id, dataJson: JSON.stringify({ ...source, [recipientKey]: "111223333" }) });
    const corrected = await validateReturnCommand({ returnId, baseDir });
    assertEquals(corrected.report.entries.some((entry) => entry.ruleNumber === "SOURCE_OWNER_MISMATCH"), false, nodeType);
  }
}));

test("historical capital sources require an owned broker copy for withholding", () => withStore(async (baseDir) => {
  const { returnId } = await createReturnCommand({ year: 2023, baseDir });
  await formAddCommand({ returnId, baseDir, nodeType: "general", dataJson: JSON.stringify({
    filing_status: "single", taxpayer_first_name: "Alex", taxpayer_last_name: "Example",
    taxpayer_ssn: "111223333", taxpayer_dob: "1985-06-15", digital_assets: true,
    address_line1: "100 Example Street", address_city: "Boston", address_state: "MA", address_zip: "02108",
  }) });
  const sale = { part: "A", description: "Synthetic security", date_acquired: "2023-01-01", date_sold: "2023-06-01", proceeds: 200, cost_basis: 100 };
  const broker = { ...sale, recipient_ssn: "999887777", payer_tin: "120000002" };
  const { id } = await formAddCommand({ returnId, baseDir, nodeType: "f1099b", dataJson: JSON.stringify(broker) });
  const wrong = await validateReturnCommand({ returnId, baseDir });
  assertEquals(wrong.report.entries.some((entry) => entry.ruleNumber === "BROKER_SOURCE_MISMATCH"), true);
  await formUpdateCommand({ returnId, baseDir, entryId: id, dataJson: JSON.stringify({ ...broker, recipient_ssn: "111223333" }) });
  const corrected = await validateReturnCommand({ returnId, baseDir });
  assertEquals(corrected.report.entries.some((entry) => entry.ruleNumber === "BROKER_SOURCE_MISMATCH"), false);
  const { id: directId } = await formAddCommand({ returnId, baseDir, nodeType: "f8949", dataJson: JSON.stringify({ ...sale, part: "C", federal_withheld: 100 }) });
  const manufactured = await validateReturnCommand({ returnId, baseDir });
  assertEquals(manufactured.report.entries.some((entry) => entry.ruleNumber === "PAYMENT_SOURCE_MISMATCH"), true);
  await formUpdateCommand({ returnId, baseDir, entryId: directId, dataJson: JSON.stringify({ ...sale, part: "C" }) });
  const noInventedPayment = await validateReturnCommand({ returnId, baseDir });
  assertEquals(noInventedPayment.report.entries.some((entry) => entry.ruleNumber === "PAYMENT_SOURCE_MISMATCH"), false);
}));

test("historical paper rejects spouse-owned rental income on nonjoint returns", () => withStore(async (baseDir) => {
  for (const [status, owner, blocked] of [
    ["single", "S", true], ["mfs", "S", true], ["mfs", "J", true],
    ["mfj", "S", false], ["mfj", "J", false],
  ] as const) {
    const { returnId } = await createReturnCommand({ year: 2024, baseDir });
    await formAddCommand({ returnId, baseDir, nodeType: "general", dataJson: JSON.stringify({
      filing_status: status, taxpayer_first_name: "Alex", taxpayer_last_name: "Example",
      taxpayer_ssn: "111223333", taxpayer_dob: "1985-06-15", digital_assets: false,
      address_line1: "100 Example Street", address_city: "Boston", address_state: "MA", address_zip: "02108",
      ...(status === "single" ? {} : {
        spouse_first_name: "Sam", spouse_last_name: "Example", spouse_ssn: "222334444",
        spouse_dob: "1985-06-15", spouse_age_65_or_older: false,
      }),
    }) });
    await formAddCommand({ returnId, baseDir, nodeType: "schedule_e", dataJson: JSON.stringify({
      tsj: owner, activity_id: "synthetic-rental", property_description: "Synthetic rental",
      street_address: "100 Example Street", city: "Boston", state: "MA", zip: "02108",
      property_type: 1, activity_type: "B", fair_rental_days: 366, personal_use_days: 0,
      rent_income: 20000, form_1099_payments_made: false,
      prior_unallowed_passive_operating: 0, prior_unallowed_passive_4797_part1: 0, prior_unallowed_passive_4797_part2: 0,
      reconstructed_prior_loss_source: {
        tax_year: 2023, activity_id: "synthetic-rental", operating: 0, form4797_part1: 0, form4797_part2: 0,
        provenance: "reviewed-outside-evidence", evidence_reference: "Synthetic reviewed zero opening",
      },
      loss_limitations_review: {
        basis_resolved: true, at_risk_resolved: true, qbi_transition_resolved: true,
        evidence_reference: "Synthetic limitations review",
      },
    }) });
    const { report } = await validateReturnCommand({ returnId, baseDir });
    assertEquals(report.entries.some(entry => entry.ruleNumber === "RENTAL_SOURCE_MISMATCH"), blocked);
  }
}));
