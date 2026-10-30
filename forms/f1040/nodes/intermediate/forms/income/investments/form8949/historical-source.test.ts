import { test, expect } from "bun:test";
import { assertHistoricalCapitalSource } from "./historical-source.ts";
import { historical8949ItemSchema } from "../../../../../inputs/income/investments/f8949/index.ts";
import { historicalScheduleDInputSchema } from "../../../../aggregation/income/investments/schedule_d/index.ts";

const transaction = { part:"C",description:"Synthetic digital asset",date_acquired:"2020-01-01",date_sold:"2023-06-01",proceeds:100,cost_basis:1000 };
test("historical discovery and execution reject post-2024 reporting boxes",()=>{
  expect(historical8949ItemSchema.safeParse(transaction).success).toBe(true);
  expect(historical8949ItemSchema.safeParse({...transaction,part:"I"}).success).toBe(false);
  expect(historicalScheduleDInputSchema.safeParse({transactions:[{...transaction,part:"I"}]}).success).toBe(false);
  expect(()=>assertHistoricalCapitalSource({...transaction,part:"I"},2023)).toThrow("A–F");
});
test("capital source disposition belongs to return year; various acquisition remains valid",()=>{
  expect(()=>assertHistoricalCapitalSource(transaction,2023)).not.toThrow();
  expect(()=>assertHistoricalCapitalSource({...transaction,date_acquired:"Various"},2023)).not.toThrow();
  expect(()=>assertHistoricalCapitalSource(transaction,2022)).toThrow("return year");
  expect(()=>assertHistoricalCapitalSource({...transaction,date_acquired:"2024-01-01"},2023)).toThrow("acquisition");
  expect(()=>assertHistoricalCapitalSource({...transaction,date_sold:"2023-02-31"},2023)).toThrow();
});
