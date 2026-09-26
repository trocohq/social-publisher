import assert from "node:assert/strict";
import test from "node:test";

import { parseStaticBatch } from "../src/static-editorial/markdown.js";
import { loadApprovedRuntimeManifest } from "../src/static-editorial/runtime-manifest.js";
import { sha256 } from "../src/shared/determinism.js";

const encode = (value: string) => new TextEncoder().encode(value);
const batchPath = "batches/one.md";
const approvalPath = "approvals/one.json";
const mediaPath = "media/one/slide-01.jpg";
const manifestPath = "approvals/active.json";
const batch = `# One\n\n\`\`\`editorial-yaml
schemaVersion: 1
id: troco-runtime-one
brand: troco
format: image
timeZone: America/Sao_Paulo
channels:
  - channel: facebook
    placement: feed
    publishAt: 2026-10-01T12:00:00-03:00
    copy: Texto.
slides:
  - role: cover
    title: Título
    body: Corpo
    alt: Descrição
\`\`\`\n`;
const entry = parseStaticBatch(batch, "troco").entries[0]!;
const media = encode("jpeg");
const approval = JSON.stringify({
  schemaVersion: 1,
  entryId: entry.id,
  contentRevision: entry.contentRevision,
  mediaRevision: `sha256:${"a".repeat(64)}`,
  actorId: "owner",
  approvedAt: "2026-09-26T20:00:00-03:00",
  artifacts: [
    {
      id: "slide-01",
      privatePath: mediaPath,
      publicUrl:
        "https://trocohq.github.io/social-publisher/static/one/slide-01.jpg",
      sha256: `sha256:${sha256(media)}`,
      byteLength: media.byteLength,
    },
  ],
});
const manifest = JSON.stringify({
  schemaVersion: 1,
  items: [{ batchPath, approvalPath, mediaPaths: [mediaPath] }],
});

function transport(overrides: ReadonlyMap<string, Uint8Array> = new Map()) {
  const files = new Map<string, Uint8Array>([
    [manifestPath, encode(manifest)],
    [batchPath, encode(batch)],
    [approvalPath, encode(approval)],
    [mediaPath, media],
    ...overrides,
  ]);
  return {
    repository: async () => ({
      private: true,
      id: 123,
      fullName: "trocohq/editorial-inputs",
      authenticated: true,
    }),
    readFile: async (_repository: string, _ref: string, path: string) => {
      const value = files.get(path);
      if (!value) throw new Error("missing");
      return value;
    },
  };
}

const config = {
  repository: "trocohq/editorial-inputs",
  repositoryId: 123,
  ref: "a".repeat(40),
  manifestPath,
  publicOrigin: "https://trocohq.github.io/social-publisher/static",
};

test("loads only the exact approved files selected by the pinned manifest", async () => {
  const result = await loadApprovedRuntimeManifest({
    ...config,
    transport: transport(),
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]!.entry.id, "troco-runtime-one");
  assert.equal(result[0]!.artifacts[0]!.byteSize, media.byteLength);
});

test("rejects duplicate paths and edited bytes", async () => {
  const duplicate = encode(
    JSON.stringify({
      schemaVersion: 1,
      items: [
        { batchPath, approvalPath, mediaPaths: [mediaPath] },
        {
          batchPath,
          approvalPath: "approvals/two.json",
          mediaPaths: [mediaPath],
        },
      ],
    }),
  );
  await assert.rejects(
    loadApprovedRuntimeManifest({
      ...config,
      transport: transport(new Map([[manifestPath, duplicate]])),
    }),
    /STATIC_RUNTIME_MANIFEST_DUPLICATE_PATH/u,
  );
  await assert.rejects(
    loadApprovedRuntimeManifest({
      ...config,
      transport: transport(new Map([[mediaPath, encode("edited")]])),
    }),
    /STATIC_RUNTIME_MEDIA_MISMATCH/u,
  );
});
