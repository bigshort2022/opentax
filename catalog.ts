import type { FormDefinition } from "./core/types/form-definition.ts";
import { f1040_2021 } from "./forms/f1040/2021/index.ts";
import { f1040_2022 } from "./forms/f1040/2022/index.ts";
import { f1040_2023 } from "./forms/f1040/2023/index.ts";
import { f1040_2024 } from "./forms/f1040/2024/index.ts";
import { f1040_2025 } from "./forms/f1040/2025/index.ts";
import { f1040_2026 } from "./forms/f1040/2026/index.ts";
import { f4868_2026 } from "./forms/f4868/2026/index.ts";

export const catalog: Record<string, FormDefinition> = {
  "f1040:2021": f1040_2021,
  "f1040:2022": f1040_2022,
  "f1040:2023": f1040_2023,
  "f1040:2024": f1040_2024,
  "f1040:2025": f1040_2025,
  "f1040:2026": f1040_2026,
  "f4868:2026": f4868_2026,
};
