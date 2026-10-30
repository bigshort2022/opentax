# Historical Federal Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Independent file ownership permits concurrent implementation; the integration owner alone runs builds, linters and suites after the edits settle.

**Goal:** Prepare federal 2021–2024 individual returns and explicitly transfer reviewed capital and rental passive losses into the next year's return, including 2025, with correct-year paper packets.

**Architecture:** Extend the existing shared graph and annual configuration, not a second calculator. Introduce an explicit paper-only form contract, year-scoped input capabilities, and durable reviewed cross-year records in the existing atomic return store. Paper assembly uses verified official historical templates independently of MeF.

**Tech Stack:** Bun, TypeScript, Zod, existing pure-node executor, pdf-lib, existing CLI/store and IRS benchmark harness.

**Approved specification:** `docs/superpowers/specs/2026-10-30-historical-federal-preparation-design.md`.

**Baseline:** `origin/main` at `29eec9d1`. Structure passes. Unit baseline executes 381 tests with three failures in `scripts/testing/affected.test.ts`; a separate probe established that Bun resolves `/var` fixture paths through `/private/var` while `importGraph` compares against the uncanonicalized root. No product implementation has changed at this baseline.

---

## Ownership and integration contracts

- Integration owner: core form contract, catalog/year entrypoints, CLI discovery/create/get/validate/export/main/help, historical preparation validation, test-selection prerequisite, end-to-end proof and final documentation.
- Annual-rules owner: `forms/f1040/nodes/config/`, ordinary/preferential tax calculation, standard/itemized deductions, annual employment/QBI thresholds and historical rule citations.
- Health/income owner: historical source-date/health/owner-income behavior outside rental/capital nodes; coordinates additions to annual configuration with the annual-rules owner rather than editing that owner's files.
- Loss-continuity owner: capital worksheet and rental passive-loss nodes/schemas, `cli/store/types.ts`, `cli/store/store.ts`, new carryover store/command modules and their regression tests. Does not edit CLI main/get/validate/export; provides callable commands and stale-dependency diagnostics for integration.
- Paper owner: new `forms/f1040/historical/pdf/` modules, source-template manifests and mapping evidence; does not edit core form types or export command.
- Oracle owner: publication-backed new `benchmark/cases/f1040/{2021,2022,2023,2024}/` cases and retained public authority evidence; no expected value from engine output.

New files are grouped by responsibility. `forms/f1040/historical/` owns year-product wiring, source capability validation and paper assembly; actual reusable arithmetic remains in the existing canonical `nodes/` tree. Each annual catalog entry owns its year, not a copied graph.

The paper builder's integration boundary is:

```ts
export type HistoricalTaxYear = 2021 | 2022 | 2023 | 2024;
export type HistoricalPaperIssue = {
  readonly code: string;
  readonly message: string;
  readonly form: string;
};
export function historicalPaperIssues(
  year: HistoricalTaxYear,
  pending: Readonly<Record<string, Record<string, unknown>>>,
): readonly HistoricalPaperIssue[];
export function buildHistoricalPdfBytes(
  year: HistoricalTaxYear,
  pending: Record<string, unknown>,
  filer: FilerIdentity | undefined,
  options?: { readonly draft?: boolean; readonly cacheDir?: string },
): Promise<Uint8Array>;
```

`historicalPaperIssues` reports unsupported/unprintable required forms without downloading templates or constructing MeF. The builder additionally validates actual template identity, filer fields, page capacity and source-to-print reconciliation. It must not silently omit an applicable nonzero form. The existing normalization boundary supplies scalar pending values.

The form union has a discriminant `preparationMode: "mef" | "paper"`. Common fields retain form type/year, input nodes, registry, execution, pending normalization and PDF building. The MeF variant retains mandatory schema/build/prepare methods; the paper variant has no fake XML builder or fake MeF bundle and supplies preparation diagnostics. Migrate every existing form declaration and consumer to the union. Existing 2025/2026 MeF semantics do not change.

