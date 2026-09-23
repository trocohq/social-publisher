import assert from "node:assert/strict";
import test from "node:test";
import {
  createGitHubPrivateInputTransport,
  createGitHubStaticStoreBackend,
} from "../src/static-editorial/github-runtime.js";

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("reads pinned private input and implements exact-version CAS", async () => {
  const requests: Request[] = [];
  const fetchImplementation = (request: Request) => {
    requests.push(request);
    if (
      request.method === "GET" &&
      request.url.endsWith("/repos/trocohq/private-state")
    )
      return Promise.resolve(
        response(200, {
          id: 456,
          full_name: "trocohq/private-state",
          private: true,
        }),
      );
    if (request.method === "GET" && request.url.includes("/contents/records/"))
      return Promise.resolve(
        response(200, {
          type: "file",
          sha: "old-sha",
          encoding: "base64",
          content: Buffer.from("bytes").toString("base64"),
        }),
      );
    if (request.method === "PUT")
      return Promise.resolve(response(200, { content: { sha: "new-sha" } }));
    if (request.url.endsWith("/repos/trocohq/private-editorial"))
      return Promise.resolve(
        response(200, {
          id: 123,
          full_name: "trocohq/private-editorial",
          private: true,
        }),
      );
    return Promise.resolve(
      response(200, {
        type: "file",
        encoding: "base64",
        content: Buffer.from("fixture").toString("base64"),
      }),
    );
  };
  const transport = createGitHubPrivateInputTransport(
    "input-token",
    fetchImplementation,
  );
  assert.deepEqual(await transport.repository("trocohq/private-editorial"), {
    id: 123,
    fullName: "trocohq/private-editorial",
    private: true,
    authenticated: true,
  });
  assert.deepEqual(
    await transport.readFile(
      "trocohq/private-editorial",
      "a".repeat(40),
      "batches/a.md",
    ),
    new TextEncoder().encode("fixture"),
  );
  const backend = createGitHubStaticStoreBackend({
    repository: "trocohq/private-state",
    repositoryId: 456,
    branch: "main",
    namespace: "static",
    token: "state-token",
    fetchImplementation,
  });
  assert.deepEqual(await backend.identity(), {
    accountId: "456",
    namespace: "static",
    private: true,
  });
  assert.deepEqual(await backend.read("records/a.json"), {
    bytes: new TextEncoder().encode("bytes"),
    version: "old-sha",
  });
  assert.equal(
    await backend.compareAndSwap({
      path: "records/a.json",
      expectedVersion: "old-sha",
      bytes: new TextEncoder().encode("next"),
    }),
    "new-sha",
  );
  assert.equal(
    requests.some(
      (request) =>
        request.headers.get("authorization") === "Bearer state-token",
    ),
    true,
  );
});

test("maps missing files and conflicts to safe results", async () => {
  const missing = createGitHubStaticStoreBackend({
    repository: "trocohq/private-state",
    repositoryId: 456,
    branch: "main",
    namespace: "static",
    token: "token",
    fetchImplementation: () => Promise.resolve(response(404, {})),
  });
  assert.equal(await missing.read("records/a.json"), null);
  const conflict = createGitHubStaticStoreBackend({
    repository: "trocohq/private-state",
    repositoryId: 456,
    branch: "main",
    namespace: "static",
    token: "token",
    fetchImplementation: () => Promise.resolve(response(409, {})),
  });
  await assert.rejects(
    () =>
      conflict.compareAndSwap({
        path: "records/a.json",
        expectedVersion: null,
        bytes: new Uint8Array(),
      }),
    /STATIC_STORE_CONFLICT/u,
  );
});
