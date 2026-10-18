import * as fs from "node:fs/promises";
import * as sys from "../scripts/support/sys.ts";
import { basename, join } from "node:path";
import { z } from "zod";
import { productCatalog } from "../catalog.ts";
import { isStateFormDefinition } from "../core/types/form-definition.ts";
import { calculateOrdinaryTax } from "../forms/ca540/2025/tax.ts";
import { form540InputSchema } from "../forms/ca540/2025/input.ts";
import {
  createReturnCommand,
  getReturnCommand,
} from "../cli/commands/return.ts";
import { formAddCommand } from "../cli/commands/form.ts";
import { validateReturnCommand } from "../cli/commands/validate.ts";
import { exportMefCommand, exportPdfCommand } from "../cli/commands/export.ts";
import {
  GateId,
  GateStatus,
  readinessResultSchema,
} from "../core/validation/readiness.ts";
import { ExternalCheckStatus } from "../core/validation/state-report.ts";
import { coverageAssessmentSchema } from "../core/validation/coverage.ts";
import { predicateIdSchema } from "../forms/ca540/2025/coverage.ts";

export enum CaCaseKind {
  Line31 = "line31",
  Workpaper = "workpaper",
  CompleteReturn = "complete_return",
}
export enum CaAuthorityKind {
  Official = "official",
  ProjectPolicy = "project_policy",
}
export enum CaEvidenceProvenance {
  MigratedExistingOracle = "migrated_existing_oracle",
  SourceDerivedWorksheet = "source_derived_worksheet",
  ReviewedChange = "reviewed_change",
}
export enum CaDiagnosticSeverity {
  Reject = "reject",
  RejectAndStop = "reject_and_stop",
  Alert = "alert",
}
const supportedKind = z.nativeEnum(CaCaseKind).refine(
  (kind): kind is CaCaseKind.Line31 | CaCaseKind.Workpaper =>
    kind !== CaCaseKind.CompleteReturn,
  "CA complete_return benchmark is unsupported in this milestone",
);
const coveragePolicySchema = coverageAssessmentSchema.unwrap().innerType()
  .omit({ source: true }).extend({ predicateId: predicateIdSchema });
const coverageProjectionSchema = z.record(coverageAssessmentSchema).superRefine(
  (rows, context) => {
    if (Object.keys(rows).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CA coverage inventory cannot be empty",
      });
    }
    for (const [id, row] of Object.entries(rows)) {
      if (
        id !== row.id || !predicateIdSchema.safeParse(row.predicateId).success
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [id],
          message:
            "Coverage key or predicate does not match its requirement assessment",
        });
      }
    }
  },
);

