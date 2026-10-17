#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * Run a single benchmark case through the tax engine and save output.json.
 * Usage: deno run --allow-read --allow-write --allow-run benchmark/run_case.ts <case_dir>
 */

import { basename, dirname, fromFileUrl, join } from "@std/path";

import {
  benchmarkInputSchema,
  benchmarkReturnSchema,
  benchmarkTax,
  createdReturnSchema,
} from "./harness.ts";
import { caseProduct } from "./harness.ts";
import { inspectCaInventory, runCaCase } from "./ca540.ts";

const SCRIPT_DIR = dirname(fromFileUrl(import.meta.url));
const TAX_DIR = join(SCRIPT_DIR, "..");

const caseDir = Deno.args[0];
if (!caseDir) {
  console.error(
    "Usage: deno run --allow-read --allow-write --allow-run run_case.ts <case_dir>",
  );
  Deno.exit(1);
}
const product = caseProduct(caseDir);
if (!product) throw new Error("Case must live at <form>/<year>/<case>");
if (product.form === "ca540") {
  await inspectCaInventory(dirname(caseDir));
  const result = await runCaCase(caseDir);
  await Deno.writeTextFile(
    join(caseDir, "output.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  Deno.exit(result.ok ? 0 : 1);
}

async function tax(...args: string[]): Promise<string> {
  return await benchmarkTax(TAX_DIR, args);
}

const inputFile = join(caseDir, "input.json");
const caseData = benchmarkInputSchema.parse(
  JSON.parse(await Deno.readTextFile(inputFile)),
);

console.log(`Running: ${basename(caseDir)}`);
console.log(`  Scenario: ${caseData.scenario ?? ""}`);

const rid = createdReturnSchema.parse(JSON.parse(
  await tax(
    "return",
    "create",
    "--form",
    product.form,
    "--year",
    String(caseData.year),
    "--json",
  ),
)).returnId;
console.log(`  Created return: ${rid}`);

for (const f of caseData.forms) {
  console.log(`  Adding: ${f.node_type}`);
  await tax(
    "form",
    "add",
    "--returnId",
    rid,
    "--node_type",
    f.node_type,
    JSON.stringify(f.data),
    "--json",
  );
}

console.log("  Computing result...");
const result = await tax("return", "get", "--returnId", rid, "--json");
benchmarkReturnSchema.parse(JSON.parse(result));
const outputFile = join(caseDir, "output.json");
await Deno.writeTextFile(outputFile, result);
console.log(`  Saved: ${outputFile}`);

console.log(JSON.stringify(JSON.parse(result).summary, null, 2));
