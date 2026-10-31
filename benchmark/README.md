# benchmark

Federal tax-engine benchmarks. Each run reports the discovered corpus separately
from runnable, executed, and known-invalid excluded cases.
Expected values are regression fixtures, not proof of IRS certification or
universal tax correctness; independently verify their provenance before treating
them as authority.

For folder layout and file formats, see
[STRUCTURE.md](../docs/architecture/STRUCTURE.md).

## Cases

Examples of TY2025 scenarios; the runner reports current corpus counts:

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
payments, not only tax/refund/owed; unsupported oracles, command failures, and
executor/source errors prevent a pass.
Full-return fixtures require a finite numeric actual within an inclusive absolute
$5 legacy tolerance. `published_lines` fixtures require exact dollar equality
only for their cited, scored lines. The legacy tolerance accommodates existing
fixture rounding; it is not an IRS-approved discrepancy allowance. Missing
values never become zero. Singleton numeric arrays are accepted; empty,
multi-entry, nonnumeric and nonfinite actuals fail. Nonfinite expectations,
invalid tolerances and no numeric expectations fail rather than silently
passing. Descriptive nonnumeric metadata is not scored.

Raw `lines` values take precedence over normalized summary values. Executor
diagnostics, declared source limitations, and failed CLI subprocesses fail the
case. Any failing case, unexecuted runnable case, or empty runnable set makes
the command exit nonzero. Active baseline exclusions alone do not change the
exit status; they remain explicitly outside the executed-case PASS/FAIL counts.

Some fixtures expect intermediate names not exposed by `return get`. These are
reported as unsupported checks, not missing filed lines. The omitted refund side
becomes zero only when a nonnegative amount owed is present, and conversely for
omitted amount owed with a nonnegative refund. When both are omitted, both become
zero only if finite tax and payments totals are equal. Explicit nulls, arrays
and malformed values are never replaced, and no other missing filed line
receives a default. Resolving mappings/output coverage needs independent review,
not changes to expected values or relaxed tolerances. A red benchmark is not by
itself proof that every reported discrepancy is a tax-engine arithmetic error.

## Reading the report

The console table labels each failing row with issue tags:

| Tag | Meaning |
| --- | --- |
| `NUM` | A compared numeric value differs beyond its applicable tolerance |
| `OUT` | A compared actual is missing, nonfinite, or not a single numeric value |
| `MAP` | An expected numeric field has no approved output mapping |
| `SRC` | The fixture declares an unresolved source limitation |
| `EXEC` | An executor diagnostic rejected a node; amounts may be partial or defaults |
| `ERR` | Another command, parsing, or scoring error |

Green values indicate only agreement within the applicable comparison tolerance.
Unscored columns are dim, not failed comparisons. `N/A` means an unavailable or
invalid value, never an invented zero. A passing row is not IRS certification.

The footer distinguishes:

- **Corpus and execution:** discovered = runnable + known-invalid exclusions;
  runnable = executed + not run; executed = passed + failed. A case with a
  command or scoring error counts as executed because it produced a failure result.
- **Disjoint failure groups:** compared-line failures; errors without compared-line
  failures; unmapped checks only. Each failed case belongs to exactly one group.
- **Overlapping causes:** each issue tag counts affected cases, not individual
  messages or fields. A case may have several causes; these counts must not be summed.
- **Citation metadata, for executed cases only:** present, missing, or unavailable
  because the expected-value file could not be read or validated. Passing cases
  without a citation are named. Presence of a nonempty top-level `source` or
  `sources` value does not establish that a publication supports the expected values.
- **Oracle scope and limits:** full-return legacy tolerance versus exact
  published-line checks; no independent source verification or full-return certification.
- **Known-invalid exclusions:** every excluded case includes its validation error,
  baseline reason, approver, and expiry. Exclusions are not hidden in a zero skip count.

With `--json`, the final stdout line is a JSON report after the console output.
The report contains:

| Field | Contract |
| --- | --- |
| `form`, `year` | Product and tax year evaluated |
| `counts` | `discovered`, `runnable`, `executed`, `excludedKnownInvalid`, `notRun`, `passed`, `failed` |
| `failureBreakdown` | Disjoint `comparedLineFailures`, `errorsWithoutLineFailures`, `unmappedOnly` counts |
| `failureCauses` | Overlapping case counts keyed by descriptive issue names |
| `failing`, `failures` | Failing names and per-case `issues`, `lineFailures`, `unsupportedChecks`, and `errors` |
| `excludedCases`, `notRunCases` | Baseline exclusion records and names of unexecuted runnable cases |
| `provenance` | Citation coverage, missing-citation cases, passing cases without citations, and source-limited cases |
| `oracleScopes`, `publishedLineCases` | Scope counts and the scored keys for published-line cases |
| `caseProvenance` | Each executed case's declared scope, citations, and source issues; `oracle: null` when unavailable |
| `validationLimits` | USD tolerances, lack of independent verification/certification, and partial-output warning |

The explicit `counts` object replaces the ambiguous `total` and `skipped` JSON
fields. Reporting does not change tax calculations, expected values, baseline
eligibility, or pass/fail criteria.

## How to run

```bash
# Every case in cases/<form>/<year>/<case>/ (defaults: f1040, 2025)
bun run bench --form f1040 --year 2025

# Console detail plus a final machine-readable report
bun run bench --form f1040 --year 2025 --json

# Validate every case's inputs and sources without running the engine
bun run check:cases
```

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

## Current discovery contract

Discovery recursively validates every leaf before starting the CLI: the shared
input and expected-value schemas, the product read from `<form>/<year>/<case>`,
and each form entry against the node schema `form add` applies (unknown fields
rejected, required fields named). Supplied citations must be nonempty and cannot
name the engine as their source; a missing citation is currently allowed and
reported, not independently verified by this check.

`bun run check:cases` performs this validation without running the engine,
allowing the known-invalid cases listed in `benchmark/cases/baseline.json`
until their entries expire. The benchmark reports those exclusions with their
reasons and approvals. Unbaselined invalid cases, expired exclusions, empty or
incomplete directories, and empty runnable inventories terminate with an error
before execution; no partial-success JSON report is emitted.

Full-return expected records include total tax, refund, and amount owed.
Published-line records retain their narrower explicit scope. CLI output must
pass the shared computed-return schema before per-field comparisons run.

## Issue 77 reconciliation

The [October 14 review](./reference/2025/README.md) records corrections to 121
fixtures against published TY2025 tables and worksheet arithmetic. The
[change ledger](./reference/2025/issue77-changes.json) preserves prior values
and calculation assumptions. A fixture's `reconciliation.source_limitations` are
reported as errors: matching a conditional expectation is not a passing result.
Source facts and eligibility gaps remain visible; historical engine outputs were
not regenerated into expected values.
