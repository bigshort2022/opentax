import { test } from "bun:test";
import { assertEquals, assertThrows } from "@std/assert";
import { eitc, type EitcInput } from "./index.ts";
import { FilingStatus } from "../../../../../types.ts";
import { configForYear } from "../../../../../config/index.ts";
import { lookupEicFromParameters } from "./table.ts";

const base: EitcInput = {
  earned_income: 10_000, agi: 10_000,
  filing_status: FilingStatus.Single, filer_has_valid_ssns: true,
  taxpayer_dob: "1950-06-01", main_home_in_us_over_half_year: true,
  taxpayer_can_be_claimed_as_dependent: false,
  childless_eic_review: {
    not_qualifying_child_of_another_taxpayer_verified: true,
    qualifying_child_status_record_reference: "Synthetic household review",
  },
  eic_tax_residency_review: { status: "all_year_resident", taxpayer_status_record_reference: "Synthetic residency evidence" },
  prior_eic_disallowance_review: { status: "none", irs_account_record_reference: "Synthetic account", no_nonclerical_disallowance_since_1996_verified: true },
};
function credit(input: EitcInput, year = 2021) {
  return eitc.compute({ taxYear: year, formType: "f1040" }, input).outputs.find((o) => o.nodeType === "eitc")?.fields.credit_amount;
}

test("2021 published childless EIC table gives $1,502 and removes the upper age limit", () => {
  assertEquals(credit(base), 1502);
  assertEquals(credit(base, 2022), 0);
  assertEquals(credit({ ...base, investment_income: 10000 }), 1502);
  assertEquals(credit({ ...base, investment_income: 10001 }), 0);
  // Pub. 596 (2021), EIC Table $15,000–$15,050, single/no children.
  assertEquals(credit({ ...base, earned_income: 15000, agi: 15000 }), 980);
});

test("2021 students and qualified youths require reviewed age-category evidence", () => {
  const young = { ...base, taxpayer_dob: "2002-06-01" };
  assertThrows(() => credit(young));
  const review = base.childless_eic_review!;
  assertEquals(credit({ ...young, childless_eic_review: { ...review, historical_2021_age_review: { taxpayer: "regular", source_reference: "Not a specified student" } } }), 1502);
  assertEquals(credit({ ...young, childless_eic_review: { ...review, historical_2021_age_review: { taxpayer: "specified_student", source_reference: "Enrollment record" } } }), 0);
  assertEquals(credit({ ...young, taxpayer_dob: "2003-06-01", childless_eic_review: { ...review, historical_2021_age_review: { taxpayer: "qualified_former_foster_youth", source_reference: "Foster care record since age14" } } }), 1502);
});

test("2021 reviewed 2019 election uses prior earned income but current AGI", () => {
  const input: EitcInput = { ...base, earned_income: 5000, agi: 15000,
    childless_eic_review: { ...base.childless_eic_review!, historical_2021_earned_income_election: {
      earned_income_2019: 10000, joint_2019_earned_income_reconciled: true,
      source_reference: "Synthetic 2019 earned income worksheet",
    } },
  };
  assertEquals(credit(input), 980);
  assertThrows(() => credit(input, 2022));
  assertThrows(() => credit({ ...input, earned_income: 10000 }));
});

test("historical EIC reaches the published phaseout cells through the return node", () => {
  // IRS i1040tt--YEAR.pdf, EIC Table pp.17–18.
  for (const [year, amount, expected] of [
    [2021, 11600, 1502], [2021, 11650, 1493],
    [2022, 9150, 560], [2022, 9200, 555], [2022, 11050, 413],
    [2023, 9750, 600], [2023, 9800, 598], [2023, 9950, 586],
    [2024, 10300, 632], [2024, 10350, 629], [2024, 18550, 2],
  ]) {
    assertEquals(credit({
      ...base, taxpayer_dob: "1990-06-01", earned_income: amount, agi: amount,
    }, year), expected, `${year} single/no children at ${amount}`);
  }
});

