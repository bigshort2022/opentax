import type { StateFormDefinition } from "../../../core/types/form-definition.ts";
import { calculateForm540 } from "./calculation.ts";
import { form540InputSchema } from "./input.ts";
import { buildWorksheetPdf } from "./worksheet.ts";

export const ca540_2025: StateFormDefinition = {
  kind: "state-paper",
  formType: "ca540",
  taxYear: 2025,
  inputKey: "ca540",
  inputSchema: form540InputSchema,
  calculate: (input) => calculateForm540(form540InputSchema.parse(input)),
  buildWorksheetPdf,
};
