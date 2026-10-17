# California Form 540 TY2025 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a supported TY2025 California resident Form 540 calculation path that produces transparent line results and a reviewable preparation worksheet, while refusing to imply unsupported cases are file-ready.

**Architecture:** Keep the existing federal MeF `FormDefinition` intact and add a separately typed California paper/workpaper definition. Reuse return storage and input-node conventions, but branch state return behavior before federal MeF assembly, validation, and export. Implement California Form 540 arithmetic as pure functions over validated CA input facts, project its line values into a deterministic, explicitly non-filing worksheet PDF, and document all scope gaps.

**Tech Stack:** Deno, TypeScript, Zod, existing CLI/store/runtime, `pdf-lib`, Deno unit tests and benchmark harness.

---

## Scope and source rules

This first state slice covers **TY2025, full-year California residents, Form 540 (not Form 540 2EZ or 540NR)**. It is a calculation workpaper, not a complete tax-preparation or filing-readiness system. Inputs are preparer-reviewed federal AGI, state wages, Schedule CA Part I line 27 Column B/Column C totals, filing status, standard-deduction eligibility, exemption facts, supplied amounts for supported credit/tax lines, and a single aggregate for Form 540 line 95 payments after use tax and penalty. The program computes lines 12–19, 31–35, 40, 45–48, 61–64, 95, 97, and 100, including ordinary tax and exemption credits. It does not prepare Schedule CA or supporting schedules; determine filing-status eligibility, residency, itemized/dependent deductions, credit eligibility, special/additional taxes, use tax, health-coverage penalty, or payment entitlement; or calculate all Form 540 lines through 111. Required review flags do not establish factual completeness. The generated artifact is labeled **preparation worksheet—not an official Form 540, not e-fileable, and not a filing-readiness determination**.

No TY2022–2024 support; no Form 540NR/540 2EZ; no amended returns; no federal return preparation; no claiming Form 540 supports all California-specific schedules, deductions, credits, payments, or filing rules. A user must reconcile federal amounts and state adjustments using the official instructions and supporting forms. No tax-filing/payment/submission authorization is inferred.

Primary sources (rules and oracles must point to these, not to the engine):

