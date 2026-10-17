# California Form 540 TY2025 Filing Pipeline Design

## Goal

Add a staged California resident Form 540 TY2025 capability that computes a return, produces CA-compliant XML, validates it against FTB schemas and business rules, and can progress to authorized PATS and transmission workflows without claiming that calculation or XML generation constitutes filing.

## Scope

- Include California resident Form 540 for TY2025, including calculation domains, return-level validation, FTB XML generation, schema validation, FTB business-rule diagnostics, and a complete CLI flow for local validate/export.
- Include California benchmark fixtures with publication-sourced expected values. Preserve the repository's benchmark oracle policy: expected values cite official FTB publications and never use engine output as truth.
- Include a compliant digital-asset disposition vertical slice: source-backed Form 1099-DA and other disposition records, federal Form 8949/Schedule D projection, and separate California Schedule D (540) gain/loss and carryover projection. No fabricated losses, unsupported loss-harvesting tactics, or assumed state conformity.
- Preserve source transaction identifiers, acquisition/disposition dates, quantity, proceeds, basis, fees, basis-reporting status, holding period, and reviewed evidence. Reconcile broker-reported amounts to the return; fail closed on missing/contradictory basis or ownership rather than inferring a deductible loss.
- Design later PATS, authorization, transmission, and acknowledgement stages in the architecture and plan; implement them only when official program access, credentials, test packages, and approved-transmitter arrangements exist.
- Exclude Form 540NR, Form 540 2EZ, other years, payments-only submissions, other states, and IRS/FTB partner certification claims.

## Architecture

- Add a shared digital-asset transaction-evidence model consumed by separate federal and California calculations. Reuse existing federal Form 8949 boxes G–L where appropriate; add a dedicated 1099-DA ingestion path and CA projection without conflating federal and California bases, realized losses, or carryovers.
- Generalize the shared catalog/CLI contracts only at genuine form boundaries. Avoid making CA use IRS identity, document tags, transmission rules, or schema-version assumptions.
- Treat tax calculation, readiness validation, artifact serialization, schema/business-rule validation, PATS, transmission, and acknowledgement processing as separate stages with explicit result states. `canFile`/ready status must not mean that a return has been transmitted or accepted.
- Store the official FTB TY2025 schema/business-rule package outside the committed source tree in an approved local research/schema location. Pin schema version and cryptographic digest in a provenance record. Never commit restricted package files or use guessed/third-party schemas.
- Use the official configured schema for both XSD tests and finalized local export/readiness validation. Missing schema, a version mismatch, or schema-validation failure prevents finalized file-ready status. Draft output stays marked diagnostic and is not fileable.
- FTB business-rule diagnostics are CA-specific and scoped to the documents actually emitted. Keep transmitter/session checks out of the return-only validation stage unless the FTB specification says they belong there.
- Keep PATS and production transport as later adapters behind explicit authorization/configuration boundaries. No network transmission or credentials are required for local calculation and artifact milestones.

## Stages and acceptance boundaries

1. **CA calculation and evidence:** Form 540 inputs are validated; calculation graph and printed projections reconcile; benchmark expected values trace to TY2025 FTB publications. Crypto benchmarks exercise 1099-DA and non-broker dispositions, basis reported/unreported, short-/long-term losses, federal-to-CA differences, and CA carryover independently. Initial scenario inventory is no smaller than the 13 claimed CA scenarios once those source cases are identified and verified; missing or unverifiable cases must be reported rather than fabricated.
2. **CA filing artifacts:** Resident identity/header, required fields, schedules, XML element ordering, and document references follow the official SES package. CLI validation reports business-rule outcomes and XSD outcomes separately. Finalized export is blocked if required validation cannot run or fails.
3. **PATS readiness:** Implement official PATS scenarios and evidence capture only after access to the official current test package. Passing local XSD checks is not PATS acceptance.
4. **Authorized transport:** Implement submission packaging, authorization/security metadata, transmission lifecycle, retries only where specified by FTB, idempotency, and acknowledgement reconciliation from official specifications. Production sending remains disabled until the required FTB/IRS participation conditions and an approved provider/transmitter path are available.

## External prerequisites and constraints

