import { test } from "bun:test";
import { assertEquals, assertThrows } from "@std/assert";
import { k1Partnership, inputSchema as partnershipSchema } from "./k1_partnership/index.ts";
import { k1SCorpNode, inputSchema as corporationSchema } from "./k1_s_corp/index.ts";

const partnership = {
  partnership_name: "Synthetic Partnership", partnership_ein: "123456789",
  source_document_reference: "synthetic 2023 issued K1", source_tax_year: 2023,
  recipient_tin: "123456789", box1_ordinary_business: -1000.25,
};
const limitations = {
  tax_year: 2023, source_reference: "synthetic reviewed limitations",
  basis_available_for_loss: 2000, at_risk_available_for_loss: 1500,
  materially_participated: true, no_prior_suspended_losses: true,
  no_other_loss_or_deduction_items: true,
};

test("historical partnership ordinary loss needs known basis at-risk and participation facts", () => {
  assertThrows(() => k1Partnership.compute({ taxYear: 2023, formType: "f1040" }, partnershipSchema.parse({ k1_partnerships: [partnership] })), Error, "loss limitations");
  const source = { ...partnership, ordinary_loss_limitations: limitations };
  const before = structuredClone(source);
  const result = k1Partnership.compute({ taxYear: 2023, formType: "f1040" }, partnershipSchema.parse({ k1_partnerships: [source] }));
  assertEquals(result.outputs.find((o) => o.nodeType === "schedule1")!.fields.line5_schedule_e, -1000.25);
  assertEquals(source, before);
  assertThrows(() => k1Partnership.compute({ taxYear: 2023, formType: "f1040" }, partnershipSchema.parse({ k1_partnerships: [{ ...source, ordinary_loss_limitations: { ...limitations, basis_available_for_loss: 999 } }] })), Error, "basis-limited");
});

test("issued owner K1 source year cannot contradict return year", () => {
  assertThrows(() => k1Partnership.compute({ taxYear: 2022, formType: "f1040" }, partnershipSchema.parse({ k1_partnerships: [{ ...partnership, box1_ordinary_business: 1000 }] })), Error, "tax year");
  assertThrows(() => k1SCorpNode.compute({ taxYear: 2022, formType: "f1040" }, corporationSchema.parse({ k1_s_corps: [{ corporation_name: "Synthetic Corporation", corporation_ein: "123456789", source_tax_year: 2023, box1_ordinary_business: 1000 }] })), Error, "tax year");
});
