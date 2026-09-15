import assert from "node:assert/strict";
import test from "node:test";

import {
  executeStaticIntent,
  executeStaticIntentWithCas,
  type StaticExecutionStore,
} from "../src/static-editorial/executor.js";
import type {
  StaticStore,
  StoredStaticValue,
} from "../src/static-editorial/store.js";

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

function casStore(): StaticStore {
  const records = new Map<string, StoredStaticValue>();
  const handoffs = new Map<string, StoredStaticValue>();
  let version = 0;
  const cas = async (
    target: Map<string, StoredStaticValue>,
    key: string,
    expected: string | null,
    value: unknown,
  ) => {
    await Promise.resolve();
    if ((target.get(key)?.version ?? null) !== expected)
      throw new Error("STATIC_STORE_CONFLICT");
    const next = { version: `v${++version}`, value };
    target.set(key, next);
    return { version: next.version };
  };
  return {
    read: async (key) => records.get(key) ?? null,
    compareAndSwap: (key, expected, value) =>
      cas(records, key, expected, value),
    readHandoff: async (key) => handoffs.get(key) ?? null,
    compareAndSwapHandoff: (key, expected, value) =>
      cas(handoffs, key, expected, value),
  };
}

test("allows only one concurrent CAS owner to create", async () => {
  const store = casStore();
  let creates = 0;
  const transport = {
    create: async () => {
      creates++;
      return { kind: "accepted" as const, providerId: "buffer-1" };
    },
    reconcile: async () => ({ kind: "missing" as const }),
  };
  await Promise.allSettled([
    executeStaticIntentWithCas({ intent, store, transport }),
    executeStaticIntentWithCas({ intent, store, transport }),
  ]);
  assert.equal(creates, 1);
});

test("reconciles persisted intent and refuses edited recovery input", async () => {
  const store = casStore();
  let creates = 0;
  const transport = {
    create: async () => {
      creates++;
      return { kind: "accepted" as const, providerId: "buffer-1" };
    },
    reconcile: async () => ({
      kind: "found" as const,
      providerId: "buffer-1",
      status: "scheduled" as const,
    }),
  };
  await assert.rejects(
    () =>
      executeStaticIntentWithCas({
        intent,
        store,
        transport,
        failpoint: "after-intent",
      }),
    /STATIC_EXECUTION_FAILPOINT/u,
  );
  await assert.rejects(
    () =>
      executeStaticIntentWithCas({
        intent: { ...intent, envelope: { edited: true } },
        store,
        transport,
      }),
    /STATIC_EXECUTION_INTENT_MISMATCH/u,
  );
  assert.deepEqual(
    await executeStaticIntentWithCas({ intent, store, transport }),
    { kind: "found", providerId: "buffer-1", status: "scheduled" },
  );
  assert.equal(creates, 0);
});

test("treats acceptance before receipt persistence as uncertain without another create", async () => {
  const store = casStore();
  let creates = 0;
  const transport = {
    create: async () => {
      creates++;
      return { kind: "accepted" as const, providerId: "buffer-1" };
    },
    reconcile: async () => ({
      kind: "found" as const,
      providerId: "buffer-1",
      status: "scheduled" as const,
    }),
  };
  assert.deepEqual(
    await executeStaticIntentWithCas({
      intent,
      store,
      transport,
      failpoint: "after-create",
    }),
    { kind: "uncertain" },
  );
  assert.deepEqual(
    await executeStaticIntentWithCas({ intent, store, transport }),
    { kind: "found", providerId: "buffer-1", status: "scheduled" },
  );
  assert.equal(creates, 1);
});
