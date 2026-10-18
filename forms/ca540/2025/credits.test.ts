import { test } from "bun:test";
import { assertEquals, assertThrows } from "@std/assert";
import { calculateExemptionCredit } from "./credits.ts";
import type { CaliforniaFilingStatus } from "./tax.ts";

const credits = (
  filingStatus: CaliforniaFilingStatus,
  federalAgi: number,
  values: {
    personal?: number;
    blind?: number;
    senior?: number;
    dependents?: number;
  } = {},
) =>
  calculateExemptionCredit({
    filingStatus,
    federalAgi,
    personalExemptions: values.personal ?? 1,
    blindExemptions: values.blind ?? 0,
    seniorExemptions: values.senior ?? 0,
    dependentExemptions: values.dependents ?? 0,
  });

test("Form 540 exemption credits use TY2025 amounts", () => {
  assertEquals(credits("single", 50_000), 153);
  assertEquals(credits("joint", 50_000, { personal: 2 }), 306);
  assertEquals(credits("single", 50_000, { dependents: 2 }), 1_103);
});

test("Form 540 exemption-credit phaseout rounds each step upward", () => {
  // FTB instructions, line 32: $2,500 per step, $6 per exemption.
  assertEquals(credits("single", 252_204), 147);
  assertEquals(credits("single", 254_703), 147);
  assertEquals(credits("single", 254_704), 141);
});

test("Form 540 married-separate phaseout uses the $1,250 divisor", () => {
  assertEquals(credits("separate", 252_204), 147);
  assertEquals(credits("separate", 253_454), 141);
});

test("Form 540 floors exemption credit groups separately", () => {
  // FTB TY2025 line 32 AGI Limitation Worksheet, lines i, m, and n.
  assertEquals(credits("single", 327_203, {
    personal: 1,
    dependents: 1,
  }), 295);
  // 25 steps: personal credit retains $3; 26 steps: it is exhausted.
  assertEquals(credits("single", 314_703, { dependents: 1 }), 328);
  assertEquals(credits("single", 314_704, { dependents: 1 }), 319);
  // 79 steps: dependent credit retains $1; 80 steps: both groups exhausted.
  assertEquals(credits("single", 449_703, { dependents: 1 }), 1);
  assertEquals(credits("single", 449_704, { dependents: 1 }), 0);
  assertEquals(credits("separate", 289_703, { dependents: 1 }), 295);
});

test("Form 540 exemption credits reject invalid counts and AGI", () => {
  assertThrows(() => credits("single", Number.NaN), RangeError);
  assertThrows(() => credits("single", 50_000, { personal: -1 }), RangeError);
  assertThrows(() => credits("single", 50_000, { personal: Number.MAX_SAFE_INTEGER }), RangeError);
  assertThrows(() => credits("single", 50_000, { dependents: Number.MAX_SAFE_INTEGER }), RangeError);
  assertThrows(
    () => credits("single", 50_000, { dependents: 1.5 }),
    RangeError,
  );
});
