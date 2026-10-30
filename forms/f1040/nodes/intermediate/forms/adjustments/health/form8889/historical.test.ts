import { test } from "bun:test";
import { assertEquals, assertThrows } from "@std/assert";
import { CoverageType, form8889, inputSchema } from "./index.ts";
import type { NodeResult } from "../../../../../../../../core/types/tax-node.ts";

function compute(year: number, extra: Record<string, unknown>) {
  return form8889.compute({ taxYear: year, formType: "f1040" }, inputSchema.parse({
    beneficiary_identity: { owner: "T", name: "Synthetic Owner", ssn: "123456789" },
    eligible_hdhp_coverage_by_month: Array(12).fill(CoverageType.SelfOnly),
    age_55_or_older: false,
    last_month_rule_elected: false,
    ...extra,
  }));
}
function printed(result: NodeResult) {
  return (result.outputs.find((o) => o.nodeType === "form8889")!.fields.forms as Record<string, unknown>[])[0];
}

test("historical HSA employer worksheet keeps cents and relative contribution years", () => {
  const source = {
    taxpayer_hsa_contributions: 1000.25,
    employer_hsa_contributions: 1000.75,
    employer_contribution_years: {
      made_in_tax_year_for_prior_year_in_w2: 250.25,
      made_in_following_year_for_tax_year: 500.50,
    },
  };
  const before = structuredClone(source);
  const form = printed(compute(2023, source));
  assertEquals(form.print_line3_limit, 3850);
  assertEquals(form.print_line9_employer, 1251);
  assertEquals(form.print_line13_deduction, 1000.25);
  assertEquals(source, before);
});

test("HSA current and following withdrawal years are relative for every supported year", () => {
  for (const year of [2021, 2022, 2023, 2024, 2025, 2026]) {
    assertThrows(() => compute(year, {
      post_year_personal_excess_withdrawal: {
        principal: 100, earnings: 5, withdrawal_tax_year: year + 2,
        withdrawn_by_return_due_date: true,
      },
    }), Error, "following tax year");
    assertThrows(() => compute(year, {
      prior_year_hsa_excess: {
        tax_year: year - 2, filed_form5329_reference: "public synthetic prior form",
        filed_return_reviewed: true, owner_ssn: "123456789",
        form5329_line48: 100, form5329_line49: 6,
      },
    }), Error, "immediately preceding");
  }
});

test("2023 HSA last-month failure uses 2022 limits rather than 2024 limits", () => {
  const form = printed(compute(2023, {
    eligible_hdhp_coverage_by_month: Array(12).fill(null),
    testing_period_failure: {
      last_month_rule_evidence: {
        contribution_year: 2022,
        eligible_hdhp_coverage_by_month: [...Array(11).fill(null), CoverageType.SelfOnly],
        age_55_or_older: false, married_at_year_end: false, last_month_rule_elected: true,
        filed_form8889_line2: 3650, filed_form8889_line4_archer: 0,
        filed_form8889_line8: 3650, filed_form8889_line9: 0,
        filed_form8889_line10: 0, filed_form8889_line13: 3650,
      },
      qualified_funding_distribution_amount: 0, not_death_or_disability: true,
      prior_year_source: "synthetic reviewed 2022 Form8889",
    },
  }));
  assertEquals(form.print_line18, 3346);
  assertEquals(form.print_line21, 334.6);
});

test("historical HSA rejects old year-named schema instead of stripping source amounts", () => {
  assertThrows(() => compute(2023, {
    employer_contribution_years: { made_in_2025_for_2024_in_w2: 0, made_in_2026_for_2025: 100 },
  }));
});

test("HSA retained postyear evidence does not accept retired fixed-year document keys", () => {
  const document = { source_document_reference: "synthetic", sha256: "a".repeat(64), bytes_base64: "e30=" };
  assertThrows(() => compute(2023, {
    retained_employer_postyear_evidence: {
      filed_2025_w2: document, trustee_2026_payment: document, owner_2026_receipt: document,
    },
  }));
});
