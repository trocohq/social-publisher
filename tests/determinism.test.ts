import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignId,
  chooseSeeded,
  fingerprintCopy,
  normalizeCopy,
  sha256,
} from "../src/shared/determinism.js";

test("the same campaign inputs always produce the same identity and choice", () => {
  assert.equal(
    campaignId("2026-08-26", "troco_explains", 1, 0),
    "2026-08-26-troco-explains-v1-0",
  );
  assert.equal(
    chooseSeeded(["a", "b", "c"], "2026-08-26:1", 0),
    chooseSeeded(["a", "b", "c"], "2026-08-26:1", 0),
  );
  assert.equal(
    fingerprintCopy("  Troco  CERTO! "),
    fingerprintCopy("troco certo"),
  );
});

test("normalization removes accents and punctuation before hashing", () => {
  assert.equal(normalizeCopy("Troco exato: R$ 17,35!"), "troco exato r 17 35");
  assert.equal(sha256("Troco").length, 64);
});

test("seeded choice rejects an empty collection", () => {
  assert.throws(() => chooseSeeded([], "seed", 0), /empty collection/);
});