Carryover commands use explicit source/destination return IDs and the configured base directory. Their public JSON schemas are Zod-derived, use exported enums for finite states and retain evidence references. The integration owner mounts `carryover preview`, `carryover review` and `carryover apply`; a review binds the source fingerprint and is never inferred from calculation or export. The loss-continuity owner supplies `carryoverIssues(returnId, baseDir)` for get/validate/export, traversing inherited dependencies. Financial writes remain a single atomic destination return replacement after all checks.

## Task 1: Repair the verified test-selection prerequisite

**Files:** `scripts/testing/affected.ts`; existing `scripts/testing/affected.test.ts`.

- [x] Use the existing three failing tests as the regression evidence. Do not re-pin their expected closures or remove them.
- [x] Canonicalize the graph root once with `realpathSync` before comparing it with Bun-resolved paths. Preserve package/external-module exclusion and repo-relative graph keys.

```ts
const canonicalRoot = realpathSync(root);
const resolved = relative(canonicalRoot, Bun.resolveSync(entry.path, dirname(file)));
```

- [x] After implementation edits settle, run `bun test scripts/testing/affected.test.ts`; expect the existing import/data/benchmark selection assertions to pass. Exercise `importGraph` directly against a symlinked temporary repository to prove the actual helper includes the import.

## Task 2: Establish year-scoped products and preparation capabilities

**Files:** `core/types/form-definition.ts`, `catalog.ts`, all three existing product `index.ts` declarations; new `forms/f1040/{2021,2022,2023,2024}/index.ts`; new `forms/f1040/historical/{index,capabilities,validation}.ts`; `cli/commands/{return,node,graph,form,validate,export}.ts`; `cli/main.ts` and existing command tests.

- [x] Before adding products, exercise the actual CLI with a temporary store: supported-year discovery lacks historical years and creating unsupported year 1900 currently leaves a record. Keep a consumer-visible regression that requires rejection before any write.
- [x] Make the form contract a discriminated union as specified above. Run LSP references first; the current denols workspace does not resolve nested Bun-worktree references, so retain that tool limitation and explicitly inventory imports/call sites as a fallback.
- [x] Reuse `executeF1040Return(inputs, { taxYear, ...context })`, the existing registry and `configForYear`. Use year-owned input schemas and a pre-parse capability guard so nested Zod stripping cannot erase rejected historical fields.
- [x] Define the supported source set for wages, interest/dividends, unemployment/other income, Schedule C/SE/QBI, 8949/Schedule D, Schedule E/PAL, supplied owner K-1 facts and Marketplace/HSA. Each advertised path must have both a calculation and paper representation. Reject outside paths before persistence or calculation, including Schedule 1-A, pre-2025 Form 8949 G–L, source dates inconsistent with the selected year and unsupported historical elections.
- [x] `createReturnCommand` resolves the catalog before calling the store. Existing saved historical records remain unchanged. Node inspection/list and graph support `--year` and use the selected product's exposed schema rather than claiming every shared graph node is historical input.
- [x] Historical validation produces preparation diagnostics, not 2025 MeF rejection rules. Distinguish input/calculation errors, stale/missing carryovers, printable coverage and unsupported electronic filing. Require actual identity/status and source coverage; an empty shell is not a verified zero return.
- [x] Historical PDF export calls the independent paper path and is not gated on electronic PIN, prior-year e-file AGI or transmitter identity. Historical MeF/submission archive requests reject explicitly. `--force` cannot bypass missing calculation/source/carryover/document requirements; `--draft` is visibly non-fileable and inventories issues.

Regression scenarios: unsupported create has zero filesystem changes; two different supported years produce distinct statutory deductions/tax; a 2025-only field is rejected with original inputs intact; an unsigned identified historical paper return has no electronic-PIN blocker; empty/partial returns are not marked complete.

## Task 3: Implement sourced annual federal rules

**Files:** `forms/f1040/nodes/config/{2021,2022,2023,2024}.ts`, `config/{index,types}.ts`; existing standard/itemized deduction and ordinary/preferential tax helpers; related employment/self-employment/QBI helpers; new historical rule source manifest under `docs/historical-federal/`.

