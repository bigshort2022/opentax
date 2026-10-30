import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { catalog } from "../../catalog.ts";
import { capitalLossCarryover, type CapitalLossCarryover, LossProvenance, openingLossSourceSchema } from "../../forms/f1040/nodes/intermediate/aggregation/income/investments/schedule_d/carryover.ts";
import { lossLimitationsReviewSchema, reconstructedPriorLossSourceSchema } from "../../forms/f1040/nodes/intermediate/forms/income/business/form8582/reconstructed-source.ts";
import { firstYearActivitySourceSchema } from "../../forms/f1040/nodes/intermediate/forms/income/business/form8582/index.ts";
import { itemSchema as rentalItemSchema, computePropertyNet, isPassiveProperty, projectScheduleEItems } from "../../forms/f1040/nodes/inputs/income/rental-passthrough/schedule_e/index.ts";
import { resolveSourceBytes } from "../commands/return-source-files.ts";
import { buildEngineInputs, readReturnJson, withUpdatedInputs, writeReturnJson } from "./store.ts";
import { singletonPublicInputKeys } from "./public-input-keys.ts";
import { carryoverLinkSchema, carryoverReviewSchema, CarryoverInputKind, type AppliedCarryoverFields, type CarryoverIssue, type InputsJson, type ReturnJson } from "./types.ts";

export { LossProvenance };
export const carryoverArgsSchema = z.object({ sourceReturnId: z.string().uuid(), targetReturnId: z.string().uuid(), baseDir: z.string().min(1) }).strict();
export const carryoverReviewArgsSchema = carryoverArgsSchema.extend({ evidenceReference: z.string().trim().min(1), provenance: z.nativeEnum(LossProvenance), sourceComplete: z.literal(true) }).strict();
export type CarryoverArgs = z.infer<typeof carryoverArgsSchema>;
export type CarryoverReviewArgs = z.infer<typeof carryoverReviewArgsSchema>;
export const reviewReturnSourcesArgsSchema = carryoverReviewArgsSchema.omit({sourceReturnId:true,targetReturnId:true}).extend({returnId:z.string().uuid()}).strict();
export type ReviewReturnSourcesArgs = z.infer<typeof reviewReturnSourcesArgsSchema>;
export const rentalCarryoverSchema = z.object({
  activityId:z.string(), owner:z.string(), ownershipPercent:z.number(),
  operating:z.number().int().nonnegative(), form4797_part1:z.number().int().nonnegative(), form4797_part2:z.number().int().nonnegative(),
  incoming:z.number().int().nonnegative(), currentLoss:z.number().int().nonnegative(),
  allowed:z.number().int().nonnegative(), outgoing:z.number().int().nonnegative(), activeWhenIncurred:z.boolean(),
}).strict();
export type RentalCarryover = z.infer<typeof rentalCarryoverSchema>;

/** Locate only the two supported carryover inputs, including composite start claims. */
function carryoverRows(inputs:InputsJson,nodeType:CarryoverInputKind):AppliedCarryoverFields[] {
  const rows:AppliedCarryoverFields[]=(inputs[nodeType]??[]).map(entry=>({
    entryId:entry.id,nodeType,nestedInStart:false,
    ...(nodeType===CarryoverInputKind.Rental && typeof entry.fields.activity_id==="string" ? {activityId:entry.fields.activity_id}:{}),
    fields:{...entry.fields},
  }));
  for(const entry of inputs.start??[]) {
    const raw=entry.fields[nodeType];
    if(raw===undefined) continue;
    const nested=nodeType===CarryoverInputKind.Capital
      ? [z.record(z.string(),z.unknown()).parse(raw)]
      : z.array(z.record(z.string(),z.unknown())).parse(raw);
    for(const fields of nested) rows.push({
      entryId:entry.id,nodeType,nestedInStart:true,
      ...(nodeType===CarryoverInputKind.Rental && typeof fields.activity_id==="string" ? {activityId:fields.activity_id}:{}),
      fields,
    });
  }
  return rows;
}

