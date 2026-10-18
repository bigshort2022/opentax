# Filed Open Tax Engine

<p align="center">
  <img src="icon.svg" width="128" height="128" alt="Filed Open Tax Engine">
</p>

**Fork integration: `2.2.0-ca540.1`**, based on [Filed OpenTax v2.2.0](https://github.com/filedcom/opentax/releases/tag/v2.2.0), with the fork's limited California Form 540 TY2025 workpaper preserved. Single binary for macOS, Linux, and Windows. This is a prerelease integration, not a claim of filing certification.

Federal products include Form 1040 TY2025, developing Form 1040 TY2026 support, and Form 4868 TY2026. TY2026 has explicit calculation/schema gaps and no PDF export. See [supported forms](#supported-forms) and [MeF readiness](#mef-readiness).

> **California scope:** selected TY2025 Form 540 calculations for full-year residents only. The worksheet is incomplete, unofficial, not filing-ready, and not e-fileable. See [California Form 540 scope and limitations](docs/ca540-ty2025.md).

California validation reports calculation coverage, stable findings, and separate local-readiness gates. A passing arithmetic/input check is not a complete-return or filing pass: required documents remain unverified and official FTB schema/rule validation is unavailable. `canFile` stays false, and neither force nor draft enables California MeF export.

The engine provides calculations for AI agents and developers; it does not establish tax correctness or filing readiness. Use official IRS/FTB forms and instructions and approved filing channels. Federal MeF A2A transmission code exists but has only been tested against a local mock IRS server; no IRS approval or live acceptance is claimed.

---

## Why

- Professional tax calculation engines are closed source, expensive, and built for humans — making it hard for AI agents to reliably use one as a calculator
- AI agents have drastically reduced the cost of building and maintaining a tax engine. It only makes sense to do it in the open
- This project aims to be the first truly open-source, up-to-date tax calculation engine that works for everyone

**Designed for the AI era:**

- Built to be run by AI agents more than humans
- Single binary CLI that AI agents can download and run instantly
- Everything stored locally. Open, secure, and accessible

Inspired by Andrej Karpathy's [autoresearch](https://github.com/karpathy/autoresearch), an autonomous loop where AI agents modify code, measure results, and keep only improvements. OpenTax applies the same idea to tax calculation: agents read IRS instructions, write implementations, generate test cases, and fix regressions in a continuous loop.

---

## Use with AI agents

Use the skills from this fork so the California scope and safety gates are retained. Copy-paste this into Claude Desktop app:

```
Load the skill here using curl or equivalent:
https://raw.githubusercontent.com/bigshort2022/opentax/main/skills/opentax/SKILL.md

Then run the onboarding flow.
```

### Claude Code

If you use [Claude Code](https://claude.ai/code), install OpenTax as a plugin so the skill is always available:

1. Add the marketplace:

```
/plugin marketplace add bigshort2022/opentax
```

2. Install the plugin:

```
/plugin install opentax@opentax
```

3. Use the skills:

```
/opentax:opentax         # guided onboarding, picks the right skill for you
/opentax:tax-preparer    # prepare a return from scratch
/opentax:tax-reviewer    # audit a completed return against source docs
```

---

## Install this fork

Use this repository's source or an explicitly selected release from
[bigshort2022/opentax releases](https://github.com/bigshort2022/opentax/releases).
The upstream `filedcom/opentax` installer and binaries do not include this fork's
California workpaper. Do not use the upstream one-line installer for this integration.

### Build from source

Requires [Bun](https://bun.sh) 1.4.2. Check out the reviewed integration commit or
release tag before building:

```bash
git clone https://github.com/bigshort2022/opentax.git
cd opentax
# Select the reviewed integration commit, or v2.2.0-ca540.1 once published.
bun install --frozen-lockfile
bun run compile
./opentax version
```

Run `./opentax` (Windows: `./opentax.exe` when built with that output name), or
place that executable on your PATH. Source builds report `dev`; release CI
injects the selected tag's version without changing the source default.

### Release binaries

When `v2.2.0-ca540.1` is published, select that exact prerelease on the fork's
release page. Download its platform asset and `SHA256SUMS`, verify the checksum,
and run `opentax version` to confirm `2.2.0-ca540.1` before using it.
The fork's `install.sh` is pinned to that tag by default, rather than GitHub's
latest-release channel; it cannot download a release that has not been published.
After publication, an explicit-version install is:

```bash
curl -fsSL https://raw.githubusercontent.com/bigshort2022/opentax/main/install.sh | OPENTAX_VERSION=v2.2.0-ca540.1 sh
```

Review the script before running it; it may need elevated permission to place
the binary on your PATH. It is separate from the upstream installer.

| Platform | Asset |
| --- | --- |
| Mac (Apple Silicon) | `opentax-macos-arm64` |
| Mac (Intel) | `opentax-macos-x64` |
| Windows (x64) | `opentax-windows-x64.exe` |
| Linux (x64) | `opentax-linux-x64` |
| Linux (ARM64) | `opentax-linux-arm64` |

The release workflow compiles and smoke-tests all five assets, retains smoke
transcripts, and publishes checksums. Maintainers should first run its dry-run
build and the verification/CA gates, then publish the reviewed commit under the
explicit fork tag. Tags with a hyphen are marked as prereleases. A build or
smoke pass does not establish tax correctness or filing certification.

---

## Example: single W-2 filer

```bash
$ opentax return create --year 2025
{ "returnId": "a1b2c3" }

$ opentax form add --returnId a1b2c3 --node_type start '{"general": {"filing_status": "single"}}'
{ "id": "start_01", "nodeType": "start" }

$ opentax form add --returnId a1b2c3 --node_type w2 '{"box1_wages": 55000, "box2_fed_withheld": 5200}'
{ "id": "w2_01", "nodeType": "w2" }

$ opentax return get --returnId a1b2c3
```

```json
{
  "returnId": "a1b2c3",
  "year": 2025,
  "summary": {
    "line1z_total_wages": 55000,
    "line9_total_income": 55000,
    "line11_agi": 55000,
    "line15_taxable_income": 39250,
    "line24_total_tax": 4475,
    "line33_total_payments": 5200,
    "line35a_refund": 725
  },
  "lines": {
    "filing_status": "single",
    "line1a_wages": 55000,
    "line12a_standard_deduction": 15750,
    "line15_taxable_income": 39250,
    "line16_income_tax": 4475,
    "line24_total_tax": 4475,
    "line25a_w2_withheld": 5200,
    "line33_total_payments": 5200,
    "line34_overpayment": 725,
    "line35a_refund": 725
  },
  "warnings": []
}
```

$55,000 in wages, $15,750 standard deduction, $39,250 taxable income, $4,475 tax
from the Tax Table, $725 refund. The output is abridged; it also lists the forms
computed and any carryforwards. Returns are stored under `./.state/returns`.

---

## More commands

```bash
# Inspect what fields a node expects, or list every registered node
opentax node inspect --node_type w2
opentax node list

# Print the JSON form add takes for a source document or input (--full adds optional fields)
opentax node template --document 1099-int
opentax node template w2 --full
opentax node template --list-documents

# List, update or delete form entries
opentax form list --returnId a1b2c3
opentax form update --returnId a1b2c3 --entryId w2_01 '{"box1_wages": 60000, "box2_fed_withheld": 5800}'
opentax form delete --returnId a1b2c3 --entryId w2_01

# Run the IRS MeF business rules offline
opentax return validate --returnId a1b2c3

# Add a PDF filed with the return, under the file name its inputs use
# (--description when the form needs a specific MeF attachment description)
opentax return attach --returnId a1b2c3 --file ./policy.pdf --name 2025-leave-policy.pdf
# Add a retained source copy (kept, not transmitted) under the reference its inputs use
opentax return attach --returnId a1b2c3 --file ./notice.pdf --reference "2023 CTC notice copy"

# Export as MeF XML, a filled IRS PDF, or a Pub 4164 submission ZIP
opentax return export --returnId a1b2c3 --type mef > return.xml
opentax return export --returnId a1b2c3 --type pdf --output return.pdf
opentax return export --returnId a1b2c3 --type mef-submission --efin 123456 --software-id 25000000

# Form 4868 extension (TY2026)
opentax return create --year 2026 --form f4868
```

The submission ZIP (`manifest/`, `xml/`, `attachment/`, named by its Submission
ID) needs the originator EFIN, the IRS-assigned Software ID and a reviewed
residency JSON (default `returns/<id>/residency-review.json`). It includes the
PDFs from the return's `attachments/` folder and the retained copies from
`retained/` that its inputs name; a missing file is reported with the path it
belongs at.

Run `opentax <command> --help` for every flag.

---

## Export, validation and filing

The federal notes below do not enable California export or filing. CA supports
only its unofficial calculation worksheet; its MeF export remains refused.

- `return get` works on partial returns; check its `warnings` before relying on
  amounts. Export also needs the filer's identity (SSN and name).
- `return validate` and export run the IRS MeF business rules offline. A clean
  run is not IRS acceptance. It also lists, as `OPENTAX_HINT` alerts, claims the
  entered facts point to but the return does not make (the same hints
  `return get` puts in `warnings`); they never block filing.
- Export blocks on every calculation diagnostic. `--force` overrides only
  reject-level business rules; `--draft` produces visibly labeled diagnostic
  output (a DRAFT comment in XML, a watermark on each PDF page). In the API,
  `ExportExecutionError` carries calculation diagnostics and
  `ExportRejectedError` carries rule rejects.
- Shell redirection can leave an empty file on failure; check the exit status.
- The CLI does not validate against the IRS XSDs; the harness does when the
  schemas are installed in [`irs/`](./irs/README.md).
- Return storage and calculations are local; explicitly sending through MeF
  transmits the submission to the selected IRS endpoint. Uploading source
  documents to a hosted assistant discloses them to that provider.

### Transmitting with MeF A2A

`opentax mef` implements transmission of TY2025 Form 1040 submission ZIPs over
IRS MeF Application-to-Application (WSDL 10.9), with stored acknowledgements.
It has only been tested against a local mock IRS server, not live IRS ATS or
production. ATS is the default; production needs separate opt-ins. California
workpapers cannot be submitted through this path.

```bash
opentax mef login-check                     # log in and out with the A2A certificate
opentax mef send --returnId a1b2c3          # build the submission ZIP and send it
opentax mef status --submissionId <id>      # IRS status record
opentax mef acks --submissionId <id>        # or --new for every pending ack
opentax mef ats-run                         # send every ATS test return in the store and poll for acks
```

It needs an ETIN, EFIN, Software ID, Application System ID and an IRS-approved
strong-authentication certificate. Setup, commands and the assumptions the
first live run must confirm are in
[docs/mef/transmission.md](./docs/mef/transmission.md).

### MeF readiness

|                      | State                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TY2025 ATS scenarios | 8 of 8 Form 1040 scenarios pass the offline check (`bun run check:ats`): no reject-level findings, packet values matched or documented as packet conflicts |
| TY2025 XML           | Built on the 2025v5.4 schema; validated against `Return1040.xsd` when `irs/` has the schemas                                                               |
| Submission ZIP       | Pub 4164 layout, manifest checked against the submission and transmission rules before it is written                                                       |
| A2A client           | Built and tested against a local mock IRS server; not yet run against the live IRS, which needs the credentials above                                      |
| TY2026               | Form 1040 on the 2026v1.0 schema, which ATS does not accept, for every TY2025 input. Form 4868 on 2026v1.0                                                  |
| TY2026 ATS scenarios | 1 of 9 Form 1040 packets pass the same offline check against 2026v1.0; `check:ats` names the findings and schema gaps that block the rest                  |

None of this is IRS acceptance or authorization of any product.

---

## Staying up to date

Automatic update checks and self-update are intentionally disabled for this
fork (`SELF_UPDATE_ENABLED = false`). The background check does not read or
write its update cache or contact the network. `opentax update` prints the
fork's versioned-release guidance and leaves the executable unchanged.

To update, explicitly choose a reviewed version from
[the fork's releases](https://github.com/bigshort2022/opentax/releases), verify
its checksum, and install that exact version manually, or rebuild from its
reviewed commit. The fork installer accepts the exact tag through
`OPENTAX_VERSION` and defaults to `v2.2.0-ca540.1`. This pinned selection preserves
the California fork and release channel; do not substitute an upstream binary
or a `releases/latest` download. Run `opentax version` after installation to
confirm the executable you selected.

---

## Supported forms

| Form | Year | Scope and limitations |
| --- | --- | --- |
| Federal Form 1040 | 2025 | Registered source-document, schedule, and credit inputs; inspect diagnostics and each feature's coverage. Calculation/export is not IRS acceptance. |
| Federal Form 1040 | 2026 | Reuses the TY2025 input-node catalog with year-aware execution. Known TY2026 calculation/rule/schema blockers remain; input acceptance does not prove TY2026 completeness. MeF uses 2026v1.0; PDF export is unavailable. |
| Federal Form 4868 | 2026 | Separate extension-request product and MeF XML on 2026v1.0; no PDF export or claim of live IRS acceptance. |
| California Form 540 | 2025 | Selected-line full-year-resident calculation workpaper only. Not a complete return; `canFile: false`; unofficial worksheet PDF only; no MeF export or transmission. |

[`catalog.ts`](./catalog.ts) lists the form definitions; `opentax node list` and
`opentax node inspect` show every node and its schema.

---

## How it's built

The engine is a directed graph of **nodes**. Each node is a pure function:
validated input in, typed output out. Schemas are Zod, with types inferred;
routing between nodes is type-checked. Federal TY2025 benchmark cases and
separate California line/workpaper cases
check selected values against cited publications and explicit scope assertions.
These regression checks do not prove full-return correctness or agency acceptance.

AI agents maintain the codebase: they read IRS instructions, write nodes, source
test cases from IRS exercises, fix regressions, and prove each change with the
harness before it ships.

---

## Development

Requires [Bun](https://bun.sh) 1.4.2. Run `bun install --frozen-lockfile` after cloning.

`cli/main.ts` is the product; the harness is dev-only and documented in
[scripts/testing/README.md](./scripts/testing/README.md). Agent instructions are
in [AGENTS.md](./AGENTS.md), and the folder layout and the check that enforces
each rule are in [STRUCTURE.md](./docs/architecture/STRUCTURE.md).

```bash
# Gates a pull request must pass
bun run check:structure   # nodes placed, registered, reachable
bun run check:cases       # benchmark cases fit their node schemas and cite a source
bun run check:oracle      # expected values changed only with a cited ledger entry
bun run check:sandbox     # the binary reaches the network only through restricted fetch
bun run test:unit         # module graph, type check and typed tests
bun run test:forms        # node, MeF, validation and return-processing tests
bun run check:mef         # sample returns gain no new baselined MeF blockers
bun run check:ty2026      # TY2026 sample-return blocker ratchet
bun run check:cli         # sample returns work end to end through the CLI
bun run test:ca540        # explicit CA arithmetic, readiness, CLI and evidence tests
bun run bench --form ca540 --year 2025 --json # exact CA line/workpaper assertions
bun run bench --form f1040 --year 2025   # local federal source-derived regression check

# Reports and helpers
bun run check:irs         # which IRS files in irs/ are present, against irs/manifest.json
bun run check:ats         # TY2025 and TY2026 ATS scenario readiness
bun run verify:changed    # only the gates a change since origin/main can reach
bun run ats:stage         # write the ATS scenarios into ./.state/returns for `opentax mef ats-run`
bun run test              # full suite

# Run the CLI from source, or build the single-file binary
bun run tax return create --year 2025
bun run compile
```

### IRS files

The IRS MeF schemas, business rules and A2A WSDL are released only to registered
software developers, so they are not in Git. Install them into the gitignored
[`irs/`](./irs/README.md) folder; checks that need them skip or report "n/a"
without them, as in CI. `bun run check:irs` verifies each file against
[`irs/manifest.json`](./irs/manifest.json).

### TY2026 research sources

The [TY2026 research corpus](./docs/ty2026/README.md) contains the implementation
plans and the source manifest. The IRS PDFs it cites are not in Git: fetch them
into the gitignored `irs/corpus/ty2026/` with `python3 docs/ty2026/corpus/download.py`
and check them with `bun run check:irs` (see [`irs/README.md`](./irs/README.md)).

### Contributing with Claude Code

Open the repo in [Claude Code](https://claude.ai/code); these skills under `.claude/skills/` run the harness for you:

- `/tax-status`: benchmark pass rate per form:year, MeF readiness of the sample returns and the TY2025 ATS scoreboard.
- `/tax-fix [form:year | mef]`: clusters benchmark (or MeF and ATS) failures by root cause, fixes the engine in parallel, gates each round with `bun run verify:changed`, and commits only net-positive engine fixes; cases are never edited to pass.
- `/tax-cases [form:year] [vita | pub17 | instructions | "scenario"]`: adds benchmark cases whose expected values come from an IRS publication, checked with `check:cases` and `check:oracle`.
- `/tax-build <form-number> [year]`: researches a new form product, sources its cases, builds its nodes and hands off to `/tax-fix`.

Typical workflows:

```
/tax-status                       # where things stand
/tax-fix f1040:2025               # fix benchmark failures

/tax-cases pub17                  # add IRS examples
/tax-fix f1040:2025               # fix what they expose

/tax-fix mef                      # clear MeF and ATS blockers
```

Before a pull request, run the proof list in [AGENTS.md](AGENTS.md).

---

## Contributors

Thanks to everyone who has contributed!

[![Contributors](https://contrib.rocks/image?repo=filedcom/opentax)](https://github.com/filedcom/opentax/graphs/contributors)

---

## License

Dual-licensed under [AGPL v3](./LICENSE) and the [Filed Commercial License](./LICENSE.commercial).
For commercial licensing inquiries: otta@filed.com
