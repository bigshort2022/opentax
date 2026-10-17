# TY2025 California Coverage and Trustworthy Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Unchecked boxes are future work, not completed evidence.

**Goal:** Make OpenTax explain exactly what its California workpaper computes, accepts as reviewed input, cannot check, and cannot prepare, without treating a skipped check or an empty error list as filing readiness.

**Architecture:** Keep California assessment jurisdiction-owned and reuse OpenTax storage, catalog, formatting, and pure calculation patterns. Add a small typed readiness reducer, a source-backed CA coverage inventory, and one state assessment entrypoint shared by validate/get/PDF. Retain the workpaper scope restriction and MeF export refusal throughout this milestone; complete tax scenarios follow in the companion plan.

**Tech Stack:** Existing Deno/TypeScript, Zod, node/CLI/store conventions, pdf-lib, Deno tests, and repository evidence harness. No service, database, network validator, or new runtime dependency.

**Design:** `../specs/2026-10-17-ca540-full-filing-design.md`.
**Next plan:** `2026-10-17-ca540-complete-scenarios.md`.

---

## 1. Scope, decisions, and non-goals

This is the first bounded contribution toward full TY2025 resident Form 540 support, not a change of the eventual full-return goal. Deliver explicit coverage and reliable explanations now, then expand source-backed complete scenarios. No actual transmission, payment, agency acceptance, 540NR, 540 2EZ, amendments, or earlier-year support. No automatic enrollment or dependency installation.

Do not remove `CA540_SCOPE_NOT_FILING_READY`, manufacture California XML, or make a production CA return pass readiness. Do not make schema validity depend on an IRS Form 1040 XSD. Official FTB access is not needed to deliver this diagnostic milestone; its absence must be represented honestly.

Keep existing federal behavior unchanged in this CA-focused contribution. The federal evaluator's weaker `canFile` semantics are an explicitly documented separate migration, not proof of federal readiness. A new generic reducer is not a second business-rule engine: it combines already evaluated gate results and never runs tax rules or executes nodes.

No persistent readiness cache in this milestone. Each command assesses the loaded return state afresh. Returned results describe that loaded snapshot, not subsequent edits or future exports.

## 2. Investigation evidence

Baseline: `4ff7eca3` plus the committed design specification on `codex/ca540-full-filing-design`.

| Finding | Evidence | Consequence |
| --- | --- | --- |
| CA is explicitly a workpaper | `forms/ca540/2025/index.ts:6-13`; `cli/commands/validate.ts:63-95` | Preserve the scope lock while replacing opaque diagnostics. |
| Review IDs depend on array position | `cli/commands/validate.ts:69-75` uses `CA540_REVIEW_${index + 1}` | Replace with stable semantic IDs; insertion of another blocker must not rename an existing issue. |
| State calculation exposes arbitrary line keys and string blockers | `core/types/form-definition.ts:7-10,60-72` | Add typed assessment results and migrate all CA consumers in one cutover. |
| Schema-valid input is not source-reconciled | `forms/ca540/2025/input.ts:15-40` accepts aggregates and review booleans | Distinguish supplied inputs from computed/independently verified facts. |
| Existing shared evaluator skips null, database, and duplicate checks, then uses `rejected === 0` | `core/validation/engine.ts:49-58,103-106`; synthetic review probe returned one skipped reject and `canFile: true` | Do not use that boolean as CA readiness. Distinguish unimplemented from externally unverified. |
| Shared text output says `READY TO FILE` and labels every skip a stub | `core/validation/report.ts:54-65` | Add an explicitly scoped CA view rather than inheriting that wording. |
| CA MeF is intentionally rejected | `cli/commands/export.ts:293-301` | `force` and `draft` cannot authorize state XML in this milestone. |
| Independent line 32 discrepancy | FTB line 32 AGI Limitation Worksheet floors the two credit groups separately; current `credits.ts:47-58` floors only their combined value | Include the confirmed source-backed correction before promoting arithmetic evidence. |
| CA evidence bypasses canonical checks | `benchmark/run_benchmark.ts:32-36` dispatches standalone line-31 vectors; `harness.ts:87-94` rejects CA product paths; `oracle.ts:60-70` expects canonical federal-shaped results | Moving JSON files alone is insufficient; make discovery, contracts, execution, and oracle checks product-aware. |
| PR CI does not execute CA tests/scenarios | `scripts/testing/run.ts:65-77` unit selection excludes `forms/ca540` and `cli/commands`; `.github/workflows/test.yml:24-31` runs no CA benchmark | Add an explicit CA test command and scenario job; module-graph visibility is not test execution. |

