#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * Run all benchmark cases and generate output.json for each.
 * Run: deno run --allow-read --allow-write --allow-run benchmark/run_all.ts
 */

import { basename, dirname, fromFileUrl, join } from "@std/path";

import {
  benchmarkExitCode,
  benchmarkInputSchema,
  benchmarkReturnSchema,
  benchmarkTax,
  createdReturnSchema,
  discoverBenchmarkCases,
} from "./harness.ts";
import { caseProduct } from "./harness.ts";
import { runCaCase } from "./ca540.ts";

const SCRIPT_DIR = dirname(fromFileUrl(import.meta.url));
const TAX_DIR = join(SCRIPT_DIR, "..");
const formIndex = Deno.args.indexOf("--form");
const yearIndex = Deno.args.indexOf("--year");
const CASES_DIR = formIndex === -1 ? join(SCRIPT_DIR, "cases") : join(
  SCRIPT_DIR,
  "cases",
  Deno.args[formIndex + 1],
  yearIndex === -1 ? "2025" : Deno.args[yearIndex + 1],
);

async function tax(...args: string[]): Promise<string> {
  return await benchmarkTax(TAX_DIR, args);
}

const names = await discoverBenchmarkCases(CASES_DIR);

console.log(`Running all ${names.length} benchmark cases...`);
console.log("==================================");

let pass = 0, fail = 0;

for (const name of names) {
  const caseDir = name;
  const product = caseProduct(caseDir);
  if (!product) throw new Error("Case must live at <form>/<year>/<case>");
  if (product.form === "ca540") {
    try {
      const result = await runCaCase(caseDir);
      await Deno.writeTextFile(
        join(caseDir, "output.json"),
        JSON.stringify(result, null, 2),
      );
      if (result.ok) pass++;
      else {
        console.error(result.errors.join("\n"));
        fail++;
      }
    } catch (error) {
      console.error(String(error));
      fail++;
    }
    continue;
  }
  const inputFile = join(caseDir, "input.json");
  await Deno.stat(inputFile);

  const caseData = benchmarkInputSchema.parse(
    JSON.parse(await Deno.readTextFile(inputFile)),
  );
  console.log(`Running: ${name}`);
  console.log(`  Scenario: ${caseData.scenario ?? ""}`);

  try {
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

    const result = await tax("return", "get", "--returnId", rid, "--json");
    benchmarkReturnSchema.parse(JSON.parse(result));
    await Deno.writeTextFile(join(caseDir, "output.json"), result);
    console.log(`  Saved: output.json`);
    pass++;
  } catch (err) {
    console.error(`  FAILED: ${err}`);
    fail++;
  }
  console.log();
}

console.log("==================================");
console.log(`Results: ${pass} passed, ${fail} failed`);

Deno.exit(benchmarkExitCode(pass + fail, fail));
