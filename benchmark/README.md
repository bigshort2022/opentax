# benchmark

Accuracy benchmark for the `tax` engine — federal TY2025 regression fixtures plus California line/workpaper cases.
Expected values are regression fixtures, not proof of IRS certification or
universal tax correctness; independently verify their provenance before treating
them as authority.

For folder layout and file formats, see
[STRUCTURE.md](../docs/architecture/STRUCTURE.md).

## Cases

Federal TY2025 scenarios cover the common return types below; inspect the
canonical case inventory and current benchmark report for the exact count:

| Range | Filing status | Key features tested                                                                                                                                      |
| ----- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01–10 | Single        | W-2 only, high income, unemployment, interest, capital gains, Schedule C, student loan, senior, two employers                                            |
| 11–17 | MFJ           | Both W-2, children/CTC, unemployment, dividends, Schedule C + QBI, retirement + SSA, excess SS tax                                                       |
| 18–20 | HOH           | Child/CTC, EITC, dependent care credit                                                                                                                   |
| 21–31 | Mixed         | Additional Medicare Tax, ACTC, LTCG 0% bracket, blind filer, senior + SE income                                                                          |
| 32–97 | Extended      | Schedule C loss, 1099-R, AOTC, marketplace/1095-A, educator expense, estimated tax, EITC no children, 401(k), tips, QBI, K-1, SSA, NIIT, multiple 1099-R |

**WIP contract — not ready for a standalone accuracy claim:** distinguish public
summary outputs, exact raw output fields, intermediate oracles and fixture
metadata. `run_benchmark.ts` lists supported exact keys traced to
`ReturnSummary` in `cli/commands/return.ts` and the F1040 output schema in
`forms/f1040/nodes/outputs/general/return-assembly/f1040/index.ts`. No aliases
or intermediate mappings have been approved. Numeric expectations outside that
supported contract become explicit `unsupportedChecks` and prevent success,
rather than being called engine defects. Envelope metadata (`case`, `scenario`,
`year`, `inputs`, sources/notes) is not scored. The `correct` object is the
oracle namespace; only explicitly named metadata fields may be nonnumeric.
Malformed oracles, including unmapped ones, fail.

**Pass criteria:** compare supported expected output keys, including AGI and
payments, not only tax/refund/owed; no unsupported oracles, command failures or
diagnostics. Each must have a finite numeric actual value within an inclusive
absolute $5 legacy tolerance. This inherited tolerance accommodates existing
fixture rounding; it is not an IRS-approved discrepancy allowance. Missing
values never become zero. Singleton numeric arrays are accepted; empty,
multi-entry, nonnumeric and nonfinite actuals fail. Nonfinite expectations,
invalid tolerances and no numeric expectations fail rather than silently
passing. Descriptive nonnumeric metadata is not scored.

Raw `lines` values take precedence over normalized summary values. Executor
diagnostics and failed CLI subprocesses fail the case. Any failing case,
skipped/incomplete case directory or empty case set makes the command exit
nonzero. The trailing JSON keeps `failing` as case-name strings and adds
`failures` with `lineFailures`, `unsupportedChecks` and `errors`.

Some fixtures expect intermediate names not exposed by `return get`. These are
reported as unsupported checks, not missing filed lines. The omitted refund side
becomes zero only when a positive amount owed is present, and conversely for
omitted amount owed with a positive refund. When both are omitted, both become
zero only if finite tax and payments totals are equal. Explicit nulls, arrays
and malformed values are never replaced, and no other missing filed line
receives a default. Resolving mappings/output coverage needs independent review,
not changes to expected values or relaxed tolerances. A red benchmark is not by
itself proof that every reported discrepancy is a tax-engine arithmetic error.

## How to run

```bash
# Every case in cases/<form>/<year>/<case>/ (defaults: f1040, 2025)
bun run bench --form f1040 --year 2025

# Machine-readable totals and per-case failures
bun run bench --form f1040 --year 2025 --json

# Validate every case's inputs and sources without running the engine
bun run check:cases
```

## California case contract

