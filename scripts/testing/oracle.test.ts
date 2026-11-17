import { test } from "bun:test";
import * as fs from "node:fs/promises";
import * as sys from "../support/sys.ts";
import { assert, assertEquals } from "@std/assert";
import { join } from "node:path";
import {
  caseChanges,
  caseKey,
  type Ledger,
  ledgerProblems,
  oracleReport,
} from "./oracle.ts";
import {
  CaAuthorityKind,
  CaCaseKind,
  CaEvidenceProvenance,
} from "../../benchmark/ca540.ts";

const product = "f1040/2025";
const name = "124-mfj-1099r-rrb1099-interest";
const expected = (agi: number) => ({
  source: "IRS Pub 17 TY2025 Ch. 7 Example 3, p. 64",
  correct: {
    line11_agi: agi,
    line24_total_tax: 0,
    line35a_refund: 0,
    line37_amount_owed: 0,
  },
});
const entry = (source: string): Ledger[number] => ({
  case: name,
  line: "line11_agi",
  before: 31000,
  after: 31500,
  source,
  approvedBy: "a7ul",
  on: "2026-10-16",
});

test("a case is identified by its product and directory", () => {
  assertEquals(
    caseKey("benchmark/cases/f1040/2025/01-single/correct.json"),
    { product: "f1040/2025", case: "01-single" },
  );
  assertEquals(
    caseKey("benchmark/cases/f1040/2025/01-single/input.json"),
    undefined,
  );
  assertEquals(caseKey("benchmark/reference/2025/x.json"), undefined);
});

test("changes are the scored lines that differ, plus added and removed cases", () => {
  assertEquals(
    caseChanges(product, name, expected(31000), expected(31000)),
    [],
  );
  assertEquals(caseChanges(product, name, expected(31000), expected(31500)), [{
    kind: "value",
    product,
    case: name,
    line: "line11_agi",
    before: 31000,
    after: 31500,
  }]);
  assertEquals(caseChanges(product, name, undefined, expected(1)), [{
    kind: "added",
    product,
    case: name,
    cited: true,
  }]);
  assertEquals(
    caseChanges(product, name, undefined, { correct: expected(1).correct }),
    [{ kind: "added", product, case: name, cited: false }],
  );
  assertEquals(caseChanges(product, name, expected(1), undefined), [{
    kind: "removed",
    product,
    case: name,
  }]);
});

test("an expected value changed to what the engine computes is refused unless a publication is cited", () => {
  const change = caseChanges(product, name, expected(31000), expected(31500));
  const uncited = ledgerProblems(change, new Map());
  assertEquals(uncited.map((p) => [p.kind, p.line]), [[
    "uncited-change",
    "line11_agi",
  ]]);
  assert(uncited[0].fix.includes("benchmark/cases/f1040/2025/ledger.json"));
  assertEquals(
    ledgerProblems(
      change,
      new Map([[product, [entry("engine-computed SSA taxability")]]]),
    ).map((p) => p.kind),
    ["engine-source"],
  );
  assertEquals(
    ledgerProblems(
      change,
      new Map([[product, [entry("IRS Pub 915 worksheet 1, p. 16")]]]),
    ),
    [],
  );
  assertEquals(
    ledgerProblems(
      change,
      new Map([[product, [{ ...entry("IRS Pub 915"), after: 31400 }]]]),
    ).map((p) => p.kind),
    ["uncited-change"],
  );
});

test("a new case needs a source and a removed case needs a ledger entry", () => {
  assertEquals(
    ledgerProblems(
      [{ kind: "added", product, case: name, cited: false }],
      new Map(),
    )
      .map((p) => p.kind),
    ["missing-source"],
  );
  assertEquals(
    ledgerProblems(
      [{ kind: "added", product, case: name, cited: true }],
      new Map(),
    ),
    [],
  );
  const removed = [{ kind: "removed" as const, product, case: name }];
  assertEquals(ledgerProblems(removed, new Map()).map((p) => p.kind), [
    "uncited-removal",
  ]);
  assertEquals(
    ledgerProblems(
      removed,
      new Map([[product, [{
        case: name,
        source: "Duplicate of Pub 17 Example 2",
        approvedBy: "a7ul",
        on: "2026-10-16",
      }]]]),
    ),
    [],
  );
});

async function run(root: string, args: string[]) {
  const result = await new sys.Command("git", { args, cwd: root }).output();
  assert(result.success, args.join(" "));
}

