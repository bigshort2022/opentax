import { z } from "zod";
import { LossProvenance } from "../../forms/f1040/nodes/intermediate/aggregation/income/investments/schedule_d/carryover.ts";

export const carryoverIssueSchema = z.object({
  code: z.string(), message: z.string(), form: z.string(),
}).strict();
export type CarryoverIssue = z.infer<typeof carryoverIssueSchema>;

export const carryoverReviewSchema = z.object({
  fingerprint: z.string(),
  evidenceReference: z.string().trim().min(1),
  provenance: z.nativeEnum(LossProvenance),
  sourceComplete: z.literal(true),
  reviewedAt: z.string().datetime(),
}).strict();
export enum CarryoverInputKind { Capital = "schedule_d", Rental = "schedule_e" }
export const appliedCarryoverFieldsSchema = z.object({
  entryId:z.string(), nodeType:z.nativeEnum(CarryoverInputKind),
  nestedInStart:z.boolean(), activityId:z.string().optional(),
  fields:z.record(z.string(),z.unknown()),
}).strict();
export type AppliedCarryoverFields = z.infer<typeof appliedCarryoverFieldsSchema>;
export const carryoverLinkSchema = z.object({
  sourceReturnId: z.string(),
  sourceYear: z.number().int(),
  sourceFingerprint: z.string(),
  reviewFingerprint: z.string(),
  // Only the fields installed by apply; these may be replaced by reapply,
  // but independent destination facts may never be overwritten.
  appliedFields: z.array(appliedCarryoverFieldsSchema),
}).strict();
export type CarryoverReview = z.infer<typeof carryoverReviewSchema>;
export type CarryoverLink = z.infer<typeof carryoverLinkSchema>;
import type { Form8990Workpaper } from "../../forms/f1040/2025/domains/deductions/business/form8990/form8990_projection.ts";

export type MetaJson = {
  readonly returnId: string;
  readonly year: number;
  readonly formType?: string; // optional for backward-compat with old return files
  readonly createdAt: string; // ISO 8601
};

export type NodeInputEntry = {
  readonly id: string; // e.g. "w2_01"
  readonly fields: Readonly<Record<string, unknown>>;
};

export type InputsJson = Record<string, NodeInputEntry[]>;

export type ReturnJson = {
  readonly meta: MetaJson;
  readonly inputs: InputsJson;
  readonly carryoverReview?: CarryoverReview;
  readonly carryoverLink?: CarryoverLink;
  readonly form8990CalculatedWorkpaper?: {
    readonly recordVersion: 1;
    readonly status: "calculated-unfiled";
    readonly returnId: string;
    readonly taxpayerSsn: string;
    readonly sourceRecordsSha256: string;
    readonly form8990Line31: number;
    readonly workpaper: Form8990Workpaper;
  };
};

export type Form8990CalculatedWorkpaperRecord = NonNullable<
  ReturnJson["form8990CalculatedWorkpaper"]
>;