function sameCarryoverLocation(a:AppliedCarryoverFields,b:AppliedCarryoverFields):boolean {
  return a.entryId===b.entryId && a.nodeType===b.nodeType &&
    a.nestedInStart===b.nestedInStart && a.activityId===b.activityId;
}

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function financialFingerprint(record: ReturnJson): string {
  return fingerprint({ meta: record.meta, inputs: record.inputs, carryoverLink: record.carryoverLink });
}
function engineInputs(record: ReturnJson) {
  const def = catalog[`${record.meta.formType ?? "f1040"}:${record.meta.year}`];
  if (!def || record.meta.formType !== "f1040" || record.meta.year < 2021 || record.meta.year > 2025) throw new Error("Carryover preparation requires a supported 2021–2025 federal individual return");
  return { def, inputs: buildEngineInputs(record.inputs, singletonPublicInputKeys(def)) };
}
function taxpayer(inputs: Record<string, unknown>): string {
  const general = inputs.general as Record<string,unknown> | undefined;
  const primary = String(general?.taxpayer_ssn ?? "").replaceAll("-", "");
  if (!/^\d{9}$/.test(primary) || !general?.filing_status) throw new Error("Carryover needs known taxpayer identity and filing status");
  if (general.filing_status !== "mfj") return primary;
  const spouse = String(general.spouse_ssn ?? "").replaceAll("-", "");
  if (!/^\d{9}$/.test(spouse)) throw new Error("Joint carryover needs known spouse identity");
  return [primary,spouse].sort().join(":");
}

/** T/S/J identify roles only; ownership follows the people across return years. */
function rentalOwner(inputs: Record<string,unknown>, role: unknown): string | undefined {
  const general = z.object({filing_status:z.string(),taxpayer_ssn:z.string(),spouse_ssn:z.string().optional()}).safeParse(inputs.general);
  if (!general.success) return undefined;
  const primary = general.data.taxpayer_ssn.replaceAll("-","");
  const spouse = general.data.spouse_ssn?.replaceAll("-","");
  if (role === "T") return /^\d{9}$/.test(primary) ? primary : undefined;
  if (general.data.filing_status !== "mfj") return undefined;
  if (role === "S") return spouse && /^\d{9}$/.test(spouse) ? spouse : undefined;
  if (role === "J" && /^\d{9}$/.test(primary) && spouse && /^\d{9}$/.test(spouse)) return [primary,spouse].sort().join(":");
  return undefined;
}

function sameRentalOwner(source: Record<string,unknown>, target: Record<string,unknown>, sourceRole: unknown, targetRole: unknown): boolean {
  const owner = rentalOwner(source,sourceRole);
  return owner !== undefined && owner === rentalOwner(target,targetRole);
}

