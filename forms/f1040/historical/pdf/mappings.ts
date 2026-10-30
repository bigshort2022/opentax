import fieldMaps from "./field-maps.json";
import templateSources from "./template-sources.json";
import type { PdfFieldEntry } from "../../2025/pdf/review-support/form-descriptor.ts";

export type HistoricalTaxYear = 2021 | 2022 | 2023 | 2024;
export interface HistoricalTemplate {
  readonly year: HistoricalTaxYear;
  readonly revisionYear?: number;
  readonly url: string;
  readonly sha256: string;
  readonly title: string;
  readonly authority: string;
  readonly applicability?: string;
}
export interface HistoricalMapping {
  readonly pendingKey: string;
  readonly template: string;
  readonly fields: readonly PdfFieldEntry[];
  readonly filerFields: readonly PdfFieldEntry[];
  readonly unmapped: readonly string[];
  /** Annual blank-template inspection establishes this required top-margin note. */
  readonly qsehraAnnotation?: { readonly page: number; readonly x: number; readonly top: number };
  readonly fieldEvidence: Readonly<Record<string, {
    readonly page: number;
    /** Actual IRS widget rectangle, top-origin PDF points. */
    readonly rect: readonly number[];
  }>>;
}

/** Each entry records actual historical widget names and measured rectangles.
 * No runtime translation of current-year field offsets or template URLs occurs. */
export const HISTORICAL_TEMPLATES = templateSources as unknown as Readonly<
  Record<HistoricalTaxYear, Readonly<Record<string, HistoricalTemplate>>>
>;
const MAPPINGS = fieldMaps as unknown as Readonly<
  Record<HistoricalTaxYear, Readonly<Record<string, HistoricalMapping>>>
>;
export function historicalMapping(year: HistoricalTaxYear, form: string): HistoricalMapping {
  const mapping = MAPPINGS[year]?.[form];
  if (!mapping) throw new Error(`No reviewed ${year} paper mapping for ${form}`);
  return mapping;
}
export function historicalMappings(year: HistoricalTaxYear): Readonly<Record<string, HistoricalMapping>> {
  const mappings = MAPPINGS[year];
  if (!mappings) throw new Error(`Unsupported historical paper year ${year}`);
  return mappings;
}
