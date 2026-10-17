# TY2025 California Complete-Tax Scenarios Expansion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans for implementation. Checkboxes describe future work, not verified support.

**Goal:** Expand the explicit-coverage workpaper into complete, source-backed resident Form 540 tax scenarios, proving facts, applicability, supporting schedules, settlement, and readiness outcomes rather than merely producing a favorable `canFile` boolean.

**Architecture:** Build California source-input, intermediate schedule, and output nodes within OpenTax's existing graph conventions. A year-owned scenario/capability inventory drives requirement selection, while the canonical benchmark adapter exercises the actual product route and compares independent expectations. Add official FTB XML/local-rule validation as a later dependency-gated stage; tax-scenario correctness can advance without pretending that unavailable filing checks passed.

**Tech Stack:** Existing TypeScript/Deno, Zod, TaxNode graph, CLI/store, canonical benchmark source/ledger checks, local PDF tools. No remote service or new runtime package is selected by this plan.

**Prerequisite:** `2026-10-17-ca540-coverage-readiness.md` completed with the credit correction, stable findings, CA test execution, and canonical evidence enforcement. This is an ordered expansion program: each scenario family has a bounded implementation/acceptance gate; none independently establishes universal resident-return or provider approval.

---

## 1. Claims and scenario kinds

Keep four claims separate:

1. A `line31` case proves one independently sourced tax computation.
2. A `workpaper` case proves selected calculations from supplied totals plus intentional limitations.
3. A `complete_return` case proves all tax facts, applicable forms, eligibility branches, and settlement for its explicitly bounded taxpayer scenario. It may correctly have `canFile: false` while official MeF gates are unavailable.
4. A locally MeF-validated complete scenario additionally proves emitted XML and locally evaluable official rules against the pinned FTB package. It is still not transmission, provider import, PATS approval, or FTB acceptance.

Do not populate purportedly complete cases with unsupported aggregate zeros or set review flags solely to obtain a pass. Explicit zero is a fact with an applicability/source basis; absent is unknown. An unavailable official rule package is not a test skip counted as successful filing validation.

## 2. Harness gaps to close first

These were inspected, not assumed:

- `benchmark/ca540_2025.ts` invokes only `calculateOrdinaryTax`; its two JSON vectors are not under canonical `benchmark/cases`.
- `benchmark/harness.ts:87-94` recognizes only federal-style product names, resolves federal `catalog`, and requires federal outputs. Moving CA directories alone cannot work.
- `scripts/testing/oracle.ts` recognizes canonical `correct.json` paths but parses numeric values through the federal schema. It does not review CA rule/readiness/document expectations.
- The shared benchmark stops at return get. It must explicitly invoke validation and relevant output stages to prove a scenario.
- `scripts/testing/run.ts:65-77` excludes CA tests from unit selection; `.github/workflows/test.yml` runs only the current selection/preflight. Add explicit CA execution, not a graph-discovery claim.
- Federal benchmark comparisons retain a $5 tolerance. CA comparisons must be exact whole dollars unless the source explicitly requires another precision.

The prerequisite plan migrates these paths. Do not recreate a second scenario harness here.

## 3. Finite case and oracle contract

Canonical layout:

```text
benchmark/cases/ca540/2025/
  scenarios.json
  ledger.json
  <scenario-id>/
    input.json
    correct.json
    sources.json
```

`scenarios.json` enumerates executable case IDs, kind, supported taxpayer profile, and requirement IDs exercised. Product capabilities remain in `forms/ca540/2025/coverage.ts`; do not duplicate support assertions in JSON. Requirements lacking a reviewed executable case remain explicitly unsupported/unverified in coverage, not silently skipped runnable fixtures.

- `input.json`: explicit product `ca540`, year 2025, stable ID, synthetic-only declaration, actual public input nodes/facts, and supported profile. Source values and eligibility facts remain distinct from calculated values.
- `sources.json`: source ID, official URL, year/revision, page/line/worksheet locator, printed amount or independently derived calculation, rounding method, and unresolved limitations. No generated XML or output.json is an oracle.
- `correct.json`: kind/profile, required exact Form 540 and supporting-schedule values, required and forbidden document IDs/counts, expected stable findings, all seven gate statuses, readiness and `canFile`, and references to source IDs or project policy for each assertion. Compare sets order-independently only where order has no legal/serialization significance; XML ordering is not a set.
- `ledger.json`: reviewed changes to numeric and typed expected assertions, source and capability references, case removals, and requirement weakening. Use typed assertion paths and before/after values; retain existing federal ledger semantics separately.