/** Missing applicable history is not a zero balance, including on paper exports. */
export function carryoverInputIssues(inputs: Readonly<Record<string,unknown>>, year: number): CarryoverIssue[] {
  const issues: CarryoverIssue[] = [];
  const d = inputs.schedule_d as Record<string,unknown> | undefined;
  let applicable = d !== undefined || ["f8949","f1099b"].some(key=>Array.isArray(inputs[key]) && inputs[key].length > 0);
  for (const [key,fields] of [
    ["f1099div",["box2a"]],
    ["k1_partnership",["box8_net_st_cap_gain","box9a_net_lt_cap_gain"]],
    ["k1_s_corp",["box7_net_st_cap_gain","box8a_net_lt_cap_gain"]],
  ] as const) {
    const rows = z.array(z.record(z.string(),z.unknown())).safeParse(inputs[key] ?? []);
    if (rows.success && rows.data.some(row=>fields.some(field=>typeof row[field]==="number" && row[field]!==0))) applicable = true;
  }
  if (applicable && (!d || typeof d.line_6_carryover !== "number" || typeof d.line_14_carryover !== "number" || !openingLossSourceSchema.safeParse(d.opening_loss_source).success)) {
    issues.push({code:"UNKNOWN_OPENING_LOSS",message:"Capital history requires separate known ST/LT opening losses (including reviewed zero) and source evidence",form:"Schedule D"});
  } else if (d?.opening_loss_source && openingLossSourceSchema.parse(d.opening_loss_source).tax_year !== year-1) {
    issues.push({code:"WRONG_OPENING_YEAR",message:"Capital opening evidence must be from the immediately prior year",form:"Schedule D"});
  }
  const rentals = Array.isArray(inputs.schedule_e) ? inputs.schedule_e as Record<string,unknown>[] : [];
  const ids = new Set<unknown>();
  for (const row of rentals) {
    if (row.activity_type !== "A" && row.activity_type !== "B") continue;
    if (!row.activity_id || ids.has(row.activity_id)) issues.push({code:"RENTAL_ACTIVITY_ID",message:"Passive rental activities require unique durable activity IDs",form:"Schedule E"});
    ids.add(row.activity_id);
    const source = reconstructedPriorLossSourceSchema.safeParse(row.reconstructed_prior_loss_source);
    const firstYear = firstYearActivitySourceSchema.safeParse(row.first_year_activity_source);
    const knownFirstYear = firstYear.success && firstYear.data.activity_id === row.activity_id &&
      Number(firstYear.data.activity_acquired_on.slice(0,4)) === year;
    if (row.first_year_activity_source !== undefined && !knownFirstYear) issues.push({code:"RENTAL_OPENING_MISMATCH",message:"First-year rental evidence must identify this activity and acquisition in the return year",form:"Form 8582"});
    if (!source.success && !row.prior_year_8582_source && !knownFirstYear) issues.push({code:"UNKNOWN_RENTAL_OPENING",message:`Activity ${row.activity_id ?? "unidentified"} needs reviewed opening loss history, including zero`,form:"Form 8582"});
    if (source.success && (source.data.tax_year !== year-1 || source.data.activity_id !== row.activity_id || source.data.operating !== row.prior_unallowed_passive_operating || source.data.form4797_part1 !== row.prior_unallowed_passive_4797_part1 || source.data.form4797_part2 !== row.prior_unallowed_passive_4797_part2)) issues.push({code:"RENTAL_OPENING_MISMATCH",message:"Rental opening year, activity and character amounts do not reconcile",form:"Form 8582"});
    if (!lossLimitationsReviewSchema.safeParse(row.loss_limitations_review).success || row.some_investment_not_at_risk === true || Number(row.prior_unallowed_at_risk ?? 0) > 0) issues.push({code:"UNRESOLVED_LOSS_LIMITATION",message:`Activity ${row.activity_id ?? "unidentified"} needs resolved basis, at-risk and separate QBI transition evidence`,form:"Schedule E"});
    const prior = Number(row.prior_unallowed_passive_operating ?? 0) + Number(row.prior_unallowed_passive_4797_part1 ?? 0) + Number(row.prior_unallowed_passive_4797_part2 ?? 0);
    if (row.qbi_trade_or_business === "Y" && prior > 0 && row.qbi_override === undefined) issues.push({code:"UNRESOLVED_QBI_TRANSITION",message:`Activity ${row.activity_id ?? "unidentified"} requires separately reconciled allowed QBI; passive carryovers cannot replace its QBI attributes`,form:"Form 8995"});
  }
  return issues;
}

