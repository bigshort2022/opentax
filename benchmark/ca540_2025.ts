import { dirname, fromFileUrl, join } from "@std/path";
import { z } from "zod";
import { calculateOrdinaryTax } from "../forms/ca540/2025/tax.ts";

const casesSchema = z.array(
  z.object({
    name: z.string().min(1),
    taxableIncome: z.number().int().nonnegative(),
    filingStatus: z.enum([
      "single",
      "joint",
      "separate",
      "head_of_household",
      "qualifying_surviving_spouse",
    ]),
    expectedLine31: z.number().int().nonnegative(),
    source: z.string().refine((value) =>
      value.includes("ftb.ca.gov/forms/2025/2025-540")
    ),
  }).strict(),
).min(2);

export async function runCa540Benchmark(): Promise<boolean> {
  const root = dirname(fromFileUrl(import.meta.url));
  const path = join(root, "ca540", "2025", "cases.json");
  const cases = casesSchema.parse(JSON.parse(await Deno.readTextFile(path)));
  let failed = false;
  for (const testCase of cases) {
    const actual = calculateOrdinaryTax(
      testCase.taxableIncome,
      testCase.filingStatus,
    );
    const passed = actual === testCase.expectedLine31;
    console.log(
      `${
        passed ? "PASS" : "FAIL"
      } ${testCase.name}: expected line 31 $${testCase.expectedLine31}, got $${actual}`,
    );
    if (!passed) failed = true;
  }
  console.log(
    `${cases.length} California TY2025 Form 540 tax-table/rate-schedule cases; FTB-sourced line 31 comparisons.`,
  );
  return !failed;
}