- [x] Read the actual IRS annual instructions/revenue procedures before recording values. Retain title, URL, tax year, pinpoint and SHA-256 of retrieved public sources. Do not inherit an unverified 2025 amount through a spread.
- [x] Add complete supported-year rule sets: all filing-status brackets, standard/additional deductions, preferential thresholds, AMT where needed, Social Security wage base, HSA/retirement/QBI thresholds, SALT, health-credit/FPL terms and supported income/credit date boundaries. Statutorily unavailable provisions are gated, not evaluated with current-year limits.
- [x] Use actual IRS Tax Table rounding/bands below $100,000 and the relevant computation worksheet above it; keep preferential-tax worksheets year-aware. Existing generic `year_schedule.ts` is the primary reuse seam.
- [x] Handle relevant 2021 differences explicitly, including the historical nonitemizer charitable deduction and Marketplace unemployment treatment when applicable. Do not leak 2025 senior/tips/overtime/vehicle deductions or the post-2024 SALT cap.
- [x] Write source-derived regression assertions at threshold boundaries and for distinct years before changing arithmetic. Synthetic fixtures may isolate arithmetic, but published benchmark expectations remain separate and publication-derived.

Checks after integration: representative bracket/tax-table boundaries; ST/LT preferential income; MFS limits; negative/zero taxable income; annual deduction and payroll/QBI limits; unchanged relevant 2025/2026 tests.

## Task 4: Make supported income and health paths historical

**Files:** existing input/form nodes for W-2, unemployment, other income, Schedule C/SE, owner K-1, Form 8962 and Form 8889; source guards and pending normalization where those paths require it. Coordinate any config additions with Task 3. Rental/8949/Schedule D belong to Task 5.

- [x] Trace public source schemas through graph execution to final lines. Replace fixed current/prior/following-year relationships with `ctx.taxYear` relationships for supported paths, preserving source cents and identifiers.
- [x] Make Marketplace FPL, applicable percentages, repayment caps, QSEHRA dates and the 2021 unemployment rule use the actual year. Exercise a 2023 one-month 1095-A/APTC reconciliation and a complete-year example.
- [x] Make HSA contribution limits, catch-up, distribution/additional-tax rules and prior/following-year evidence use the actual year. Do not merely rename a `made_in_2025_for_2024` field and leave its computation unchanged; migrate consumers cleanly where a generic schema replaces it.
- [x] Support supplied individual owner K-1 facts only within provable basis/at-risk/passive constraints; never infer S/C election or synthesize K-1 values. Communicate every substantive remaining boundary to the capability/paper owners, and implement the applicable use-case paths rather than rejecting the entire domain.
- [x] Add regressions for actual observable values, mixed health/source dates, rejected conflicting facts, and source preservation. No mock-forwarding or source-text tests.

## Task 5: Implement reviewed capital and rental loss continuity

**Files:** existing Schedule D/Schedule E/passive-loss nodes and their source schemas; new pure capital carryover helper in the existing investments node domain; `cli/store/{types,store}.ts`; new `cli/store/carryovers.ts`, `cli/commands/carryover.ts` and behavior tests.

- [x] Implement the published Capital Loss Carryover Worksheet, not loss minus $3,000. Its absorption starts from the worksheet's pre-zero-floor taxable income and actual line 21 deduction:

```ts
const availableAbsorption = Math.min(
  allowedCapitalLossDeduction,
  Math.max(0, taxableIncomeBeforeZeroFloor + allowedCapitalLossDeduction),
);
const shortLoss = Math.max(0, -netShortTerm);
const longGain = Math.max(0, netLongTerm);
const shortCarryover = Math.max(0, shortLoss - availableAbsorption - longGain);
const longLoss = Math.max(0, -netLongTerm);
const shortGain = Math.max(0, netShortTerm);
const longAbsorption = Math.max(0, availableAbsorption - shortLoss);
const longCarryover = Math.max(0, longLoss - shortGain - longAbsorption);
```