- FTB states that individual schemas and business rules are distributed through the FTA State Exchange System to authorized users after a CA Letter of Intent for each supported year. The currently published TY2025 version listing is 2025v4.3; use the authorized package and confirm that it is the correct applicable version at implementation time.
- FTB developer participation requires IRS e-file program enrollment, approved EFIN/ETIN, IRS ATS and CA suitability, a CA software developer participation form, and CA LOI. FTB requires yearly PATS and accepts submissions only through an approved software provider.
- This repository's commercial notice reserves IRS MeF developer/transmitter application rights to Filed Inc. and authorized partners. Do not change or imply broader authorization; route any IRS-side filing/transmitter work through authorized parties.
- California tax calculation sources include the official TY2025 Form 540 booklet/instructions, Schedule CA and instructions, tax table/rate schedules, and any other FTB publications applicable to each supported rule.

## Tax-authority currency and verification

- Re-verify the official FTB TY2025 form/instruction index, publication revisions, conformity guidance, schema version, and business-rule package at implementation start and before each release. A stable URL alone is not evidence that the version is current or applicable.
- For every implemented calculation or filing rule, retain an authority record with the source title, tax year, issuing agency, canonical URL, publication/revision date, retrieval date, page/line or rule identifier, and SHA-256 of the retained source bytes. Keep restricted SES files outside committed source; record their exact version and hashes in the permitted local provenance record.
- Treat FTB form instructions as implementation guidance, not conclusive law: FTB itself says its instructions summarize tax law and are not authoritative law. Resolve material ambiguity or conflict using the applicable California Revenue and Taxation Code, regulations, conformity statutes/notices, and official FTB publications; document the resolution before coding.
- Bind every benchmark expectation to a published worked example or other explicit official value and cite the exact page/line in its case metadata and ledger. A model-produced value, calculator output, or unverified third-party answer is not an oracle.
- When FTB updates an instruction, schema, or business-rule package, compare the new official revision against the pinned source record. Update implementation, tests, benchmark ledger, and schema provenance together where the change affects TY2025 behavior; otherwise record why the update is non-applicable.
- Acceptance requires a reviewer to verify source provenance and rule-to-test coverage, not merely that XML validates against an XSD. XSD validity does not establish correct tax treatment or FTB acceptance.

## Validation and evidence

- Unit tests cover schema-inferred input shapes, boundaries, computation invariants, rounding, residency/filing eligibility, and CA-specific transitions.
- Digital-asset tests reconcile source evidence to Form 8949 G–L and Schedule D, prove proceeds-minus-basis-plus-adjustments math, detect missing/duplicate/contradictory transactions, and independently verify federal versus CA gain/loss and carryover calculations at applicable limits.
- Benchmarks validate published line amounts against cited FTB material; benchmark schema/oracle checks remain mandatory.
- Integration tests exercise catalog selection, CLI create/input/validate/export, emitted document inventory, diagnostics, and fail-closed behavior when schemas are absent or mismatched.
- XSD tests use the authorized version-pinned SES schemas; malformed ordering, missing required header fields, invalid enumerations, and structurally invalid XML must be rejected.
- Business-rule tests cover both rejection and valid edge cases against FTB-published rules; schema validity is not treated as business-rule validity.
- PATS evidence uses official test cases and recorded test outcomes. Transmission tests use official non-production facilities only; production acceptance requires acknowledged responses from the approved path and is not simulated by mocks.
- Before claiming completion, run repository-required structure, unit, CA TY2025 benchmark, case/oracle checks, plus actual CLI smoke tests for ready, rejected, missing-schema, and draft paths. State any external PATS/authorization/production checks that were not available.

## Official references

- FTB developer participation: https://www.ftb.ca.gov/tax-pros/efile/efile-for-developers.html
- FTB valid individual XML schemas and TY2025 version listing: https://www.ftb.ca.gov/tax-pros/efile/individual-ftb-xml-schemas.html
- TY2025 Form 540 booklet: https://www.ftb.ca.gov/forms/2025/2025-540-booklet.html
- TY2025 Form 540 instructions: https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html
- IRS 2025 Form 8949 instructions: https://www.irs.gov/pub/irs-prior/i8949--2025.pdf
- FTB 2025 Schedule D (540) instructions: https://www.ftb.ca.gov/forms/2025/2025-540-d-instructions.html
- FTB 2025 Schedule CA (540) instructions: https://www.ftb.ca.gov/forms/2025/2025-540-ca-instructions.html