const dollars = z.number().int().safe();
const nonblank = z.string().trim().min(1);
const stringSet = z.array(nonblank).refine(
  (items) => new Set(items).size === items.length,
  "duplicate set member",
);
const requirementIds = z.array(nonblank).min(1).refine(
  (items) => new Set(items).size === items.length,
  "duplicate requirement ID",
);
const product = { product: z.literal("ca540"), year: z.literal(2025) };
const line31Input = z.object({
  ...product,
  kind: z.literal(CaCaseKind.Line31),
  taxableIncome: dollars.nonnegative(),
  filingStatus: form540InputSchema.shape.filingStatus,
}).strict();
const workpaperInput = z.object({
  ...product,
  kind: z.literal(CaCaseKind.Workpaper),
  scenario: nonblank,
  forms: z.tuple([
    z.object({ node_type: z.literal("ca540"), data: form540InputSchema })
      .strict(),
  ]),
}).strict();
export const caInputSchema = z.preprocess((raw) => {
  if (
    raw !== null && typeof raw === "object" && "kind" in raw &&
    raw.kind === CaCaseKind.CompleteReturn
  ) {
    throw new Error(
      "CA complete_return benchmark is unsupported in this milestone",
    );
  }
  return raw;
}, z.union([line31Input, workpaperInput]));
export type CaInput = z.infer<typeof caInputSchema>;
const gateStatus = z.nativeEnum(GateStatus);
export const caGateSchema = z.object({
  scope: gateStatus,
  inputs: gateStatus,
  calculation: gateStatus,
  review: gateStatus,
  required_documents: gateStatus,
  mef_schema: gateStatus,
  local_rules: gateStatus,
}).strict();
const line31Expected = z.object({
  kind: z.literal(CaCaseKind.Line31),
  lines: z.object({ line31_tax: dollars }).strict(),
}).strict();
const diagnosticDisposition = z.object({
  severity: z.nativeEnum(CaDiagnosticSeverity),
  category: nonblank,
  formRef: nonblank,
}).strict();
const workpaperExpected = z.object({
  kind: z.literal(CaCaseKind.Workpaper),
  product: z.object({ formType: z.literal("ca540"), taxYear: z.literal(2025) })
    .strict(),
  lines: z.object({
    line19_taxable_income: dollars,
    line31_tax: dollars,
    line32_exemption_credits: dollars,
    line64_total_tax: dollars,
    line97_overpaid_tax: dollars,
    line100_tax_due: dollars,
  }).strict(),
  validationScope: z.literal("ca540-workpaper"),
  profile: z.literal("workpaper"),
  diagnosticCodes: stringSet,
  diagnostics: z.record(diagnosticDisposition),
  coverage: coverageProjectionSchema,
  canFile: z.literal(false),
  readiness: readinessResultSchema.refine(
    (result) => !result.canFile,
    "CA workpaper cannot authorize filing",
  ).refine(
    (result) =>
      new Set(result.missingGateIds).size === result.missingGateIds.length,
    "duplicate missing gate ID",
  ),
  gates: caGateSchema,
  documents: z.object({
    requirementsKnown: z.boolean(),
    required: stringSet,
    produced: stringSet,
  }).strict(),
  externalChecks: z.object({
    ftb_records: z.literal(ExternalCheckStatus.Unverified),
    provider_approval: z.literal(ExternalCheckStatus.Unverified),
    transmission_acceptance: z.literal(ExternalCheckStatus.Unverified),
  }).strict(),
}).strict();
export const caExpectedSchema = z.discriminatedUnion("kind", [
  line31Expected,
  workpaperExpected,
]);
export type CaExpected = z.infer<typeof caExpectedSchema>;
const CA_ENGINE_SOURCE =
  /\b(engine|output\.json|gen_correct|tax2025\.ts|reference calculator)\b/i;
export const caSourcesSchema = z.object({
  official: z.array(
    nonblank.refine(
      (value) =>
        /https:\/\/www\.ftb\.ca\.gov\/forms\/2025\//.test(value) &&
        !CA_ENGINE_SOURCE.test(value),
      "independent TY2025 FTB citation required",
    ),
  ).min(1),
  policy: nonblank.refine(
    (value) => !CA_ENGINE_SOURCE.test(value),
    "policy must not cite engine output",
  ).optional(),
  provenance: nonblank.optional(),
}).strict();
export function validateCaSources(raw: unknown): void {
  caSourcesSchema.parse(raw);
}
export const caScenarioSchema = z.object({
  product: z.literal("ca540"),
  year: z.literal(2025),
  cases: z.array(
    z.object({
      id: nonblank,
      kind: supportedKind,
      requirements: requirementIds,
    }).strict(),
  ).min(1),
}).strict().superRefine((value, context) => {
  if (new Set(value.cases.map((item) => item.id)).size !== value.cases.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "duplicate case ID",
    });
  }
});
export const caLedgerSchema = z.array(
  z.object({
    case: nonblank,
    path: nonblank,
    before: z.unknown().optional(),
    after: z.unknown().optional(),
    authority: z.object({
      kind: z.nativeEnum(CaAuthorityKind),
      citation: nonblank,
    }).strict(),
    reviewer: nonblank,
    on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    provenance: z.nativeEnum(CaEvidenceProvenance),
  }).strict().superRefine((entry, context) => {
    const schema = caAssertionSchema(entry.path);
    if (!schema) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["path"],
        message: "Unknown typed CA assertion path",
      });
    } else {for (const field of ["before", "after"] as const) {
        if (
          entry[field] !== undefined && !schema.safeParse(entry[field]).success
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: "Value does not fit typed CA assertion path",
          });
        }
      }}
    if (entry.before === undefined && entry.after === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Assertion needs before or after evidence",
      });
    }
  }),
).min(1);
export type CaLedger = z.infer<typeof caLedgerSchema>;

