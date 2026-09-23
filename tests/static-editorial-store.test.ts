import assert from "node:assert/strict";
import test from "node:test";

import {
  openPrivateStaticStore,
  type StaticStoreBackend,
} from "../src/static-editorial/store.js";

function memoryBackend(
  identity = {
    accountId: "troco-private",
    namespace: "static-editorial/v1",
    private: true,
  },
) {
  const files = new Map<string, { bytes: Uint8Array; version: string }>();
  const paths: string[] = [];
  const backend: StaticStoreBackend = {
    identity: async () => identity,
    read: async (path) => {
      paths.push(path);
      return files.get(path) ?? null;
    },
    compareAndSwap: async ({ path, expectedVersion, bytes }) => {
      paths.push(path);
      const current = files.get(path);
      if ((current?.version ?? null) !== expectedVersion)
        throw new Error("CONFLICT");
      const version = `v${files.size + 1}`;
      files.set(path, { bytes, version });
      return version;
    },
  };
  return { backend, paths };
}

test("stores versioned records and exact staged handoffs separately", async () => {
  const memory = memoryBackend();
  const store = await openPrivateStaticStore({
    backend: memory.backend,
    expectedAccountId: "troco-private",
    expectedNamespace: "static-editorial/v1",
  });
  const record = await store.compareAndSwap(
    "troco-editorial-0001:instagram:feed",
    null,
    { state: "intent" },
  );
  assert.deepEqual(await store.read("troco-editorial-0001:instagram:feed"), {
    version: record.version,
    value: { state: "intent" },
  });
  const handoff = await store.compareAndSwapHandoff(
    "troco-editorial-0001:instagram:feed",
    null,
    { envelope: { exact: true } },
  );
  assert.deepEqual(
    await store.readHandoff("troco-editorial-0001:instagram:feed"),
    { version: handoff.version, value: { envelope: { exact: true } } },
  );
  assert.ok(memory.paths.some((path) => path.startsWith("records/")));
  assert.ok(memory.paths.some((path) => path.startsWith("handoffs/")));
});

test("rejects public identity and oversized values before writing", async () => {
  const publicBackend = memoryBackend({
    accountId: "troco-private",
    namespace: "static-editorial/v1",
    private: false,
  });
  await assert.rejects(
    () =>
      openPrivateStaticStore({
        backend: publicBackend.backend,
        expectedAccountId: "troco-private",
        expectedNamespace: "static-editorial/v1",
      }),
    /STATIC_STORE_IDENTITY_INVALID/u,
  );
  const memory = memoryBackend();
  const store = await openPrivateStaticStore({
    backend: memory.backend,
    expectedAccountId: "troco-private",
    expectedNamespace: "static-editorial/v1",
    maxBytes: 128,
  });
  await assert.rejects(
    () =>
      store.compareAndSwap("troco-editorial-0001:instagram:feed", null, {
        body: "x".repeat(200),
      }),
    /STATIC_STORE_SIZE_EXCEEDED/u,
  );
});
