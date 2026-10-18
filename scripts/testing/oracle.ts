import * as fs from "node:fs/promises";
import * as sys from "../support/sys.ts";
/** Oracle contract: expected benchmark values change only with a cited publication. */
import { dirname, join } from "node:path";
import { fileURLToPath as fromFileUrl } from "node:url";
import { z } from "zod";
import {
  benchmarkExpectedSchema,
  ENGINE_SOURCE,
} from "../../benchmark/harness.ts";
import { repositoryFiles } from "./repository.ts";
import {
  caAssertions,
  CaCaseKind,
  CaEvidenceProvenance,
  type CaLedger,
  caLedgerAuthorityValid,
  caLedgerSchema,
  canonicalCaValue,
  inspectCaInventory,
} from "../../benchmark/ca540.ts";

export const CASES_DIR = "benchmark/cases";
export const LEDGER_FILE = "ledger.json";
const LEGACY_CA_FILE = "benchmark/ca540/2025/cases.json";

const ledgerEntrySchema = z.object({
  case: z.string().min(1),
  /** Omitted for a removed case. */
  line: z.string().min(1).optional(),
  before: z.number().finite().optional(),
  after: z.number().finite().optional(),
  source: z.string().min(1),
  approvedBy: z.string().min(1),
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});
export const ledgerSchema = z.array(ledgerEntrySchema);
export type Ledger = z.infer<typeof ledgerSchema>;

export type Change =
  | {
    readonly kind: "assertion";
    readonly product: string;
    readonly case: string;
    readonly path: string;
    readonly before: unknown;
    readonly after: unknown;
  }
  | {
    readonly kind: "value";
    readonly product: string;
    readonly case: string;
    readonly line: string;
    readonly before: number | undefined;
    readonly after: number | undefined;
  }
  | {
    readonly kind: "added";
    readonly product: string;
    readonly case: string;
    readonly cited: boolean;
  }
  | {
    readonly kind: "removed";
    readonly product: string;
    readonly case: string;
  };

export type Problem = {
  readonly kind:
    | "uncited-change"
    | "uncited-removal"
    | "engine-source"
    | "missing-source";
  readonly product: string;
  readonly case: string;
  readonly line?: string;
  readonly message: string;
  readonly fix: string;
};

const CASE_FILE = /^benchmark\/cases\/([^/]+\/\d{4})\/([^/]+)\/correct\.json$/;

export function caseKey(
  path: string,
): { product: string; case: string } | undefined {
  const match = CASE_FILE.exec(path);
  return match ? { product: match[1], case: match[2] } : undefined;
}

/** CA tracks all critical contracts, inputs, source references and scenario coverage. */
function evidenceKey(
  path: string,
): { product: string; case: string; file?: string } | undefined {
  const ca =
    /^benchmark\/cases\/(ca540\/2025)\/(?:(scenarios\.json)|([^/]+)\/(input|correct|sources)\.json)$/
      .exec(path);
  if (ca) {
    return {
      product: ca[1],
      case: ca[2] ? "@manifest" : ca[3],
      file: ca[2] ?? `${ca[4]}.json`,
    };
  }
  return caseKey(path);
}

export function scoredValues(raw: unknown): Record<string, number> {
  return benchmarkExpectedSchema.parse(raw);
}

export function isCited(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const { source, sources } = raw as { source?: unknown; sources?: unknown };
  return (typeof source === "string" && source.trim().length > 0) ||
    (Array.isArray(sources) && sources.length > 0);
}

export function caseChanges(
  product: string,
  name: string,
  before: unknown | undefined,
  after: unknown | undefined,
): Change[] {
  if (product === "ca540/2025") {
    const was = caAssertions(before);
    const now = caAssertions(after);
    return [...new Set([...Object.keys(was), ...Object.keys(now)])].sort()
      .filter((path) =>
        canonicalCaValue(was[path]) !== canonicalCaValue(now[path])
      )
      .map((path) => ({
        kind: "assertion" as const,
        product,
        case: name,
        path,
        before: was[path],
        after: now[path],
      }));
  }
  if (before === undefined && after === undefined) return [];
  if (before === undefined) {
    return [{ kind: "added", product, case: name, cited: isCited(after) }];
  }
  if (after === undefined) return [{ kind: "removed", product, case: name }];
  const was = scoredValues(before);
  const now = scoredValues(after);
  return [...new Set([...Object.keys(was), ...Object.keys(now)])]
    .filter((line) => was[line] !== now[line])
    .sort()
    .map((line) => ({
      kind: "value" as const,
      product,
      case: name,
      line,
      before: was[line],
      after: now[line],
    }));
}

const ledgerPath = (product: string) =>
  `${CASES_DIR}/${product}/${LEDGER_FILE}`;

function citation(entry: Ledger[number] | undefined): string | undefined {
  if (!entry) return undefined;
  return ENGINE_SOURCE.test(entry.source) ? undefined : entry.source;
}

