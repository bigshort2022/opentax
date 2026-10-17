# TY2025 California Form 540 Full-Return and MeF Handoff Design

## Problem

The current `ca540:2025` product is a calculation workpaper. It calculates selected Form 540 lines from user-supplied aggregates, omits many schedules and eligibility computations, forces `canFile: false`, and rejects MeF export. Removing that scope gate alone would misrepresent an incomplete return as fileable.

## Goal

Expand the product to complete TY2025 California Form 540 preparation for full-year California residents, produce an FTB-compatible MeF XML candidate for downstream review or use in an approved provider's workflow if that provider supports import, and return specific, evidence-backed readiness diagnostics. This project does not transmit returns, collect or authorize payment, or claim FTB acceptance or OpenTax provider approval.

## Initial scope

- Tax year 2025; Form 540 resident returns for full-year California residents.
- Complete Form 540 lines, calculations, and all supporting schedules/attachments required for supported resident cases. The implementation plan must create and maintain a line/schedule coverage matrix against the official 2025 FTB forms list and instructions before adding calculations.
- Explicitly exclude Form 540NR, Form 540 2EZ, amended returns, TY2024 and earlier, actual transmission, payment, ACK/reject processing, and filing authorization. These require separate scope and certification decisions.
- Include the Form 540 inputs and workflows necessary to prepare a complete supported return. Unsupported taxpayer situations must be identified explicitly and fail readiness rather than default to zero or pass via review booleans.

## Readiness contract

The current `canFile: false` is deliberate workpaper policy, not evidence that a synthetic input failed a MeF schema. Replace that unconditional result only after complete coverage and the validation gates below exist.

Expose independent, typed results for at least:

- calculation/data completeness and tax-rule diagnostics;
- FTB MeF schema validation;
- FTB business-rule validation;
- readiness blockers and non-blocking alerts; and
- return-level `canFile`.

`canFile` is true only when the return is within the supported scope, required facts and schedules are present and reviewed, calculations and applicable business rules pass, and the generated FTB XML validates against the pinned official schema. It means the return passes this tool's local filing-readiness checks; it does not mean OpenTax can transmit it, an approved provider will accept/import it, or FTB has accepted it. Schema validity alone never makes `canFile` true. Product/provider approval and transmission/acceptance status remain separate and are not inferred.

## MeF authority and external dependencies

Use the FTB California individual schema and business rules, not the IRS Form 1040 schema, for the state return. FTB's public schema page says those artifacts are distributed to authorized users through the FTA State Exchange System after a California Letter of Intent for each supported tax year. The FTB page lists TY2025 Form Type `540/NR/2EZ`, version `2025v4.3`, available in SES on 2026-06-08, with PATS and production dates starting 2026-06-22. Target that latest listed version unless FTB confirms a superseding release. Do not invent or substitute schemas/rules if access is unavailable.

Before implementation depends on the package, confirm the project can obtain authorized access and determine what artifacts may be committed. If redistribution is restricted, keep the official package outside source control and make validation consume a versioned, hash-checked private/CI artifact. Failure to obtain the official schema and rules blocks any FTB-schema-valid or filing-ready claim.

FTB's developer participation page says California e-file software developers must apply to the IRS e-file program, hold approved EFIN/ETIN, pass IRS ATS and California suitability, complete the CA participation form and CA Letter of Intent, and pass annual FTB PATS. FTB also says it accepts returns only through approved software providers. This project's handoff-only scope does not pursue provider approval or transmission. Any PATS result must be obtained through an authorized route and reported accurately; absence of that route means no claim of PATS approval or FTB acceptance.

## Architecture

- Keep California tax calculation, state return data, and FTB serialization distinct from the federal Form 1040 engine and IRS MeF schema.
- Preserve year-versioned, strict input schemas and typed line/schedule results; use explicit source-document facts and traceable calculations rather than user-entered totals wherever the return model supports it.
- Derive `canFile` from the typed result gates; do not hardcode false or allow `--force` to bypass tax, schema, or business-rule rejects.
- Generate the XML candidate only from validated return state. Preserve exact validator rule identifiers/messages and map them to actionable diagnostics without leaking private taxpayer content into logs or committed fixtures.
- Keep existing workpaper output available only as a clearly labeled incomplete result until the full-return gates are proven. Remove or migrate obsolete paper-only MeF refusal when the replacement path is complete; do not add a shim that implies filing support early.

## Validation and evidence

1. **Requirements coverage:** Maintain a traceability matrix from each Form 540 line, relevant 2025 Schedule CA and supporting schedule field, eligibility rule, and XML element/business rule to an FTB source and implementation/test.
2. **Tax correctness:** Use synthetic cases with expected line values independently derived from FTB 2025 forms, instructions, publications, tax tables, and applicable law. Cover filing status, boundaries, phaseouts, carryovers, rounding, credits, payments, and error paths; never derive oracle values from OpenTax output.
3. **Schema:** Run the exact FTB TY2025 v4.3 XSD locally against generated XML, with tests for required/missing/invalid elements, types, ordering, namespaces, and attachments.
4. **Business rules:** Run the exact FTB TY2025 v4.3 rules locally and preserve exact rule identifiers and severities; include positive cases and intentional rule failures.
5. **End-to-end:** Exercise a fully supported synthetic return through fact ingestion, calculations, complete Form 540/schedules, XML generation, XSD validation, and business-rule evaluation. Assert readiness true only for a valid fixture and assert specific blockers for incomplete, unsupported, or rejected fixtures.
6. **Official test evidence:** If FTB authorizes a PATS/test path for this handoff-only project, run only approved synthetic test scenarios and record the versioned result. Do not use live taxpayer data or a production transmission. If access is unavailable or PATS is not applicable absent provider enrollment, document the exact unverified gate and do not claim official approval/acceptance.
7. **Privacy and operations:** Fixtures contain no taxpayer data, live returns, private identifiers, or raw CLI logs. No automatic transmission, payment, credentials, or filing authorization.

## Primary sources

- FTB, [Valid Individual FTB XML Schemas](https://www.ftb.ca.gov/tax-pros/efile/individual-ftb-xml-schemas.html): authorized SES access, version table, TY2025 v4.3 and PATS/production dates.
- FTB, [e-file for software developers](https://www.ftb.ca.gov/tax-pros/efile/efile-for-developers.html): provider enrollment and annual PATS requirements; submissions only through approved providers.
- FTB, [Forms you can e-file for individuals](https://www.ftb.ca.gov/tax-pros/efile/individual-efile-forms.html): TY2025 accepted Form 540 schedules and attachments.
- FTB, [2025 Form 540 instructions](https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html) and the 2025 Form 540, Schedule CA, and supporting form instructions: tax calculations and return requirements.
- IRS, [MeF schemas and business rules for individual returns](https://www.irs.gov/e-file-providers/modernized-e-file-schema-and-business-rules-for-individual-tax-returns-and-extensions): federal individual MeF specifications, distinct from FTB's California return schema/rules.

## Decision summary

Approved direction: TY2025 full-year resident Form 540 first; validated XML handoff, no transmission; strict separate status gates with `canFile` derived only from complete supported readiness; hybrid local schema/rule validation plus official FTB test evidence when authorized; FTB SES schema access is an explicit prerequisite and fail-closed release gate.
