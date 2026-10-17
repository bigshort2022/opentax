import { assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { assessForm540 } from "../../forms/ca540/2025/assessment.ts";
import { workpaperInput } from "../../forms/ca540/2025/test-fixtures.ts";
import { formatDiagnosticsJson, formatDiagnosticsText } from "./report.ts";

Deno.test("CA text and JSON preserve nonpassing gate and finding identities", () => {
  const { report } = assessForm540([workpaperInput]);
  const text = formatDiagnosticsText(report, "synthetic", 2025);
  const json = JSON.parse(formatDiagnosticsJson(report));
  assertEquals(json.canFile, false);
  assertEquals(json.gates, report.gates);
  for (const gate of report.gates) {
    assertStringIncludes(text, `${gate.id}: ${gate.status}`);
  }
  for (const finding of report.entries) {
    assertStringIncludes(text, finding.ruleNumber);
  }
  for (const check of report.externalChecks) {
    assertStringIncludes(text, `${check.id}: ${check.status}`);
  }
  assertFalse(/^\s*STATUS: READY TO FILE\s*$/m.test(text));
});

Deno.test("CA invalid input diagnostics never echo taxpayer values", () => {
  const { report } = assessForm540([{
    ...workpaperInput,
    federalAgi: "PRIVATE_SENTINEL",
  }]);
  for (
    const formatted of [
      formatDiagnosticsText(report, "synthetic", 2025),
      formatDiagnosticsJson(report),
    ]
  ) {
    assertFalse(formatted.includes("PRIVATE_SENTINEL"));
    assertStringIncludes(formatted, "CA540_INPUT_INVALID");
  }
});