Verify those steps against the actual archived worksheet and its MFS rule. Expose worksheet inputs/lines for review. A zero-floor Form 1040 line 15 is insufficient evidence.

- [x] Separate known opening ST/LT values (including explicit zero) from unknown values. Require reviewed evidence when prior history is applicable. Historical acquisitions may predate 2021 without pretending to compute 2016–2020 returns.
- [x] Preserve rental suspended losses by stable activity identity and character, with incoming/current allowed/outgoing reconciliation. Add truthful reconstructed-unfiled provenance rather than forging accepted-filed ledger evidence. Applicable unknown at-risk/basis or unsupported QBI transitions remain separate blockers.
- [x] Preview is strictly read-only. Review records the source financial fingerprint and reviewed evidence. Apply requires consecutive years, matched taxpayer identity, reviewed current source, complete balance components, compatible target activity/source facts and no independently supplied conflicting carryover.
- [x] Build and validate the full destination change before the store's single atomic write; preserve unrelated fields. Reapplying an identical reviewed source is idempotent. Source edits invalidate review and every downstream linked dependency until explicitly reviewed/reapplied. Do not overwrite independent target entries, silently compound losses or mutate the source.
- [x] Regression examples: $10,000 ST loss with pre-floor income $20,000 carries $7,000; the same loss with pre-floor income -$5,000 carries $10,000; ST loss offset by LT gain; LT loss with residual absorption; $1,500 MFS limit; distinct rental activities; unknown versus zero; mismatched taxpayer/year; conflicting target; stale grandparent; rejected apply leaves byte-identical records; repeat apply adds no duplicate.

## Task 6: Build actual historical paper packets

**Files:** new `forms/f1040/historical/pdf/` builder, mappings, template manifest and coverage validation; reuse existing `core/pdf/` utilities and domain projections when year-correct. Existing final-year 2025 maps are evidence/patterns, not historical field-index substitutes.

- [x] Download official final-year PDFs for 1040, Schedules 1/2/3/A/B/C/D/E/SE and the applicable supported 8949, 8582, QBI, owner-loss and health forms. Check fillable fields, extract field rectangles, inspect rendered labels and verify mapping positions before producing code. Record source URL/hash/year for each template.
- [x] Map historical Form 1040 line differences (including 2021 wage/charitable lines) and every relevant selected schedule. Set filer/identity/status/check boxes correctly; use year-specific table positions. Include all overflow pages/statements needed to preserve complete transaction and rental detail.
- [x] Implement the declared builder/issues interfaces. Enforce page capacity and reconcile source totals to printed totals. A required nonzero unsupported document is an issue, never an omission. Include the actual schedules, not an invented tax-summary substitute.
- [x] A complete unsigned review packet does not invent electronic credentials or claim signing/filing. An explicitly requested diagnostic draft includes a conspicuous NOT FOR FILING mark and unresolved-item inventory on actual output.
- [x] Keep template retrieval failures visible. Do not silently use another year or an invented blank substitute.

Verification after integration: actual PDFs for all four years; field readback of identity, tax year, selected numeric lines and checkboxes; rendered review of every changed layout and overflow shape; draft watermark/inventory; named historical forms present with reconciled amounts.

## Task 7: Add independent IRS oracles

**Files:** new `benchmark/cases/f1040/{2021,2022,2023,2024}/case*/{input,correct}.json`, per-product ledger where required by the oracle harness, source manifest/evidence under `docs/historical-federal/`.

