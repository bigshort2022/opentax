---
name: tax-status
description: Where the engine stands — benchmark pass rate per form:year, MeF readiness of the sample returns, and the TY2025 ATS scoreboard. Read-only.
---

# Tax Status

Run these and summarize; change nothing.

1. For each `benchmark/cases/<form>/<year>/` directory:
   `bun run bench:cached --form <form> --year <year> --json`. Report
   `counts.passed` / `counts.executed`, `counts.failed`, and the separate
   `counts.discovered`, `counts.runnable`, `counts.excludedKnownInvalid`,
   and `counts.notRun` inventory counts. Group failures by issue and compared line.
   Keep disjoint `failureBreakdown` groups separate from overlapping
   `failureCauses`; do not label every failure an arithmetic defect.
   Include `excludedCases` reasons and expiry, `provenance` citation coverage,
   `oracleScopes`, and `validationLimits`. Citation presence is not verified
   IRS support, and published-line checks are not full-return certification.
2. `bun run check:mef`: sample returns ready to file, the most common
   findings, and any `NEW` or `FIXED` problem against
   `scripts/testing/mef-baseline.json`.
3. `bun run check:ats`: scenarios passing out of 8, packet values matched, and
   any blocker, schema failure or unexplained value.
4. `bun run check:irs`: which IRS packages in `irs/` are missing (XSD checks
   are skipped without them).

End with the next step: `/tax-fix <form>:<year>` for benchmark failures,
`/tax-fix mef` for MeF or ATS blockers.