### Confirmed arithmetic reproduction

A throwaway Deno evaluation called the existing `calculateExemptionCredit` with synthetic single status, federal AGI 327203, personal exemptions 1, dependent exemptions 1, blind/senior 0. The engine returned 268. FTB's worksheet gives `ceil((327203 - 252203) / 2500) * 6 = 180` per exemption, then `max(153 - 180, 0) + max(475 - 180, 0) = 295`. This is independently derived worksheet arithmetic, not a published FTB example or an engine-generated oracle. No fix has been applied.

## 3. Contracts to implement

### 3.1 Separate product capability, return applicability, and check outcome

Do not collapse these into one boolean:

- **Capability:** `computed`, `supplied_input`, `unsupported`, `unavailable`. Supplied totals and review answers are never presented as computed supporting forms.
- **Applicability:** `required`, `not_applicable`, `unknown`. A non-applicability decision needs its predicate ID and fact/source evidence; missing facts produce unknown, never false by default.
- **Outcome:** `passed`, `failed`, `unsupported`, `not_run`, `unavailable`. Do not use a successful process exit or missing diagnostic as a pass.
- **External check status:** `unverified` or `not_applicable` with justification. Do not invent a local pass for FTB account-history, prior-year AGI matching, duplicate-file, or provider checks.

Use exported finite enums and Zod `nativeEnum` at serialized boundaries, following repository conventions. IDs are stable, jurisdiction/year-scoped where appropriate. Test semantic outcomes, not exact prose or incidental defaults.

Proposed core contract in `core/validation/readiness.ts`:

```ts
export enum GateId {
  Scope = "scope",
  Inputs = "inputs",
  Calculation = "calculation",
  Review = "review",
  RequiredDocuments = "required_documents",
  MefSchema = "mef_schema",
  LocalRules = "local_rules",
}
export enum GateStatus {
  Passed = "passed",
  Failed = "failed",
  Unsupported = "unsupported",
  NotRun = "not_run",
  Unavailable = "unavailable",
}
export enum LocalReadiness {
  Ready = "ready",
  Blocked = "blocked",
  Indeterminate = "indeterminate",
}
export interface GateResult {
  readonly id: GateId;
  readonly status: GateStatus;
  readonly diagnosticCodes: readonly string[];
}
export interface ReadinessResult {
  readonly status: LocalReadiness;
  readonly canFile: boolean;
  readonly missingGateIds: readonly GateId[];
}
```

`deriveLocalReadiness(gates: readonly GateResult[]): ReadinessResult` owns the fixed mandatory gate set above; callers cannot shrink it. Duplicate/unknown gate IDs are an invalid assessment and cannot yield ready. Any failed/unsupported gate yields blocked. Otherwise missing/not_run/unavailable gates yield indeterminate. Only exactly one passed result for every required gate yields ready. `canFile` is exactly `status === LocalReadiness.Ready`. Unknown applicability feeds a non-passing RequiredDocuments or LocalRules gate, not a bypass.

This reducer's unit-level all-passed case is not an assertion that the current CA product can populate those passes. In this milestone Scope remains Unsupported because the product is workpaper-only.

### 3.2 CA assessment and report

Create `forms/ca540/2025/assessment.ts` as the sole state assessment orchestration boundary. Input is the collection of stored CA entry fields; validate cardinality and schema before calling arithmetic. Expected input errors become structured findings, not thrown Zod dumps. Unexpected programmer/operational exceptions remain operational failures and must never be labeled successful validation.