/** Every change needs a ledger entry that states it and cites a publication. */
export function ledgerProblems(
  changes: readonly Change[],
  ledgers: ReadonlyMap<string, Ledger | CaLedger>,
): Problem[] {
  return changes.flatMap((change): Problem[] => {
    if (change.kind === "assertion") {
      const parsed = caLedgerSchema.safeParse(ledgers.get(change.product));
      const entry = parsed.success
        ? parsed.data.find((candidate) =>
          candidate.case === change.case && candidate.path === change.path &&
          canonicalCaValue(candidate.before) ===
            canonicalCaValue(change.before) &&
          canonicalCaValue(candidate.after) === canonicalCaValue(change.after)
        )
        : undefined;
      const independent = entry && caLedgerAuthorityValid(entry) &&
        !(entry.provenance === CaEvidenceProvenance.MigratedExistingOracle &&
          change.before !== undefined);
      if (entry && independent) return [];
      return [{
        kind: "uncited-change",
        product: change.product,
        case: change.case,
        line: change.path,
        message:
          `${change.path} changed or was removed without matching typed reviewed evidence`,
        fix:
          `Record exact before/after, official numerical authority or honest project policy authority, reviewer, date and explicit provenance in ${
            ledgerPath(change.product)
          }; approvedBy is not CA approval`,
      }];
    }
    const ledger = (ledgers.get(change.product) ?? []) as Ledger;
    const file = ledgerPath(change.product);
    if (change.kind === "added") {
      if (change.cited) return [];
      return [{
        kind: "missing-source",
        product: change.product,
        case: change.case,
        message: "New case has no source citation",
        fix:
          `Add "source": "<publication, exercise, page>" to its correct.json`,
      }];
    }
    if (change.kind === "removed") {
      const entry = ledger.find((candidate) =>
        candidate.case === change.case && candidate.line === undefined
      );
      if (entry && citation(entry)) return [];
      return [{
        kind: entry ? "engine-source" : "uncited-removal",
        product: change.product,
        case: change.case,
        message: entry
          ? `Ledger entry cites the engine, not a publication: ${entry.source}`
          : "Case removed without a ledger entry",
        fix:
          `Add { "case": "${change.case}", "source": "<why, with the publication>", "approvedBy", "on" } to ${file}`,
      }];
    }
    const entry = ledger.find((candidate) =>
      candidate.case === change.case && candidate.line === change.line &&
      candidate.before === change.before && candidate.after === change.after
    );
    if (entry && citation(entry)) return [];
    return [{
      kind: entry ? "engine-source" : "uncited-change",
      product: change.product,
      case: change.case,
      line: change.line,
      message: entry
        ? `Ledger entry cites the engine, not a publication: ${entry.source}`
        : `${change.line} changed ${change.before ?? "∅"} -> ${
          change.after ?? "∅"
        } without a ledger entry`,
      fix:
        `Add { "case": "${change.case}", "line": "${change.line}", "before": ${
          change.before ?? "null"
        }, "after": ${
          change.after ?? "null"
        }, "source": "<publication, page>", "approvedBy", "on" } to ${file}`,
    }];
  });
}

