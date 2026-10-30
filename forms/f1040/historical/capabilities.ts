import { z } from "zod";
import type { InputNodeEntry } from "../../../core/types/form-definition.ts";
import { inputNodes as sharedInputs } from "../2025/inputs.ts";
import { buildStartNode } from "../2025/return-processing/start.ts";
import { inputSchema as generalSchema } from "../nodes/inputs/general/filing/general/index.ts";
import { historical8949ItemSchema } from "../nodes/inputs/income/investments/f8949/index.ts";
import { itemSchema as brokerageItemSchema } from "../nodes/inputs/income/investments/f1099b/index.ts";
import { assertHistoricalCapitalSource } from "../nodes/intermediate/forms/income/investments/form8949/historical-source.ts";
import { historicalScheduleDInputSchema } from "../nodes/intermediate/aggregation/income/investments/schedule_d/index.ts";
import { FilingStatus } from "../nodes/types.ts";
import { inputSchema as estimatedPaymentSchema, priorYearAppliedCreditReviewSchema } from "../nodes/inputs/payments/estimated/f1040es/index.ts";

/** Source paths with historical calculation and paper preparation coverage. */
const supportedInputs: Readonly<Record<string, true>> = {
  general: true, w2: true, f1099int: true, f1099oid: true, f1099div: true,
  f1099g: true, f1099m: true, f1099nec: true, f1099k: true, f1099b: true,
  f8949: true, schedule_d: true, schedule_c: true, schedule_e: true,
  schedule_a: true, schedule_b_part_iii: true, k1_s_corp: true,
  k1_partnership: true, f1095a: true, form8889: true, qsehra: true,
  form7206: true, sep_retirement: true, f1040es: true, ext: true, preparer: true,
};

const historicalGeneralSchema = generalSchema.omit({
  dual_status_return_2025: true,
  child_eic_filer_review: true,
  prior_ctc_disallowance_review: true,
  prior_aotc_disallowance_review: true,
  mfs_eitc_separation_review: true,
  dependent_education_income_review: true,
  dependent_kiddie_tax_family_record_reference: true,
  dependent_kiddie_tax_family_review: true,
  hoh_spouse_lived_apart_review: true,
  qss_nonclaimed_child_review: true,
  apply_overpayment_to_2026_estimated_tax_amount: true,
}).extend({
  filing_status: z.nativeEnum({ Single: FilingStatus.Single, MFJ: FilingStatus.MFJ, MFS: FilingStatus.MFS }),
  dependents: z.array(z.never()).optional().describe(
    "Historical dependent-credit preparation is not included in this product",
  ),
}).strict();

/** Preserve source refinements while hiding inapplicable public fields. */
function omitSourceFields(schema: z.ZodTypeAny, fields: Readonly<Record<string, true>>): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects) {
    return new z.ZodEffects({ ...schema._def, schema: omitSourceFields(schema.innerType(), fields) });
  }
  if (schema instanceof z.ZodOptional) return omitSourceFields(schema.unwrap(), fields).optional();
  if (schema instanceof z.ZodNullable) return omitSourceFields(schema.unwrap(), fields).nullable();
  if (schema instanceof z.ZodDefault) {
    return new z.ZodDefault({ ...schema._def, innerType: omitSourceFields(schema.removeDefault(), fields) });
  }
  if (!(schema instanceof z.ZodObject)) throw new Error("Historical source field restriction requires an object");
  return schema.omit(fields);
}

function objectSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects) return objectSchema(schema.innerType());
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return objectSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) return objectSchema(schema.removeDefault());
  return schema;
}

