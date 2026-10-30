import { z } from "zod";

export enum LossProvenance {
  CalculatedUnfiled = "calculated-unfiled",
  ReviewedOutsideEvidence = "reviewed-outside-evidence",
}
export const openingLossSourceSchema = z.object({
  tax_year: z.number().int().min(1900).max(2099),
  evidence_reference: z.string().trim().min(1),
  provenance: z.nativeEnum(LossProvenance),
}).strict();

const worksheetInputSchema = z.object({
  netShortTerm: z.number().finite(),
  netLongTerm: z.number().finite(),
  taxableIncomeBeforeFloor: z.number().finite(),
  allowedDeduction: z.number().finite().nonnegative(),
  marriedFilingSeparately: z.boolean().optional(),
}).strict();

export interface CapitalLossCarryover {
  shortTerm: number;
  longTerm: number;
  lines: {
    line1: number; line2: number; line3: number; line4: number;
    line5: number; line6: number; line7: number; line8: number;
    line9: number; line10: number; line11: number; line12: number; line13: number;
  };
}
/** IRS Schedule D Capital Loss Carryover Worksheet, lines 1–13.
 * Line 1 is the prior year's Form 1040 taxable income BEFORE its zero floor.
 * The worksheet printed in year Y computes the carry from Y-1 into Y. */
export function capitalLossCarryover(raw: z.input<typeof worksheetInputSchema>): CapitalLossCarryover {
  const input = worksheetInputSchema.parse(raw);
  const expected = Math.min(input.marriedFilingSeparately ? 1500 : 3000,
    Math.max(0, -input.netShortTerm-input.netLongTerm));
  if (input.allowedDeduction !== expected) throw new Error("Schedule D line 21 deduction does not reconcile to net losses and filing status");
  const line1 = input.taxableIncomeBeforeFloor;
  const line2 = input.allowedDeduction;
  const line3 = Math.max(0, line1+line2);
  const line4 = Math.min(line2,line3);
  const line5 = Math.max(0,-input.netShortTerm);
  const line6 = Math.max(0,input.netLongTerm);
  const line7 = line4+line6;
  const line8 = Math.max(0,line5-line7);
  const line9 = Math.max(0,-input.netLongTerm);
  const line10 = Math.max(0,input.netShortTerm);
  const line11 = Math.max(0,line4-line5);
  const line12 = line10+line11;
  const line13 = Math.max(0,line9-line12);
  return { shortTerm: line8, longTerm: line13,
    lines: { line1,line2,line3,line4,line5,line6,line7,line8,line9,line10,line11,line12,line13 } };
}