function caAssertionSchema(path: string): z.ZodTypeAny | undefined {
  if (path.startsWith("input.json.")) {
    const key = path.slice("input.json.".length);
    const fields: z.ZodRawShape = {
      ...line31Input.shape,
      ...workpaperInput.shape,
      kind: supportedKind,
    };
    return fields[key];
  }
  if (path.startsWith("sources.json.")) {
    return (caSourcesSchema.shape as z.ZodRawShape)[
      path.slice("sources.json.".length)
    ];
  }
  if (path.startsWith("scenarios.json.")) {
    return (caScenarioSchema.innerType().shape as z.ZodRawShape)[
      path.slice("scenarios.json.".length)
    ];
  }
  const key = path.replace(/^correct\.json\./, "");
  const coverage = /^coverage\.(.+)\.(source|policy)$/.exec(key);
  if (coverage) {
    return coverage[2] === "source"
      ? coverageAssessmentSchema.unwrap().innerType().shape.source
      : coveragePolicySchema;
  }
  if (key.startsWith("product.")) {
    return (workpaperExpected.shape.product.shape as z.ZodRawShape)[
      key.slice("product.".length)
    ];
  }
  if (key.startsWith("lines.")) {
    return (workpaperExpected.shape.lines.shape as z.ZodRawShape)[
      key.slice("lines.".length)
    ];
  }
  if (key.startsWith("gates.")) {
    return (caGateSchema.shape as z.ZodRawShape)[key.slice("gates.".length)];
  }
  if (key.startsWith("readiness.")) {
    return (readinessResultSchema.innerType().shape as z.ZodRawShape)[
      key.slice("readiness.".length)
    ];
  }
  if (key.startsWith("documents.")) {
    return (workpaperExpected.shape.documents.shape as z.ZodRawShape)[
      key.slice("documents.".length)
    ];
  }
  if (key.startsWith("externalChecks.")) {
    return (workpaperExpected.shape.externalChecks.shape as z.ZodRawShape)[
      key.slice("externalChecks.".length)
    ];
  }
  const diagnostic =
    /^diagnostics\.CA540_[A-Z0-9_]+\.(severity|category|formRef)$/.exec(key);
  if (diagnostic) {
    return (diagnosticDisposition.shape as z.ZodRawShape)[diagnostic[1]];
  }
  const fields: z.ZodRawShape = {
    kind: supportedKind,
    validationScope: workpaperExpected.shape.validationScope,
    profile: workpaperExpected.shape.profile,
    canFile: workpaperExpected.shape.canFile,
    diagnosticCodes: stringSet,
  };
  return fields[key];
}

