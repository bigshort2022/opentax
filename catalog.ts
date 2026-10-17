import type { FormDefinition } from "./core/types/form-definition.ts";
import { f1040_2025 } from "./forms/f1040/2025/index.ts";
import type { ProductDefinition } from "./core/types/form-definition.ts";
import { ca540_2025 } from "./forms/ca540/2025/index.ts";

export const catalog: Record<string, FormDefinition> = {
  "f1040:2025": f1040_2025,
};

export const productCatalog: Record<string, ProductDefinition> = {
  ...catalog,
  "ca540:2025": ca540_2025,
};
