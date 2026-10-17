import { assertEquals, assertThrows } from "@std/assert";
import {
  deriveLocalReadiness,
  GateId,
  gateResultSchema,
  GateStatus,
  LocalReadiness,
  readinessResultSchema,
} from "./readiness.ts";

const passes = () =>
  Object.values(GateId).map((id) => ({
    id,
    status: GateStatus.Passed,
    diagnosticCodes: [],
  }));

Deno.test("local readiness requires every mandatory gate exactly once", () => {
  assertEquals(deriveLocalReadiness(passes()), {
    status: LocalReadiness.Ready,
    canFile: true,
    missingGateIds: [],
  });
  for (const id of Object.values(GateId)) {
    const result = deriveLocalReadiness(
      passes().filter((gate) => gate.id !== id),
    );
    assertEquals(result.status, LocalReadiness.Indeterminate);
    assertEquals(result.canFile, false);
    assertEquals(result.missingGateIds, [id]);
  }
  assertEquals(deriveLocalReadiness([]), {
    status: LocalReadiness.Indeterminate,
    canFile: false,
    missingGateIds: Object.values(GateId),
  });
});

Deno.test("every mandatory non-pass prevents local readiness", () => {
  for (const id of Object.values(GateId)) {
    for (const status of Object.values(GateStatus)) {
      if (status === GateStatus.Passed) continue;
      const result = deriveLocalReadiness(
        passes().map((gate) =>
          gate.id === id
            ? { ...gate, status, diagnosticCodes: ["TEST_REQUIRED"] }
            : gate
        ),
      );
      assertEquals(result.canFile, false);
      assertEquals(
        result.status,
        status === GateStatus.Failed || status === GateStatus.Unsupported
          ? LocalReadiness.Blocked
          : LocalReadiness.Indeterminate,
      );
    }
  }
});

Deno.test("known failures remain blocking alongside unavailable checks", () => {
  const result = deriveLocalReadiness(
    passes().map((gate) => ({
      ...gate,
      status: gate.id === GateId.Scope
        ? GateStatus.Unsupported
        : GateStatus.Unavailable,
    })),
  );
  assertEquals(result.status, LocalReadiness.Blocked);
  assertEquals(result.canFile, false);
});

Deno.test("duplicate gates cannot replace missing checks", () => {
  const gates = passes();
  assertThrows(() => deriveLocalReadiness([...gates, gates[0]]), TypeError);
  assertThrows(
    () => deriveLocalReadiness(gates.map(() => gates[0])),
    TypeError,
  );
});

Deno.test("serialized gates reject unknown IDs statuses and properties", () => {
  const gate = passes()[0];
  assertThrows(() => gateResultSchema.parse({ ...gate, id: "custom_bypass" }));
  assertThrows(() =>
    gateResultSchema.parse({ ...gate, status: "not_applicable" })
  );
  assertThrows(() => gateResultSchema.parse({ ...gate, status: "skipped" }));
  assertThrows(() => gateResultSchema.parse({ ...gate, bypass: true }));
});

Deno.test("serialized readiness cannot contradict its filing boolean or missing gates", () => {
  assertThrows(() =>
    readinessResultSchema.parse({
      status: LocalReadiness.Ready,
      canFile: false,
      missingGateIds: [],
    })
  );
  assertThrows(() =>
    readinessResultSchema.parse({
      status: LocalReadiness.Blocked,
      canFile: true,
      missingGateIds: [],
    })
  );
  assertThrows(() =>
    readinessResultSchema.parse({
      status: LocalReadiness.Ready,
      canFile: true,
      missingGateIds: [GateId.Inputs],
    })
  );
});
