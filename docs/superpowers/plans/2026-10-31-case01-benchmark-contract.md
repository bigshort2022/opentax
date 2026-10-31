# Case 01 benchmark contract and provenance repair

## Goal

Repair `benchmark/cases/f1040/2025/01-single-w2-minimal` on the existing historical-preparation PR. Preserve all 23 expected keys and dollar amounts. Do not change tax formulas, generate expectations from the engine, repair unrelated cases, or touch taxpayer stores.

## Evidence and scope

The retained product-CLI walkthrough computed AGI $15,000, taxable income $0, tax $0, payments $312, and refund $312, with no executor warnings. The exact-dollar scorer checked seven assertions without a numeric mismatch and rejected sixteen as unmapped. This is the failing-before evidence, not a claim that all 23 assertions already passed.

The October 14 issue-77 notes describe a targeted arithmetic correction, not full source certification. Their generic QDCGT, senior-deduction and child-credit wording does not describe this Single, under-65, childless W-2 case. Replace that ambiguity with case-specific authority and explicit synthetic assumptions; retain the historical review record.

Canonical sorted `correct` object SHA-256 before this repair: `dbd91716e7d0e9af0192ebd295086c71af3b04ba125ec78d32693f151ec9df2f`.

## Decisions

- Add an opt-in `reviewed_synthetic` oracle scope. It requires a validated binding and authority entry for **every** expected value, no orphan bindings, explicit synthetic assumptions and source limitations. Compare these cases at **$0 tolerance**. Existing unreviewed cases retain their current mappings and $5 tolerance; published-line cases remain exact.
- Use a small, finite observable vocabulary, not arbitrary aliases supplied by a fixture. Eleven ordinary return-line observations include the existing seven fields plus standard deduction, income tax, tax before credits and EIC.
- Observe `ordinary_taxable` from the successfully executed income-tax node's actual parsed `taxable_income` input only on its ordinary-rate route. Reject preferential, foreign-exclusion, averaging and special-tax routes rather than infer an intermediate from Form 1040 line 15.
- The eleven zero-activity assertions check **no contribution** from their actual producers: QBI, SE tax, Additional Medicare Tax, child/dependent-care/education credits, PTC and excess Social Security. A successful node with no matching emitted contribution is evidence of zero contribution, not evidence that every private worksheet calculated a zero. Education without source facts may be explicitly inactive. Missing, unimplemented, failed or unrecorded execution is never evidence of zero. Nonzero or malformed contributions fail. These zero-activity observables do not promise to disaggregate positive combined child/other-dependent or AOTC/LLC credits.
- Record opt-in execution evidence at the executor boundary: successful parsed inputs and emitted outputs/finalizations, explicit optional-without-source skips, failures and unavailable nodes. Capture only when requested; ordinary runs allocate no trace. Do not add filed zero lines or mutate node inputs/results.
- Request this evidence through the existing `getReturnCommand` implementation from the harness after creating/populating the synthetic return with the CLI. This avoids a second engine execution and avoids shipping a benchmark-only CLI flag. Default CLI responses remain unchanged. Evidence is transient and is not persisted into a return.
- Report exact assertion coverage and evidence kinds for reviewed cases. Continue to state that neither a synthetic benchmark pass nor citation presence certifies a completed IRS return, eligibility, PDF/MeF correctness or filing readiness.

## Shared interfaces

Runtime: `NodeContext.captureExecution?: boolean`; `ExecuteResult.execution?: Readonly<Record<string, NodeExecution>>`. Export `NodeExecutionStatus` with `computed`, `inactive`, `failed`, `unavailable`. Each entry identifies `nodeType`; computed entries contain actual parsed `input`, actual `outputs`, and `finalizations` when present. Inactive entries contain the existing empty/context-only input; they are not successful calculations. Failed/unavailable entries cannot carry successful output evidence. `FormDefinition.executeReturn(inputs, options?: { readonly captureExecution?: boolean })`; TY2025 forwards the option. `GetReturnArgs.captureExecution?: boolean`; `GetReturnResult.execution?: ExecuteResult["execution"]`. Other form/year implementations need not fabricate unsupported evidence.

