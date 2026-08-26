import assert from "node:assert/strict";
import test from "node:test";

import { incidentMutation } from "../src/incidents/github.js";

test("a repeated failure updates one labeled incident and recovery closes it", () => {
  const active = {
    number: 17,
    state: "open" as const,
    labels: [{ name: "social-publisher-incident" }],
  };
  assert.deepEqual(incidentMutation("failure", active), {
    kind: "update",
    issueNumber: 17,
  });
  assert.deepEqual(incidentMutation("recovery", active), {
    kind: "close",
    issueNumber: 17,
  });
  assert.deepEqual(incidentMutation("recovery", undefined), { kind: "none" });
});

test("multiple active incidents fail instead of selecting one", () => {
  assert.throws(
    () =>
      incidentMutation("failure", [
        {
          number: 17,
          state: "open",
          labels: [{ name: "social-publisher-incident" }],
        },
        {
          number: 18,
          state: "open",
          labels: [{ name: "social-publisher-incident" }],
        },
      ]),
    /multiple open/i,
  );
});
