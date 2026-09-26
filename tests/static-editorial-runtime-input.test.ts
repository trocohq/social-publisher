import assert from "node:assert/strict";
import test from "node:test";

import { compileApprovedRuntimeInput } from "../src/static-editorial/runtime-input.js";
import { parseStaticBatch } from "../src/static-editorial/markdown.js";
import { sha256 } from "../src/shared/determinism.js";

const encode = (value: string) => new TextEncoder().encode(value);
const batchSource = `# Batch\n\n\`\`\`editorial-yaml
schemaVersion: 1
id: troco-runtime-one
brand: troco
format: image
timeZone: America/Sao_Paulo
channels:
  - channel: instagram
    placement: feed
    publishAt: 2026-10-01T12:00:00-03:00
    copy: Texto final.
slides:
  - role: cover
    title: Título
    body: Corpo
    alt: Descrição
\`\`\`\n`;
const entry = parseStaticBatch(batchSource, "troco").entries[0]!;
const media = encode("jpeg-fixture");
const approval = {
  schemaVersion: 1,
  entryId: entry.id,
  contentRevision: entry.contentRevision,
  mediaRevision: `sha256:${"a".repeat(64)}`,
  actorId: "GuilhermeAlbert",
  approvedAt: "2026-09-26T20:00:00-03:00",
  artifacts: [
    {
      id: "slide-01",
      privatePath: "media/troco-runtime-one/slide-01.jpg",
      publicUrl:
        "https://trocohq.github.io/social-publisher/static/troco-runtime-one/slide-01.jpg",
      sha256: `sha256:${sha256(media)}`,
      byteLength: media.byteLength,
    },
  ],
};

function compile(changes: Partial<typeof approval> = {}) {
  return compileApprovedRuntimeInput({
    batch: encode(batchSource),
    approval: encode(JSON.stringify({ ...approval, ...changes })),
    media: new Map([[approval.artifacts[0]!.privatePath, media]]),
    publicOrigin: "https://trocohq.github.io/social-publisher/static",
  });
}

test("binds the approved source and exact private bytes to public artifacts", () => {
  const result = compile();
  assert.equal(result.entry.id, "troco-runtime-one");
  assert.deepEqual(result.artifacts, [
    {
      id: "slide-01",
      storage: "external",
      sha256: sha256(media),
      byteSize: media.byteLength,
      mediaType: "image/jpeg",
      locator:
        "https://trocohq.github.io/social-publisher/static/troco-runtime-one/slide-01.jpg",
    },
  ]);
});

test("fails closed for edited source, media or an unrelated public origin", () => {
  assert.throws(
    () => compile({ contentRevision: `sha256:${"b".repeat(64)}` }),
    /STATIC_RUNTIME_CONTENT_MISMATCH/u,
  );
  assert.throws(
    () =>
      compileApprovedRuntimeInput({
        batch: encode(batchSource),
        approval: encode(JSON.stringify(approval)),
        media: new Map([
          [approval.artifacts[0]!.privatePath, encode("changed")],
        ]),
        publicOrigin: "https://trocohq.github.io/social-publisher/static",
      }),
    /STATIC_RUNTIME_MEDIA_MISMATCH/u,
  );
  assert.throws(
    () =>
      compile({
        artifacts: [
          {
            ...approval.artifacts[0]!,
            publicUrl: "https://example.com/slide-01.jpg",
          },
        ],
      }),
    /STATIC_RUNTIME_PUBLIC_URL_INVALID/u,
  );
});