The assessment includes valid calculated lines if available, typed findings, coverage assessments, the seven gate results, readiness, and external-check limitations. No fake zero lines on invalid input. A report extends the existing diagnostic report contract with a CA-specific `validationScope`, gate outcomes, readiness, and coverage. Keep the existing `canFile` field so consumers still receive the established field, but derive it only from this report's strict readiness result.

Do not infer a rule's implementation from a non-null predicate or its category. The existing federal rule inventory contains `alwaysPass` placeholders, and a locally checkable duplicate check can share a category with external duplicate-return checks. CA rule metadata must explicitly declare authority, implementation status, applicability, and required input facts. Keep this federal finding documented rather than copying its classifications into the new CA contract.

Replace the state's `calculate` orchestration member with `assess`; keep the pure exported `calculateForm540` arithmetic function for direct calculation consumers/tests. Migrate `index.ts`, the three state CLI branches, worksheet generation, and tests together; do not retain a deprecated `calculate` alias on the product definition. Replace string `blockers` with stable typed findings; project message strings only at the existing user-facing warnings boundary.

Stable codes include:

- `CA540_INPUT_COUNT`, `CA540_INPUT_INVALID`.
- `CA540_RESIDENCY_UNSUPPORTED`, `CA540_REVIEW_RESIDENCY`, `CA540_REVIEW_FILING_STATUS`.
- `CA540_REVIEW_INCOME_RECONCILIATION`, `CA540_DEDUCTIONS_ITEMIZED_UNSUPPORTED`, `CA540_DEDUCTION_DEPENDENT_UNSUPPORTED`.
- `CA540_REVIEW_STANDARD_DEDUCTION`, `CA540_REVIEW_CREDITS_TAXES`, `CA540_REVIEW_PAYMENTS`.
- Existing `CA540_SCOPE_NOT_FILING_READY` retained for its unchanged meaning.
- `CA540_REQUIRED_DOCUMENTS_UNKNOWN`, `CA540_MEF_SCHEMA_UNAVAILABLE`, `CA540_LOCAL_RULES_UNAVAILABLE`.

Store code, safe message template, field/requirement reference, severity, and stage. Do not store raw taxpayer values, raw Zod errors, or raw validator stderr in public diagnostics. Do not assign FTB rule IDs to project-owned checks.

### 3.3 Honest initial gates

| Gate | Valid current synthetic workpaper | Invalid/missing input |
| --- | --- | --- |
| Scope | unsupported; workpaper restriction | unsupported |
| Inputs | passed only for exactly one schema-valid entry | failed; no calculated values |
| Calculation | passed only if arithmetic ran successfully; not a full-return correctness claim | not_run |
| Review | passed only for required current review answers; no proof of legal eligibility | not_run or failed for known missing review |
| RequiredDocuments | not_run until complete fact-driven requirements can be determined | not_run |
| MefSchema | unavailable; no official CA package/serializer integrated | unavailable |
| LocalRules | unavailable; official CA rule inventory/evaluation not integrated | unavailable |

Overall CA readiness is blocked, even when current workpaper arithmetic and review answers pass. External checks remain separately unverified. Report facts such as "calculation completed" without saying "return verified".

### 3.4 Coverage inventory

Create `forms/ca540/2025/coverage.ts` as the typed product-owned inventory; render documentation from or reconcile it against that inventory, not a second manually divergent support list. Each requirement has an ID, form/line/section, source URL and exact section/page, capability, implementation reference, evidence scenario IDs, and a named applicability predicate. Unknown rules/fields cannot be omitted from totals to inflate completeness.

Initial inventory must account for these groups, expanding into individual fields/requirements while reading the official six-sided Form 540 and instructions:

| Requirement group | Initial assessment |
| --- | --- |
| Identity, addresses, filing status, residency, exemptions, dependent identifying details | Limited supplied facts; complete preparation/eligibility unsupported. |
| W-2 state wages; federal AGI and source reconciliation | Supplied input. Line 12 is state wages from all states, not just California wages. |
| Schedule CA Part I and nonconformity | Aggregate supplied totals; underlying schedule unsupported. |
| Standard deduction | Computed for the ordinary chart, eligibility supplied. |
| Itemized and dependent standard deductions | Unsupported. |
| CCF line 19 adjustment and FTB 3800/3803 alternative tax methods | Unsupported; cannot be treated as ordinary-rate-only cases without applicability facts. |
| Ordinary tax and line 32 exemption limitation | Computed; phaseout regression must be corrected before evidence is promoted. |
| Schedule G-1/FTB 5870A, nonrefundable credits, carryovers/recapture | Supplied totals or unsupported schedules; no computed eligibility claim. |
| Schedule P/AMT, behavioral health services tax, other taxes | Supplied totals, not supporting calculations. |
| Withholding, estimates, extension payments, refundable credits | Aggregate input only; source-ledger reconciliation unsupported. |
| Use tax and FTB 3853 health-coverage/ISR | Aggregate effects only; underlying calculations unsupported. |
| Excess use tax/ISR, refund allocation, voluntary contributions, final amount due, interest and estimated-tax penalties | Not a complete settlement calculation. |
| RDP/community-property adjustments and other required resident schedules | Unsupported unless actually implemented; explicit applicability questions required later. |
| Signatures, authorizations, attachments, XML mapping, external filing checks | Unsupported/unavailable; not implicitly satisfied by a calculated line. |

For the official TY2025 accepted-forms list, classify each form as relevant to original resident Form 540, outside this product, or requiring further applicability facts. Include counts/multiplicity and attachments in the eventual requirements inventory. Merely listing an accepted form does not mean every taxpayer needs it.

No overall "percent filing-ready" score. Report exact capability and assessment counts, plus unknowns and limitations. Add check-inventory completeness as an explicit blocker until all applicable requirements are covered.

## 4. Implementation tasks

### Task 1 — Preserve and correct source-backed exemption arithmetic

**Files:** modify `forms/ca540/2025/credits.ts`, `credits.test.ts`; add the regression evidence to the CA scenario ledger established by Task 6.

- [ ] Add this consumer-visible regression to `credits.test.ts` before changing arithmetic:

```ts
Deno.test("Form 540 floors exemption credit groups separately", () => {
  // FTB TY2025 Form 540 instructions, line 32, AGI Limitation Worksheet i/m/n.
  assertEquals(credits("single", 327_203, {
    personal: 1,
    dependents: 1,
  }), 295);
});
```

- [ ] Run `deno test forms/ca540/2025/credits.test.ts --filter 'floors exemption'`; expected current result: actual 268 versus expected 295.
- [ ] Replace the combined reduction with the worksheet's two separately floored groups:

```ts
const personalCount = input.personalExemptions + input.blindExemptions +
  input.seniorExemptions;
const personalCredit = personalCount * EXEMPTION_CREDIT;
const dependentCredit = input.dependentExemptions * DEPENDENT_EXEMPTION_CREDIT;
const threshold = agiThreshold(input.filingStatus);
const divisor = input.filingStatus === "separate" ? 1_250 : 2_500;
const steps = Math.max(0, Math.ceil((input.federalAgi - threshold) / divisor));
const reduction = steps * CREDIT_REDUCTION_PER_STEP;
return Math.max(0, personalCredit - reduction * personalCount) +
  Math.max(0, dependentCredit - reduction * input.dependentExemptions);
```

Remove obsolete combined-credit variables/branches, retaining input validation. Add phaseout cases immediately before/at/after exhaustion of each group and married-separate divisor boundaries. No new expected value may come from the implementation.
- [ ] Run the focused credit and calculation modules after the change, then the agreed final suite once the contribution is integrated. Record the source-derived correction honestly; do not alter published expected amounts to fit the engine.
- [ ] Commit separately as `fix(ca540): floor exemption credit groups independently`.

### Task 2 — Add the finite coverage inventory

**Create:** `forms/ca540/2025/coverage.ts`, `coverage.test.ts`.
**Modify:** `docs/ca540-ty2025.md` and the CA scenario evidence inventory in Task 6.