- [x] Use public IRS ATS samples or published worked examples for each actual year. Extract filled fields or inspect rendered pages when PDF text is garbled; unreadable text is not evidence.
- [x] Record exact publication/URL/page/line citation for every expected total. Copy published values only; never run the engine to manufacture expected values or adjust a case to fit output. Synthetic construction of a source not present in the publication must be clearly identified and cannot masquerade as a published return.
- [x] Map source facts through the supported public schemas, preserving published dates/amounts and required fields. Include no private taxpayer records. New cases must pass source/schema validation before execution.
- [x] Where the IRS publishes only individual lines, use an explicit `published_lines` oracle with its citation and synthetic-input disclosure. Score those lines with exact dollar equality and report their limited coverage. Unscoped complete-return cases must still require total tax, refund, and amount owed; never infer the missing balances from the engine. Historical ATS research found blank expected totals or inconsistent required-source facts, so those examples are not promoted to complete-return oracles.
- [x] Run `bun run check:cases`, `bun run check:oracle` and `bun run bench --form f1040 --year <year>` for each 2021–2026 affected product after integration. If a published case exposes an engine defect, fix the engine or record a sourced unresolved blocker; never weaken the oracle.

## Task 8: Integrate, exercise and review

- [x] Run targeted behavior checks after all implementation owners have yielded: annual math, carryover commands, historical create/input/validation and PDF mappings. Then run current repository gates once and diagnose actual failures from retained evidence: `check:structure`, `check:sandbox`, `check:cases`, `check:oracle`, `test:unit`, `test:forms`, `check:mef`, `check:cli` and all affected annual benchmarks.
- [x] Run the real CLI in an isolated synthetic store through create → add source inputs → get → validate → paper export for each historical year. Run 2021 → 2022 → 2023 → 2024 → 2025 preview/review/apply. Edit the synthetic ancestor and observe a downstream stale blocker, then review/reapply in order and observe reconciliation.
- [x] Visually inspect actual rendered PDFs as specified in Task 6; tests alone are not PDF proof. Confirm rejected unsupported years/fields, wrong taxpayers, unknown opening basis/carries and stale chains produce no financial writes.
- [x] After smoke proof, update existing product/architecture/CLI documentation with actual supported forms, boundaries and runnable commands. Remove throwaway scaffolds; retain only useful publication or deterministic regression evidence. Do not preserve implementation-wording tests or duplicate source-text checks.
- [ ] Independently review specification compliance first, then code quality, arithmetic/source authority and persistence safety. Resolve findings and run the affected checks again only after a fix. Maintain one feature PR; do not merge or deploy without authorization.
- [ ] Deliver exact exercised checks, unresolved external verification (including unavailable private IRS XSDs where applicable), and the use-case workflow. No optional Jev semantic verification is claimed; repository gates and runtime proof are recorded separately.

## Plan self-review

The annual execution, supported source domains, capital worksheet, activity-specific passive losses, preview/review/apply, transitive staleness, correct-year independent paper preparation, IRS authority and privacy requirements all have explicit tasks above. The only filing capability added is paper preparation; state/corporate returns, Form 1040-X, payments and transmission remain excluded. No task adopts private financial facts or treats a successful calculation as a filed return.

## Verification record

Implementation uses only public IRS material and synthetic taxpayer fixtures.
The original working tree and real return stores were not changed. Source,
arithmetic, carryover-safety, CLI and paper reviews were independently delegated;
findings were resolved and the affected scenarios were exercised afterward.

| Check | Observed result |
| --- | --- |
| `bun run check:structure` | 227 node files, 17 existing baseline exceptions, zero problems; 1,276 year-pinned occurrences and zero year problems |
| `bun run check:sandbox` | 1,555 shipped modules, zero problems |
| `bun run check:cases` | 117 valid cases, 28 known-invalid cases, zero problems |
| `bun run check:oracle` | 145 cases, eight new historical cases, zero problems |
| `bun run test:unit` | 403 passed, one skipped, zero failures; includes the repaired macOS import-graph regressions |
| `bun run test:forms` | 8,324 passed, 35 baselined failures, 264 skipped; zero new failures |
| Targeted public-source/native-consumer tests | 87 passed, zero failures across five files |
| Historical PDF and related consumer tests | 167 passed, zero failures across 12 files, using the repository's existing 30-minute per-test PDF allowance |
| Historical preparation/carryover command tests | 21 passed, zero failures |
| `bun run lint` | Exit zero; warnings remain |
| `bun run check:mef` | 374 samples, 373 ready, one existing `S1-F1040-195` finding; zero harness problems |
| `bun run check:ty2026` | 374 samples, 231 ready; existing calculation/schema deferrals retained, zero harness problems |
| `bun run check:cli` | 18 actual CLI returns, zero problems |
| TY2021–2024 benchmarks | Two exact published-line cases per year, all eight passed; these are not complete-return IRS oracles |
| TY2025 benchmark | 22 passed and 87 failed, identical to detached baseline `29eec9d1`; all 109 displayed financial results and the entire failure set were unchanged |
| TY2026 benchmark | Attempted; no `benchmark/cases/f1040/2026` corpus exists (`ENOENT`) |
| Compiled product | Bun compiled 1,555 modules; actual binary exercised below |

