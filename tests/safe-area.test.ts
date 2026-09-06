import assert from "node:assert/strict";
import test from "node:test";

import { safeAreaFor } from "../src/render/safe-area.js";

test("feed safe area preserves the approved 40 by 60 reference", () => {
  assert.deepEqual(safeAreaFor(1080, 1350), {
    x: 40,
    y: 60,
    right: 1040,
    bottom: 1290,
    width: 1000,
    height: 1230,
  });
});

test("vertical safe area scales the vertical margin proportionally", () => {
  assert.deepEqual(safeAreaFor(1080, 1920), {
    x: 40,
    y: 85,
    right: 1040,
    bottom: 1835,
    width: 1000,
    height: 1750,
  });
});

test("safe area rejects invalid canvas dimensions", () => {
  assert.throws(() => safeAreaFor(0, 1350), /positive integers/);
  assert.throws(() => safeAreaFor(1080, 1.5), /positive integers/);
});
