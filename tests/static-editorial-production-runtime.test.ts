import assert from "node:assert/strict";
import test from "node:test";

import { executePlannedStaticEditorial } from "../src/cli/execute-static-editorial.js";
import { createStaticProductionRuntime } from "../src/static-editorial/production-runtime.js";
import type {
  StaticStore,
  StoredStaticValue,
} from "../src/static-editorial/store.js";

function memoryStore(): StaticStore {
  const records = new Map<string, StoredStaticValue>();
  const handoffs = new Map<string, StoredStaticValue>();
  let version = 0;
  const read = async (map: Map<string, StoredStaticValue>, key: string) =>
    map.get(key) ?? null;
  const write = async (
    map: Map<string, StoredStaticValue>,
    key: string,
    expected: string | null,
    value: unknown,
  ) => {
    const current = map.get(key)?.version ?? null;
    if (current !== expected) throw new Error("conflict");
    const next = String(++version);
    map.set(key, { version: next, value });
    return { version: next };
  };
  return {
    read: (key) => read(records, key),
    compareAndSwap: (key, expected, value) =>
      write(records, key, expected, value),
    readHandoff: (key) => read(handoffs, key),
    compareAndSwapHandoff: (key, expected, value) =>
      write(handoffs, key, expected, value),
  };
}

const plan = {
  mode: "scheduled" as const,
  repositoryId: 123,
  ref: "a".repeat(40),
  status: "ready" as const,
};
const approvedInput = {
  entry: {
    schemaVersion: 1 as const,
    id: "troco-runtime-one",
    brand: "troco" as const,
    format: "image" as const,
    timeZone: "America/Sao_Paulo" as const,
    channels: [
      {
        channel: "instagram" as const,
        placement: "feed" as const,
        publishAt: "2026-10-01T12:00:00-03:00",
        copy: "Texto",
      },
    ],
    slides: [{ role: "cover" as const, title: "T", body: "B", alt: "A" }],
    entrySourceSha256: `sha256:${"a".repeat(64)}` as const,
    contentRevision: `sha256:${"b".repeat(64)}` as const,
  },
  approval: {
    schemaVersion: 1 as const,
    entryId: "troco-runtime-one",
    contentRevision: `sha256:${"b".repeat(64)}` as const,
    mediaRevision: `sha256:${"c".repeat(64)}` as const,
    actorId: "owner",
    approvedAt: "2026-09-26T20:00:00-03:00",
    artifacts: [
      {
        id: "slide-01",
        privatePath: "media/one/slide.jpg",
        publicUrl: "https://example.com/slide.jpg",
        sha256: `sha256:${"d".repeat(64)}` as const,
        byteLength: 10,
      },
    ],
  },
  artifacts: [
    {
      id: "slide-01",
      storage: "external" as const,
      sha256: "d".repeat(64),
      byteSize: 10,
      mediaType: "image/jpeg" as const,
      locator: "https://example.com/slide.jpg",
    },
  ],
};

test("persists once, preflights and verifies media before provider create", async () => {
  const events: string[] = [];
  const runtime = createStaticProductionRuntime({
    now: () => new Date("2026-09-30T16:00:00Z"),
    loadManifest: async () => [approvedInput],
    store: memoryStore(),
    expectedAccountIds: { instagram: "ig", facebook: "fb" },
    preflight: async () => events.push("preflight"),
    verifyPublic: async () => events.push("verify"),
    create: async () => {
      events.push("create");
      return { providerId: "provider-1" };
    },
    reconcile: async () => ({
      kind: "found",
      providerId: "provider-1",
      status: "scheduled",
    }),
  });
  assert.deepEqual(await executePlannedStaticEditorial({ plan, runtime }), {
    reconciled: 0,
    uncertain: 0,
    accepted: 1,
    held: 0,
    failed: 0,
  });
  assert.deepEqual(events, ["preflight", "verify", "create"]);
  assert.deepEqual(await executePlannedStaticEditorial({ plan, runtime }), {
    reconciled: 1,
    uncertain: 0,
    accepted: 0,
    held: 0,
    failed: 0,
  });
  assert.deepEqual(events, ["preflight", "verify", "create"]);
});

test("does not call a provider outside the 24-hour window", async () => {
  let calls = 0;
  const runtime = createStaticProductionRuntime({
    now: () => new Date("2026-09-29T12:00:00Z"),
    loadManifest: async () => [approvedInput],
    store: memoryStore(),
    expectedAccountIds: { instagram: "ig", facebook: "fb" },
    preflight: async () => {
      calls += 1;
    },
    verifyPublic: async () => undefined,
    create: async () => ({ providerId: "never" }),
    reconcile: async () => ({ kind: "missing" }),
  });
  assert.deepEqual(await executePlannedStaticEditorial({ plan, runtime }), {
    reconciled: 0,
    uncertain: 0,
    accepted: 0,
    held: 0,
    failed: 0,
  });
  assert.equal(calls, 0);
});

test("durably holds missed work without provider access", async () => {
  let calls = 0;
  const runtime = createStaticProductionRuntime({
    now: () => new Date("2026-10-01T16:00:01Z"),
    loadManifest: async () => [approvedInput],
    store: memoryStore(),
    expectedAccountIds: { instagram: "ig", facebook: "fb" },
    preflight: async () => {
      calls += 1;
    },
    verifyPublic: async () => undefined,
    create: async () => ({ providerId: "never" }),
    reconcile: async () => ({ kind: "missing" }),
  });
  for (let run = 0; run < 2; run += 1)
    assert.deepEqual(await executePlannedStaticEditorial({ plan, runtime }), {
      reconciled: 0,
      uncertain: 0,
      accepted: 0,
      held: 1,
      failed: 0,
    });
  assert.equal(calls, 0);
});
