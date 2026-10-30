import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { CONFIG_BY_YEAR, isHistoricalTaxYear } from "../../../../../config/index.ts";
import { FilingStatus } from "../../../../../types.ts";
import { normalizeAllPending } from "../../../../../../2025/return-processing/pending.ts";
import { roundWholeDollars } from "../../../../../../whole-dollars.ts";
import { inputSchema as partnershipSchema } from "../../../../../inputs/income/rental-passthrough/k1_partnership/index.ts";
import { inputSchema as corporationSchema } from "../../../../../inputs/income/rental-passthrough/k1_s_corp/index.ts";
import { passiveK1Activities } from "../../../../../inputs/income/rental-passthrough/k1_passive_source.ts";
import {
  inputSchema as scheduleESchema, projectScheduleEItems, computePropertyNet,
  isPassiveProperty,
} from "../../../../../inputs/income/rental-passthrough/schedule_e/index.ts";
import {
  inputSchema as passiveSchema, passiveActivity, passiveLossLimit,
  allocatePassiveActivityLosses,
} from "../form8582/index.ts";

const amount = z.union([z.number().finite(), z.array(z.number().finite())]);
const coverageSchema = z.object({
  general: z.object({
    filing_status: z.nativeEnum(FilingStatus),
    taxpayer_ssn: z.string().optional(), spouse_ssn: z.string().optional(),
  }).optional(),
  form461: z.object({ historical_k1_business_income_loss: amount.optional() }).optional(),
  schedule1: z.object({
    line3_schedule_c: amount.optional(), line5_schedule_e: amount.optional(),
    line6_schedule_f: amount.optional(),
  }).optional(),
  k1_partnership: partnershipSchema.optional(),
  k1_s_corp: corporationSchema.optional(),
  schedule_e: scheduleESchema.optional(),
  form8582: passiveSchema.optional(),
});
function sum(value: z.infer<typeof amount> | undefined): number {
  return Array.isArray(value) ? value.reduce((total, item) => total + item, 0) : value ?? 0;
}

/** Final preparation boundary, not a feedback edge from Form 8582 to Form 461.
 * Line 5 is the complete Schedule E net after basis/PAL. The aggregate test
 * excludes known nonbusiness income and never assumes an unclassified rental
 * is a section 162 business merely because it is passive or qualifies for QBI.
 */