A source-derived expected value must record its derivation and independent review. Do not falsely call a computed worksheet result a published FTB worked example. A missing source or unresolved source conflict blocks promotion to a passing complete case.

All taxpayer source records, return facts, and identities used by fixtures are synthetic; the legal/technical references are real official publications. Identifiers required by an official test package stay in authorized private test artifacts unless publication permission is clear. Do not commit live return data, private artifact locations, XML containing identifiers, or raw CLI logs.

## 4. Implementation boundaries and planned file layout

Reuse `core/runtime` and canonical TaxNode placement. New paths below are proposed implementation targets, not claims that files already exist:

| Responsibility | Files |
| --- | --- |
| Year integration and public inputs | `forms/ca540/2025/index.ts`, existing `input.ts`, proposed `inputs.ts`, `registry.ts`, `return-processing/start.ts` |
| Coverage/applicability | Existing-by-prerequisite `forms/ca540/2025/coverage.ts`, `assessment.ts` and tests |
| Identity/residency facts | `forms/ca540/nodes/inputs/general/identity/filer/filer.ts` and colocated tests |
| Source wages/withholding | `forms/ca540/nodes/inputs/income/wages/w2/w2.ts` and colocated tests |
| State reconciled income | `forms/ca540/nodes/intermediate/forms/income/reconciliation/schedule_ca/schedule_ca.ts` and colocated tests |
| Deduction computation | `forms/ca540/nodes/intermediate/worksheets/deductions/standard/standard_deduction/standard_deduction.ts` and colocated tests |
| Payment facts/ledger | `forms/ca540/nodes/inputs/payments/estimates/payments/payments.ts` and colocated tests |
| Settlement assembly | `forms/ca540/nodes/outputs/payments/settlement/form540/form540.ts` and colocated tests |
| Scenario execution contract | `benchmark/ca540.ts`, `ca540.test.ts`; product-dispatched existing runners |
| Public surface | `cli/commands/ca540.test.ts`, `return.ts`, `validate.ts`, `export.ts`; docs/skills |
| Later native XML/local rules | Proposed `forms/ca540/2025/mef/` and `forms/ca540/validation/`; exact official field/rule mapping is defined only after authorized package inspection |

Node schema types are inferred from Zod; finite codes follow exported enums. Amount precision is explicit at source boundaries; preserve source cents where required and apply documented rounding at the correct computation stage. Do not silently reuse federal brackets, deductions, schema namespaces, or nonconformity assumptions.

Do not build a generic multi-jurisdiction framework first. Reuse source parsers/validated neutral contracts where they genuinely match. Keep California law and federal-to-state reconciliation in California-owned nodes. The existing shared form contract imports federal identity/MeF types: do not force state objects through those types via casts. Extract a small neutral capability contract only at a demonstrated shared boundary.

## 5. Ordered delivery and acceptance

### Task S1 — Fix a complete scenario's requirements before writing its calculations

**Files:** `coverage.ts`, `benchmark/cases/ca540/2025/scenarios.json`, per-case `sources.json`, `docs/ca540-ty2025.md`.

- [ ] Inventory the printed six-sided Form 540 and instructions, Schedule CA, and relevant TY2025 accepted schedules. Map every requirement to supported, unsupported, unavailable, or demonstrably not applicable for the selected profile. Review this source inventory independently.
- [ ] Define the first profile as an original TY2025 full-year resident single adult wage-only return: standard deduction, no dependent status, no dependents, no age/blindness exemption, no RDP/community-property adjustment, no special tax methods, no California/federal differences, full-year qualifying health coverage, and explicit source-supported payment/use-tax facts. Select wage/withholding values only after locating a readable official tax-table row; do not infer table values from OpenTax's midpoint algorithm.
- [ ] Independently derive all relevant line results and documented zeros from official sources before running the engine. Record every excluded applicability predicate and evidence, including why no AMT, child-tax method, credits, and other schedules apply. If official instructions require another worksheet, include it rather than mark not applicable by convenience.
- [ ] Approve the fixture's actual facts and oracle before admitting it to the executable manifest. Until then the associated coverage requirement remains unsupported/unverified. Do not add an unexecutable positive case, count pending evidence as a pass, or invent an expected tax value in this planning document.

### Task S2 — Implement source facts, applicability, and first complete wage-only calculation

**Files:** proposed identity/W-2/payment/deduction/output nodes in section 4; `inputs.ts`, `registry.ts`, `return-processing/start.ts`, `index.ts`, `assessment.ts`; colocated tests; first case directory `single-w2-standard-refund`.

