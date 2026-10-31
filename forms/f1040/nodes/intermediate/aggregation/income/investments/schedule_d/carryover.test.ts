import { test, expect } from "bun:test";
import { capitalLossCarryover } from "./carryover.ts";

test("IRS carryover worksheet preserves low-income losses and character", () => {
  const calc = (st: number, lt: number, income: number, mfs = false) => capitalLossCarryover({ netShortTerm: st, netLongTerm: lt, taxableIncomeBeforeFloor: income, allowedDeduction: Math.min(mfs ? 1500 : 3000, Math.max(0, -st-lt)), marriedFilingSeparately: mfs });
  expect(calc(-10000, 0, 20000).shortTerm).toBe(7000);
  expect(calc(-10000, 0, -5000).shortTerm).toBe(10000);
  expect(calc(-10000, 0, -1000).shortTerm).toBe(8000);
  expect(calc(-10000, 4000, 20000).shortTerm).toBe(3000);
  expect(calc(4000, -10000, 20000).longTerm).toBe(3000);
  expect(calc(-1000, -9000, 20000)).toMatchObject({ shortTerm: 0, longTerm: 7000 });
  expect(calc(-10000, 0, 20000, true).shortTerm).toBe(8500);
  expect(calc(-10000, 0, -5000).lines.line1).toBe(-5000);
});

test("worksheet refuses unknown and inconsistent deduction facts", () => {
  expect(() => capitalLossCarryover({ netShortTerm: -10000, netLongTerm: 0, taxableIncomeBeforeFloor: NaN, allowedDeduction: 3000 })).toThrow();
  expect(() => capitalLossCarryover({ netShortTerm: -10000, netLongTerm: 0, taxableIncomeBeforeFloor: 20000, allowedDeduction: 3000, marriedFilingSeparately: true })).toThrow();
});