Final local suite evidence is in
`.state/research/testing/unit-MPI9Db` and
`.state/research/testing/forms-uvJLf0`. These ignored local logs are not public
taxpayer artifacts. The temporary baseline worktree, symlink probe and smoke
script were removed after observation.

### Actual CLI and rendered-paper proof

- Created and reviewed synthetic wage returns for every historical year;
  validated paper readiness separately from unsupported electronic filing and
  exported the correct-year unsigned forms. Rendered all four packets.
- Rendered MFS identity fields for all four years; spouse names occupied the
  historical MFS field rather than the joint-return name row.
- Exercised capital transactions, independently reconciled Schedule D columns,
  Form 8949 A–F grouping and direct reporting. Re-exported the scalar-transaction
  2021 packet and visually verified its previously missing line 3 columns.
- Exported foreign-account-only Schedule B packets with zero interest/dividends
  for 2021 and 2023; inspected all country-overflow statements and year labels.
- Exercised 2022 unemployment, sourced Schedule C/1099-NEC, annual meal treatment,
  SE and QBI; 2023 one-month Marketplace/APTC reconciliation; 2023 full-year
  monthly Pub. 974/8962/QBI reconciliation; and 2024 HSA preparation. Inspected
  the generated schedules, including all 16 pages of the Pub. 974 packet.
- Exercised a sourced 2024 rental-to-main-home allocation and passive loss,
  transferred its suspended balance into an inactive 2025 activity, and checked
  the actual Schedule E/8582 packet. Post-apply owner/share changes made the
  linked balance stale; rejected review left the saved record byte-identical.
- Previewed, reviewed and applied a 2021–2025 capital chain. A changed ancestor
  invalidated descendants; chronological review/reapplication repaired them.
  Reapplication was idempotent, and rejected applications preserved both records.
- Rejected unsupported/nonjoint owner facts and unreviewed paper export even
  with `--force`, without writing a PDF or changing saved financial inputs.
  The explicit draft instead marked every page `NOT FOR FILING`.
- Exercised `importGraph` through an actual temporary symlink and observed the
  return command's store dependency with exclusively repository-relative keys.

### Verification limits and supported boundary

The unchanged TY2025 benchmark failures are not reported as passing. The
missing TY2026 corpus provides no benchmark evidence. Broader XML-dependent
tests could not be certified without the private
`irs/mef/2025v5.4/IndividualIncomeTax/Ind1040/Return1040.xsd` package from the IRS
Secure Object Repository; no XSD certification is claimed.

The nested Bun worktree was not indexed by denols, and optional semantic tools
were unavailable during this run. Explicit caller inventories, type checks,
independent reviews and actual runtime checks supplied the available evidence.

Coverage is the declared single/MFJ/MFS, no-dependent historical product, not
every individual tax provision. State/corporate returns, amendments, unsupported
rental dispositions or vacation-home deduction-limit worksheets, unproven
basis/at-risk/QBI transitions and unsupported required forms remain blocked.
No entity election, missing cost basis, repayment treatment or private opening
balance was inferred. Paper readiness does not mean signature, filing, mailing,
payment or IRS acceptance.