- [ ] Define separate schemas for taxpayer facts, issued source records, and payment facts. Validate filing-status/identity consistency, source ownership and duplicates, coverage months, and supported year/residency. Required facts cannot be manufactured from a missing numeric field.
- [ ] Bind public input node registration through the existing executor and canonical graph. Compute AGI reconciliation, deduction, taxable income, tax, exemption limitation, total tax, payments, and final settlement. Line 12 uses W-2 box 16 state wages from all states as instructed, not just CA box-16 amounts.
- [ ] Derive required schedules from facts before XML emission. Compare expected required documents with produced documents; an omitted schedule cannot exempt its own rules.
- [ ] Add source-backed positive arithmetic and transitions for refund, amount due, and exact balance by varying documented payment amounts. Assert every relevant intermediate line and final refund/due, not merely a nonempty output or total count.
- [ ] Make `complete_return` assert complete preparation for this profile while MeF/rule gates remain unavailable and `canFile` false. No required unsupported branch may be hidden to make the preparation claim pass.
- [ ] Cut over the public CA inputs deliberately when the source model exists: version the input model, refuse incompatible aggregate-only records as workpaper/incomplete, and never silently rewrite stored facts. A user-assisted migration uses a fresh copy and complete-payload guard for existing-entry writes. Remove obsolete aliases, do not maintain two claimed-complete paths.
- [ ] Run focused scenario and CLI checks, observe the real create/add/get/validate/workpaper path in a fresh private synthetic workspace, and update the coverage evidence only after successful output review.

### Task S3 — Expand status, deduction, and exemption scenarios

**Files:** same graph domains; additional deduction/eligibility nodes in canonical tax-section folders; per-case source/oracle pairs; scenario inventory.

- [ ] Add `joint-two-earner`, `separate-deduction-restriction`, `hoh-required-schedule`, `qualifying-surviving-spouse`, `dependent-filer-deduction`, `senior-blind-exemptions`, and `mixed-exemption-phaseout` families.
- [ ] Each family must cover its own eligibility facts and required supporting documents; accepting a filing-status enum is not evidence of status eligibility.
- [ ] Test married-separate spouse itemization restrictions, dependent earned-income deduction limits, identity/count consistency, age/blindness boundaries, and separately floored credit groups. Include below/at/above thresholds and both phaseout divisors from the FTB worksheet.
- [ ] Preserve the confirmed phaseout oracle of 295 for single AGI 327203 with one personal and one dependent exemption; trace propagation through line 32, total tax, and settlement in an independently reviewed return case.
- [ ] Keep unsupported RDP/community-property facts blocked until their actual allocation model exists. A passing ordinary joint case cannot prove RDP adjustments.

### Task S4 — Expand reconciliation, investments, and itemized deductions

**Files:** proposed Schedule CA nodes; additional canonical income/deduction nodes; scenario/source/ledger entries.

- [ ] Add `schedule-ca-source-adjustments` and `ca-itemized-reconciliation` families. Preserve federal source amounts, California basis/additions/subtractions, carry provenance, and deduction limitations separately.
- [ ] Add resident investment/retirement and business-income families: state/federal basis differences, capital losses/carryovers, depreciation differences, passive/other loss limitations, and state deduction nonconformity. Use the exact applicable official schedules, not aggregate shortcuts.
- [ ] Cover a documented valid negative AGI/subtraction case and the CCF/alternative-tax methods when their facts apply. Unsupported special methods stay specifically blocked rather than approximated with ordinary tax.
- [ ] Update complete-case required documents and expected lines whenever a new requirement applies. Assert a missing Schedule CA or other supporting schedule is a blocker even if the serializer would omit it.

### Task S5 — Expand credits, taxes, payments, and final settlement

**Files:** canonical CA credits/taxes/payments nodes; existing output/assessment; scenario/source/ledger entries.

- [ ] Add `renter-credit`, `dependent-care-credit`, `refundable-credits`, `amt-high-income-tax`, `payments-reconciliation`, `use-tax-isr-settlement`, and `carryover-consumption` families.
- [ ] Determine eligibility, phaseouts, credit ordering/limitations, and source-document requirements from the applicable TY2025 forms. Implement FTB 3514-related refundable credit facts, FTB 3506 care credit, Schedule P and other required schedules where applicable; no fixed zero defaults as substitutes.
- [ ] Model withholding, estimated/extension/prior-year applied payments as separate sourced records; prevent duplicates and wrong-year allocation. Record carryover origin, consumed amount, and remaining balance without importing unsupported prior-year rules.
- [ ] Implement use tax, FTB 3853 coverage/exemptions/ISR, excess charges, refund allocation to next year, contributions, final amount due, and applicable interest/estimated-tax penalty paths. Distinguish line 97 overpayment from the final requested refund and line 100 from the final payment amount.
- [ ] Include cases where use tax/ISR exceed payments; the current nonnegative line-95 aggregate alone cannot describe all settlement outcomes. Use official side/line definitions rather than guessing the missing fields.
- [ ] Treat required unsupported schedules from the complete Form 540 inventory as remaining blockers; these families are integration coverage, not exhaustive approval of all resident situations.

