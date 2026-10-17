import { assertEquals, assertThrows } from "@std/assert";
import { calculateOrdinaryTax } from "./tax.ts";

Deno.test("Form 540 line 31 uses the tax table through $100,000", () => {
  // FTB 2025 California Tax Table, row $99,951–$100,000.
  assertEquals(calculateOrdinaryTax(100_000, "single"), 5_736);
  assertEquals(calculateOrdinaryTax(100_000, "joint"), 3_068);
});

Deno.test("Form 540 table uses the published $100 income band midpoint", () => {
  // FTB 2025 California Tax Table rows $351–$450 and $451–$550.
  assertEquals(calculateOrdinaryTax(450, "single"), 4);
  assertEquals(calculateOrdinaryTax(451, "single"), 5);
});

Deno.test("Form 540 line 31 switches to the rate schedule above $100,000", () => {
  // FTB 2025 Schedule X: $3,201.97 + 9.3% of income over $72,724.
  assertEquals(calculateOrdinaryTax(100_001, "single"), 5_739);
  // FTB Schedule Y: $2,044.02 + 6% of income over $82,904.
  assertEquals(calculateOrdinaryTax(100_001, "joint"), 3_070);
});

Deno.test("Form 540 tax calculation rejects invalid inputs", () => {
  assertThrows(() => calculateOrdinaryTax(-1, "single"), RangeError);
  assertThrows(() => calculateOrdinaryTax(Number.NaN, "single"), RangeError);
  assertThrows(
    () => calculateOrdinaryTax(1_000, "unsupported" as never),
    RangeError,
  );
});