/** Includes ancestors, review invalidation and independently edited linked balances. */
export async function carryoverIssues(returnId: string, baseDir: string): Promise<CarryoverIssue[]> {
  z.string().uuid().parse(returnId);
  const visiting = new Set<string>();
  async function visit(id: string): Promise<CarryoverIssue[]> {
    if (visiting.has(id)) return [{code:"STALE_CARRYOVER",message:"Cyclic carryover dependency",form:"carryover"}];
    visiting.add(id);
    try {
      const record = await readReturnJson(join(baseDir,id));
      const def = catalog[`${record.meta.formType ?? "f1040"}:${record.meta.year}`];
      const tracked = record.carryoverLink !== undefined || record.carryoverReview !== undefined ||
        [...carryoverRows(record.inputs,CarryoverInputKind.Capital),...carryoverRows(record.inputs,CarryoverInputKind.Rental)].some(row=>row.fields.opening_loss_source!==undefined || row.fields.reconstructed_prior_loss_source!==undefined);
      if (!tracked && record.meta.year >= 2025) return [];
      if (!def) throw new Error("Unsupported carryover source year");
      const inputs = buildEngineInputs(record.inputs,singletonPublicInputKeys(def));
      const issues = carryoverInputIssues(inputs,record.meta.year);
      if (record.carryoverReview && record.carryoverReview.fingerprint !== financialFingerprint(record)) issues.push({code:"STALE_CARRYOVER_REVIEW",message:"Source financial inputs changed after carryover review",form:"carryover"});
      if (record.carryoverLink) {
        const link = carryoverLinkSchema.parse(record.carryoverLink);
        z.string().uuid().parse(link.sourceReturnId);
        const source = await readReturnJson(join(baseDir,link.sourceReturnId));
        const review = source.carryoverReview;
        const sourceInputs = engineInputs(source).inputs;
        if (source.meta.year !== record.meta.year-1 || link.sourceYear !== source.meta.year || taxpayer(sourceInputs) !== taxpayer(inputs) || financialFingerprint(source) !== link.sourceFingerprint || !review || review.fingerprint !== financialFingerprint(source) || fingerprint(review) !== link.reviewFingerprint) issues.push({code:"STALE_CARRYOVER",message:`Inherited carryover from ${link.sourceReturnId} requires review and explicit reapplication`,form:"carryover"});
        for (const applied of link.appliedFields) {
          const row = carryoverRows(record.inputs,applied.nodeType).find(candidate=>sameCarryoverLocation(candidate,applied));
          if (!row || Object.entries(applied.fields).some(([key,value])=>canonical(row.fields[key])!==canonical(value))) issues.push({code:"STALE_CARRYOVER",message:"Linked destination opening fields were independently changed",form:"carryover"});
          if (row && applied.nodeType === CarryoverInputKind.Rental) {
            const sourceRow = carryoverRows(source.inputs,CarryoverInputKind.Rental).find(candidate=>candidate.activityId===applied.activityId);
            if (!sourceRow || !sameRentalOwner(sourceInputs,inputs,sourceRow.fields.tsj,row.fields.tsj) ||
              Number(sourceRow.fields.ownership_percent ?? 100) !== Number(row.fields.ownership_percent ?? 100)) {
              issues.push({code:"STALE_CARRYOVER",message:"Linked rental owner or ownership share changed; reconcile the source before reviewing or reapplying",form:"Schedule E"});
            }
          }
        }
        const inherited = await visit(link.sourceReturnId);
        if (inherited.length) issues.push({code:"STALE_CARRYOVER",message:`Ancestor ${link.sourceReturnId} has unresolved carryover dependencies: ${inherited.map(i=>i.code).join(", ")}`,form:"carryover"});
      }
      return issues;
    } catch (error) { return [{code:"STALE_CARRYOVER",message:error instanceof Error ? error.message : String(error),form:"carryover"}]; }
    finally { visiting.delete(id); }
  }
  return visit(returnId);
}

