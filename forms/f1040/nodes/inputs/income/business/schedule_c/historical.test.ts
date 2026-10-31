import { test } from "bun:test";
import { assertEquals, assertThrows } from "@std/assert";
import { scheduleC, itemSchema, inputSchema, computeTotalExpenses } from "./index.ts";

const meals = {
  line_a_principal_business: "Synthetic consulting",
  line_b_business_code: "541990",
  line_f_accounting_method: "cash",
  line_g_material_participation: true,
  line_1_gross_receipts: 10000,
  line_24b_meals: 1000,
  restaurant_meals: [{ amount: 600, paid_or_incurred_on: "2022-06-15", restaurant_source_reference: "synthetic business restaurant receipt", business_meal_requirements_met: true }],
};

test("2021 and 2022 restaurant meals are fully deductible while other meals remain half", () => {
  assertEquals(computeTotalExpenses(itemSchema.parse(meals)), 800);
  assertEquals(computeTotalExpenses(itemSchema.parse({ ...meals, restaurant_meals: undefined })), 500);
});

test("Schedule C restaurant source cannot cross the selected return year", () => {
  assertThrows(() => scheduleC.compute({ taxYear: 2023, formType: "f1040" }, inputSchema.parse({ schedule_cs: [meals] })), Error, "meal source");
  assertThrows(() => computeTotalExpenses(itemSchema.parse({ ...meals, restaurant_meals: [{ ...meals.restaurant_meals[0], amount: 1001 }] })), Error, "restaurant");
});