export async function loadCaCase(directory: string) {
  const inputRaw = JSON.parse(
    await fs.readFile(join(directory, "input.json"), "utf8"),
  );
  if (inputRaw.kind === CaCaseKind.CompleteReturn) {
    throw new Error(
      "CA complete_return benchmark is unsupported in this milestone",
    );
  }
  const input = caInputSchema.parse(inputRaw);
  const expected = caExpectedSchema.parse(
    JSON.parse(await fs.readFile(join(directory, "correct.json"), "utf8")),
  );
  const sources = caSourcesSchema.parse(
    JSON.parse(await fs.readFile(join(directory, "sources.json"), "utf8")),
  );
  if (input.kind === CaCaseKind.Workpaper && !sources.policy) {
    throw new Error(
      "CA workpaper source contract requires explicit project policy authority",
    );
  }
  if (input.kind !== expected.kind) {
    throw new Error("CA input/expected kind mismatch");
  }
  const definition = productCatalog[`${input.product}:${input.year}`];
  if (!definition || !isStateFormDefinition(definition)) {
    throw new Error("Unsupported CA benchmark product");
  }
  if (input.kind === CaCaseKind.Workpaper) {
    definition.inputSchema.parse(input.forms[0].data);
  }
  return { input, expected, sources };
}
export async function inspectCaInventory(root: string): Promise<string[]> {
  const manifest = caScenarioSchema.parse(
    JSON.parse(await fs.readFile(join(root, "scenarios.json"), "utf8")),
  );
  const ledger = caLedgerSchema.parse(
    JSON.parse(await fs.readFile(join(root, "ledger.json"), "utf8")),
  );
  const directories: string[] = [];
  for await (const entry of sys.readDir(root)) {
    if (entry.isDirectory) directories.push(entry.name);
  }
  if (
    JSON.stringify(directories.sort()) !==
      JSON.stringify(manifest.cases.map((item) => item.id).sort())
  ) {
    throw new Error(
      "CA scenario manifest does not match canonical case inventory (empty, missing or extra cases)",
    );
  }
  const current: Record<string, Record<string, unknown>> = {
    "@manifest": caAssertions(manifest, "scenarios.json"),
  };
  for (const item of manifest.cases) {
    const value = await loadCaCase(join(root, item.id));
    if (value.input.kind !== item.kind) {
      throw new Error(`CA manifest kind mismatch: ${item.id}`);
    }
    current[item.id] = {
      ...caAssertions(value.input, "input.json"),
      ...caAssertions(value.expected, "correct.json"),
      ...caAssertions(value.sources, "sources.json"),
    };
  }
  for (const [id, assertions] of Object.entries(current)) {
    const latest: Record<string, CaLedger[number]> = {};
    for (const entry of ledger) {
      if (entry.case === id) latest[entry.path] = entry;
    }
    for (
      const path of new Set([
        ...Object.keys(assertions),
        ...Object.keys(latest),
      ])
    ) {
      const entry = latest[path];
      if (
        !entry || !caLedgerAuthorityValid(entry) ||
        canonicalCaValue(entry.after) !== canonicalCaValue(assertions[path])
      ) throw new Error(`CA unreviewed evidence: ${id}/${path}`);
    }
  }
  return directories.map((id) => join(root, id));
}

/** Object keys are exact; array-valued assertions are sets, never positional code lists. */
export function canonicalCaValue(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(canonicalCaValue).sort());
  }
  if (value !== null && typeof value === "object") {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map((
          [key, item],
        ) => [key, canonicalCaValue(item)]),
      ),
    );
  }
  return JSON.stringify(value) ?? "undefined";
}

export function caAssertions(
  raw: unknown,
  prefix = "",
): Record<string, unknown> {
  if (raw === undefined) return {};
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    if (prefix === "coverage" || prefix.endsWith(".coverage")) {
      const assertions: Record<string, unknown> = {};
      for (const [id, row] of Object.entries(raw)) {
        if (row === null || typeof row !== "object" || Array.isArray(row)) {
          assertions[`${prefix}.${id}`] = row;
          continue;
        }
        const { source, ...policy } = row as Record<string, unknown>;
        assertions[`${prefix}.${id}.source`] = source;
        assertions[`${prefix}.${id}.policy`] = policy;
      }
      return assertions;
    }
    const entries = Object.entries(raw);
    if (entries.length === 0) return { [prefix]: {} };
    return Object.assign(
      {},
      ...entries.map(([key, value]) =>
        caAssertions(value, prefix ? `${prefix}.${key}` : key)
      ),
    );
  }
  return { [prefix]: raw };
}

