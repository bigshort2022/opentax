import type { PaperFormDefinition } from "../../../core/types/form-definition.ts";
import type { TaxNode } from "../../../core/types/tax-node.ts";
import { registry } from "../2025/registry.ts";
import { executeF1040Return } from "../2025/return-processing/execute_return.ts";
import { historicalInputCapabilities } from "./capabilities.ts";
import { historicalPreparationIssues } from "./validation.ts";
import { buildHistoricalPdfBytes, type HistoricalTaxYear } from "./pdf/builder.ts";

/** Do not expose unrelated, unconnected legacy nodes as historical capabilities. */
function historicalRegistry(start: TaxNode): PaperFormDefinition["registry"] {
  const reachable: Record<string, TaxNode> = { start };
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    for (const nodeType of queue[index].outputNodeTypes) {
      if (Object.hasOwn(reachable, nodeType)) continue;
      const node = registry[nodeType];
      if (!node || node.nodeType !== nodeType) continue;
      reachable[nodeType] = node;
      queue.push(node);
    }
  }
  return reachable;
}

/** One shared calculation graph, with an explicit year and bounded public sources. */
export function historical1040(taxYear: HistoricalTaxYear): PaperFormDefinition {
  const capabilities = historicalInputCapabilities(taxYear);
  const context = { taxYear, formType: "f1040" };
  return {
    formType: context.formType,
    taxYear,
    preparationMode: "paper",
    paperAvailable: true,
    inputNodes: capabilities.entries,
    registry: historicalRegistry(capabilities.start),
    sourceSchema: capabilities.sourceSchema,
    assertInput: capabilities.assertInput,
    executeReturn: (inputs) => {
      capabilities.assertInput("start", inputs);
      return executeF1040Return(inputs, context);
    },
    preparationIssues: (inputs, pending) => historicalPreparationIssues(taxYear, inputs, pending),
    buildPdfBytes: (pending, filer, options) => buildHistoricalPdfBytes(taxYear, pending, filer, options),
    // Paper consumes the complete graph source; there is no MeF-specific projection.
    buildPending: (pending) => pending,
  };
}