test("against a git base, an uncommitted edit to an expected value is caught until the ledger cites it", async () => {
  const root = await sys.makeTempDir();
  const dir = join(root, "benchmark/cases", product, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, "input.json"), "{}");
  await fs.writeFile(
    join(dir, "correct.json"),
    JSON.stringify(expected(31000)),
  );
  await run(root, ["init", "-q"]);
  await run(root, ["-c", "user.email=t@t", "-c", "user.name=t", "add", "."]);
  await run(root, [
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "commit",
    "-q",
    "-m",
    "case",
  ]);
  assertEquals((await oracleReport(root, "HEAD")).problems, []);

  await fs.writeFile(
    join(dir, "correct.json"),
    JSON.stringify(expected(31500)),
  );
  const caught = await oracleReport(root, "HEAD");
  assertEquals(caught.changes.length, 1);
  assertEquals(caught.problems.map((p) => p.kind), ["uncited-change"]);

  await fs.writeFile(
    join(root, "benchmark/cases", product, "ledger.json"),
    JSON.stringify([entry("IRS Pub 915 worksheet 1, p. 16")]),
  );
  assertEquals((await oracleReport(root, "HEAD")).problems, []);
});

test("CA typed outcome and evidence deletions need reviewed typed ledger evidence", () => {
  const before = { kind: CaCaseKind.Line31, lines: { line31_tax: 2864 } };
  const after = { kind: CaCaseKind.Line31, lines: { line31_tax: 2863 } };
  const changes = caseChanges("ca540/2025", "table", before, after);
  assertEquals(changes.length, 1);
  assertEquals(ledgerProblems(changes, new Map()).length, 1);
  for (
    const [was, now] of [
      [{ readiness: { status: "blocked" } }, {
        readiness: { status: "ready" },
      }],
      [{ diagnosticCodes: ["SCOPE"] }, { diagnosticCodes: [] }],
      [{ documents: { required: ["schedule-ca"] } }, {
        documents: { required: [] },
      }],
      [{ gates: { mef_schema: "unavailable" } }, { gates: {} }],
      [{ official: ["FTB tax table"] }, { official: [] }],
      [{ cases: [{ id: "baseline", requirements: [CaCaseKind.Line31] }] }, {
        cases: [],
      }],
    ]
  ) {
    assertEquals(
      ledgerProblems(caseChanges("ca540/2025", "evidence", was, now), new Map())
        .length > 0,
      true,
    );
  }
});

test("CA evidence rejects self-approval and policy-only numeric authority", () => {
  const changes = caseChanges("ca540/2025", "mixed", {
    lines: { line32_exemption_credits: 268 },
  }, { lines: { line32_exemption_credits: 295 } });
  const common = {
    case: "mixed",
    path: "lines.line32_exemption_credits",
    before: 268,
    after: 295,
    reviewer:
      "implementation agent; source-derived arithmetic, no human approval claimed",
    on: "2026-10-16",
    provenance: CaEvidenceProvenance.ReviewedChange as const,
  };
  assertEquals(
    ledgerProblems(
      changes,
      new Map([["ca540/2025", [{
        ...common,
        authority: {
          kind: CaAuthorityKind.ProjectPolicy as const,
          citation: "OpenTax workpaper plan",
        },
      }]]]),
    ).length,
    1,
  );
  assertEquals(
    ledgerProblems(
      changes,
      new Map([["ca540/2025", [{
        ...common,
        authority: {
          kind: CaAuthorityKind.Official as const,
          citation:
            "FTB 2025 Form 540 line32 AGI limitation worksheet https://www.ftb.ca.gov/forms/2025/2025-540-booklet.html",
        },
      }]]]),
    ).length,
    0,
  );
  assertEquals(
    ledgerProblems(
      caseChanges("ca540/2025", "baseline", {
        diagnostics: { scope: { severity: "reject" } },
      }, { diagnostics: { scope: { severity: "alert" } } }),
      new Map(),
    ).length,
    1,
  );
});

