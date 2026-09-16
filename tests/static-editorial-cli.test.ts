import assert from "node:assert/strict";
import test from "node:test";
import { planStaticEditorialExecution } from "../src/cli/execute-static-editorial.js";

const env = {
  STATIC_EDITORIAL_ENABLED: "true",
  ZERO_COST_CONFIRMED: "true",
  GITHUB_EVENT_NAME: "schedule",
  STATIC_EDITORIAL_REPOSITORY: "trocohq/private-editorial",
  STATIC_EDITORIAL_REPOSITORY_ID: "456",
  STATIC_EDITORIAL_REF: "b".repeat(40),
  PRIVATE_EDITORIAL_TOKEN: "secret",
  STATIC_STATE_TOKEN: "state",
  BUFFER_API_KEY: "buffer",
};

test("accepts schedule events and dispatched reconciliation only", () => {
  assert.deepEqual(
    planStaticEditorialExecution({ args: ["--mode", "scheduled"], env }),
    {
      mode: "scheduled",
      repositoryId: 456,
      ref: "b".repeat(40),
      status: "ready",
    },
  );
  assert.deepEqual(
    planStaticEditorialExecution({
      args: ["--mode", "reconcile-only"],
      env: { ...env, GITHUB_EVENT_NAME: "workflow_dispatch" },
    }),
    {
      mode: "reconcile-only",
      repositoryId: 456,
      ref: "b".repeat(40),
      status: "ready",
    },
  );
  assert.throws(
    () =>
      planStaticEditorialExecution({
        args: ["--mode", "scheduled"],
        env: { ...env, GITHUB_EVENT_NAME: "workflow_dispatch" },
      }),
    /STATIC_EXECUTION_MODE_FORBIDDEN/u,
  );
});

test("fails closed without enablement, free evidence or scoped credentials", () => {
  for (const name of [
    "STATIC_EDITORIAL_ENABLED",
    "ZERO_COST_CONFIRMED",
    "PRIVATE_EDITORIAL_TOKEN",
    "STATIC_STATE_TOKEN",
    "BUFFER_API_KEY",
  ])
    assert.throws(() =>
      planStaticEditorialExecution({
        args: ["--mode", "scheduled"],
        env: { ...env, [name]: "" },
      }),
    );
});

test("returns only opaque execution metadata", () => {
  const result = JSON.stringify(
    planStaticEditorialExecution({ args: ["--mode", "scheduled"], env }),
  );
  assert.doesNotMatch(result, /private-editorial|secret|buffer/u);
});