- FTB, [2025 Form 540](https://www.ftb.ca.gov/forms/2025/2025-540.pdf) (six sides; signature on Side 6).
- FTB, [2025 Instructions for Form 540](https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html): Before You Begin; filing status; lines 6–11 exemptions; lines 12–19; line 31 tax; line 32 exemption-credit limitation; lines 71–73 payments; lines 91–92 use tax and individual shared responsibility; lines 97–111 settlement.
- FTB, [2025 Schedule CA (540)](https://www.ftb.ca.gov/forms/2025/2025-540-ca.pdf) and [instructions](https://www.ftb.ca.gov/forms/2025/2025-540-ca-instructions.html): Part I column A federal amounts, columns B/C California subtractions/additions, line 27 totals; Part II itemized deductions. The instructions state Schedule CA adjusts federal AGI and deductions and explicitly list California/federal nonconformity.
- FTB, [2025 California Tax Table](https://www.ftb.ca.gov/forms/2025/2025-540-taxtable.pdf) and [2025 California Tax Rate Schedules](https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf): line 31 calculation; table applies at taxable income $100,000 or less, schedules above $100,000.
- FTB, [2025 Form 540 booklet](https://www.ftb.ca.gov/forms/2025/2025-540-booklet.html): published standard deduction chart and rate schedule instructions; TY2025 changes including OBBBA nonconformity.

FTB itself says the instructions summarize tax law and are not authoritative law. Supporting statutes/publications and a tax professional remain necessary for questions outside this narrow calculation. Do not claim filing readiness based only on these instruction summaries.

## File structure to implement

- Create `forms/ca540/2025/` for TY2025 schemas, pure calculations, return definition, and tests; put reusable CA Form 540 nodes only under the repository's canonical `forms/<form>/nodes/...` tree if the existing structure checker requires a `TaxNode` graph.
- Modify `core/types/form-definition.ts` to define the shared base and explicit California paper-return definition without fake MeF methods; retain the federal definition contract unchanged.
- Modify `catalog.ts` to register `ca540:2025` as a distinct paper-return definition.
- Modify `cli/commands/return.ts`, `cli/commands/form.ts`, `cli/commands/validate.ts`, and `cli/commands/export.ts` only where required to route state returns through state-specific summary, validation, and worksheet export, and to reject MeF export for `ca540` with a clear error.
- Modify `cli/commands/*.test.ts` for consumer-visible catalog routing and no-MeF behavior; add direct `forms/ca540/2025/*.test.ts` for calculation boundaries and unsupported cases.
- Modify `benchmark/run_benchmark.ts` for a separate California line-31 runner and add FTB-cited cases beneath `benchmark/ca540/2025/`; keep the federal benchmark harness unchanged.
- Create `docs/ca540-ty2025.md` describing supported lines, excluded situations, source citations, worksheet semantics, and manual filing requirements. Update `README.md` supported-form list and current support boundary.

## Tasks

### Task 1: Prove the TY2025 tax-table oracle and core arithmetic

**Files:**
- Create: `forms/ca540/2025/tax.test.ts`
- Create: `forms/ca540/2025/tax.ts`
- Create: `benchmark/ca540/2025/cases.json`

- [x] Extract expected tax values from exact FTB table/rate schedule entries. Tests cover table-band edges and the $100,000/$100,001 transition for single and joint status; no federal brackets or implementation-derived oracle values.
- [x] Write tests for table-band lookup, rate-schedule transitions, filing-status distinctions, and invalid inputs.
- [x] Run `deno test forms/ca540/2025/tax.test.ts`; all focused cases pass.
- [x] Implement pure status-specific table/rate-schedule calculation with fail-closed input checks.
- [x] Re-run focused tests and confirm source-backed expected values pass.

### Task 2: Define supported Schedule CA and Form 540 inputs

**Files:**
- Create: `forms/ca540/2025/input.ts`
- Create: `forms/ca540/2025/calculation.ts`
- Create: `forms/ca540/2025/calculation.test.ts`

- [x] Define the strict TY2025 input schema with separate federal AGI, state wages, Schedule CA B/C totals, exemption facts, supplied line amounts, and required review flags. Missing material fields are rejected rather than defaulted.
- [x] Test lines 12–19, 31–35, 40, 45–48, 61–64, 95/97/100, valid zeros, taxable-income floor, and unsupported residency/dependent cases. Line 111 and supporting schedules remain out of scope.
- [x] Run focused calculation and exemption-credit tests; all pass.
- [x] Implement whole-dollar Form 540 arithmetic; retain federal AGI separately from CA additions/subtractions.
- [x] Re-run calculation/credit tests against FTB-sourced tax and exemption-credit values.

### Task 3: Add a real state-return definition and route it safely

**Files:**
- Modify: `core/types/form-definition.ts`
- Modify: `catalog.ts`
- Create: `forms/ca540/2025/index.ts`
- Modify: `cli/commands/return.ts` and `cli/commands/return.test.ts`
- Modify: `cli/commands/form.ts` and `cli/commands/form.test.ts`
- Modify: `cli/commands/validate.ts` and `cli/commands/validate.test.ts`
- Modify: `cli/commands/export.ts` and `cli/commands/export.test.ts`

- [x] Add consumer-facing CLI workflow coverage for create/add/get/validate/MeF refusal/PDF export.
- [x] Run the new end-to-end CLI test; the first run failed at unsupported catalog routing, then passed after implementation.
- [x] Register a distinct paper-workpaper definition; keep federal MeF definition and benchmark catalog unchanged.
- [x] Focused state CLI test and repository unit suite pass; the federal `catalog` remains FormDefinition-only.

### Task 4: Produce a reviewable, truthful preparation worksheet

**Files:**
- Create: `forms/ca540/2025/worksheet.ts`
- Create: `forms/ca540/2025/worksheet.test.ts`
- Modify: `cli/commands/export.ts` and its tests if Task 3 did not already add the path.

- [x] PDF extraction test verifies TY2025 identity, line values, citations, limitations, and no-official/no-e-file/no-readiness warning.
- [x] Run the focused PDF extraction test; it passes.
- [x] Generate worksheet PDF with calculated lines, citations, blockers, and manual-review warnings; no official-form imitation or filing claims.
- [x] Render and inspect the worksheet page. Text and line values are legible; all content fits on one page.

### Task 5: Add FTB-sourced benchmark coverage and documentation

**Files:**
- Create: `benchmark/ca540/2025/cases.json`
- Create: `benchmark/ca540_2025.ts`
- Create: `docs/ca540-ty2025.md`
- Modify: `README.md`

- [x] Add two independent FTB-cited line 31 cases: one in the tax table and one above $100,000 in Schedule X.
- [x] Add a separate `ca540` benchmark branch and run it successfully; the existing federal harness branch is untouched. The federal invocation remains blocked by pre-existing invalid fixtures, recorded below.
- [x] Add consumer documentation and README scope statement with primary FTB citations and explicit exclusions.
- [x] Review README and consumer documentation; all unsupported scopes are explicitly excluded.

### Task 6: Verify the complete change and publish a follow-up PR

**Files:** all CA Form 540 implementation, tests, benchmark, and docs in this plan.

- [x] `deno task check:structure` — 228 node files, 20 baseline exceptions, 0 problems.
- [x] `deno task test:unit` — 158 tests, 0 failures.
- [x] `deno task check:cases` (105 valid, 28 baselined known-invalid, 0 problems) and `deno task check:oracle` (133 cases, 0 changes, 0 problems).
- [x] `deno task bench --form ca540 --year 2025` — 2 FTB line 31 cases pass. `deno task bench --form f1040 --year 2025` exits with 28 known-invalid fixtures despite the case checker baseline; do not claim the federal benchmark passes.
- [x] Run actual CLI create/add/get/validate/PDF/MeF smoke using a synthetic return under a fresh `/tmp` workspace; PDF written, validation remains `canFile: false`, MeF rejected.
- [x] `deno fmt --check` for changed TypeScript and `git diff --check` pass; wrapper-repo Ruff is not applicable because it was not changed.
- [x] Merged PR #1 first, updated PR #2 from the new `main`, and reconciled all three skill scope gates with the limited CA workpaper boundary.

## Acceptance gates

1. FTB primary-source expected values cover both the $100,000 tax-table boundary and a rate-schedule computation, with filing-status distinction and rounding checks.
2. Schedule CA column B/C totals drive Form 540 lines 14/16 and are separately visible; no federal-line copying masks required California adjustments.
3. Omitted material taxpayer facts create explicit blockers; unsupported cases cannot produce a filing-ready status.
4. The catalog/CLI create, add, get, validate, and PDF export path works end to end for `ca540:2025`; MeF export is rejected without fabricated XML.
5. Worksheet says not official / not e-fileable / not a filing-readiness determination; it carries source links and unresolved blockers.
6. The federal `catalog` and execution branch remain unchanged. The federal benchmark command still exits on 28 invalid cases; this feature does not claim a clean federal benchmark run.
7. TY2022–2024 remains unclaimed. PR #1 is merged; PR #2 contains the workpaper, updated skill scope, citations, and verification evidence.