`bun run bench --form ca540 --year 2025 --json` runs canonical cases under `cases/ca540/2025/`. `line31` cases compare one tax value; `workpaper` cases exercise create/add/get/validate, the permitted worksheet, and force/draft MeF refusal. `complete_return` cases are explicitly unsupported in this milestone. Exact whole-dollar CA comparisons do not inherit the federal $5 legacy tolerance.

Each case has strict `input.json`, `correct.json`, and `sources.json` records. Inputs declare product, year, and kind. Workpaper expectations include selected numeric lines, stable diagnostic dispositions, every local gate, readiness, required/produced document sets, and external-check limitations. A deliberately blocked workpaper can pass its scenario assertions while its `canFile` remains false. Missing expected lines never default to zero.

`scenarios.json` must match the nonempty executable case inventory and list the requirement IDs each case exercises. Official FTB TY2025 citations establish numeric provenance; explicit OpenTax project policy establishes the workpaper restriction, not an FTB rejection or authorization. Source-derived worksheet arithmetic must not be described as a published FTB worked example or as user numerical approval.

For CA, `ledger.json` records typed assertion paths, before/after values, authority kind/citation, contributor review identity/date, and provenance. Numeric amounts, typed gate/readiness/document assertions, input/source changes, and manifest deletions are checked. This is evidence change control, not automatic human signoff. Missing sources, unknown typed paths, stale evidence, malformed cases, and an empty inventory fail validation.

The old standalone CA vector runner is removed. `check:cases`, `check:oracle`, and the canonical benchmark runner use product-aware CA contracts while retaining federal defaults and evidence conventions. `bun run test:ca540` explicitly executes CA product and evidence tests; the ordinary unit selection alone does not prove CA coverage.

No benchmark here establishes official FTB schema/business-rule validation, PATS qualification, provider import compatibility, or agency acceptance.

## Adding a new case

Use `/tax-cases` (Claude Code skill) to generate IRS-sourced cases
automatically, or create `cases/{form}/{year}/NN-description/input.json` and
`correct.json` manually following the formats in
[STRUCTURE.md](../docs/architecture/STRUCTURE.md).

## Changing expected values

`bun run check:oracle` compares every `correct.json` with `origin/main`
(`--base <ref>` to choose another). Each changed scored value needs an entry in
`benchmark/cases/<form>/<year>/ledger.json` stating `case`, `line`, `before`,
`after`, a `source` that cites a publication, `approvedBy` and `on`; a removed
case needs an entry without `line`; a new case needs a `source`. An entry that
cites the engine does not count.

## Tax-year references

Use the
[2025 Form 1040 instructions](https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf)
and the
[2025 Schedule A instructions](https://www.irs.gov/pub/irs-prior/i1040sca--2025.pdf),
plus the applicable form-specific instructions. The former abbreviated parameter
table was stale and is not retained as a second, competing source of tax rules.
This documentation change does not modify engine tax parameters or gold
fixtures.

## Federal discovery contract

Discovery recursively validates every leaf before starting the CLI: the shared
input and expected-value schemas, the product read from `<form>/<year>/<case>`,
each form entry against the node schema `form add` applies (unknown fields
rejected, required fields named), and any `source`, which must cite a
publication and never the engine. Every invalid case is reported in one error;
`bun run check:cases` runs only this step, without the engine, allowing the
known-invalid cases listed in `benchmark/cases/baseline.json` (with a reason,
an expiry and an approver) until their entry expires. Empty or
incomplete directories and malformed fixtures terminate with an error; no
partial-success JSON report is emitted. Each valid expected record includes
total tax, refund and amount owed. CLI output must pass the shared
computed-return schema before the stricter per-field comparisons run. This
preserves current-main validation while retaining the draft’s explicit
unsupported-oracle diagnostics.

## Issue 77 reconciliation

The [October 14 review](./reference/2025/README.md) records corrections to 121
fixtures against published TY2025 tables and worksheet arithmetic. The
[change ledger](./reference/2025/issue77-changes.json) preserves prior values
and calculation assumptions. A fixture's `reconciliation.source_limitations` are
reported as errors: matching a conditional expectation is not a passing result.
Source facts and eligibility gaps remain visible; historical engine outputs were
not regenerated into expected values.