Harness: new `benchmark/reviewed_contract.ts` owns `reviewedSyntheticExpectedSchema` (untransformed validated fixture), `parseReviewedSyntheticFixture(unknown)`, and `resolveReviewedAssertions(fixture, actualLines, execution)` returning `{ actual: Record<string, unknown>, evidence: readonly { field: string; observable: string; status: string; detail: string }[] }`. Missing/unavailable evidence leaves the corresponding actual value absent, so existing strict numeric comparison fails. Schema requires `oracle_scope: "reviewed_synthetic"`, finite `correct` including the three final-balance values, `source` plus `sources`, and `provenance: { kind: "synthetic", reviewed: YYYY-MM-DD, assumptions: string[], limitations: string[], assertions: Record<expectedKey, { observable, authority: "published_amount" | "instruction_application" | "benchmark_convention", citation: string, basis: string }> }`. Observable and authority codes use exported enums with `z.nativeEnum`. Validate exact key coverage and zero expected amounts for zero-activity observables. Citation must be one of the fixture's declared sources and an official IRS URL. Metadata describes the synthetic source; it is not a new expected-value oracle.

## Work items

### 1. Execution evidence

Files: core context/executor/form-definition, TY2025 definition, CLI return command, executor regression tests.

- [x] Add optional capture without changing default calculations or response shape.
- [x] Distinguish computed, legitimately inactive, failed and unavailable steps; publish success only after output/finalization processing succeeds.
- [x] Keep multi-pass evidence tied to the final returned execution; never substitute a counterfactual's trace.
- [x] Regression-test inactive versus invalid/throwing/unavailable execution and unchanged default financial results.

### 2. Reviewed synthetic contract and provenance

Files: new contract module/tests; case 01 `input.json` and `correct.json`.

- [x] Define strict reviewed bindings and fail-closed resolution. Preserve all 23 numeric expectations.
- [x] Record specific IRS authorities, synthetic closed-world assumptions and non-certification limitations.
- [x] Correct the scenario: $15,000 wages are **below**, not equal to, the $15,750 standard deduction.
- [x] Replace generic reconciliation claims with a dated case-specific review, retaining the issue-77 historical scope.
- [x] Test missing/failed evidence, unexpected contributions, unsupported tax routes, unknown bindings and incomplete/orphan provenance.

### 3. Harness integration and reporting

Files: harness, runner, report and their existing tests; benchmark README and architecture contract.

- [x] Validate reviewed fixtures at discovery and keep default unreviewed classification strict.
- [x] Run the same product return command once with capture requested only for reviewed fixtures.
- [x] Compare all reviewed assertions at exact-dollar tolerance; report scored fields and evidence/authority kinds, including the difference between no contribution and a computed intermediate.
- [x] Preserve failure accounting, source-error precedence, exclusions and partial-output warnings.

### 4. Verification and delivery

- [x] Actual isolated synthetic CLI smoke plus reviewed benchmark smoke: all 23 assertions, original expectation hash, $312 refund and no errors.
- [x] Core/contract/integration regressions; required structure, cases, oracle and typed unit gates; lint.
- [x] Full TY2025 benchmark: inspect all changes against the retained 109-case baseline, not just a reduced case selection. TY2021–2024 published-line benchmarks remain green.
- [ ] Review the change, record exercised verification and remaining limits below, commit/push to PR #4, and inspect its checks. Do not merge.

## Authority register