test("isolated CA oracle covers source and manifest weakening and an entirely removed inventory", async () => {
  const root = await sys.makeTempDir();
  const target = join(root, "benchmark/cases/ca540/2025");
  const source = new URL("../../benchmark/cases/ca540/2025/", import.meta.url);
  try {
    await fs.mkdir(target, { recursive: true });
    for (const file of ["scenarios.json", "ledger.json"]) {
      await fs.copyFile(new URL(file, source), join(target, file));
    }
    for (
      const id of [
        "single-tax-table-68494",
        "single-rate-schedule-150000",
        "workpaper-baseline",
        "mixed-exemption-regression",
      ]
    ) {
      await fs.mkdir(join(target, id));
      for (const file of ["input.json", "correct.json", "sources.json"]) {
        await fs.copyFile(
          new URL(`${id}/${file}`, source),
          join(target, id, file),
        );
      }
    }
    await run(root, ["init", "-q"]);
    await run(root, ["add", "."]);
    await run(root, [
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "user.name=synthetic-oracle-test",
      "commit",
      "-q",
      "-m",
      "synthetic CA baseline",
    ]);
    assertEquals(
      (await oracleReport(root, "HEAD", { requireCaInventory: true })).problems,
      [],
    );
    const sources = join(target, "workpaper-baseline/sources.json");
    const oldSources = await fs.readFile(sources, "utf8");
    const altered = JSON.parse(oldSources);
    altered.official.pop();
    await fs.writeFile(sources, JSON.stringify(altered));
    assert(
      (await oracleReport(root, "HEAD")).problems.some((problem) =>
        problem.line?.startsWith("sources.json")
      ),
    );
    await fs.writeFile(sources, oldSources);
    const manifest = JSON.parse(
      await fs.readFile(join(target, "scenarios.json"), "utf8"),
    );
    manifest.cases[0].requirements.pop();
    await fs.writeFile(
      join(target, "scenarios.json"),
      JSON.stringify(manifest),
    );
    assert(
      (await oracleReport(root, "HEAD")).problems.some((problem) =>
        problem.case === "@manifest"
      ),
    );
    await sys.remove(target, { recursive: true });
    assert((await oracleReport(root, "HEAD")).problems.length > 0);
  } finally {
    await sys.remove(root, { recursive: true });
  }
});

test("CA project gate, readiness, diagnostics and coverage policy cannot cite FTB as policy authority", () => {
  for (
    const [path, before, after] of [
      ["gates.scope", "unsupported", "passed"],
      ["readiness.status", "blocked", "ready"],
      ["diagnostics.CA540_SCOPE_NOT_FILING_READY.severity", "reject", "alert"],
    ] as const
  ) {
    const change = {
      kind: "assertion" as const,
      product: "ca540/2025",
      case: "baseline",
      path: `correct.json.${path}`,
      before,
      after,
    };
    const entry = {
      case: "baseline",
      path: change.path,
      before,
      after,
      reviewer: "implementation-agent policy review; no human signoff",
      on: "2026-10-16",
      provenance: CaEvidenceProvenance.ReviewedChange as const,
    };
    const official = {
      ...entry,
      authority: {
        kind: CaAuthorityKind.Official as const,
        citation:
          "FTB 2025 tax table https://www.ftb.ca.gov/forms/2025/2025-540-taxtable.pdf",
      },
    };
    assertEquals(
      ledgerProblems([change], new Map([["ca540/2025", [official]]])).length,
      1,
    );
    const policy = {
      ...entry,
      authority: {
        kind: CaAuthorityKind.ProjectPolicy as const,
        citation: "OpenTax CA540 bounded workpaper readiness policy",
      },
    };
    assertEquals(
      ledgerProblems([change], new Map([["ca540/2025", [policy]]])).length,
      0,
    );
  }
});

