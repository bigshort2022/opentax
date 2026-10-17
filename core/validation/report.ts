/**
 * Diagnostics report formatter.
 *
 * Formats a DiagnosticsReport into professional CLI text output
 * (similar to Drake Tax / Lacerte diagnostics).
 */

import type { DiagnosticEntry, DiagnosticsReport } from "./types.ts";
import {
  isStateDiagnosticsReport,
  type StateDiagnosticsReport,
} from "./state-report.ts";

/** Format a diagnostics report as human-readable text. */
export function formatDiagnosticsText(
  report: DiagnosticsReport,
  returnId: string,
  taxYear: number,
): string {
  if (isStateDiagnosticsReport(report)) {
    return formatStateDiagnosticsText(report);
  }
  const lines: string[] = [];
  const w = 60;
  const sep = "\u2500".repeat(w);
  const doubleSep = "\u2550".repeat(w);

  lines.push(doubleSep);
  lines.push(`  TAX RETURN DIAGNOSTICS -- Return ${returnId} (TY${taxYear})`);
  lines.push(doubleSep);
  lines.push("");

  // Errors (reject + reject_and_stop)
  const errors = report.entries.filter(
    (e) => e.severity === "reject" || e.severity === "reject_and_stop",
  );
  if (errors.length > 0) {
    lines.push(
      `  ERRORS (${errors.length})${
        " ".repeat(Math.max(0, 38 - String(errors.length).length))
      }MUST FIX`,
    );
    lines.push(`  ${sep}`);
    for (const e of errors) {
      lines.push(formatEntry(e));
    }
    lines.push("");
  }

  // Warnings (alerts)
  const warnings = report.entries.filter((e) => e.severity === "alert");
  if (warnings.length > 0) {
    lines.push(
      `  WARNINGS (${warnings.length})${
        " ".repeat(Math.max(0, 36 - String(warnings.length).length))
      }REVIEW`,
    );
    lines.push(`  ${sep}`);
    for (const w of warnings) {
      lines.push(formatEntry(w));
    }
    lines.push("");
  }

  // Summary
  lines.push(`  ${sep}`);
  lines.push("  SUMMARY");
  lines.push(`  ${sep}`);
  lines.push(`  Rules checked:  ${padNum(report.summary.total)}`);
  lines.push(`  Passed:         ${padNum(report.summary.passed)}`);
  lines.push(
    `  Errors:         ${padNum(report.summary.rejected)}${
      report.summary.rejected > 0 ? "    <-- BLOCKS E-FILE" : ""
    }`,
  );
  lines.push(`  Warnings:       ${padNum(report.summary.alerts)}`);
  lines.push(`  Skipped (stub): ${padNum(report.summary.skipped)}`);
  lines.push(`  ${sep}`);

  const status = report.canFile
    ? "STATUS: READY TO FILE"
    : "STATUS: NOT READY TO FILE";
  lines.push(`  ${status}`);
  lines.push(doubleSep);

  return lines.join("\n");
}

/** Format a diagnostics report as JSON. */
export function formatDiagnosticsJson(report: DiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}

function formatStateDiagnosticsText(report: StateDiagnosticsReport): string {
  const lines = [
    `CALIFORNIA FORM 540 TY${report.product.taxYear} -- WORKPAPER ONLY`,
    `Local readiness: ${report.readiness.status}; canFile: ${report.canFile}`,
    "Calculation evidence is not complete-return, transmission, or acceptance evidence.",
    "",
    `LOCAL GATES (${report.summary.total}; not counts of official tax rules)`,
  ];
  for (const gate of report.gates) lines.push(`  ${gate.id}: ${gate.status}`);
  lines.push("", "FINDINGS");
  for (const finding of report.entries) lines.push(formatEntry(finding));
  lines.push(
    "",
    "COVERAGE (capability / applicability; no filing-ready percentage)",
  );
  for (const item of report.coverage) {
    lines.push(`  ${item.id}: ${item.capability} / ${item.applicability}`);
    lines.push(`    ${item.formRef} -- ${item.locator}`);
    for (const evidence of item.evidence) {
      lines.push(`    ${evidence.fact}: ${evidence.decision}`);
    }
  }
  lines.push("", "EXTERNAL CHECKS");
  for (const check of report.externalChecks) {
    lines.push(`  ${check.id}: ${check.status}`);
    lines.push(`    ${check.message}`);
  }
  lines.push(
    "",
    "No filing, submission, or payment is authorized by this report.",
  );
  return lines.join("\n");
}

function formatEntry(e: DiagnosticEntry): string {
  const categoryLabel = e.category.replace(/_/g, " ");
  const lines: string[] = [];
  lines.push(`  ${e.ruleNumber}  ${capitalize(categoryLabel)}`);
  if (e.message) {
    // Wrap long messages at ~55 chars
    const wrapped = wordWrap(e.message, 54);
    for (const line of wrapped) {
      lines.push(`    ${line}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function padNum(n: number): string {
  return n.toLocaleString().padStart(8);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function wordWrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > width && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