- [ ] Transcribe all Form 540 line/field groups and relevant schedule requirements against the primary sources in section 8, retaining unsupported and unknown entries.
- [ ] Implement the finite capability/applicability schemas and named predicate dispatch; no dynamic code evaluation from inventory text. A predicate may return unknown when required facts are absent.
- [ ] Test duplicate requirement IDs, unknown predicate IDs, missing sources, an implemented claim without evidence, and a required schedule missing from the computed result. These must reject or block; none may silently disappear.
- [ ] Test that `usesItemizedDeductions: true` identifies unsupported itemization, while absence of a new applicability fact yields unknown rather than not-applicable. A supplied zero credit cannot prove that a supporting schedule is unnecessary.
- [ ] Test a small source-traceable initial inventory projection: ordinary standard deduction is computed, Schedule CA inputs are supplied, itemized deduction is unsupported, and official schema is unavailable.
- [ ] Reconcile README/consumer scope with the inventory without claiming full-return support; commit `feat(ca540): describe explicit calculation coverage`.

### Task 3 — Implement the fail-closed readiness reducer

**Create:** `core/validation/readiness.ts`, `readiness.test.ts`.

- [ ] Implement the exact enums/contracts in section 3.1 and the fixed gate-set reducer. All callers receive the same mandatory gate set; no user-supplied allowlist may bypass it.
- [ ] Keep the reducer pure, linear in gate count, with no I/O, rules evaluation, source parsing, or state mutation.
- [ ] Add table-driven tests covering every gate removed in turn, every non-pass status in turn, duplicate IDs, unknown serialized IDs, empty results, and all mandatory passes. Example invariant test:

```ts
const passedGates = Object.values(GateId).map((id) => ({
  id,
  status: GateStatus.Passed,
  diagnosticCodes: [],
}));
assertEquals(deriveLocalReadiness(passedGates).canFile, true);
for (const missing of Object.values(GateId)) {
  const report = deriveLocalReadiness(passedGates.filter((g) => g.id !== missing));
  assertEquals(report.canFile, false);
  assertEquals(report.missingGateIds, [missing]);
}
```

Put the example inside a Deno test with imports of `assertEquals` and the defined readiness symbols. Add deterministic generated combinations to prove adding an unavailable required gate cannot improve readiness. A justified non-applicable requirement can satisfy its inventory obligation, but a mandatory validation gate cannot itself be marked not-applicable to evade checks.
- [ ] Run `deno test core/validation/readiness.test.ts`; commit `feat(validation): add explicit local-readiness gates`.

### Task 4 — Centralize state assessment and stable diagnostics

**Create:** `forms/ca540/2025/assessment.ts`, `assessment.test.ts`.
**Modify:** `core/types/form-definition.ts`, `forms/ca540/2025/calculation.ts`, `calculation.test.ts`, `index.ts`, `cli/commands/validate.ts`, `return.ts`, `export.ts`, and all CA fixtures/test consumers of `StateFormCalculation`.

- [ ] Before an exported-symbol change, inspect references with the language server; use the investigation map as a starting point, not an excuse to miss consumers.
- [ ] Move review and unsupported-case findings to a single typed source with the stable codes in section 3.2. Do not retain positional aliases or string-to-code text matching.
- [ ] Implement `assess` on the state product definition and migrate all state consumers. Existing pure arithmetic remains separately testable. Validate entry cardinality, use Zod safe parsing for expected input issues, and never compute on invalid input.
- [ ] Populate the honest gate table. Attach the coverage inventory and separately unverified external limitations. Aggregate summary counts must reconcile to the recorded evaluations/findings; failures are not counted as passes or hidden in skipped.
- [ ] Add tests for zero/two CA entries; malformed stored field types; missing required fields; valid zero monetary input; each false review answer; part-year/nonresident; itemized/dependent unsupported cases; reordered and additional findings preserving semantic IDs; and all review flags true still blocked by scope/MeF/coverage.
- [ ] Confirm get/validate/PDF use one assessment contract. A validation command returns structured findings on expected input errors; get/PDF must refuse unavailable calculations rather than fabricate totals. Do not catch unrelated filesystem/programming errors and convert them to success.
- [ ] Preserve CLI validation exit semantics: a successfully produced blocked report remains a successful inspection command. Operational failure is nonzero. Scenario assertions/CI must inspect typed readiness and fail on an unexpected result; exit zero is not filing readiness.
- [ ] Keep CA MeF refusal independent of `force` and `draft`. Do not route CA XML through federal builder/type assertions.
- [ ] Commit `feat(ca540): centralize scoped readiness assessment` after consumer migration and focused verification.

