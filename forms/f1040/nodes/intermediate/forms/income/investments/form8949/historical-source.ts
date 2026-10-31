import { z } from "zod";
import { isHistoricalTaxYear } from "../../../../../config/index.ts";

export enum HistoricalForm8949Part {
  A = "A", B = "B", C = "C", D = "D", E = "E", F = "F",
}
const historicalPartSchema = z.nativeEnum(HistoricalForm8949Part);
const dateSchema = z.string().date();

/** Pre-2025 dispositions use boxes A–F and the actual return-year sale date. */
export function assertHistoricalCapitalSource(source: {part:string;date_sold:string;date_acquired:string}, year:number): void {
  if (!isHistoricalTaxYear(year)) return;
  if (!historicalPartSchema.safeParse(source.part).success) throw new Error("Historical Form 8949 permits only boxes A–F");
  if (!dateSchema.safeParse(source.date_sold).success || Number(source.date_sold.slice(0,4))!==year) throw new Error("Historical Form 8949 disposition date must be in the return year");
  if (dateSchema.safeParse(source.date_acquired).success) {
    if (source.date_acquired > source.date_sold) throw new Error("Form 8949 acquisition date follows disposition");
  } else if (!/^(various|inherited)$/i.test(source.date_acquired)) {
    throw new Error("Form 8949 acquisition needs a valid date, Various or Inherited source notation");
  }
}
