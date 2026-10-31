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

**Explicit contracts — not a standalone accuracy claim:** distinguish public
summary outputs, raw output fields, intermediate observations and fixture metadata.
Unreviewed fixtures use only the exact keys listed in `run_benchmark.ts`; aliases
are not inferred. Numeric expectations outside that contract become explicit
`unsupportedChecks` and prevent success, rather than being called engine defects.
Reviewed synthetic fixtures opt into the finite bindings below. Envelope metadata
(`case`, `scenario`, `year`, `inputs`, sources/notes) is not scored. Every value
inside `correct` is a finite numeric assertion; malformed oracles, including
unmapped ones, fail.

**Pass criteria:** compare supported expected output keys, including AGI and
payments, not only tax/refund/owed; unsupported oracles, command failures, and
executor/source errors prevent a pass.
Unreviewed full-return fixtures require a finite numeric actual within an inclusive
absolute $5 legacy tolerance. `published_lines` fixtures require exact dollar
equality only for their cited, scored lines. `reviewed_synthetic` fixtures require
exact dollar equality for every declared assertion. The legacy tolerance
accommodates existing fixture rounding; it is not an IRS-approved discrepancy
allowance. Missing evidence never becomes zero. Return-line comparisons accept
singleton numeric arrays; empty, multi-entry, nonnumeric and nonfinite actuals fail. Nonfinite expectations,
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
zero only if finite tax and payments totals are equal. A singleton numeric array
can prove a balance or total without replacing its raw representation. Explicit
nulls, arrays and malformed values are never overwritten, and no other missing
filed line receives a default. Resolving mappings/output coverage needs independent review,
not changes to expected values or relaxed tolerances. A red benchmark is not by
itself proof that every reported discrepancy is a tax-engine arithmetic error.

## Reviewed synthetic assertions

`oracle_scope: "reviewed_synthetic"` is an opt-in contract, not a blanket alias
repair for legacy fixtures. `reviewed_contract.ts` validates an official IRS
source list, explicit synthetic assumptions and limitations, and one provenance
entry for every expected key, with no orphan entries. Each entry identifies a
finite supported observable, authority kind (`published_amount`,
`instruction_application`, or `benchmark_convention`), a declared IRS citation,
and the applicable page/line/table and reasoning.

Case 01 retains all 23 expectations. Its observations cover:

- Eleven return lines, with explicit reviewed bindings for the standard deduction,
  income tax, tax before credits and EIC.
- The actual parsed taxable-income input used by a successfully executed
  ordinary-rate income-tax node. Other tax routes are not inferred from line 15.
- Eleven zero-activity assertions about emitted tax, credit or deduction
  contributions. These require actual successful execution or a recorded optional
  skip with no source facts. An absent field, missing trace, failed node or
  unavailable implementation is not sufficient. Nonzero, malformed or ambiguous
  contributions fail. These assertions do not certify unused private worksheets
  or disaggregate positive combined child/other-dependent or education credits.

The harness creates and populates the synthetic return through the CLI, then
invokes the same `getReturnCommand` once with transient execution capture.
Default CLI output is unchanged; no benchmark flag or tax-store trace is added.
Form 8839, Form 8990 and QEF-deferral projection routes currently omit execution
evidence rather than expose a stale pre-projection trace; their reviewed
intermediate assertions therefore fail closed.
Only reviewed cases request capture; ordinary runs retain no execution trace.

`provenance.limitations` describes the boundaries of a synthetic oracle, including
facts not independently certified. It does not resolve an active source gap:
`reconciliation.source_limitations` still fails the case. Citation presence and a
review date are metadata, not automated verification of the cited publication.


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
- **Oracle scope and limits:** full-return legacy tolerance, exact published-line
  checks, and exact reviewed-synthetic assertions with their observed evidence;
  no automated independent source verification or full-return certification.
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
| `reviewedSyntheticCases` | Declared versus scored fields and each assertion's expected/actual value, numeric match, observation status and evidence detail |
| `caseProvenance` | Declared scope, citations, source issues and reviewed synthetic authority/assumption metadata; `oracle: null` when unavailable |
| `validationLimits` | USD tolerances, lack of independent verification/certification, and partial-output warning |

The explicit `counts` object replaces the ambiguous `total` and `skipped` JSON
fields. A reviewed contract changes which observations can be scored, not tax
calculations, numeric expected values, or baseline eligibility.

An invalid computed-return envelope remains a case-level parsing failure, not a
partial success. Reviewed cases then report zero compared assertions against
their declared coverage. Source errors can also fail a case whose numeric
assertions all match.

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

Full-return and reviewed-synthetic expected records include total tax, refund and
amount owed. Published-line records retain their narrower explicit scope. Computed
return output must pass the shared schema before per-field comparisons run.

## Issue 77 reconciliation

The [October 14 review](./reference/2025/README.md) records corrections to 121
fixtures against published TY2025 tables and worksheet arithmetic. The
[change ledger](./reference/2025/issue77-changes.json) preserves prior values
and calculation assumptions. A fixture's `reconciliation.source_limitations` are
reported as errors: matching a conditional expectation is not a passing result.
Source facts and eligibility gaps remain visible; historical engine outputs were
not regenerated into expected values.
