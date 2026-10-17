import { z } from "zod";

export enum CoverageCapability {
  Computed = "computed",
  SuppliedInput = "supplied_input",
  Unsupported = "unsupported",
  Unavailable = "unavailable",
}

export enum Applicability {
  Required = "required",
  NotApplicable = "not_applicable",
  Unknown = "unknown",
}

export enum AcceptedFormClassification {
  ResidentRelevant = "resident_relevant",
  OutsideScope = "outside_scope",
  Unknown = "unknown",
}

export const coverageCapabilitySchema = z.nativeEnum(CoverageCapability);
export const applicabilitySchema = z.nativeEnum(Applicability);
export const acceptedFormClassificationSchema = z.nativeEnum(
  AcceptedFormClassification,
);
const nonempty = z.string().trim().min(1);
const requirementShape = {
  id: nonempty,
  formRef: nonempty,
  locator: nonempty,
  source: z.object({ url: z.string().url(), locator: nonempty }).strict()
    .readonly(),
  capability: coverageCapabilitySchema,
  implementationRef: nonempty.nullable(),
  // Canonical scenario assertion references, not executed-test or complete-support claims.
  scenarioEvidenceIds: z.array(nonempty).readonly(),
  // The owning product validates this reference against its finite predicate enum.
  predicateId: nonempty,
  acceptedForm: z.object({
    classification: acceptedFormClassificationSchema,
    maxPerReturn: nonempty,
  }).strict().readonly().optional(),
};

function checkEvidence(
  row: {
    capability: CoverageCapability;
    implementationRef: string | null;
    scenarioEvidenceIds: readonly string[];
  },
  ctx: z.RefinementCtx,
): void {
  if (
    row.capability !== CoverageCapability.Computed &&
    row.capability !== CoverageCapability.SuppliedInput
  ) return;
  if (!row.implementationRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["implementationRef"],
      message: "Implemented coverage requires an implementation reference",
    });
  }
  if (row.scenarioEvidenceIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scenarioEvidenceIds"],
      message: "Implemented coverage requires scenario evidence",
    });
  }
}

export const coverageRequirementSchema = z.object(requirementShape).strict()
  .superRefine(checkEvidence).readonly();
export type CoverageRequirement = z.infer<typeof coverageRequirementSchema>;

/** Safe evidence contains field references and decision codes, never taxpayer values. */
export const coverageEvidenceSchema = z.object({
  fact: nonempty,
  decision: nonempty,
}).strict().readonly();

export const coverageAssessmentSchema = z.object({
  ...requirementShape,
  applicability: applicabilitySchema,
  evidence: z.array(coverageEvidenceSchema).readonly(),
}).strict().superRefine(checkEvidence).readonly();
export type CoverageAssessment = z.infer<typeof coverageAssessmentSchema>;