export async function previewCarryover(raw: CarryoverArgs) {
  const args = carryoverArgsSchema.parse(raw);
  const source = await readReturnJson(join(args.baseDir,args.sourceReturnId));
  const target = await readReturnJson(join(args.baseDir,args.targetReturnId));
  const {def,inputs} = engineInputs(source);
  const targetInputs = engineInputs(target).inputs;
  const issues = (await carryoverIssues(args.sourceReturnId,args.baseDir)).filter(i=>i.code!=="STALE_CARRYOVER_REVIEW");
  if (source.meta.year >= 2025 && !source.carryoverReview && !source.carryoverLink) issues.push(...carryoverInputIssues(inputs,source.meta.year));
  let taxpayerMatches = false;
  try { taxpayerMatches = taxpayer(inputs) === taxpayer(targetInputs); } catch(error) { issues.push({code:"UNKNOWN_TAXPAYER",message:String(error),form:"1040"}); }
  if (!taxpayerMatches) issues.push({code:"TAXPAYER_MISMATCH",message:"Carryover requires the same taxpayer (and spouse for joint returns)",form:"1040"});
  if (target.meta.year !== source.meta.year+1) issues.push({code:"NONCONSECUTIVE_YEARS",message:"Carryover destination must be the immediately following year",form:"carryover"});
  let capital: CapitalLossCarryover | undefined;
  const rentals: RentalCarryover[] = [];
  try {
    const sourceRentals = projectScheduleEItems(z.array(rentalItemSchema).parse(inputs.schedule_e ?? []),source.meta.year);
    const resolved = await resolveSourceBytes(join(args.baseDir,args.sourceReturnId),inputs);
    const result = def.executeReturn(resolved);
    issues.push(...result.diagnostics.map(d=>({code:d.code,message:d.message,form:d.nodeType})));
    const d = result.pending.schedule_d;
    const f = result.pending.f1040;
    if (d && typeof d.print_line7_st_total === "number" && typeof d.print_line15_lt_total === "number") {
      if (!f || typeof f.line11_agi !== "number") throw new Error("Capital worksheet needs computed source AGI");
      if (typeof f.line14_deductions_qbi_total !== "number") throw new Error("Capital worksheet needs computed total deductions before the taxable-income zero floor");
      const general = z.object({filing_status:z.string()}).parse(inputs.general);
      capital = capitalLossCarryover({netShortTerm:d.print_line7_st_total,netLongTerm:d.print_line15_lt_total,taxableIncomeBeforeFloor:f.line11_agi-f.line14_deductions_qbi_total,allowedDeduction:Math.abs(Number(d.print_line21_loss ?? 0)),marriedFilingSeparately:general.filing_status==="mfs"});
    } else if (inputs.schedule_d) {
      const opening = z.object({line_6_carryover:z.literal(0),line_14_carryover:z.literal(0)}).safeParse(inputs.schedule_d);
      if (!opening.success) throw new Error("Source Schedule D did not produce complete short- and long-term net amounts");
      if (!f || typeof f.line11_agi !== "number" || typeof f.line14_deductions_qbi_total !== "number") throw new Error("Capital worksheet needs completed source income and deductions");
      capital = capitalLossCarryover({netShortTerm:0,netLongTerm:Number(f.line7a_cap_gain_distrib ?? 0),taxableIncomeBeforeFloor:f.line11_agi-f.line14_deductions_qbi_total,allowedDeduction:0});
    }
    const activities = result.pending.form8582?.activities;
    if (Array.isArray(activities)) for (const activity of activities as Record<string,unknown>[]) {
      if (activity.reporting_form !== "schedule_e") continue;
      const id = String(activity.activity_id);
      const sourceRow = sourceRentals.find(row=>row.activity_id===id);
      if (!sourceRow) throw new Error("Rental activity has no canonical source property");
      const outgoing = result.carryforwards[`suspended_pal_8582:${id}`] ?? 0;
      const character = (form:string) => (result.carryforwards[`suspended_pal_8582_partix:${encodeURIComponent(id)}:${form}`] ?? 0)+(result.carryforwards[`suspended_pal_8582_partviii:${encodeURIComponent(id)}:${form}`] ?? 0);
      const part1 = character("form4797_part1"), part2 = character("form4797_part2");
      const incoming = Number(activity.prior_unallowed_operating)+Number(activity.prior_unallowed_4797_part1)+Number(activity.prior_unallowed_4797_part2);
      const currentLoss = Math.max(0,-Number(activity.current_net));
      if (outgoing < part1+part2 || outgoing > incoming+currentLoss) throw new Error("Rental suspended loss character reconciliation failed");
      const priorActive = activity.prior_active_participation === true;
      const currentActive = activity.activity_type === "A";
      if (outgoing > 0 && incoming > 0 && currentLoss > 0 && priorActive !== currentActive) throw new Error("Rental outgoing losses have mixed participation histories requiring separate reconciliation");
      const activeWhenIncurred = incoming > 0 && currentLoss === 0 ? priorActive : currentActive && (incoming === 0 || priorActive);
      rentals.push(rentalCarryoverSchema.parse({activityId:id,owner:sourceRow.tsj,ownershipPercent:sourceRow.ownership_percent ?? 100,operating:outgoing-part1-part2,form4797_part1:part1,form4797_part2:part2,incoming,currentLoss,allowed:incoming+currentLoss-outgoing,outgoing,activeWhenIncurred}));
    }
    for (const row of sourceRentals.filter(isPassiveProperty)) {
      if (rentals.some(r=>r.activityId===row.activity_id)) continue;
      if (computePropertyNet(row)<0 || (row.prior_unallowed_passive_operating ?? 0)+(row.prior_unallowed_passive_4797_part1 ?? 0)+(row.prior_unallowed_passive_4797_part2 ?? 0)!==0) throw new Error("Rental activity has no complete computed passive-loss reconciliation");
      rentals.push(rentalCarryoverSchema.parse({activityId:row.activity_id,owner:row.tsj,ownershipPercent:row.ownership_percent ?? 100,operating:0,form4797_part1:0,form4797_part2:0,incoming:0,currentLoss:0,allowed:0,outgoing:0,activeWhenIncurred:row.activity_type==="A"}));
    }
    const unallocated = result.carryforwards.suspended_pal_8582 ?? 0;
    if (rentals.reduce((sum,r)=>sum+r.outgoing,0)!==unallocated) issues.push({code:"UNALLOCATED_RENTAL_LOSS",message:"Suspended passive losses require complete activity and character allocation",form:"Form 8582"});
  } catch(error) { issues.push({code:"INCOMPLETE_SOURCE",message:error instanceof Error?error.message:String(error),form:"carryover"}); }
  const protectedRows:{row:AppliedCarryoverFields;keys:readonly string[]}[]=[];
  if (capital) for (const row of carryoverRows(target.inputs,CarryoverInputKind.Capital)) protectedRows.push({row,keys:["line_6_carryover","line_14_carryover","opening_loss_source"]});
  for (const rental of rentals) {
    const matches=carryoverRows(target.inputs,CarryoverInputKind.Rental).filter(row=>row.activityId===rental.activityId);
    if (matches.length!==1) issues.push({code:"TARGET_ACTIVITY_MISMATCH",message:`Destination needs one matching activity ${rental.activityId}`,form:"Schedule E"});
    for (const row of matches) {
      if (!sameRentalOwner(inputs,targetInputs,rental.owner,row.fields.tsj) || Number(row.fields.ownership_percent ?? 100)!==rental.ownershipPercent) issues.push({code:"TARGET_ACTIVITY_MISMATCH",message:`Destination ownership differs for activity ${rental.activityId}`,form:"Schedule E"});
      protectedRows.push({row,keys:["prior_unallowed_passive_operating","prior_unallowed_passive_4797_part1","prior_unallowed_passive_4797_part2","prior_passive_losses_active_when_incurred","reconstructed_prior_loss_source"]});
    }
  }
  if (target.carryoverLink?.sourceReturnId === args.sourceReturnId) {
    for (const applied of target.carryoverLink.appliedFields) {
      const replacement = protectedRows.find(({row})=>sameCarryoverLocation(row,applied));
      if (!replacement || Object.keys(applied.fields).some(key=>!replacement.keys.includes(key))) {
        issues.push({code:"TARGET_CARRYOVER_DISAPPEARED",message:`Previously installed carryover ${applied.entryId} is absent from the new transfer; absence is not a reviewed zero and requires explicit reconciliation`,form:"carryover"});
      }
    }
  }
  for (const {row,keys} of protectedRows) {
    const prior=target.carryoverLink?.sourceReturnId===args.sourceReturnId
      ? target.carryoverLink.appliedFields.find(applied=>sameCarryoverLocation(row,applied)):undefined;
    for (const key of keys) if(Object.hasOwn(row.fields,key) && (!prior || !Object.hasOwn(prior.fields,key) || canonical(row.fields[key])!==canonical(prior.fields[key]))) {
      issues.push({code:"TARGET_CARRYOVER_CONFLICT",message:`Independent destination ${row.entryId}.${key} cannot be overwritten`,form:"carryover"});
    }
  }
  return {sourceReturnId:args.sourceReturnId,targetReturnId:args.targetReturnId,sourceYear:source.meta.year,targetYear:target.meta.year,taxpayerMatches,sourceFingerprint:financialFingerprint(source),targetFingerprint:financialFingerprint(target),review:source.carryoverReview,capital,rentals,issues};
}

