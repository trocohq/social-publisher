import assert from "node:assert/strict";
import test from "node:test";
import { mayDeleteStaticMedia } from "../src/static-editorial/retention.js";

const hashes = ["sha256:aaa", "sha256:bbb"];
const published = {
  logicalKey: "feed",
  state: "published" as const,
  ingestedAssetHashes: hashes,
};

test("retains media for queued, uncertain or pending Story consumers", () => {
  for (const state of [
    "accepted",
    "scheduled",
    "processing",
    "uncertain",
  ] as const)
    assert.equal(
      mayDeleteStaticMedia({
        now: "2026-10-20T00:00:00.000Z",
        assetHashes: hashes,
        retainUntil: "2026-10-01T00:00:00.000Z",
        consumers: [{ logicalKey: "feed", state }],
      }),
      false,
    );
  assert.equal(
    mayDeleteStaticMedia({
      now: "2026-10-20T00:00:00.000Z",
      assetHashes: hashes,
      retainUntil: "2026-10-01T00:00:00.000Z",
      consumers: [published, { logicalKey: "story", state: "scheduled" }],
    }),
    false,
  );
});

test("requires exact ingestion hashes and elapsed retention", () => {
  assert.equal(
    mayDeleteStaticMedia({
      now: "2026-10-20T00:00:00.000Z",
      assetHashes: hashes,
      retainUntil: "2026-10-01T00:00:00.000Z",
      consumers: [published],
    }),
    true,
  );
  assert.equal(
    mayDeleteStaticMedia({
      now: "2026-09-20T00:00:00.000Z",
      assetHashes: hashes,
      retainUntil: "2026-10-01T00:00:00.000Z",
      consumers: [published],
    }),
    false,
  );
  assert.equal(
    mayDeleteStaticMedia({
      now: "2026-10-20T00:00:00.000Z",
      assetHashes: hashes,
      retainUntil: "2026-10-01T00:00:00.000Z",
      consumers: [{ ...published, ingestedAssetHashes: [hashes[0]!] }],
    }),
    false,
  );
});