/** Check the original source tree, before nested Zod objects can strip facts. */
function assertKnownFields(schema: z.ZodTypeAny, value: unknown, path: string): void {
  if (value === undefined || value === null) return;
  const inner = objectSchema(schema);
  if (inner instanceof z.ZodArray && Array.isArray(value)) {
    value.forEach((item, index) => assertKnownFields(inner.element, item, `${path}[${index}]`));
    return;
  }
  if (inner instanceof z.ZodUnion || inner instanceof z.ZodDiscriminatedUnion) {
    const options: readonly z.ZodTypeAny[] = inner.options;
    const matching = options.find((option) => option.safeParse(value).success);
    if (matching) assertKnownFields(matching, value, path);
    return;
  }
  if (inner instanceof z.ZodRecord && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertKnownFields(inner.valueSchema, item, `${path}.${key}`);
    }
    return;
  }
  if (!(inner instanceof z.ZodObject) || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const field: z.ZodTypeAny | undefined = inner.shape[key];
    if (!field) {
      if (inner._def.catchall instanceof z.ZodNever) {
        throw new Error(`Unsupported historical source field: ${path}.${key}`);
      }
      assertKnownFields(inner._def.catchall, item, `${path}.${key}`);
    } else {
      assertKnownFields(field, item, `${path}.${key}`);
    }
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function assertHistoricalFacts(year: number, nodeType: string, value: unknown): void {
  const fields = record(value);
  if (!fields) return;
  if (nodeType === "general") {
    if (fields.filing_status === "hoh" || fields.filing_status === "qss") {
      throw new Error("Historical HOH/QSS qualifying-person preparation is not supported; do not substitute another filing status");
    }
    const review = record(fields.childless_eic_review);
    if (year !== 2021 && (review?.historical_2021_age_review !== undefined || review?.historical_2021_earned_income_election !== undefined)) {
      throw new Error("The expanded childless EIC age and earned-income election apply only to 2021");
    }
  }
  if (year !== 2021 && (fields.unemployment_compensation_2021 !== undefined || fields.qualified_cash_contributions_2021 !== undefined)) {
    throw new Error("This historical election applies only to tax year 2021");
  }
  if (nodeType === "k1_s_corp" && (fields.first_year_passive_loss_source !== undefined || fields.form7203_debt_evidence !== undefined)) {
    throw new Error("Historical S-corporation loss preparation requires the supported stock-only basis source; current-year passive/debt evidence cannot be reused");
  }
  if (nodeType === "schedule_e" && (fields.current_property_source !== undefined || fields.sales !== undefined)) {
    throw new Error("Historical rental property disposition/depreciation source preparation is not supported by this rental income path");
  }
  if (nodeType === "f1040es") {
    const review = record(fields.prior_year_applied_credit_review);
    if (review?.accepted_2024_return_reference !== undefined) {
      throw new Error("Historical applied payments require accepted_prior_year_return_reference, not a fixed 2024 return");
    }
  }
}

export function historicalInputCapabilities(year: number) {
  const reviewCapitalSource = (
    source: Parameters<typeof assertHistoricalCapitalSource>[0],
    context: z.RefinementCtx,
  ): void => {
    try {
      assertHistoricalCapitalSource(source, year);
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : String(error) });
    }
  };
  const entries: readonly InputNodeEntry[] = sharedInputs
    .filter((entry) => Object.hasOwn(supportedInputs, entry.inputKey ?? entry.node.nodeType))
    .map((entry): InputNodeEntry => {
      const key = entry.inputKey ?? entry.node.nodeType;
      if (key === "general" && !entry.isArray) {
        const schema = year === 2021 ? historicalGeneralSchema : historicalGeneralSchema.extend({
          childless_eic_review: omitSourceFields(historicalGeneralSchema.shape.childless_eic_review, {
            historical_2021_age_review: true,
            historical_2021_earned_income_election: true,
          }),
        });
        return { ...entry, inputSchema: schema };
      }
      if (key === "f8949" && entry.isArray) return { ...entry, itemSchema: historical8949ItemSchema.superRefine(reviewCapitalSource) };
      if (key === "f1099b" && entry.isArray) return { ...entry, itemSchema: brokerageItemSchema.superRefine(reviewCapitalSource) };
      if (key === "schedule_d" && !entry.isArray) return {
        ...entry,
        inputSchema: historicalScheduleDInputSchema.superRefine((source, context) => {
          const accumulated = source.transaction === undefined ? [] : Array.isArray(source.transaction) ? source.transaction : [source.transaction];
          for (const transaction of accumulated) reviewCapitalSource(transaction, context);
          for (const transaction of source.transactions ?? []) reviewCapitalSource(transaction, context);
        }),
      };
      if (key === "f1040es" && !entry.isArray) {
        return { ...entry, inputSchema: estimatedPaymentSchema.extend({
          prior_year_applied_credit_review: priorYearAppliedCreditReviewSchema.optional(),
        }) };
      }
      if (key === "f1095a" && entry.isArray && year !== 2021) {
        return { ...entry, itemSchema: omitSourceFields(entry.itemSchema, { unemployment_compensation_2021: true }) };
      }
      if (key === "schedule_a" && !entry.isArray && year !== 2021) {
        return { ...entry, inputSchema: omitSourceFields(entry.inputSchema, { qualified_cash_contributions_2021: true }) };
      }
      if (key === "k1_s_corp" && entry.isArray) {
        return { ...entry, itemSchema: omitSourceFields(entry.itemSchema, { first_year_passive_loss_source: true, form7203_debt_evidence: true }) };
      }
      if (key === "schedule_e" && entry.isArray) {
        return { ...entry, itemSchema: omitSourceFields(entry.itemSchema, { current_property_source: true, sales: true }) };
      }
      return entry;
    });
  const start = buildStartNode(entries);
  const byKey = new Map(entries.map((entry) => [entry.inputKey ?? entry.node.nodeType, entry]));
  const assertInput = (nodeType: string, data: unknown): void => {
    if (nodeType === "start") {
      assertKnownFields(start.inputSchema, data, "start");
      const fields = record(data);
      for (const [key, value] of Object.entries(fields ?? {})) {
        const entry = byKey.get(key);
        if (!entry) throw new Error(`Unsupported historical input: ${key}`);
        if (entry.isArray && Array.isArray(value)) {
          for (const item of value) assertHistoricalFacts(year, key, item);
        } else {
          assertHistoricalFacts(year, key, value);
        }
      }
      start.inputSchema.parse(data);
      return;
    }
    const entry = byKey.get(nodeType);
    if (!entry) throw new Error(`Unsupported historical input: ${nodeType}`);
    const schema = entry.isArray ? entry.itemSchema : entry.inputSchema;
    assertKnownFields(schema, data, nodeType);
    assertHistoricalFacts(year, nodeType, data);
    schema.parse(data);
  };
  return { entries, start, sourceSchema: start.inputSchema, assertInput };
}