test("CA migration compares against legacy vector amounts instead of treating them as uncited new values", async () => {
  const root = await sys.makeTempDir();
  try {
    const legacy = join(root, "benchmark/ca540/2025");
    await fs.mkdir(legacy, { recursive: true });
    const source =
      "FTB 2025 tax table https://www.ftb.ca.gov/forms/2025/2025-540-taxtable.pdf";
    await fs.writeFile(
      join(legacy, "cases.json"),
      JSON.stringify([{
        name: "single-tax-table-68494",
        taxableIncome: 68494,
        filingStatus: "single",
        expectedLine31: 2864,
        source,
      }]),
    );
    await run(root, ["init", "-q"]);
    await run(root, ["add", "."]);
    await run(root, [
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "user.name=synthetic-oracle-test",
      "commit",
      "-q",
      "-m",
      "premigration CA vector",
    ]);
    const canonical = join(
      root,
      "benchmark/cases/ca540/2025/single-tax-table-68494",
    );
    await fs.mkdir(canonical, { recursive: true });
    await fs.writeFile(
      join(canonical, "input.json"),
      JSON.stringify({
        product: "ca540",
        year: 2025,
        kind: CaCaseKind.Line31,
        taxableIncome: 68494,
        filingStatus: "single",
      }),
    );
    await fs.writeFile(
      join(canonical, "correct.json"),
      JSON.stringify({ kind: CaCaseKind.Line31, lines: { line31_tax: 2864 } }),
    );
    await fs.writeFile(
      join(canonical, "sources.json"),
      JSON.stringify({ official: [source] }),
    );
    const retained = await oracleReport(root, "HEAD");
    assertEquals(retained.changes, []);
    await fs.writeFile(
      join(canonical, "correct.json"),
      JSON.stringify({ kind: CaCaseKind.Line31, lines: { line31_tax: 2865 } }),
    );
    const altered = await oracleReport(root, "HEAD");
    assert(
      altered.changes.some((change) =>
        change.kind === "assertion" &&
        change.path === "correct.json.lines.line31_tax" &&
        change.before === 2864 && change.after === 2865
      ),
    );
    assert(
      altered.problems.some((problem) =>
        problem.line === "correct.json.lines.line31_tax"
      ),
    );
    await fs.writeFile(
      join(root, "benchmark/cases/ca540/2025/ledger.json"),
      JSON.stringify([{
        case: "single-tax-table-68494",
        path: "correct.json.lines.line31_tax",
        before: 2864,
        after: 2865,
        authority: { kind: CaAuthorityKind.Official, citation: source },
        reviewer: "synthetic migration attack; not human approval",
        on: "2026-10-16",
        provenance: CaEvidenceProvenance.MigratedExistingOracle,
      }]),
    );
    assert(
      (await oracleReport(root, "HEAD")).problems.some((problem) =>
        problem.line === "correct.json.lines.line31_tax"
      ),
    );
    await fs.writeFile(
      join(canonical, "correct.json"),
      JSON.stringify({ kind: CaCaseKind.Line31, lines: { line31_tax: 2864 } }),
    );
    await fs.writeFile(
      join(canonical, "sources.json"),
      JSON.stringify({ official: [source + " altered citation"] }),
    );
    assert(
      (await oracleReport(root, "HEAD")).changes.some((change) =>
        change.kind === "assertion" && change.path === "sources.json.official"
      ),
    );
  } finally {
    await sys.remove(root, { recursive: true });
  }
});

test("CA coverage policy and technical source assertions require their respective authority owners", async () => {
  const fixture = JSON.parse(
    await fs.readFile(
      new URL(
        "../../benchmark/cases/ca540/2025/workpaper-baseline/correct.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const { source, ...policy } =
    fixture.coverage["ca540.line32.exemption_credits"];
  const path = "correct.json.coverage.ca540.line32.exemption_credits.policy";
  const after = { ...policy, capability: "unsupported" };
  const change = {
    kind: "assertion" as const,
    product: "ca540/2025",
    case: "baseline",
    path,
    before: policy,
    after,
  };
  const entry = {
    case: "baseline",
    path,
    before: policy,
    after,
    reviewer: "implementation-agent policy review; no human signoff",
    on: "2026-10-16",
    provenance: CaEvidenceProvenance.ReviewedChange,
  };
  const official = {
    kind: CaAuthorityKind.Official,
    citation: `FTB source ${source.url}`,
  };
  const project = {
    kind: CaAuthorityKind.ProjectPolicy,
    citation: "OpenTax CA540 coverage capability and applicability policy",
  };
  assertEquals(
    ledgerProblems(
      [change],
      new Map([["ca540/2025", [{ ...entry, authority: official }]]]),
    ).length,
    1,
  );
  assertEquals(
    ledgerProblems(
      [change],
      new Map([["ca540/2025", [{ ...entry, authority: project }]]]),
    ).length,
    0,
  );
  const sourcePath =
    "correct.json.coverage.ca540.line32.exemption_credits.source";
  const sourceAfter = {
    ...source,
    locator: `${source.locator}; corrected source locator`,
  };
  const sourceChange = {
    ...change,
    path: sourcePath,
    before: source,
    after: sourceAfter,
  };
  const sourceEntry = {
    ...entry,
    path: sourcePath,
    before: source,
    after: sourceAfter,
  };
  assertEquals(
    ledgerProblems(
      [sourceChange],
      new Map([["ca540/2025", [{ ...sourceEntry, authority: project }]]]),
    ).length,
    1,
  );
  assertEquals(
    ledgerProblems(
      [sourceChange],
      new Map([["ca540/2025", [{ ...sourceEntry, authority: official }]]]),
    ).length,
    0,
  );
});
