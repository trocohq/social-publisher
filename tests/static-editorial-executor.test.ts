import assert from "node:assert/strict";
import test from "node:test";

import {
  executeStaticIntent,
  type StaticExecutionStore,
} from "../src/static-editorial/executor.js";

const intent = {
  logicalKey: "troco-editorial-0001:instagram:feed",
  fence: 2,
  envelopeSha256: `sha256:${"a".repeat(64)}` as const,
  envelope: { dueAt: "2026-09-20T15:00:00.000Z", images: ["sha256:media"] },
};

function memoryStore(existing: "none" | "intent" | "uncertain" = "none") {
  let state = existing;
  const events: string[] = [];
  const store: StaticExecutionStore = {
    claim: async (_key, fence) => {
      events.push(`claim:${fence}`);
      return fence === 2;
    },
    read: async () => (state === "none" ? null : { ...intent, state }),
    persistIntent: async () => {
      events.push("intent");
      state = "intent";
    },
    persistOutcome: async (_key, outcome) => {
      events.push(outcome);
      state = outcome;
    },
  };
  return { store, events };
}

test("persists intent before one provider create", async () => {
  const target = memoryStore();
  const result = await executeStaticIntent({
    intent,
    store: target.store,
    transport: {
      create: async () => {
        target.events.push("create");
        return { kind: "accepted", providerId: "buffer-1" };
      },
      reconcile: async () => ({ kind: "missing" }),
    },
  });
  assert.deepEqual(result, { kind: "accepted", providerId: "buffer-1" });
  assert.deepEqual(target.events, ["claim:2", "intent", "create", "accepted"]);
});

test("reconciles an uncertain create without creating twice", async () => {
  const target = memoryStore();
  let creates = 0;
  assert.deepEqual(
    await executeStaticIntent({
      intent,
      store: target.store,
      transport: {
        create: async () => {
          creates++;
          throw new Error("timeout");
        },
        reconcile: async () => ({ kind: "missing" }),
      },
    }),
    { kind: "uncertain" },
  );
  await executeStaticIntent({
    intent,
    store: target.store,
    transport: {
      create: async () => {
        creates++;
        return { kind: "accepted", providerId: "duplicate" };
      },
      reconcile: async () => ({
        kind: "found",
        providerId: "buffer-1",
        status: "scheduled",
      }),
    },
  });
  assert.equal(creates, 1);
});

test("stops a stale fence before provider access", async () => {
  const target = memoryStore();
  await assert.rejects(
    () =>
      executeStaticIntent({
        intent: { ...intent, fence: 1 },
        store: target.store,
        transport: {
          create: async () => ({ kind: "accepted", providerId: "bad" }),
          reconcile: async () => ({ kind: "missing" }),
        },
      }),
    /STATIC_EXECUTION_NOT_OWNER/u,
  );
  assert.deepEqual(target.events, ["claim:1"]);
});
