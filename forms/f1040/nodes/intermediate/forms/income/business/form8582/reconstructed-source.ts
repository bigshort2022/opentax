import { z } from "zod";
import { LossProvenance } from "../../../../aggregation/income/investments/schedule_d/carryover.ts";

export const lossLimitationsReviewSchema = z.object({
  basis_resolved: z.literal(true),
  at_risk_resolved: z.literal(true),
  qbi_transition_resolved: z.literal(true),
  evidence_reference: z.string().trim().min(1),
}).strict();

/** Preparation evidence, never an assertion of filing or IRS acceptance. */
export const reconstructedPriorLossSourceSchema = z.object({
  tax_year: z.number().int().min(1900).max(2099),
  activity_id: z.string().trim().min(1).max(64),
  provenance: z.nativeEnum(LossProvenance),
  evidence_reference: z.string().trim().min(1),
  operating: z.number().int().nonnegative(),
  form4797_part1: z.number().int().nonnegative(),
  form4797_part2: z.number().int().nonnegative(),
}).strict();
