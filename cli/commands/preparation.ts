import type { FormDefinition, PreparationIssue } from "../../core/types/form-definition.ts";
import { carryoverIssues, returnSourceReviewIssues } from "../store/carryovers.ts";

/** Linked losses are checked for every year; historical source review is explicit. */
export async function returnPreparationIssues(
  location: { readonly returnId: string; readonly baseDir: string },
  definition: FormDefinition,
  inputs: Readonly<Record<string, unknown>>,
  pending: Readonly<Record<string, Record<string, unknown>>>,
): Promise<readonly PreparationIssue[]> {
  const dependencies = await carryoverIssues(location.returnId, location.baseDir);
  if (definition.preparationMode !== "paper") return dependencies;
  const review = await returnSourceReviewIssues(location.returnId, location.baseDir);
  return [
    ...definition.preparationIssues(inputs, pending),
    ...dependencies,
    ...review,
  ];
}

export class PreparationBlockedError extends Error {
  constructor(readonly issues: readonly PreparationIssue[]) {
    super(`Preparation blocked:\n${issues.map((issue) => `  [${issue.code}] ${issue.form}: ${issue.message}`).join("\n")}\nUse --draft only for a visibly incomplete diagnostic copy; --force cannot adopt unknown or stale facts.`);
    this.name = "PreparationBlockedError";
  }
}
