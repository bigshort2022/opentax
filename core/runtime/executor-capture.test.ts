import { test } from "bun:test";
import { assertEquals } from "@std/assert";
import { z } from "zod";
import type { NodeContext } from "../types/node-context.ts";
import type { NodeRegistry } from "../types/node-registry.ts";
import { OutputNodes } from "../types/output-nodes.ts";
import { type NodeResult, TaxNode, UnimplementedTaxNode } from "../types/tax-node.ts";
import { execute } from "./executor.ts";

const context: NodeContext = { taxYear: 2025, formType: "f1040" };

class CaptureNode extends TaxNode {
  readonly outputNodes = new OutputNodes([]);
  constructor(
    readonly nodeType: string,
    readonly inputSchema: z.ZodTypeAny,
    private readonly run: (input: unknown) => NodeResult,
    override readonly contextFields: readonly string[] = [],
  ) {
    super();
  }
  compute(_context: NodeContext, input: unknown): NodeResult {
    return this.run(input);
  }
}

function run(registry: NodeRegistry, captureExecution?: boolean) {
  const plan = Object.keys(registry).map((nodeType) => ({ id: nodeType, nodeType }));
  return execute(plan, registry, {}, { ...context, captureExecution });
}

test("execution capture distinguishes computed no-output, optional inactive, failed and unavailable", () => {
  const required = z.object({ amount: z.number(), filing_status: z.string().optional() });
  const optional = (name: string) => new CaptureNode(name, required, () => {
    throw new Error("invalid optional inputs must not compute");
  }, ["filing_status"]);
  const registry: NodeRegistry = {
    start: new CaptureNode("start", z.object({}), () => ({ outputs: [
      { nodeType: "context_only", fields: { filing_status: "single" } },
      { nodeType: "invalid", fields: { amount: "invalid" } },
    ] })),
    completed: new CaptureNode("completed", z.object({}), () => ({ outputs: [] })),
    empty: optional("empty"),
    context_only: optional("context_only"),
    invalid: optional("invalid"),
    throwing: new CaptureNode("throwing", z.object({}), () => { throw new Error("compute failed"); }),
    unimplemented: new UnimplementedTaxNode("unimplemented"),
  };
  const plan = [...Object.keys(registry).map((nodeType) => ({ id: nodeType, nodeType })),
    { id: "missing_instance", nodeType: "missing" }];
  const result = execute(plan, registry, {}, { ...context, captureExecution: true });
  assertEquals(result.execution?.completed, { nodeType: "completed", status: "computed", input: {}, outputs: [] });
  assertEquals(result.execution?.empty, { nodeType: "empty", status: "inactive", input: {} });
  assertEquals(result.execution?.context_only, { nodeType: "context_only", status: "inactive", input: { filing_status: "single" } });
  assertEquals(result.execution?.invalid, { nodeType: "invalid", status: "failed" });
  assertEquals(result.execution?.throwing, { nodeType: "throwing", status: "failed" });
  assertEquals(result.execution?.unimplemented, { nodeType: "unimplemented", status: "unavailable" });
  assertEquals(result.execution?.missing_instance, { nodeType: "missing", status: "unavailable" });
  assertEquals(result.diagnostics.map((entry) => entry.nodeId), ["invalid", "throwing"]);
  assertEquals(result.pending.context_only, undefined);
  assertEquals(result.pending.invalid, { amount: "invalid" });
});


test("execution capture is absent by default and does not change financial results", () => {
  const registry: NodeRegistry = {
    start: new CaptureNode("start", z.object({}), () => ({ outputs: [
      { nodeType: "sink", fields: { wages: 15_000, refund: 312 } },
    ], carryforwards: { retained: 25 } })),
    sink: new CaptureNode("sink", z.object({ wages: z.number(), refund: z.number() }), () => ({ outputs: [] })),
  };
  const plain = run(registry);
  const disabled = run(registry, false);
  const captured = run(registry, true);
  assertEquals(Object.hasOwn(plain, "execution"), false);
  assertEquals(Object.hasOwn(disabled, "execution"), false);
  assertEquals(captured.pending, plain.pending);
  assertEquals(captured.diagnostics, plain.diagnostics);
  assertEquals(captured.carryforwards, plain.carryforwards);
  assertEquals(plain.pending.sink, { wages: 15_000, refund: 312 });
});

for (const failure of ["merge", "finalization"] as const) {
  test(`execution capture discards successful evidence after ${failure} failure`, () => {
    const brokenFields = Object.defineProperty({}, "amount", {
      enumerable: true,
      get() { throw new Error("output merge failed"); },
    });
    const registry: NodeRegistry = {
      start: new CaptureNode("start", z.object({}), () => ({
        outputs: [{ nodeType: "sink", fields: { amount: 312 } },
          ...(failure === "merge" ? [{ nodeType: "sink", fields: brokenFields }] : [])],
        ...(failure === "finalization" ? {
          finalizations: [{ nodeType: "missing", fields: { amount: 0 } }],
        } : {}),
      })),
      sink: new CaptureNode("sink", z.object({ amount: z.number() }), () => ({ outputs: [] })),
    };
    const result = run(registry, true);
    assertEquals(result.execution?.start, { nodeType: "start", status: "failed" });
    assertEquals(result.execution?.sink?.status, "computed");
    assertEquals(result.diagnostics.length, 1);
    // Capture must not roll back or otherwise alter existing partial-output semantics.
    assertEquals(result.pending.sink, { amount: 312 });
    assertEquals(result.pending, run(registry).pending);
  });
}

test("execution capture retains optional skip facts before later pending deposits", () => {
  const registry: NodeRegistry = {
    start: new CaptureNode("start", z.object({}), () => ({
      outputs: [{ nodeType: "optional", fields: { filing_status: "single" } }],
    })),
    optional: new CaptureNode("optional", z.object({ amount: z.number() }), () => {
      throw new Error("optional node must not compute");
    }, ["filing_status"]),
    later: new CaptureNode("later", z.object({}), () => ({
      outputs: [{ nodeType: "optional", fields: { amount: 312 } }],
    })),
  };
  const result = run(registry, true);
  assertEquals(result.execution?.optional, {
    nodeType: "optional", status: "inactive", input: { filing_status: "single" },
  });
  assertEquals(result.pending.optional, { filing_status: "single", amount: 312 });
});
