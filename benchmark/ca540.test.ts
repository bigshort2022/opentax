import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import {
  caExpectedSchema,
  caInputSchema,
  compareCaExpected,
  inspectCaInventory,
  loadCaCase,
  runCaCase,
  validateCaSources,
} from "./ca540.ts";
import { inspectBenchmarkCases } from "./harness.ts";
import type { CaExpected } from "./ca540.ts";
import {
  CaAuthorityKind,
  CaCaseKind,
  CaDiagnosticSeverity,
  CaEvidenceProvenance,
  caLedgerSchema,
  caScenarioSchema,
} from "./ca540.ts";

const root = join(
  dirname(fromFileUrl(import.meta.url)),
  "cases",
  "ca540",
  "2025",
);
const vector = {
  product: "ca540",
  year: 2025,
  kind: CaCaseKind.Line31,
  taxableIncome: 68494,
  filingStatus: "single",
};
Deno.test("CA kinds reject wrong product/year/fields and never default a missing expected line to zero", () => {
  for (
    const patch of [{ product: "f1040" }, { year: 2024 }, { invented: 1 }, {
      taxableIncome: undefined,
    }]
  ) {
    assertEquals(
      caInputSchema.safeParse({ ...vector, ...patch }).success,
      false,
    );
  }
  assertEquals(caInputSchema.safeParse(vector).success, true);
  assertEquals(
    caExpectedSchema.safeParse({ kind: CaCaseKind.Line31, lines: {} }).success,
    false,
  );
  assertEquals(
    caExpectedSchema.safeParse({
      kind: CaCaseKind.Line31,
      lines: { line31_tax: 0 },
    }).success,
    true,
  );
  assertThrows(
    () =>
      caInputSchema.parse({
        product: "ca540",
        year: 2025,
        kind: CaCaseKind.CompleteReturn,
      }),
    Error,
    "unsupported",
  );
  assertEquals(
    compareCaExpected({ kind: CaCaseKind.Line31, lines: { line31_tax: 0 } }, {
      lines: {},
    }).length,
    1,
  );
  assertEquals(
    compareCaExpected(
      { kind: CaCaseKind.Line31, lines: { line31_tax: 2864 } },
      { lines: { line31_tax: 2863 } },
    ).length,
    1,
  );
});
Deno.test("CA requires independent nonblank FTB citations and honest policy authority", () => {
  for (
    const source of [undefined, {}, { official: [] }, { official: [""] }, {
      official: ["engine output.json"],
    }]
  ) {
    assertThrows(() => validateCaSources(source));
  }
  validateCaSources({
    official: [
      "FTB 2025 California Tax Table https://www.ftb.ca.gov/forms/2025/2025-540-taxtable.pdf",
    ],
  });
});
Deno.test("canonical CA inventory rejects source absence, unknown fields, missing documents and empty inventory", async () => {
  const temp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(temp, "ca540"), { recursive: true });
    await Deno.copyFile(
      join(root, "scenarios.json"),
      join(temp, "ca540", "scenarios.json"),
    );
    await Deno.copyFile(
      join(root, "ledger.json"),
      join(temp, "ca540", "ledger.json"),
    );
    await assertRejects(() => inspectCaInventory(join(temp, "ca540")));
    const directory = join(temp, "ca540", "workpaper-baseline");
    await Deno.mkdir(directory);
    for (const file of ["input.json", "correct.json", "sources.json"]) {
      await Deno.copyFile(
        join(root, "workpaper-baseline", file),
        join(directory, file),
      );
    }
    const expected = JSON.parse(
      await Deno.readTextFile(join(directory, "correct.json")),
    );
    const missing = structuredClone(expected);
    delete missing.documents;
    assertEquals(caExpectedSchema.safeParse(missing).success, false);
    const input = JSON.parse(
      await Deno.readTextFile(join(directory, "input.json")),
    );
    input.forms[0].data.invented = 1;
    await Deno.writeTextFile(
      join(directory, "input.json"),
      JSON.stringify(input),
    );
    await assertRejects(() => loadCaCase(directory));
    await Deno.copyFile(
      join(root, "workpaper-baseline", "input.json"),
      join(directory, "input.json"),
    );
    await Deno.remove(join(directory, "sources.json"));
    await assertRejects(() => loadCaCase(directory));
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
});
Deno.test("real canonical CA cases route through the product and enforce exact typed outcomes", async () => {
  const inventory = await inspectCaInventory(root);
  assertEquals(inventory.length, 4);
  for (const directory of inventory) {
    const result = await runCaCase(directory);
    assertEquals(result.errors, [], result.name);
    assertEquals(result.ok, true, result.name);
  }
  const inspection = await inspectBenchmarkCases(root);
  assertEquals(inspection.problems, []);
  assertEquals(inspection.found.length, 4);
});
Deno.test("CA typed comparisons enforce document, diagnostic and gate sets without positional ordering", async () => {
  const { expected } = await loadCaCase(join(root, "workpaper-baseline"));
  if (expected.kind !== CaCaseKind.Workpaper) {
    throw new Error("workpaper required");
  }
  const actual = structuredClone(expected);
  assertEquals(compareCaExpected(expected, actual), []);
  actual.documents.produced.push("unexpected-schedule");
  assertEquals(compareCaExpected(expected, actual).length, 1);
  actual.documents.produced = [];
  actual.diagnosticCodes.reverse();
  assertEquals(compareCaExpected(expected, actual), []);
  actual.readiness.canFile = true as false;
  assertEquals(compareCaExpected(expected, actual).length, 1);
});

