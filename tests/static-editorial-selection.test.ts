import assert from "node:assert/strict";
import test from "node:test";

import { selectStaticAction } from "../src/static-editorial/selection.js";

const now = new Date("2026-09-14T12:00:00-03:00");
const base = {
  now,
  state: "approved" as const,
  hasAttempt: false,
  hasProviderId: false,
  hasPlatformId: false,
};

test("holds missed work and preflights only inside the lookahead", () => {
  assert.equal(
    selectStaticAction({ ...base, publishAt: "2026-09-14T11:59:59-03:00" }),
    "hold",
  );
  assert.equal(
    selectStaticAction({ ...base, publishAt: "2026-09-15T11:59:59-03:00" }),
    "preflight",
  );
  assert.equal(
    selectStaticAction({ ...base, publishAt: "2026-09-15T12:00:01-03:00" }),
    "none",
  );
});

test("reconciles identity before time and never reopens published work", () => {
  assert.equal(
    selectStaticAction({
      ...base,
      publishAt: "2026-09-14T10:00:00-03:00",
      hasProviderId: true,
    }),
    "reconcile",
  );
  assert.equal(
    selectStaticAction({
      ...base,
      publishAt: "2026-09-15T10:00:00-03:00",
      state: "published",
      hasAttempt: true,
    }),
    "none",
  );
});