test("historical EIC rounding matches every child-count column at phaseout boundaries", () => {
  // Literal printed cells from i1040tt--2021/2022/2023/2024.pdf pp.18–20.
  // Columns: nonjoint 0/1/2/3 children, then joint 0/1/2/3.
  const rows = [
    [2021, 17550, [590, 3618, 5980, 6728, 1502, 3618, 5980, 6728]],
    [2021, 17600, [582, 3618, 5980, 6728, 1493, 3618, 5980, 6728]],
    [2021, 19500, [291, 3618, 5980, 6728, 1202, 3618, 5980, 6728]],
    [2021, 19550, [284, 3609, 5968, 6716, 1194, 3618, 5980, 6728]],
    [2021, 25450, [0, 2666, 4726, 5473, 291, 3618, 5980, 6728]],
    [2021, 25500, [0, 2658, 4715, 5463, 284, 3609, 5968, 6716]],
    [2022, 15250, [92, 3733, 6110, 6874, 560, 3733, 6110, 6874]],
    [2022, 15300, [88, 3733, 6130, 6896, 557, 3733, 6130, 6896]],
    [2022, 20100, [0, 3733, 6164, 6935, 190, 3733, 6164, 6935]],
    [2022, 20150, [0, 3726, 6155, 6925, 186, 3733, 6164, 6935]],
    [2022, 26250, [0, 2751, 4870, 5640, 0, 3733, 6164, 6935]],
    [2022, 26300, [0, 2743, 4859, 5630, 0, 3723, 6150, 6921]],
    [2023, 16350, [97, 3995, 6550, 7369, 600, 3995, 6550, 7369]],
    [2023, 16400, [93, 3995, 6570, 7391, 596, 3995, 6570, 7391]],
    [2023, 21550, [0, 3995, 6604, 7430, 202, 3995, 6604, 7430]],
    [2023, 21600, [0, 3985, 6590, 7416, 198, 3995, 6604, 7430]],
    [2023, 28100, [0, 2946, 5221, 6047, 0, 3995, 6604, 7430]],
    [2023, 28150, [0, 2938, 5211, 6036, 0, 3986, 6592, 7418]],
    [2024, 17200, [105, 4213, 6890, 7751, 632, 4213, 6890, 7751]],
    [2024, 17250, [101, 4213, 6910, 7774, 630, 4213, 6910, 7774]],
    [2024, 22700, [0, 4213, 6960, 7830, 213, 4213, 6960, 7830]],
    [2024, 22750, [0, 4204, 6948, 7818, 209, 4213, 6960, 7830]],
    [2024, 29600, [0, 3110, 5506, 6376, 0, 4213, 6960, 7830]],
    [2024, 29650, [0, 3102, 5495, 6365, 0, 4207, 6953, 7823]],
  ] as const;
  for (const [year, amount, expected] of rows) {
    const cfg = configForYear(year);
    for (const [column, value] of expected.entries()) {
      for (const income of [amount, amount + 49]) {
        assertEquals(lookupEicFromParameters(
          cfg.eitcByChildren, income, column % 4, column >= 4,
          cfg.eitcMaximumRounding,
        ), value, `${year} column ${column} at ${income}`);
      }
    }
  }
});

test("historical EIC terminal bands honor every published footnote", () => {
  // IRS i1040tt--YEAR.pdf: eight printed terminal-band footnotes per year.
  for (const [year, children, singleEnd, singleCredit, jointEnd, jointCredit] of [
    [2021, 0, 21430, 2, 27380, 2], [2021, 1, 42158, 1, 48108, 1],
    [2021, 2, 47915, 2, 53865, 2], [2021, 3, 51464, 2, 57414, 2],
    [2022, 0, 16480, 1, 22610, 0], [2022, 1, 43492, 3, 49622, 2],
    [2022, 2, 49399, 5, 55529, 3], [2022, 3, 53057, 1, 59187, 4],
    [2023, 0, 17640, 2, 24210, 0], [2023, 1, 46560, 1, 53120, 2],
    [2023, 2, 52918, 2, 59478, 3], [2023, 3, 56838, 4, 63398, 5],
    [2024, 0, 18591, 2, 25511, 0], [2024, 1, 49084, 3, 56004, 0],
    [2024, 2, 55768, 2, 62688, 4], [2024, 3, 59899, 5, 66819, 2],
  ]) {
    for (const [joint, end, expected] of [
      [false, singleEnd, singleCredit], [true, jointEnd, jointCredit],
    ] as const) {
      const cfg = configForYear(year);
      for (const income of [Math.floor(end / 50) * 50, end - 1, end]) {
        assertEquals(
          lookupEicFromParameters(cfg.eitcByChildren, income, children, joint, cfg.eitcMaximumRounding),
          income === end ? 0 : expected,
          `${year} ${joint ? "joint" : "nonjoint"}/${children} children at ${income}`,
        );
      }
    }
  }
});

test("2021 qualified-youth paper indicator certifies the printed birth range for that person", () => {
  // 2021 Form1040 p.2 line27a: after Jan1,1998 and before Jan2,2004.
  for (const [dob, expected] of [
    ["1990-06-01", false], ["1998-01-01", false], ["1998-01-02", true],
    ["2004-01-01", true], ["2004-01-02", false],
  ] as const) {
    for (const owner of ["taxpayer", "spouse"] as const) {
      const input: EitcInput = {
        ...base,
        filing_status: owner === "spouse" ? FilingStatus.MFJ : FilingStatus.Single,
        taxpayer_dob: owner === "taxpayer" ? dob : "1990-06-01",
        spouse_dob: owner === "spouse" ? dob : undefined,
        eic_tax_residency_review: {
          status: "all_year_resident", taxpayer_status_record_reference: "Synthetic residency",
          spouse_status_record_reference: "Synthetic spouse residency",
        },
        childless_eic_review: {
          ...base.childless_eic_review!,
          historical_2021_age_review: {
            taxpayer: owner === "taxpayer" ? "qualified_former_foster_youth" : "regular",
            spouse: owner === "spouse" ? "qualified_homeless_youth" : undefined,
            source_reference: "Synthetic qualified-youth record",
          },
        },
      };
      const fields = eitc.compute({ taxYear: 2021, formType: "f1040" }, input)
        .outputs.find((o) => o.nodeType === "eitc")?.fields;
      assertEquals(fields?.historical_2021_qualified_youth === true, expected, `${owner} ${dob}`);
    }
  }
  // A spouse's reviewed category must not be paired with the taxpayer's DOB,
  // nor used at all on a nonjoint return.
  const fields = eitc.compute({ taxYear: 2021, formType: "f1040" }, {
    ...base, taxpayer_dob: "2000-06-01", spouse_dob: "2000-06-01",
    childless_eic_review: {
      ...base.childless_eic_review!,
      historical_2021_age_review: {
        taxpayer: "regular", spouse: "qualified_homeless_youth",
        source_reference: "Synthetic spouse-only youth record",
      },
    },
  }).outputs.find((o) => o.nodeType === "eitc")?.fields;
  assertEquals(fields?.historical_2021_qualified_youth, undefined);
});