Deno.test("CA case check refuses numeric edits, typed weakening, source changes and scenario deletion without reviewed ledger", async () => {
  const temp = await Deno.makeTempDir();
  try {
    for (const file of ["scenarios.json", "ledger.json"]) {
      await Deno.copyFile(join(root, file), join(temp, file));
    }
    for (
      const id of [
        "single-tax-table-68494",
        "single-rate-schedule-150000",
        "workpaper-baseline",
        "mixed-exemption-regression",
      ]
    ) {
      await Deno.mkdir(join(temp, id));
      for (const file of ["input.json", "correct.json", "sources.json"]) {
        await Deno.copyFile(join(root, id, file), join(temp, id, file));
      }
    }
    const path = join(temp, "workpaper-baseline", "correct.json");
    const text = await Deno.readTextFile(path);
    for (
      const mutate of [
        (value: Extract<CaExpected, { kind: CaCaseKind.Workpaper }>) =>
          value.lines.line31_tax--,
        (value: Extract<CaExpected, { kind: CaCaseKind.Workpaper }>) =>
          value.diagnosticCodes.pop(),
        (value: Extract<CaExpected, { kind: CaCaseKind.Workpaper }>) =>
          value.documents.required.push("Schedule CA (540)"),
        (value: Extract<CaExpected, { kind: CaCaseKind.Workpaper }>) =>
          Reflect.deleteProperty(value.gates, "mef_schema"),
        (value: Extract<CaExpected, { kind: CaCaseKind.Workpaper }>) =>
          value.diagnostics.CA540_SCOPE_NOT_FILING_READY.severity =
            CaDiagnosticSeverity.Alert,
      ]
    ) {
      const value = JSON.parse(text);
      mutate(value);
      await Deno.writeTextFile(path, JSON.stringify(value));
      await assertRejects(() => inspectCaInventory(temp));
    }
    await Deno.writeTextFile(path, text);
    const sourcePath = join(temp, "workpaper-baseline", "sources.json");
    const source = JSON.parse(await Deno.readTextFile(sourcePath));
    source.official.pop();
    await Deno.writeTextFile(sourcePath, JSON.stringify(source));
    await assertRejects(() => inspectCaInventory(temp));
    await Deno.copyFile(
      join(root, "workpaper-baseline", "sources.json"),
      sourcePath,
    );
    const manifest = JSON.parse(
      await Deno.readTextFile(join(temp, "scenarios.json")),
    );
    manifest.cases[0].requirements = [];
    await Deno.writeTextFile(
      join(temp, "scenarios.json"),
      JSON.stringify(manifest),
    );
    await assertRejects(() => inspectCaInventory(temp));
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
});

Deno.test("CA comparison catches a missing required schedule instead of accepting the documents container", async () => {
  const { expected } = await loadCaCase(join(root, "workpaper-baseline"));
  if (expected.kind !== CaCaseKind.Workpaper) {
    throw new Error("workpaper required");
  }
  const syntheticExpectation = structuredClone(expected);
  syntheticExpectation.documents.required = ["Schedule CA (540)"];
  syntheticExpectation.documents.produced = ["Schedule CA (540)"];
  const actual = structuredClone(syntheticExpectation);
  actual.documents.produced = [];
  assertEquals(compareCaExpected(syntheticExpectation, actual).length, 1);
});

Deno.test("CA ledger assertion paths and values are typed and approvedBy cannot self-approve evidence", () => {
  const entry = {
    case: "mixed-exemption-regression",
    path: "correct.json.lines.line32_exemption_credits",
    after: 295,
    authority: {
      kind: CaAuthorityKind.Official,
      citation:
        "FTB 2025 line32 worksheet https://www.ftb.ca.gov/forms/2025/2025-540-booklet.html",
    },
    reviewer: "source-derived manual arithmetic reviewer; not human approval",
    on: "2026-10-16",
    provenance: CaEvidenceProvenance.ReviewedChange,
  };
  assertEquals(caLedgerSchema.safeParse([entry]).success, true);
  assertEquals(
    caLedgerSchema.safeParse([{ ...entry, after: "295" }]).success,
    false,
  );
  assertEquals(
    caLedgerSchema.safeParse([{ ...entry, path: "correct.json.invented" }])
      .success,
    false,
  );
  assertEquals(
    caLedgerSchema.safeParse([{ ...entry, approvedBy: "user" }]).success,
    false,
  );
  assertEquals(
    caLedgerSchema.safeParse([{
      ...entry,
      provenance: "user_supplied_acceptance",
    }]).success,
    false,
  );
  assertEquals(
    caLedgerSchema.safeParse([{
      ...entry,
      provenance: CaEvidenceProvenance.SourceDerivedWorksheet,
    }]).success,
    true,
  );
});

Deno.test("CA benchmark JSON is a single machine-readable result with all canonical cases counted", async () => {
  const output = await new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-run=pdftotext",
      fromFileUrl(new URL("./run_benchmark.ts", import.meta.url)),
      "--form",
      "ca540",
      "--year",
      "2025",
      "--json",
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(output.code, 0, new TextDecoder().decode(output.stderr));
  const report = JSON.parse(new TextDecoder().decode(output.stdout));
  assertEquals(report.product, "ca540");
  assertEquals(report.total, 4);
  assertEquals(report.pass, 4);
  assertEquals(report.fail, 0);
  assertEquals(report.skipped, 0);
  assertEquals(report.results.length, 4);
});

Deno.test("CA workpaper comparisons reject a wrong reported product year", async () => {
  const { expected } = await loadCaCase(join(root, "workpaper-baseline"));
  if (expected.kind !== CaCaseKind.Workpaper) {
    throw new Error("workpaper required");
  }
  const actual = structuredClone(expected);
  Reflect.set(actual.product, "taxYear", 2024);
  assertEquals(compareCaExpected(expected, actual).length, 1);
});

Deno.test("CA scenario requirement sets remain nonempty and unique with typed case IDs", () => {
  const scenario = {
    id: "table",
    kind: CaCaseKind.Line31,
    requirements: ["ca540.line31.ordinary_tax"],
  };
  const manifest = { product: "ca540", year: 2025, cases: [scenario] };
  const parsed = caScenarioSchema.parse(manifest);
  const id: string = parsed.cases[0].id;
  assertEquals(id, "table");
  assertEquals(
    caScenarioSchema.safeParse({
      ...manifest,
      cases: [{ ...scenario, requirements: [] }],
    }).success,
    false,
  );
  assertEquals(
    caScenarioSchema.safeParse({
      ...manifest,
      cases: [{ ...scenario, requirements: ["tax", "tax"] }],
    }).success,
    false,
  );
  assertEquals(
    caScenarioSchema.safeParse({ ...manifest, cases: [scenario, scenario] })
      .success,
    false,
  );
});

Deno.test("CA coverage assertions reject missing and changed requirement assessments", async () => {
  const { expected } = await loadCaCase(join(root, "workpaper-baseline"));
  if (expected.kind !== CaCaseKind.Workpaper) {
    throw new Error("workpaper required");
  }
  const id = "ca540.line32.exemption_credits";
  const missing = structuredClone(expected);
  Reflect.deleteProperty(missing.coverage, id);
  assertEquals(compareCaExpected(expected, missing).length, 1);
  const changed = structuredClone(expected);
  Reflect.set(changed.coverage[id], "capability", "unsupported");
  assertEquals(compareCaExpected(expected, changed).length, 1);
  const weakened = structuredClone(expected);
  Reflect.deleteProperty(weakened.coverage, id);
  assertEquals(compareCaExpected(weakened, expected).length, 1);
});

Deno.test("CA workpaper expectations reuse readiness coherence and never authorize filing", async () => {
  const { expected } = await loadCaCase(join(root, "workpaper-baseline"));
  if (expected.kind !== CaCaseKind.Workpaper) {
    throw new Error("workpaper required");
  }
  const inconsistent = structuredClone(expected);
  Reflect.set(inconsistent.readiness, "status", "ready");
  assertEquals(caExpectedSchema.safeParse(inconsistent).success, false);
  Reflect.set(inconsistent.readiness, "canFile", true);
  assertEquals(caExpectedSchema.safeParse(inconsistent).success, false);
});
