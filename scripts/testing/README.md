# Harness

The harness is what you use while building the engine; it is never shipped.
`cli/main.ts` is the product. The harness restricts a change and proves it, so a
pull request carries evidence instead of a description. The finish condition is
in [AGENTS.md](../../AGENTS.md); the rule each check owns is in the table in
[STRUCTURE.md](../../docs/architecture/STRUCTURE.md).

| Command                                       | Proves                                                   | Fails when                                                                                                                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deno task check:structure`                   | nodes are placed, registered and reachable               | a `TaxNode` outside `forms/<form>/nodes/<role>/[<kind>/]<section>/<group>/<name>/`; a registry key that is not the node type; a node class in no registry; a registered node that nothing routes to and the CLI cannot take |
| `deno task check:cases`                       | benchmark cases fit their node schemas and cite a source | an input `form add` would reject, with the field named; a `source` that cites the engine                                                                                                                                    |
| `deno task check:oracle [--base origin/main]` | expected values changed only with a citation             | a changed scored value, a removed case, or a new case without a source, that has no matching entry in `benchmark/cases/<form>/<year>/ledger.json`                                                                           |
| `deno task bench --form f1040 --year 2025`    | the engine matches IRS ground truth                      | a supported line outside the $5 legacy tolerance, an unmapped oracle, a diagnostic, a skipped case                                                                                                                          |
| `deno task test:unit`                         | the module graph resolves and the typed tests pass       | a graph error, a missing or duplicate test module, a failing test, a runtime change during the run                                                                                                                          |
| `deno task test:ca540` | selected CA calculations, coverage, assessment, CLI/worksheet and evidence contracts execute | a selected behavioral contract fails; this does not run official FTB schemas/PATS |
| `deno task bench --form ca540 --year 2025 --json` | canonical CA line/workpaper expectations match exactly, including intentional non-readiness | a numeric/typed expectation differs, inventory is empty/malformed, required evidence is absent, or workflow fails |

The first three checks print problems with fixes and support JSON reports. `.github/workflows/test.yml` runs those checks and `test:unit`, plus an explicit CA test/benchmark job with the required PDF utilities. The federal benchmark remains local while its baselined invalid cases remain unresolved; a CA pass is not a clean federal benchmark or filing certification.

## Ratchets

Existing debt is allowed with a reason, an expiry date and an approver; new debt
fails. An expired entry fails, and an entry that no longer matches a problem
fails until it is removed, so a baseline only shrinks.

| File                                        | Keyed by               | Holds                                               |
| ------------------------------------------- | ---------------------- | --------------------------------------------------- |
| `scripts/testing/structure-baseline.json`   | path, node type        | nodes outside the tree, registry and reach problems |
| `benchmark/cases/baseline.json`             | `<form>/<year>/<case>` | cases whose inputs no longer fit their node schema  |
| `benchmark/cases/<form>/<year>/ledger.json` | case, line             | every expected-value change, with its publication   |

California ledgers use typed assertion paths and official/project-policy authority for numeric and nonnumeric outcomes, inputs/sources, and manifest changes. Their contributor provenance does not imply user or tax-professional numerical approval. Federal numeric ledger semantics are unchanged.

The ledger is history, not debt: it is append-only and never expires. An entry
that cites the engine, its output or a reference calculator does not count.

## Adding a check

Add one when the same mistake has happened twice, at the highest level that
holds: make it impossible in code (one owner, one path, the old way deleted);
else a check here whose error names the fix; else a test; else a line in
`AGENTS.md`, which nothing enforces. Prove the check fails on the real past
mistake before it lands. When the pattern is already common, fail only on new
occurrences. Delete a check once its mistake cannot happen, and record every
rule and its enforcer in the STRUCTURE.md table.

## Test runner

`deno task test:unit` runs the exact core, CLI utility and harness modules after
checking the graph of every TypeScript module. `test:harness` selects the
verification contracts and benchmark harness. `test:preflight` checks discovery
and graph resolution without executing tests. Reports explicitly list excluded
modules; a selected run does not prove complete filing coverage.

`deno task test:ca540` is a separate explicit selection of `forms/ca540/2025`, `cli/commands/ca540.test.ts`, and `benchmark/ca540.test.ts`. It is required because the ordinary unit mode excludes CA product/command modules; graph discovery alone is not execution evidence. CA canonical cases distinguish line-31 checks from workpapers and reject complete-return cases until that product scope exists.

`deno task test` runs the complete discovered suite serially, requires xmllint,
Poppler and the retained TY2025 Return1040 schema, and rejects unavailable
ignored requirements. Exact module/test exclusions in `skip-policy.json` require
a documented reason; excluded tests remain unverified, and the report never
calls a run with exclusions complete coverage. Private reviewed evidence must be
supplied through the existing named environment inputs for the relevant optional
filing gates. Missing inputs and ignored cases remain visible in the
requirements and JUnit reports. A full suite is not IRS acceptance or
independent tax ground truth.

Every invocation retains a unique private directory under
`.state/research/testing/`, including exact selected/excluded modules, module
graph, runtime hashes, stdout/stderr, child exit status and terminal report.
Runtime changes, graph errors, missing/duplicate test modules, zero executed
tests and nonzero child status prevent success. Full runs acquire an exclusive
shared lock; an unreleased lock requires checking its recorded process and
report before recovery. Historical evidence is never overwritten.