- [2025 Form 1040 instructions](https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf): p. 6 Single deduction $15,750; p. 68 zero-income Tax Table row; p. 115 dependent-care credit; p. 117 excess Social Security withholding. Ordinary-rate tax base is a benchmark intermediate, not a separately filed line.
- [Publication 596 (2025)](https://www.irs.gov/pub/irs-prior/p596--2025.pdf): pp. 2–6 and childless eligibility rules; p. 31, $15,000–under-$15,050, Single/no-children EIC $312. Eligibility remains synthetic.
- [2025 Form 1040](https://www.irs.gov/pub/irs-prior/f1040--2025.pdf): pp. 1–2, income/AGI, deductions, taxable-income floor, tax/credit/payment totals, refund and balance due.
- [Form 8995 (2025)](https://www.irs.gov/pub/irs-prior/f8995--2025.pdf): qualifying business/REIT/PTP income; none assumed here.
- [Schedule SE instructions (2025)](https://www.irs.gov/pub/irs-prior/i1040sse--2025.pdf): pp. 1, 4; ordinary employee W-2 wages are not self-employment income.
- [Form 8959 (2025)](https://www.irs.gov/pub/irs-prior/f8959--2025.pdf): p. 1, lines 1–7; Single $200,000 threshold.
- [Schedule 8812 (2025)](https://www.irs.gov/pub/irs-prior/f1040s8--2025.pdf): pp. 1–2; no qualifying children or other dependents assumed.
- [Form 8863 (2025)](https://www.irs.gov/pub/irs-prior/f8863--2025.pdf): pp. 1–2; no education source or qualified expenses assumed.
- [Form 8962 (2025)](https://www.irs.gov/pub/irs-prior/f8962--2025.pdf): p. 1, lines 24–29; no Marketplace coverage, advance credits or policy allocations assumed.

## Verification record

The implementation, independent reviews and local verification are complete. Publication and remote-check status are recorded separately below.

| Check | Observed result |
| --- | --- |
| Original oracle | All 23 keys and numeric values unchanged; canonical hash remains `dbd91716e7d0e9af0192ebd295086c71af3b04ba125ec78d32693f151ec9df2f` |
| Actual isolated CLI | AGI $15,000; taxable income/tax $0; payments/refund $312; no warnings; default response has no capture |
| Case 01 reviewed report | 23/23 exact matches: 11 return lines, one observed ordinary-rate input, nine completed no-contribution observations, two explicitly inactive education observations |
| Final typed unit gate | 451 passed, one prerequisite-guarded WSDL-schema skip, zero failures across 64 files; 3,379 graph modules; runtime unchanged |
| Source/contract follow-up | 37 focused tests passed after the final Form 1040 line-13a citation clarification; case and oracle checks remain clean |
| Structure | 227 nodes, 17 baseline exceptions, zero structure problems; 1,276 year-pinned occurrences, zero year problems |
| Case/oracle gates | 117 valid and 28 known-invalid cases, zero problems; 145 oracle cases, eight pre-existing historical additions versus `origin/main`, zero problems |
| TY2025 full corpus | 137 discovered, 109 executed, 28 excluded, zero not run; 23 passed / 86 failed, expected exit 1 |
| Whole-corpus comparison | All 109 displayed financial rows unchanged; only case 01 changes FAIL to PASS; every other detailed failure record unchanged |
| TY2021–2024 | All eight published-line benchmarks pass, two per year |
| Capture parity smoke | All 374 synthetic return fixtures produce identical financial/diagnostic/carryforward/replay results with capture off/on; 372 include traces, two intentionally omit them (adoption and QEF-deferral fixtures); zero executor diagnostics |
| Lint | Exit 0; 238 existing warnings in 107 files, no diagnostics reported in modified modules |

Final unit evidence: `.state/research/testing/unit-BsQZIr/terminal.json` and adjacent logs. An earlier run correctly rejected edits made to two test/inventory files while it was running; that rejected run is not passing evidence. The final stable-tree run above supersedes it.

The remaining 86 failures split into 38 with compared-line failures, nine with errors but no compared-line failures, and 39 with unmapped checks only. Citation metadata is present for 27 executed cases and missing for 82; six passing cases still lack citations. Case 01's authorities explicitly distinguish two published amounts, 19 instruction applications and two benchmark conventions.

### Review-driven boundary correction

The scorer already accepted singleton numeric arrays, but the inactive-balance normalizer accepted only scalar balances/totals. Both balance directions and break-even totals now use the same strict single-value reader without changing raw values or accepting empty/multiple/nonfinite amounts. Two added regressions failed before and passed after the correction. Shared malformed-return-envelope rejection remains a case-level error; reviewed reports disclose zero compared assertions instead of pretending partial output was fully scored.

### Evidence limits

Capture is unavailable for Form 8839, Form 8990 and Form 8621 QEF-deferral projection paths rather than returning a stale trace. Reviewed zero-activity bindings do not certify private worksheet results or disaggregate positive combined credits. IRS eligibility and taxpayer-source authenticity remain synthetic assumptions. No PDF/MeF acceptance, filing certification, or real taxpayer-store modification is claimed.
