# Historical Federal Preparation and Cross-Year Losses

## Goal and accepted scope

Prepare original federal individual returns for tax years 2022–2024 and reconstruct tax year 2021 where needed to establish the balances entering those years and 2025. This is working tax calculation and year-correct paper preparation, not merely a list of outstanding tasks or a relabeled current-year return.

The user selected **Federal + cross-year carryovers** and approved this design. State engines, corporate returns, Form 1040-X preparation, transmission and payment are outside this feature. Existing California/Massachusetts preparation requirements remain separate; federal support never implies state support. No private taxpayer input or accounting decision is adopted by developing this feature.

## Principles

- **The return year governs the result.** Shared arithmetic reads the selected year's rules. Historical returns must not inherit 2025/2026 limits, deductions, reporting boxes, source dates or printed forms by default.
- **Unknown is not zero.** Missing opening losses, unresolved basis, incomplete source populations and missing income needed for loss absorption remain visible blockers. An explicit reviewed zero is a different fact.
- **Preparation is not filing.** Calculated, reviewed, exported, signed, submitted and accepted are distinct states. An unfiled reconstructed year can support later preparation without being misrepresented as an accepted return.
- **Reuse one calculation convention.** Extend shared nodes and year-owned configuration/wiring. Do not create a second standalone tax engine or copy the entire current-year implementation into four forks.
- **Sources stay intact.** Preserve reported source cents, dates, identifiers and legal-character decisions; round at the existing federal reporting boundaries. Derived balances never rewrite original facts.
- **User-specific priorities, reusable implementation.** Product code and regression fixtures contain no real taxpayer identifiers, amounts, account records or source documents. Synthetic and IRS-published examples supply verification.

## Supported preparation domains

The historical product supports the following individual-return paths needed by the use case, including their applicable calculations and paper schedules:

- Filing identity/status, standard-versus-itemized deductions, income aggregation, ordinary and preferential income tax, withholding and reviewed tax-year-specific payments.
- W-2 wages, unemployment and other sourced ordinary income, interest and dividends, small-business income and associated self-employment/QBI calculations where applicable.
- Brokerage and digital-asset dispositions, Form 8949 adjustments and reporting categories, Schedule D netting and capital-gain distributions, and separate incoming/outgoing short- and long-term losses.
- Rental receipts and supplied deductible expense/repayment facts, personal/rental use allocation, passive loss limitations and activity-specific suspended losses. A recorded repayment is not automatically an allowed deduction; treatment and required substantiation remain explicit caller facts.
- Individual owner consequences from supplied K-1 facts with applicable loss limitations. The software must not infer an entity's election status, fabricate a K-1 or convert corporate receipts to Schedule C income.
- Applicable Marketplace premium-tax-credit/APTC reconciliation and HSA contribution/distribution calculations, using the return year and relevant prior/following-year evidence.

Published capabilities identify the supported forms and any substantive conditions for each year. Other historical tax provisions are explicitly rejected rather than silently dropped or evaluated under current-year law. A capability is advertised only when its relevant calculation and paper path work; registering a node does not establish full historical tax-law coverage.

Historical 2021-only provisions and pre-2025 differences must be handled wherever they intersect an advertised path. In particular, historical returns cannot receive Schedule 1-A deductions or the post-2024 SALT regime. Pre-2025 digital-asset reporting uses the appropriate historical Form 8949 categories, not 2025 boxes G–L.

## Annual execution and discovery

Each supported year is a real catalog product with its own declared capabilities. The existing create, form input, get, validate and export workflow works for 2021–2024. Node discovery and inspection can target a year and must not show 2025-only inputs as generally available historical inputs.

Creating a return for an unsupported form/year fails before creating a saved empty record. Existing historical empty records remain intact and become usable when their year is supported. No automatic migration copies another year's income, elections, source documents or amounts into them.

Execution uses year-correct tax tables/rate schedules, deductions, credit and health thresholds, relevant source-year relationships and date boundaries. The underlying IRS authority is identified for every annual rule set. Source-only diagnostics and unsupported combinations remain visible even if the engine can calculate other portions of the return.

Preparation validation distinguishes:

1. Input/schema and source-identity/coverage errors.
2. Calculation and loss-reconciliation errors.
3. Missing or stale cross-year dependencies.
4. Missing printable documents or unsupported historical provisions.
5. Electronic-filing capability, which is not supplied by this historical paper feature.

A successful partial calculation does not imply a complete or fileable return. An empty record cannot be presented as a verified zero-income return. Existing 2025/2026 calculation and filing contracts remain intact.

## Federal capital-loss continuity

For each supported source year, calculate the actual IRS Capital Loss Carryover Worksheet using the source year's Schedule D short-term net, long-term net, allowable current loss and taxable-income amount before the Form 1040 zero floor where the worksheet requires that amount.

Do not use `total loss minus 3000` as a substitute for the worksheet. Preserve short-/long-term character, opposite-character gain offsets, the applicable filing-status deduction limit and limited absorption in low- or negative-taxable-income years. The calculation exposes its worksheet inputs and resulting balances for review.

Opening balances require separate known short-term and long-term values, including explicit zero, and a source reference. Missing balances remain unresolved when capital history is applicable. Unknown acquisition basis is never supplied by a carryover calculation. Pre-2021 acquisition and loss history can be represented by reviewed opening facts; this feature does not claim a complete 2016–2020 return engine.

