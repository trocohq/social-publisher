import assert from "node:assert/strict";
import test from "node:test";

import {
  approveStaticPreview,
  type ApprovalStore,
} from "../src/static-editorial/approval.js";

const revision = `sha256:${"a".repeat(64)}` as const;
const preview = {
  entryId: "troco-editorial-0001",
  contentRevision: `sha256:${"b".repeat(64)}` as const,
  mediaRevision: revision,
  assets: [
    { filename: "static-01.jpg", sha256: `sha256:${"c".repeat(64)}` as const },
  ],
};

function memoryStore() {
  const records = new Map<string, unknown>();
  const store: ApprovalStore = {
    read: async (id, value) => records.get(`${id}:${value}`) ?? null,
    createExclusive: async (id, value, record) => {
      const key = `${id}:${value}`;
      if (records.has(key)) throw new Error("APPROVAL_ALREADY_EXISTS");
      records.set(key, record);
    },
  };
  return { store, records };
}

test("binds one authenticated approval to exact source and media bytes", async () => {
  const target = memoryStore();
  const request = {
    actorId: "owner",
    authenticated: true,
    approvedRevision: revision,
    approvedAt: "2026-09-14T12:00:00-03:00",
    action: "approve-static-preview" as const,
  };
  const first = await approveStaticPreview({
    preview,
    currentSource: preview.contentRevision,
    currentAssets: preview.assets,
    request,
    store: target.store,
  });
  const second = await approveStaticPreview({
    preview,
    currentSource: preview.contentRevision,
    currentAssets: preview.assets,
    request,
    store: target.store,
  });
  assert.deepEqual(second, first);
  assert.equal(target.records.size, 1);
});

test("rejects edited or unauthenticated previews without a store write", async () => {
  for (const candidate of [
    {
      currentSource: `sha256:${"d".repeat(64)}`,
      currentAssets: preview.assets,
      authenticated: true,
    },
    {
      currentSource: preview.contentRevision,
      currentAssets: [
        { ...preview.assets[0]!, sha256: `sha256:${"e".repeat(64)}` },
      ],
      authenticated: true,
    },
    {
      currentSource: preview.contentRevision,
      currentAssets: preview.assets,
      authenticated: false,
    },
  ] as const) {
    const target = memoryStore();
    await assert.rejects(() =>
      approveStaticPreview({
        preview,
        currentSource: candidate.currentSource,
        currentAssets: candidate.currentAssets,
        request: {
          actorId: "owner",
          authenticated: candidate.authenticated,
          approvedRevision: revision,
          approvedAt: "2026-09-14T12:00:00-03:00",
          action: "approve-static-preview",
        },
        store: target.store,
      }),
    );
    assert.equal(target.records.size, 0);
  }
});