/** Source-inventory review without a destination, sharing the carryover review record. */
export async function reviewReturnSources(raw: ReviewReturnSourcesArgs) {
  const args = reviewReturnSourcesArgsSchema.parse(raw);
  const path = join(args.baseDir,args.returnId);
  const current = await readReturnJson(path);
  const {def,inputs} = engineInputs(current);
  taxpayer(inputs);
  const issues = (await carryoverIssues(args.returnId,args.baseDir)).filter(i=>i.code!=="STALE_CARRYOVER_REVIEW");
  if (current.meta.year >= 2025 && !current.carryoverReview && !current.carryoverLink) issues.push(...carryoverInputIssues(inputs,current.meta.year));
  const result = def.executeReturn(await resolveSourceBytes(path,inputs));
  issues.push(...result.diagnostics.map(d=>({code:d.code,message:d.message,form:d.nodeType})));
  if (issues.length) throw new Error(issues.map(i=>`${i.code}: ${i.message}`).join("; "));
  const sourceFingerprint = financialFingerprint(current);
  if (canonical(await readReturnJson(path))!==canonical(current)) throw new Error("Source changed during review");
  const review = carryoverReviewSchema.parse({fingerprint:sourceFingerprint,evidenceReference:args.evidenceReference,provenance:args.provenance,sourceComplete:true,reviewedAt:new Date().toISOString()});
  await writeReturnJson(path,{...current,carryoverReview:review});
  return review;
}