### Task 5 — Make CLI and worksheet diagnostics truthful

**Modify:** `core/validation/report.ts`, `cli/commands/ca540.test.ts`, `validate.test.ts`, `return.test.ts`, `export.test.ts`, `forms/ca540/2025/worksheet.ts`, `worksheet.test.ts`.

- [ ] Format CA reports with jurisdiction/year/product scope, arithmetic status, gate outcomes, requirement gaps, and external-check limitations. Use "local checks" and "workpaper only", not unqualified "READY TO FILE". Keep the federal format/contract unchanged here and document why.
- [ ] Show all missing applicability facts and unsupported requirements with stable codes and safe next actions. Do not imply that setting all review booleans true supplies the missing supporting schedules.
- [ ] Use separate categories for not-run and unavailable instead of labeling both "stub". Include both schema and rules statuses even when no calculation can run.
- [ ] Paginate the worksheet for worst-case diagnostics. Existing `worksheet.ts` uses a single page with a fixed downward cursor; an expanded report must not lose blockers off the bottom. Preserve not-official/not-e-fileable warnings and primary-source references on readable output.
- [ ] Extend the CLI test to compare gate/code semantics between JSON and text, preserve the public `canFile` false value, and reject CA MeF with both override flags. Use extraction and rendered visual inspection for multi-page PDF; do not pin complete wording/source text in permanent tests.
- [ ] Ensure sentinel synthetic sensitive values never appear in errors, stdout diagnostics, or PDF review-blocker text; intended tax line values in a locally requested private workpaper remain permitted. Keep artifacts outside the checkout and remove temporary workspaces afterward.
- [ ] Commit `feat(cli): expose California coverage and readiness limits`.

### Task 6 — Put California evidence under real harness enforcement

**Existing files to migrate:** `benchmark/ca540/2025/cases.json`, `benchmark/ca540_2025.ts`, `benchmark/run_benchmark.ts`, `benchmark/run_case.ts`, `benchmark/run_all.ts`, `benchmark/harness.ts`, `benchmark/check_cases.ts`, `scripts/testing/oracle.ts`, `oracle.test.ts`, `benchmark/harness.test.ts`.
**Create:** `benchmark/ca540.ts`, `benchmark/ca540.test.ts` for the typed canonical adapter and its behavior tests.
**New canonical case location:** `benchmark/cases/ca540/2025/<case>/input.json`, `correct.json`, `sources.json`, and `benchmark/cases/ca540/2025/ledger.json`. Keep the capability inventory in the product; a product-level `scenarios.json` lists case IDs and exercised requirement IDs without duplicating capability declarations.