### Task S6 — Enforce the full scenario and source matrix

**Files:** `scenarios.json`, canonical case/source/ledger files, `benchmark/ca540.ts`, `ca540.test.ts`, `benchmark/harness.ts`, `scripts/testing/oracle.ts`, CI/docs.

- [ ] Implement the initial 20 named integration families below in order of their prerequisite domains, admitting reviewed runnable cases incrementally. Expand each threshold-bearing family into fixed below/at/above cases from its official rules. Keep unimplemented families visible in coverage, not skipped runnable tests. Expand beyond these families wherever the complete resident coverage matrix has an uncovered branch; these 20 are not sufficient evidence of universal support.

| Entry | Family / proof target |
| --- | --- |
| 01 | Single standard-deduction refund |
| 02 | Single amount due |
| 03 | Exact tax/payment balance |
| 04 | Joint two-earner return |
| 05 | Separate spouse deduction restriction |
| 06 | HOH eligibility and supporting schedule |
| 07 | Qualifying surviving spouse eligibility |
| 08 | Dependent standard-deduction worksheet |
| 09 | Senior/blind/dependent exemptions |
| 10 | Mixed-group exemption phaseout |
| 11 | Source-derived Schedule CA additions/subtractions |
| 12 | CA itemized deduction reconciliation |
| 13 | Renter credit eligibility/limits |
| 14 | Care credit eligibility and supporting form |
| 15 | Refundable credits and supporting forms |
| 16 | AMT and high-income additional tax |
| 17 | Withholding/estimates/extension/prior-year payment reconciliation |
| 18 | Use tax/ISR/refund allocation/final settlement |
| 19 | Carryover consumption and provenance |
| 20 | Intentionally unsupported taxpayer situation with exact blockers |

- [ ] For each family add deterministic negative mutations: one missing required fact, one incompatible fact, one missing required schedule, and relevant unavailable dependency. Invalid raw inputs are negative contract tests, not malformed positive cases admitted by relaxed discovery.
- [ ] Require exact numeric and typed outcomes. An intentionally blocked case passes the *test* only when the expected blockers occur; the taxpayer return remains blocked. Removing a requirement, expected document, or case needs reviewed change evidence.
- [ ] Exercise real validate and permitted export stages, not just return get. Report executed case IDs/stages, exact compared values, unexpected outcomes, and unresolved limitations in machine-readable `--json` output.
- [ ] Run the explicit `test:ca540` task and canonical CA benchmark in CI, preserving privacy-safe execution evidence. A green unrelated unit suite is not scenario evidence.
- [ ] Do not count skipped official-package tests as executed schema validation or turn absent package access into a success flag.

### Task S7 — Integrate authorized FTB schema/local rules only after the evidence prerequisite

**Files:** later CA-owned `2025/mef/`, `validation/`, and artifact-manifest modules; assessment, export, scenario adapter, and authorized private CI configuration.

- [ ] Obtain authorized access and verify redistribution rules for the FTB TY2025 package. Public page currently lists 2025v4.3; recheck its suitability/active status at implementation and pin schema and business-rule hashes, effective dates, validator version, and full import closure.
- [ ] Inspect the actual artifact formats before selecting a rule loader or claiming they are executable. Inventory every official rule by exact ID, severity, inputs, applicability, implementation status and local/external authority. Do not infer authority from category names or a predicate returning true.
- [ ] Implement jurisdiction-owned XML identity/header/form/attachment mapping from the actual package. Derive document inventory structurally from the prepared bundle, not from federal-tag regexes or only whatever happened to be emitted.
- [ ] Run the real schema validator offline with no external entity/network resolution, bounded input and execution resources, controlled imports and exact diagnostics. Preserve safe field/rule references publicly; raw validator text with values stays private.
- [ ] Evaluate applicable local official rules, distinguishing proven non-applicability, unknown applicability, unimplemented requirements, errors, and external-only checks. Wrong year/version/hash or missing validator blocks readiness; no stand-in XSD or mock is accepted as evidence.
- [ ] Bind validation to the exact immutable input snapshot, XML bytes, attachments, coverage/engine revision and artifact hashes. Recompute for a changed export; do not reuse a prior successful result across edits. Prevent output replacement on failure, following existing export preservation tests.
- [ ] Permit a local-ready result only for fully covered scenario profiles that passed all local prerequisites. Retain blocked results for unsupported profiles. Make the report explicitly exclude transmission/agency acceptance and publish the exact checked profile.
- [ ] If an approved provider import contract is documented, exercise a synthetic handoff through its authorized workflow and record compatibility separately. If not, label the artifact local XML export only; do not advertise working e-file handoff.
- [ ] Obtain official PATS evidence only through an authorized applicable route. Local correctness/schema tests do not establish provider approval. No enrollment, external submission, or production transmission is performed implicitly by executing this plan.