export function assertHistoricalOwnerLossCoverage(
  taxYear: number,
  rawPending: Readonly<Record<string, unknown>>,
): void {
  if (!isHistoricalTaxYear(taxYear)) return;
  const normalized = normalizeAllPending(rawPending);
  if (normalized.k1_partnership === undefined && normalized.k1_s_corp === undefined &&
    normalized.schedule_e === undefined) {
    if (normalized.form461?.historical_k1_business_income_loss !== undefined) {
      throw new Error("Historical owner Form 461 review needs the issued K-1 sources, not an isolated business marker");
    }
    return;
  }
  const pending = coverageSchema.parse(normalized);
  const filingStatus = pending.general?.filing_status;
  if (!filingStatus) throw new Error("Historical owner Form 461 review needs the actual return filing status");
  const cfg = CONFIG_BY_YEAR[taxYear];
  const threshold = filingStatus === FilingStatus.MFJ ? cfg.eblThresholdMfj : cfg.eblThresholdSingle;
  const line2 = sum(pending.schedule1?.line3_schedule_c);
  // Schedule 1 emits its assembled line: basis disallowance is already included.
  const line5 = sum(pending.schedule1?.line5_schedule_e);
  const line6 = sum(pending.schedule1?.line6_schedule_f);
  if (taxYear >= 2024 && [line2, line5, line6].some((line) => line < -cfg.eblThresholdSingle / 2)) {
    throw new Error("Historical owner return requires a Form 461 attachment from the complete post-limitation Schedule C/E/F line; its combined filing calculation is not supported");
  }
  const knownBusinessNet = line2 + line6 + sum(pending.form461?.historical_k1_business_income_loss);
  if (knownBusinessNet < -threshold) {
    throw new Error("Historical owner business losses exceed the Form 461 threshold; rental business classification and a combined limitation calculation are required before preparation");
  }

  const source = pending.schedule_e;
  if (!source) return;
  if ((source.farm_rental_activities?.length ?? 0) > 0 ||
    (source.estate_trust_rows?.length ?? 0) > 0) {
    throw new Error("Historical owner Form 461 review needs separately classified farm-rental or estate/trust activity sources");
  }
  const properties = projectScheduleEItems(source.schedule_es, taxYear);
  const passive = pending.form8582;
  const activities = passive?.activities ?? [];
  if (passive?.current_loss_forms || passive?.current_4797_sale_gains?.length ||
    activities.some((activity) => activity.prior_unallowed_4797_part1 > 0 || activity.prior_unallowed_4797_part2 > 0)) {
    throw new Error("Historical owner Form 461 review needs separately classified disposition-character loss allocations");
  }
  const allocation = activities.length === 0 ? undefined : allocatePassiveActivityLosses(
    activities.map((activity) => ({
      currentNet: roundWholeDollars(activity.current_net),
      priorUnallowed: roundWholeDollars(activity.prior_unallowed_operating),
      specialEligible: activity.activity_type === "A",
      priorSpecialEligible: activity.prior_active_participation === true,
    })),
    roundWholeDollars(passiveLossLimit(passiveActivity(passive!)).allowed),
  );
  const consumed = new Set<string>();
  const partnerships = pending.k1_partnership?.k1_partnerships ?? [];
  const corporations = pending.k1_s_corp?.k1_s_corps ?? [];
  for (const item of [...partnerships, ...corporations]) {
    const evidence = item.passive_income_source;
    if (!evidence) continue;
    const owner = evidence.recipient_tin;
    const primary = pending.general?.taxpayer_ssn?.replace(/\D/g, "");
    const spouse = pending.general?.spouse_ssn?.replace(/\D/g, "");
    if (evidence.tax_year !== taxYear ||
      (item.source_tax_year !== undefined && item.source_tax_year !== taxYear) ||
      (owner !== primary && !(filingStatus === FilingStatus.MFJ && owner === spouse))) {
      throw new Error("Historical Form 461 passive K-1 source must match the actual return year and owner");
    }
  }
  for (const expected of [
    ...passiveK1Activities(partnerships, "k1_partnership", true),
    ...passiveK1Activities(corporations, "k1_s_corp", true),
  ]) {
    const activity = activities.find((item) => item.activity_id === expected.activity_id);
    if (!activity || consumed.has(expected.activity_id) || !isDeepStrictEqual(activity, expected)) {
      throw new Error("Historical Form 461 passive K-1 activity must reconcile to its issued income and acquisition sources");
    }
    consumed.add(expected.activity_id);
  }
  let possibleBusinessLoss = 0;
  for (const property of properties) {
    const current = computePropertyNet(property);
    let postLimitation = current;
    if (isPassiveProperty(property)) {
      const index = activities.findIndex((activity) => activity.activity_id === property.activity_id);
      if (index >= 0) {
        const activity = activities[index];
        if (activity.reporting_form !== "schedule_e" || activity.current_net !== current ||
          activity.prior_unallowed_operating !== (property.prior_unallowed_passive_operating ?? 0) ||
          consumed.has(activity.activity_id)) {
          throw new Error("Historical owner Form 461 review needs uniquely reconciled rental activity loss allocations");
        }
        consumed.add(activity.activity_id);
        postLimitation = Math.max(0, current) - allocation!.allowed[index];
      } else if (current < 0 || (property.prior_unallowed_passive_operating ?? 0) > 0) {
        throw new Error("Historical owner Form 461 review needs the final allowed operating PAL for each rental activity");
      }
    }
    // These reviewed royalty links expressly identify nonbusiness royalties;
    // their gross issuer amount is already in this property, not another item.
    const knownNonbusiness = property.k1_royalty_source !== undefined ||
      property.f1099m_royalty_source !== undefined;
    if (!knownNonbusiness) possibleBusinessLoss += Math.min(0, postLimitation);
  }
  if (activities.some((activity) => !consumed.has(activity.activity_id))) {
    throw new Error("Historical owner Form 461 review needs all allowed passive loss activities reconciled to their source and business classification");
  }
  if (knownBusinessNet + possibleBusinessLoss < -threshold) {
    throw new Error("Historical owner Form 461 obligation depends on unresolved rental business classification; supply a sourced section 162 classification for each post-limitation activity before preparation");
  }
}