- [ ] Move the two existing line-31 oracles to the canonical CA case contract without relabeling them full-return scenarios. Preserve exact FTB citations and provenance.
- [ ] Add a typed CA benchmark adapter rather than passing CA through federal FormDefinition casts, federal line names, or federal required-output assumptions. Keep IRS publication expectations for federal fixtures while allowing the explicit FTB source contract for CA.
- [ ] Resolve CA through `productCatalog`, not the federal-only `catalog`; update product path recognition and every canonical runner's explicit `--form ca540` creation/output contract. Export shared CA adapter contracts so check:cases, oracle, and execution validate the same inputs. Preserve default federal creation/routing.
- [ ] Add an explicit product/case kind (`line31`, `workpaper`, `complete_return`) with different required output contracts. Do not let a single-line case satisfy full-return coverage.
- [ ] Cover exact expected lines, exact blocker/code sets when relevant, required/absent schedules, capability profile, readiness status, and expected schema/rules state. Never accept a missing expected line via a zero/default fallback or skip a case whose inputs no longer fit the product schema.
- [ ] Use exact whole-dollar comparisons for CA; the shared federal runner currently allows a legacy $5 tolerance. Do not inherit that tolerance or silently change federal behavior. CA `--json` must return machine-readable per-case outcomes and correct totals, not the old standalone text output.
- [ ] Extend CA oracle change control to numeric values, readiness/gate states, diagnostic dispositions, required-document sets, source references, and coverage/scenario deletions. Keep federal numeric-ledger semantics unchanged. CA ledger entries name a typed assertion path, before/after values, official source or project policy authority, reviewer, and date. Do not falsely cite an FTB document as the authority for OpenTax's own workpaper policy. A missing ledger, empty suite, duplicate case ID, or deleted expected outcome cannot silently pass.
- [ ] Add isolated harness tests that alter a temporary CA expected result without a matching ledger, add an invalid CA field, remove an expected schedule, and remove all CA cases. Each must fail the owning check. No test modifies the repository's actual fixtures or `origin/main`.
- [ ] Remove the obsolete standalone CA fixture store/runner after migrating all commands; retain one canonical case source and one adapter per product. Do not keep two divergent CA oracle collections.
- [ ] Add workpaper baseline and the mixed-exemption regression evidence; no complete-return fixture is declared passing before the companion plan implements its requirements.
- [ ] Commit `test(ca540): enforce source-backed scenario evidence`.

### Task 7 — Verification and contribution handoff

**Modify:** `docs/ca540-ty2025.md`, `README.md`, `skills/opentax/SKILL.md`, `skills/tax-preparer/SKILL.md`, `skills/tax-reviewer/SKILL.md`, `deno.json`, `.github/workflows/test.yml`, `benchmark/README.md`, `scripts/testing/README.md`.

- [ ] Keep every named user surface consistent: workpaper scope, stable diagnostics, schema/rule unavailability, no transmission, no earlier-year support. Document the JSON contract change and preserve only intentional public fields, not positional diagnostic shims.
- [ ] Add `test:ca540` as an explicit Deno test task selecting `forms/ca540/2025`, `cli/commands/ca540.test.ts`, and `benchmark/ca540.test.ts`, with read/write and subprocess permissions for Deno and pdftotext as exercised by the selected tests. Run that task plus the canonical CA benchmark in CI. Do not claim the existing unit selection executes CA. Provision the existing required PDF utilities in the CA CI job explicitly; do not introduce runtime dependencies or auto-install locally.
- [ ] Run one integration verification set after changes are assembled:

```sh
deno task check:structure
deno task test:unit
deno task test:ca540
deno task check:cases
deno task check:oracle
deno task bench --form ca540 --year 2025
```

Focused bug/contract tests run before and after their relevant changes. Format only affected TypeScript, and run `git diff --check`. Do not weaken test discovery, baseline failures, or claims to make a check green.

- [ ] Existing federal benchmark invocation is known to fail on 28 invalid fixtures. Record it as a baseline limitation; do not rerun merely to reconfirm, fix those fixtures opportunistically, or claim a clean federal benchmark. If a planned shared-harness change introduces a new failure beyond that baseline, stop and fix the regression.
- [ ] Exercise the real CLI in a fresh private synthetic workspace: create/add/get/validate text and JSON/export worksheet/attempt MeF with no flags, force, and draft. Verify explicit limitations, no leaked values in error messages, no fabricated XML, and readable multi-page blockers. Observe actual output; tests alone are not sufficient evidence.
- [ ] Benchmark the assessment path separately from process startup, PDF rendering, and any future schema compilation. Record cold/warm wall time, peak memory if measurable, input/schedule counts, engine revision and platform. Use independent synthetic returns for throughput; never race writes to one return. No latency target is claimed as achieved by this plan.
- [ ] Open a bounded PR from latest main under `codex/`, preserving unrelated work. State which gates remain unavailable. No automatic merge, release, provider enrollment, external test submission, or production filing authorization.

## 5. Permanent regression acceptance matrix