export async function returnSourceReviewIssues(returnId:string,baseDir:string): Promise<CarryoverIssue[]> {
  z.string().uuid().parse(returnId);
  const record = await readReturnJson(join(baseDir,returnId));
  const review = carryoverReviewSchema.safeParse(record.carryoverReview);
  if (!review.success) return [{code:"SOURCE_REVIEW_REQUIRED",message:"Complete income, deductions, payments and applicable opening history require an explicit evidence-bound source review",form:"1040"}];
  if (review.data.fingerprint!==financialFingerprint(record)) return [{code:"STALE_SOURCE_REVIEW",message:"Financial inputs changed after the source-inventory review",form:"1040"}];
  return [];
}

export async function reviewCarryover(raw: CarryoverReviewArgs) {
  const args = carryoverReviewArgsSchema.parse(raw);
  const preview = await previewCarryover({sourceReturnId:args.sourceReturnId,targetReturnId:args.targetReturnId,baseDir:args.baseDir});
  if (preview.issues.length) throw new Error(preview.issues.map(i=>`${i.code}: ${i.message}`).join("; "));
  const path = join(args.baseDir,args.sourceReturnId);
  const current = await readReturnJson(path);
  if (financialFingerprint(current)!==preview.sourceFingerprint) throw new Error("Source changed during review");
  const review = carryoverReviewSchema.parse({fingerprint:preview.sourceFingerprint,evidenceReference:args.evidenceReference,provenance:args.provenance,sourceComplete:true,reviewedAt:new Date().toISOString()});
  await writeReturnJson(path,{...current,carryoverReview:review});
  return review;
}