## 6. Verification commands and proof requirements

The prerequisite adds `test:ca540`; after each integrated scenario contribution:

```sh
deno task check:structure
deno task test:unit
deno task test:ca540
deno task check:cases
deno task check:oracle
deno task bench --form ca540 --year 2025 --json
```

Use focused failing-before/passing-after tests for tax bugs. Run the final set once after integration, not repeatedly during unrelated edits. Keep the existing 28 invalid federal fixtures as an explicitly unverified baseline; do not claim their full benchmark passes or weaken them as part of CA work.

For each positive complete-tax case require all applicable calculations and schedules, reconciled source facts, exact expected financial lines, exact document inventory, and intended readiness gates. For negative cases require exact dispositions. Unexecuted official validators remain unexecuted even if every arithmetic comparison passes.

CLI smoke uses fresh private synthetic workspaces outside code and production. Observe returned lines, JSON/text diagnostics, actual permitted artifact, visible limitations, and rejection behavior. No production return mutation or raw evidence committed to source control. Test modifications must preserve deterministic isolation and the full-suite test inventory.

## 7. Performance and scaling validation

Measure before selecting infrastructure. Separate time for source parsing, graph execution, requirements assessment, XML assembly, cold/warm schema validation, and optional PDF rendering. Record platform, revision, source record/attachment counts, wall time, memory when available, and correctness outcomes.

- Run cheap fact/calculation feedback without rendering PDFs or calling a network authority.
- Use bounded independent-return concurrency for batch benchmarks. No concurrent writes to a return or shared mutable taxpayer context.
- Keep official packages immutable and version-keyed. A compiled-schema cache can share immutable schema state, not taxpayer data.
- Start with bounded local subprocess validation. Consider persistent workers only if repeated startup/schema compilation is a measured bottleneck; workers add memory, resource cleanup and cross-return isolation requirements.
- Avoid input-dependent quadratic joins for source reconciliation: index records by stable reference and detect duplicates explicitly.
- Do not impose arbitrary limits on FTB-unbounded forms to obtain a latency target. Use documented resource limits with explicit refusal diagnostics; large unsupported inputs never silently truncate.

No throughput or millisecond claim has been verified by this document. Performance changes may not trade correctness/coverage for speed without an explicit scoped refusal.

## 8. Primary sources and release boundaries

- FTB [2025 Form 540 instructions](https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html): eligibility, source reconciliation, line calculations, deductions, tax methods, credits/taxes, payments and settlement.
- FTB [Schedule CA instructions](https://www.ftb.ca.gov/forms/2025/2025-540-ca-instructions.html): independent California/federal differences.
- FTB [2025 individual forms/multiplicity](https://www.ftb.ca.gov/tax-pros/efile/individual-efile-forms.html): required form inventory when applicable.
- FTB [schemas/access and version table](https://www.ftb.ca.gov/tax-pros/efile/individual-ftb-xml-schemas.html): restricted authoritative artifacts, separate rule revisions and tax years.
- FTB [developer participation](https://www.ftb.ca.gov/tax-pros/efile/efile-for-developers.html) and [approved-provider limitations](https://www.ftb.ca.gov/tax-pros/efile/efile-software-providers.html): PATS/provider and acceptance claims are separate from locally computed returns.

Every later scenario family must cite its exact supporting form/worksheet instructions when its oracle is authored. Exact XML elements, official rule formats, test credentials, and provider import behavior cannot be specified truthfully until authorized materials are obtained; these are named implementation prerequisites, not guessed APIs or completed tests.

The full-return goal is complete only when the source coverage matrix has no unimplemented applicable requirement for the advertised profiles, scenario/branch evidence is complete, and the claimed validation layers have actually run. Continue to label gaps explicitly; never upgrade a workpaper by changing a boolean.