export function caLedgerAuthorityValid(entry: CaLedger[number]): boolean {
  if (CA_ENGINE_SOURCE.test(entry.authority.citation)) return false;
  const key = entry.path.replace(/^correct\.json\./, "");
  const numeric = /^lines\./.test(key);
  const projectOwned = /^scenarios\.json\./.test(entry.path) ||
    /^sources\.json\.(policy|provenance)$/.test(entry.path) ||
    /^coverage\..+\.policy$/.test(key) ||
    /^(?:kind$|product\.|validationScope$|profile$|diagnosticCodes$|diagnostics\.|canFile$|readiness\.|gates\.|documents\.|externalChecks\.)/
      .test(key);
  if (projectOwned) {
    return entry.authority.kind === CaAuthorityKind.ProjectPolicy &&
      /(?:OpenTax|CA540|coverage.readiness)/i.test(entry.authority.citation);
  }
  return entry.authority.kind === CaAuthorityKind.Official &&
    (numeric
      ? /https:\/\/www\.ftb\.ca\.gov\/forms\/2025\//
      : /https:\/\/www\.ftb\.ca\.gov\//).test(entry.authority.citation);
}
export function compareCaExpected(
  expected: CaExpected,
  actual: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  function compare(want: unknown, got: unknown, path: string) {
    if (want !== null && typeof want === "object" && !Array.isArray(want)) {
      for (const [key, value] of Object.entries(want)) {
        compare(
          value,
          got !== null && typeof got === "object"
            ? (got as Record<string, unknown>)[key]
            : undefined,
          path ? `${path}.${key}` : key,
        );
      }
    } else if (canonicalCaValue(want) !== canonicalCaValue(got)) {
      errors.push(
        `${path}: expected ${JSON.stringify(want)}, got ${
          JSON.stringify(got) ?? "missing"
        }`,
      );
    }
  }
  // kind describes the fixture contract, not a computed engine field.
  for (const [key, value] of Object.entries(expected)) {
    if (key === "kind") continue;
    if (key === "coverage") {
      const wanted = value as Record<string, unknown>;
      const observed =
        actual.coverage !== null && typeof actual.coverage === "object"
          ? actual.coverage as Record<string, unknown>
          : {};
      for (
        const id of new Set([...Object.keys(wanted), ...Object.keys(observed)])
      ) {
        if (canonicalCaValue(wanted[id]) !== canonicalCaValue(observed[id])) {
          errors.push(
            `coverage.${id}: missing, unexpected or changed requirement assessment`,
          );
        }
      }
    } else compare(value, actual[key], key);
  }
  return errors;
}
export type CaCaseResult = {
  name: string;
  kind: CaInput["kind"];
  ok: boolean;
  errors: string[];
  actual?: Record<string, unknown>;
};
export async function runCaCase(directory: string): Promise<CaCaseResult> {
  const { input, expected } = await loadCaCase(directory);
  let actual: Record<string, unknown>;
  if (input.kind === CaCaseKind.Line31) {
    actual = {
      lines: {
        line31_tax: calculateOrdinaryTax(
          input.taxableIncome,
          input.filingStatus,
        ),
      },
    };
  } else {
    const baseDir = await sys.makeTempDir({ prefix: "opentax-ca-benchmark-" });
    try {
      const { returnId } = await createReturnCommand({
        year: input.year,
        formType: input.product,
        baseDir,
      });
      for (const form of input.forms) {
        await formAddCommand({
          returnId,
          baseDir,
          nodeType: form.node_type,
          dataJson: JSON.stringify(form.data),
        });
      }
      const result = await getReturnCommand({ returnId, baseDir });
      const { report } = await validateReturnCommand({ returnId, baseDir });
      // Validate the public shape at the adapter boundary; never synthesize missing gates or documents.
      const typed = z.object({
        product: workpaperExpected.shape.product,
        validationScope: z.literal("ca540-workpaper"),
        profile: z.literal("workpaper"),
        canFile: z.literal(false),
        readiness: workpaperExpected.shape.readiness,
        coverage: z.array(coverageAssessmentSchema).min(1),
        gates: z.array(
          z.object({ id: z.nativeEnum(GateId), status: gateStatus }),
        ),
        documents: workpaperExpected.shape.documents,
        externalChecks: z.array(
          z.object({ id: nonblank, status: z.nativeEnum(ExternalCheckStatus) }),
        ),
        entries: z.array(
          diagnosticDisposition.extend({ ruleNumber: nonblank }).passthrough(),
        ),
      }).parse(report);
      const gates = caGateSchema.parse(
        Object.fromEntries(typed.gates.map((gate) => [gate.id, gate.status])),
      );
      const externalChecks = workpaperExpected.shape.externalChecks.parse(
        Object.fromEntries(
          typed.externalChecks.map((check) => [check.id, check.status]),
        ),
      );
      const coverage = coverageProjectionSchema.parse(
        Object.fromEntries(typed.coverage.map((row) => [row.id, row])),
      );
      if (Object.keys(coverage).length !== typed.coverage.length) {
        throw new Error("Duplicate CA coverage requirement IDs");
      }
      actual = {
        product: typed.product,
        lines: result.lines,
        validationScope: typed.validationScope,
        profile: typed.profile,
        canFile: typed.canFile,
        readiness: typed.readiness,
        gates,
        coverage,
        diagnosticCodes: typed.entries.map((entry) => entry.ruleNumber),
        diagnostics: Object.fromEntries(
          typed.entries.map((
            { ruleNumber, severity, category, formRef },
          ) => [ruleNumber, { severity, category, formRef }]),
        ),
        documents: typed.documents,
        externalChecks,
      };
      if (
        new Set(typed.gates.map((gate) => gate.id)).size !== typed.gates.length
      ) throw new Error("Duplicate CA gate IDs");
      const pdf = await exportPdfCommand({ returnId, baseDir });
      const text = await new sys.Command("pdftotext", {
        args: [pdf, "-"],
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (
        !text.success ||
        !new TextDecoder().decode(text.stdout).includes(
          "Not an official Form 540",
        )
      ) throw new Error("CA permitted worksheet missing workpaper label");
      for (const options of [{}, { force: true }, { draft: true }]) {
        let refused = false;
        try {
          await exportMefCommand({ returnId, baseDir, ...options });
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.includes("not available for California Form 540")
          ) throw error;
          refused = true;
        }
        if (!refused) {
          throw new Error("CA MeF must be refused even under force/draft");
        }
      }
    } finally {
      await sys.remove(baseDir, { recursive: true });
    }
  }
  const errors = compareCaExpected(expected, actual);
  return {
    name: basename(directory),
    kind: input.kind,
    ok: errors.length === 0,
    errors,
    actual,
  };
}
export async function runCaBenchmark(root: string, caseName?: string) {
  // Selection never bypasses the canonical inventory and evidence checks.
  const inventory = await inspectCaInventory(root);
  const cases = caseName === undefined
    ? inventory
    : inventory.filter((directory) => basename(directory) === caseName);
  if (cases.length === 0) throw new Error(`Unknown CA benchmark case: ${caseName}`);
  const results: CaCaseResult[] = [];
  for (const directory of cases) {
    try {
      results.push(await runCaCase(directory));
    } catch (error) {
      const { input } = await loadCaCase(directory);
      results.push({
        name: basename(directory),
        kind: input.kind,
        ok: false,
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }
  const pass = results.filter((result) => result.ok).length;
  return {
    product: "ca540",
    year: 2025,
    total: results.length,
    pass,
    fail: results.length - pass,
    skipped: 0,
    results,
  };
}