| Scenario | Required observable result |
| --- | --- |
| Empty/duplicate gate collection | Not ready; exact missing/duplicate assessment defect visible. |
| Required local check unimplemented or exception/timeout | Non-pass; not silently skipped. |
| Required applicability fact absent | Unknown requirement, not a not-applicable pass. |
| Supporting schedule omitted by emitter | RequiredDocuments non-pass before emitted-document rule filtering. |
| All current review flags true | Arithmetic may pass; CA remains workpaper-only, cannot file. |
| Missing official FTB package | MefSchema/LocalRules unavailable; no fabricated schema result. |
| FTB-only account/duplicate checks | Separately unverified; no local acceptance claim. |
| Change one known review answer | Stable finding ID; unrelated IDs do not change. |
| Invalid stored input | Structured input failure; no misleading zero line output. |
| Mixed credit-group exhaustion | Line 32 follows two-group FTB worksheet and equals 295 for the confirmed regression. |
| CA expected result changes without evidence ledger | Oracle gate fails. |
| Many blockers | All remain accessible in JSON/text and legible paginated workpaper. |
| Force/draft CA MeF export | Still rejected, without XML output. |

## 6. Latency and scalability choices

No distributed infrastructure is justified for this milestone. Coverage lookup and readiness reduction are bounded local work; use maps for ID/reference joins and avoid repeated whole-inventory scans for each rule. Reuse an in-memory assessment within one command, not across changed returns. Do not render PDF or start XSD validation for ordinary arithmetic feedback.

A later XSD integration should first use a bounded local subprocess, with offline resolution, no external entities, resource limits, and version/hash checks. Only introduce persistent compiled-schema workers after measured repeated setup cost justifies the lifecycle/isolation complexity. Independent returns can run concurrently; one return's mutation remains serialized. Documentation/source URLs are provenance, never fetched on each validation call.

## 7. Exit criteria and unresolved external dependencies

This milestone is complete when coverage, stable diagnostics, gate distinctions, the credit correction, actual CA evidence checks, consumer updates, and CLI smoke evidence pass. A CA `canFile: true` is explicitly not an acceptance criterion.

Official FTB schema/rule artifacts and their distribution permissions remain unavailable in this investigation. Provider import compatibility, PATS applicability, external FTB-record checks, and actual submission are unverified. They block later filing-integration claims but not this contribution. Do not invent XML element names, official rule IDs, executable rule formats, provider behavior, or official-test results.

## 8. Primary sources

- FTB [2025 Form 540 instructions](https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html): Before You Begin; lines 6–19; line 31 alternate tax methods; line 32 AGI Limitation Worksheet; credits/taxes/payments/use tax/ISR and settlement.
- FTB [2025 Form 540](https://www.ftb.ca.gov/forms/2025/2025-540.pdf): six-sided field/line inventory. Obtain a readable authorized copy when transcribing exact field coverage; HTML instructions do not substitute for checking all printed fields.
- FTB [2025 Schedule CA instructions](https://www.ftb.ca.gov/forms/2025/2025-540-ca-instructions.html): California/federal reconciliation and deduction differences.
- FTB [2025 accepted individual forms](https://www.ftb.ca.gov/tax-pros/efile/individual-efile-forms.html): forms, multiplicity, and supporting schedules; not a claim that all apply to every return.
- FTB [individual XML schema versions/access](https://www.ftb.ca.gov/tax-pros/efile/individual-ftb-xml-schemas.html): authorized SES access, 2025v4.3 availability and PATS/production dates.
- FTB [enrollment and rejection examples](https://www.ftb.ca.gov/tax-pros/efile/enroll-in-efile-program.html): prior-year AGI and duplicate-return checks require FTB records.
- FTB [software provider approval limitations](https://www.ftb.ca.gov/tax-pros/efile/efile-software-providers.html): PATS does not establish support for every schedule or taxpayer.

## 9. Plan evidence status

The investigation read the implementation and official HTML instructions and reproduced the mixed-exemption discrepancy in a throwaway Deno invocation. The current workpaper restriction, MeF refusal, and shared skipped-rule behavior were exercised during the preceding review. No implementation code, tax fixture, schema, runtime dependency, or production return was changed in preparing this plan. Proposed paths and APIs above are future implementation contracts, not assertions that those files/functions already exist.