export async function applyCarryover(raw: CarryoverArgs) {
  const args = carryoverArgsSchema.parse(raw);
  const preview = await previewCarryover(args);
  const review = preview.review && carryoverReviewSchema.parse(preview.review);
  if (preview.issues.length || !review || review.fingerprint!==preview.sourceFingerprint) throw new Error([...preview.issues.map(i=>`${i.code}: ${i.message}`),...(!review || review.fingerprint!==preview.sourceFingerprint?["Carryover source needs a current explicit completeness review"]:[])].join("; "));
  const path = join(args.baseDir,args.targetReturnId);
  const target = await readReturnJson(path);
  if(financialFingerprint(target)!==preview.targetFingerprint) throw new Error("Destination changed after carryover preview");
  const oldLink = target.carryoverLink;
  if (oldLink && oldLink.sourceReturnId!==args.sourceReturnId) throw new Error("Destination already inherits a different source");
  const inputs = structuredClone(target.inputs);
  const appliedFields:AppliedCarryoverFields[]=[];
  function install(row:AppliedCarryoverFields,fields:Record<string,unknown>) {
    const prior=oldLink?.appliedFields.find(applied=>sameCarryoverLocation(row,applied));
    for (const key of Object.keys(fields)) {
      if (Object.hasOwn(row.fields,key) && (!prior || !Object.hasOwn(prior.fields,key) || canonical(row.fields[key])!==canonical(prior.fields[key]))) throw new Error(`Independent destination carryover ${row.entryId}.${key} cannot be overwritten`);
    }
    const updatedFields={...row.fields,...fields};
    if(row.nestedInStart) {
      inputs.start=inputs.start.map(entry=>{
        if(entry.id!==row.entryId) return entry;
        const nested=row.nodeType===CarryoverInputKind.Capital ? updatedFields
          : z.array(z.record(z.string(),z.unknown())).parse(entry.fields.schedule_e).map(item=>item.activity_id===row.activityId?updatedFields:item);
        return {...entry,fields:{...entry.fields,[row.nodeType]:nested}};
      });
    } else {
      const entries=inputs[row.nodeType]??[];
      const existing=entries.some(entry=>entry.id===row.entryId);
      const updated={id:row.entryId,fields:updatedFields};
      inputs[row.nodeType]=existing ? entries.map(entry=>entry.id===row.entryId?updated:entry) : [...entries,updated];
    }
    appliedFields.push({...row,fields});
  }
  const built = engineInputs(target).inputs;
  const sourceInputs = engineInputs(await readReturnJson(join(args.baseDir,args.sourceReturnId))).inputs;
  if (preview.capital) {
    const rows=carryoverRows(inputs,CarryoverInputKind.Capital);
    if(rows.length>1) throw new Error("Ambiguous destination Schedule D");
    const row=rows[0]??{entryId:"schedule_d_01",nodeType:CarryoverInputKind.Capital,nestedInStart:false,fields:{}};
    install(row,{line_6_carryover:preview.capital.shortTerm,line_14_carryover:preview.capital.longTerm,opening_loss_source:{tax_year:preview.sourceYear,evidence_reference:review.evidenceReference,provenance:review.provenance}});
  }
  for (const rental of preview.rentals) {
    const matches = carryoverRows(inputs,CarryoverInputKind.Rental).filter(row=>row.activityId===rental.activityId);
    if (matches.length!==1) throw new Error(`Destination requires exactly one matching rental activity ${rental.activityId}`);
    const row = matches[0];
    if (row.fields.activity_type!=="A" && row.fields.activity_type!=="B") throw new Error("Destination rental passive classification is incompatible");
    if (!sameRentalOwner(sourceInputs,built,rental.owner,row.fields.tsj) || Number(row.fields.ownership_percent ?? 100)!==rental.ownershipPercent) throw new Error("Destination rental ownership differs");
    lossLimitationsReviewSchema.parse(row.fields.loss_limitations_review);
    if (row.fields.some_investment_not_at_risk===true || Number(row.fields.prior_unallowed_at_risk??0)>0) throw new Error("Destination at-risk limitation is unresolved");
    install(row,{prior_unallowed_passive_operating:rental.operating,prior_unallowed_passive_4797_part1:rental.form4797_part1,prior_unallowed_passive_4797_part2:rental.form4797_part2,prior_passive_losses_active_when_incurred:rental.activeWhenIncurred,reconstructed_prior_loss_source:{tax_year:preview.sourceYear,activity_id:rental.activityId,provenance:review.provenance,evidence_reference:review.evidenceReference,operating:rental.operating,form4797_part1:rental.form4797_part1,form4797_part2:rental.form4797_part2}});
  }
  const link = carryoverLinkSchema.parse({sourceReturnId:args.sourceReturnId,sourceYear:preview.sourceYear,sourceFingerprint:preview.sourceFingerprint,reviewFingerprint:fingerprint(review),appliedFields});
  const next = {...(canonical(inputs)===canonical(target.inputs) ? target : withUpdatedInputs(target,inputs)),carryoverLink:link};
  const targetExecution = engineInputs(next);
  const inputIssues = carryoverInputIssues(targetExecution.inputs,target.meta.year);
  if (inputIssues.length) throw new Error(inputIssues.map(i=>i.message).join("; "));
  const result = targetExecution.def.executeReturn(await resolveSourceBytes(path,targetExecution.inputs));
  if (result.diagnostics.length) throw new Error(result.diagnostics.map(i=>i.message).join("; "));
  if (taxpayer(built)!==taxpayer(targetExecution.inputs)) throw new Error("Destination taxpayer changed");
  const finalSource = await readReturnJson(join(args.baseDir,args.sourceReturnId));
  if (financialFingerprint(finalSource)!==preview.sourceFingerprint || fingerprint(finalSource.carryoverReview)!==fingerprint(review) || canonical(await readReturnJson(path))!==canonical(target)) throw new Error("Return changed during carryover application");
  const unchanged = canonical(next)===canonical(target);
  if (!unchanged) await writeReturnJson(path,next);
  return {sourceReturnId:args.sourceReturnId,targetReturnId:args.targetReturnId,applied:!unchanged,idempotent:unchanged,capital:preview.capital,rentals:preview.rentals};
}
