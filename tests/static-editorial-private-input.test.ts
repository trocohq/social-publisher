import assert from "node:assert/strict";
import test from "node:test";
import { loadPrivateStaticInput } from "../src/static-editorial/private-input.js";

const config = {
  repository: "trocohq/private-editorial",
  repositoryId: 456,
  ref: "b".repeat(40),
  paths: [
    "batches/september.md",
    "approvals/troco-editorial-0001.json",
    "media/troco-editorial-0001/slide-01.jpg",
  ],
  maxTotalBytes: 1024,
} as const;

function transport(
  overrides: Partial<{
    private: boolean;
    id: number;
    fullName: string;
    authenticated: boolean;
  }> = {},
) {
  const reads: string[] = [];
  return {
    reads,
    api: {
      repository: async () => ({
        private: true,
        id: 456,
        fullName: "trocohq/private-editorial",
        authenticated: true,
        ...overrides,
      }),
      readFile: async (_repository: string, ref: string, path: string) => {
        reads.push(`${ref}:${path}`);
        return new Uint8Array([1, 2, 3]);
      },
    },
  };
}

test("reads only bounded static files from a pinned private repository", async () => {
  const target = transport();
  const result = await loadPrivateStaticInput({
    config,
    transport: target.api,
  });
  assert.deepEqual(
    result.files.map((file) => file.path),
    config.paths,
  );
  assert.equal(result.totalBytes, 9);
});

test("rejects untrusted repository identity before file reads", async () => {
  for (const [override, code] of [
    [{ private: false }, "STATIC_PRIVATE_REPOSITORY_REQUIRED"],
    [{ id: 999 }, "STATIC_PRIVATE_REPOSITORY_MISMATCH"],
    [{ fullName: "attacker/fork" }, "STATIC_PRIVATE_REPOSITORY_MISMATCH"],
    [{ authenticated: false }, "STATIC_PRIVATE_AUTH_REQUIRED"],
  ] as const) {
    const target = transport(override);
    await assert.rejects(
      () => loadPrivateStaticInput({ config, transport: target.api }),
      new RegExp(code, "u"),
    );
    assert.deepEqual(target.reads, []);
  }
});

test("rejects mutable refs and executable or unsupported paths", async () => {
  for (const unsafe of [
    "main",
    "../secret.md",
    ".github/workflows/publish.yml",
    "package.json",
    "scripts/run.ts",
    "media/file.mp4",
  ]) {
    const target = transport();
    const current =
      unsafe === "main"
        ? { ...config, ref: unsafe }
        : { ...config, paths: [unsafe] };
    await assert.rejects(() =>
      loadPrivateStaticInput({ config: current, transport: target.api }),
    );
    assert.deepEqual(target.reads, []);
  }
});

test("rejects oversized private input", async () => {
  const target = transport();
  target.api.readFile = async () => new Uint8Array(600);
  await assert.rejects(
    () =>
      loadPrivateStaticInput({
        config: { ...config, maxTotalBytes: 1000 },
        transport: target.api,
      }),
    /STATIC_PRIVATE_INPUT_TOO_LARGE/u,
  );
});