async function git(root: string, args: string[]): Promise<string> {
  const result = await new sys.Command("git", {
    args,
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(
      `git ${args.slice(0, 2).join(" ")} failed: ${
        new TextDecoder().decode(result.stderr).trim()
      }`,
    );
  }
  return new TextDecoder().decode(result.stdout);
}

/** Preserve the original independent vectors across the one-time canonical migration. */
function legacyCaBaseCases(raw: unknown): [string, unknown][] {
  const cases = z.array(
    z.object({
      name: z.string().min(1),
      taxableIncome: z.number().int().nonnegative(),
      filingStatus: z.string().min(1),
      expectedLine31: z.number().int().nonnegative(),
      source: z.string().min(1),
    }).strict(),
  ).min(1).parse(raw);
  const seen = new Set<string>();
  return cases.flatMap((item): [string, unknown][] => {
    if (seen.has(item.name)) throw new Error("Duplicate legacy CA oracle ID");
    seen.add(item.name);
    const directory = `${CASES_DIR}/ca540/2025/${item.name}`;
    return [
      [`${directory}/input.json`, {
        product: "ca540",
        year: 2025,
        kind: CaCaseKind.Line31,
        taxableIncome: item.taxableIncome,
        filingStatus: item.filingStatus,
      }],
      [`${directory}/correct.json`, {
        kind: CaCaseKind.Line31,
        lines: { line31_tax: item.expectedLine31 },
      }],
      [`${directory}/sources.json`, { official: [item.source] }],
    ];
  });
}
async function baseCases(
  root: string,
  base: string,
): Promise<Map<string, unknown>> {
  const paths = (await git(root, [
    "ls-tree",
    "-r",
    "--name-only",
    base,
    "--",
    CASES_DIR,
    LEGACY_CA_FILE,
  ])).split("\n").filter((path) =>
    evidenceKey(path) || path === LEGACY_CA_FILE
  );
  const entries: [string, unknown][] = [];
  for (const path of paths) {
    const raw = JSON.parse(await git(root, ["show", `${base}:${path}`]));
    if (path === LEGACY_CA_FILE) entries.push(...legacyCaBaseCases(raw));
    else entries.push([path, raw]);
  }
  return new Map(entries);
}

async function currentCases(root: string): Promise<Map<string, unknown>> {
  const entries: [string, unknown][] = [];
  for (
    const path of (await repositoryFiles(root)).filter((p) => evidenceKey(p))
  ) {
    try {
      entries.push([
        path,
        JSON.parse(await fs.readFile(join(root, path), "utf8")),
      ]);
    } catch (error) {
      // Git's index can still list a working-tree deletion. Compare it as a
      // removal against the base; the ledger/inventory must authorize it.
      if (!sys.isNotFound(error)) throw error;
    }
  }
  return new Map(entries);
}

async function currentLedgers(
  root: string,
  products: Iterable<string>,
): Promise<Map<string, Ledger | CaLedger>> {
  const entries: [string, Ledger | CaLedger][] = [];
  for (const product of new Set(products)) {
    try {
      entries.push([
        product,
        (product === "ca540/2025" ? caLedgerSchema : ledgerSchema).parse(
          JSON.parse(await fs.readFile(join(root, ledgerPath(product)), "utf8")),
        ),
      ]);
    } catch (error) {
      if (!(sys.isNotFound(error))) throw error;
    }
  }
  return new Map(entries);
}

export type OracleReport = {
  readonly base: string;
  readonly cases: number;
  readonly changes: readonly Change[];
  readonly problems: readonly Problem[];
};

export async function oracleReport(
  root: string,
  base: string,
  options: { requireCaInventory?: boolean } = {},
): Promise<OracleReport> {
  await git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  // Finish owned git readers before parsing current files can fail.
  const was = await baseCases(root, base);
  const now = await currentCases(root);
  const changes = [...new Set([...was.keys(), ...now.keys()])].sort().flatMap(
    (path) => {
      const key = evidenceKey(path)!;
      const changes = caseChanges(
        key.product,
        key.case,
        was.get(path),
        now.get(path),
      );
      const file = key.file;
      return file
        ? changes.map((change) =>
          change.kind === "assertion"
            ? {
              ...change,
              path: change.path ? `${file}.${change.path}` : file,
            }
            : change
        )
        : changes;
    },
  );
  const ledgers = await currentLedgers(
    root,
    changes.map((change) => change.product),
  );
  const inventoryProblems: Problem[] = [];
  try {
    await inspectCaInventory(join(root, CASES_DIR, "ca540", "2025"));
  } catch (error) {
    // Generic/federal-only isolated repositories retain their existing oracle contract.
    const hasCa = [...was.keys(), ...now.keys()].some((path) =>
      path.includes("/ca540/")
    );
    if (
      options.requireCaInventory || hasCa ||
      !sys.isNotFound(error)
    ) {
      inventoryProblems.push({
        kind: "missing-source",
        product: "ca540/2025",
        case: "@inventory",
        message: error instanceof Error ? error.message : String(error),
        fix:
          "Restore nonempty canonical CA inventory, manifest, typed ledger and independent sources",
      });
    }
  }
  return {
    base,
    cases: [...now.keys()].filter((path) => caseKey(path)).length,
    changes,
    problems: [...ledgerProblems(changes, ledgers), ...inventoryProblems],
  };
}

export function formatReport(report: OracleReport): string {
  const lines = report.problems.map((problem) =>
    `${problem.product}/${problem.case}${
      problem.line ? ` ${problem.line}` : ""
    }\n  ${problem.message}\n  fix: ${problem.fix}`
  );
  const summary =
    `${report.cases} cases, ${report.changes.length} changes since ${report.base}, ${report.problems.length} problems`;
  return [...lines, summary].join("\n");
}

if (import.meta.main) {
  const root = dirname(dirname(dirname(fromFileUrl(import.meta.url))));
  const baseIndex = process.argv.slice(2).indexOf("--base");
  const base = baseIndex === -1
    ? "origin/main"
    : process.argv.slice(2)[baseIndex + 1];
  let report: OracleReport;
  try {
    report = await oracleReport(root, base, { requireCaInventory: true });
  } catch (error) {
    console.error(
      `${(error as Error).message}\nFetch the base first: git fetch origin ${
        base.replace(/^origin\//, "")
      }`,
    );
    process.exit(2);
  }
  console.log(
    process.argv.slice(2).includes("--json")
      ? JSON.stringify(report)
      : formatReport(report),
  );
  process.exit(report.problems.length === 0 ? 0 : 1);
}
