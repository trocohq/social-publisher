import assert from "node:assert/strict";
import test from "node:test";

import {
  checkStaticEditorialAccess,
  planStaticAccessCheck,
} from "../src/cli/check-static-editorial-access.js";

const env = {
  STATIC_EDITORIAL_REPOSITORY: "trocohq/editorial-inputs",
  STATIC_EDITORIAL_REPOSITORY_ID: "1383667841",
  STATIC_EDITORIAL_REF: "a".repeat(40),
  PRIVATE_EDITORIAL_TOKEN: "token",
};

test("verifies the exact private repository and pinned commit without writing", async () => {
  const requests: Request[] = [];
  const result = await checkStaticEditorialAccess(
    planStaticAccessCheck(env),
    async (request) => {
      requests.push(request);
      if (request.url.endsWith("/repos/trocohq/editorial-inputs"))
        return new Response(
          JSON.stringify({
            id: 1383667841,
            full_name: "trocohq/editorial-inputs",
            private: true,
          }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({
          type: "file",
          encoding: "base64",
          content: "Cg==",
        }),
        { status: 200 },
      );
    },
  );
  assert.deepEqual(result, {
    status: "verified",
    repositoryId: 1383667841,
    ref: "a".repeat(40),
  });
  assert.equal(requests.length, 2);
  assert.equal(
    requests.every((request) => request.method === "GET"),
    true,
  );
});

test("fails closed for a mutable ref or mismatched private identity", async () => {
  assert.throws(
    () => planStaticAccessCheck({ ...env, STATIC_EDITORIAL_REF: "main" }),
    /STATIC_ACCESS_CONFIG_INVALID/u,
  );
  await assert.rejects(
    () =>
      checkStaticEditorialAccess(planStaticAccessCheck(env), async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 1383667841,
              full_name: "trocohq/editorial-inputs",
              private: false,
            }),
            { status: 200 },
          ),
        ),
      ),
    /STATIC_PRIVATE_REPOSITORY_MISMATCH/u,
  );
});