A carryover can originate from either reviewed outside evidence or a calculated unfiled return. Its provenance says which; a generated record never asserts IRS acceptance or taxpayer approval.

## Rental suspended-loss continuity

Retain passive loss carryovers separately from capital losses, keyed by stable activity identity and reporting character. Preserve the current-year allowed/suspended reconciliation and incoming/outgoing amounts per activity. Do not fold rental losses into Schedule D carryovers or match activities merely by a similar description.

Reconstructed, not-yet-filed years have their own truthful provenance. They do not populate fields asserting an accepted/filed source merely to bypass existing validation. Missing activity allocation or an unresolved applicable at-risk/basis limitation blocks adoption of the affected balance.

Other tax attributes, including QBI and at-risk carryforwards, remain separate. Their inputs or limitations must not be discarded or silently replaced with capital/passive balances; any unavailable required transition is reported explicitly.

## Preview, application and stale-data protection

Cross-year transfer is a two-stage operation:

- **Preview:** read-only calculation showing source and destination years, taxpayer match, balance type, source facts, computed balances and unresolved requirements.
- **Apply:** an explicit operation writes supported reviewed balances into the immediately following year's matching inputs, preserving unrelated entries and original source records.

Application requires consecutive years, the same taxpayer, a valid reviewed source calculation or reviewed outside evidence, known balance components and no contradictory destination inputs. It must not silently overwrite independently entered carryovers or merge incompatible activity records. Validation completes before any financial write; a rejected application leaves both returns unchanged.

Persist the source identity/year and a fingerprint of the financial/review inputs used by the calculation. When source inputs change, a linked destination reports the carryover as stale and blocks reliance on the old balance until it is reviewed and explicitly reapplied. Check inherited dependencies as well as the immediate source. Strictly consecutive increasing years prevent a cyclic chain.

Changing a source does not erase old evidence, alter unrelated target inputs or automatically mark the destination reviewed. Repeating application of the same reviewed source cannot duplicate an amount.

## Year-correct paper preparation

Historical paper assembly is independent of mandatory current-year MeF XML construction. It uses official final IRS forms for the actual year, with year-specific field mappings, document inclusion and source-to-printed-total reconciliation. Changing only a PDF URL while keeping another year's field offsets is not acceptable.

The packet contains the Form 1040 and applicable supported schedules/forms, not only a cover sheet or a summary of computed values. Unsupported or missing required documents block an ordinary complete packet; an explicitly requested diagnostic draft may include partial output with a prominent **DRAFT — NOT FOR FILING** mark and unresolved-item inventory.

Preparing an unsigned paper review copy does not require a fabricated electronic signature PIN or transmitter identity. Export describes the actual preparation/review state and never asserts signature, mailing, transmission or acceptance. Historical MeF export fails with an explicit unsupported-capability message rather than emitting a current-year envelope.

Template selection is pinned to the relevant year and verified against the official form. PDF field readback and rendered review verify amounts, checkboxes, overflowing statements and form-year labels. Private identifiers are excluded from public logs and committed review artifacts.

## Authority and evidence

Use archived IRS forms, instructions, revenue procedures and published examples for the actual tax year. Record source title, URL, year, pinpoint and retained-source digest for annual rules and printed mappings. Public ATS samples can provide published line amounts without claiming ATS certification; a missing or unreadable source is not an oracle.

Benchmark expected values come from the cited IRS publication, never from this engine or another calculator. Preserve publication corrections and explain source revisions rather than editing expectations to match implementation. Synthetic tests cover behavior and invariants but do not substitute for the repository's publication-backed benchmark requirement.

The repository baseline for implementation is the refreshed `origin/main` at `29eec9d1`, which uses Bun and already includes TY2026 year-parameterization work. Reuse that work rather than recreating gaps observed in the older local checkout. The user's original branch, local California work and private return stores remain unchanged.

## Acceptance criteria

- Real 2021–2024 catalog products accept supported inputs, calculate under the correct law and produce correct-year paper packets through the actual CLI.
- Supported form/year discovery is truthful; unsupported years and provisions fail before mutation or silent data loss.
- The relevant wages, unemployment, investment, rental, owner-income and health paths are exercised with sourced/synthetic facts and retain source arithmetic.
- Capital-loss worksheet outputs distinguish ST/LT and handle positive, zero and negative pre-floor taxable income correctly; rental suspended losses remain reconciled by activity.
- A 2021 → 2022 → 2023 → 2024 → 2025 reconstruction chain can be previewed and explicitly applied without asserting that earlier returns are filed.
- Unknown and explicit-zero opening balances differ. Wrong taxpayer/year, contradictory target values, source edits, inherited stale links and repeat application are covered by deterministic consumer-visible checks.
- Historical paper preparation does not depend on 2025 MeF assembly or an electronic signature PIN. Required forms, year labels, values and visible draft states are verified from actual PDFs.
- Publication-backed historical benchmarks, relevant existing-year regressions, structure, sandbox, case/oracle, type/unit/form, MeF and CLI gates are run using the current repository scripts. Missing external IRS schema/transport evidence is disclosed, never called passing or required for this paper-only feature.
- Product documentation explains supported years/forms, known boundaries, source requirements and the executable preparation/carryover workflow.
- No taxpayer inputs are changed, no private data are committed, and no software is deployed or return signed/submitted/paid by implication.
