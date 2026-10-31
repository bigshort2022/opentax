import { applyCarryover, previewCarryover, reviewCarryover, reviewReturnSources, type CarryoverArgs, type CarryoverReviewArgs, type ReviewReturnSourcesArgs } from "../store/carryovers.ts";

/** Read-only worksheet, reconciliation and unresolved-requirement preview. */
export async function previewCarryoverCommand(args: CarryoverArgs) {
  return await previewCarryover(args);
}

/** Explicit review binds evidence to financial inputs; it never asserts filing. */
export async function reviewCarryoverCommand(args: CarryoverReviewArgs) {
  return await reviewCarryover(args);
}

/** Prevalidate every balance before one atomic destination replacement. */
export async function applyCarryoverCommand(args: CarryoverArgs) {
  return await applyCarryover(args);
}

/** Affirm source coverage independently of a next-year transfer. */
export async function reviewReturnSourcesCommand(args: ReviewReturnSourcesArgs) {
  return await reviewReturnSources(args);
}
