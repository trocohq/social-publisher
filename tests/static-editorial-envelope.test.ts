import assert from "node:assert/strict";
import test from "node:test";

import { toStaticEnvelope } from "../src/static-editorial/envelope.js";

test("builds a validated custom-scheduled delivery from the approved artifacts", () => {
  const envelope = toStaticEnvelope({
    entry: {
      schemaVersion: 1,
      id: "troco-editorial-0001",
      brand: "troco",
      format: "carousel",
      timeZone: "America/Sao_Paulo",
      channels: [
        {
          channel: "instagram",
          placement: "feed",
          publishAt: "2026-09-20T12:00:00-03:00",
          copy: "Copy",
        },
      ],
      slides: [
        { role: "cover", title: "One", body: "Body", alt: "Alt one" },
        { role: "closing", title: "Two", body: "Body", alt: "Alt two" },
      ],
    },
    approvalRevision: `sha256:${"a".repeat(64)}`,
    intentGeneration: 2,
    artifacts: [
      {
        id: "one",
        storage: "external",
        sha256: "b".repeat(64),
        byteSize: 10,
        mediaType: "image/jpeg",
        locator: "https://media.troco.app/one.jpg",
      },
      {
        id: "two",
        storage: "external",
        sha256: "c".repeat(64),
        byteSize: 11,
        mediaType: "image/jpeg",
        locator: "https://media.troco.app/two.jpg",
      },
    ],
    expectedAccountIds: { instagram: "ig-account" },
  });
  assert.match(
    envelope.identity.idempotencyKey,
    /^troco-editorial-0001:sha256:[a-f0-9]{64}:2$/u,
  );
  assert.deepEqual(
    envelope.artifacts.map((artifact) => artifact.id),
    ["one", "two"],
  );
  assert.deepEqual(envelope.deliveries[0], {
    id: "instagram-feed",
    adapter: "social.buffer",
    operation: "publish",
    required: true,
    payload: { type: "social.post", text: "Copy", artifactIds: ["one", "two"] },
    providerOptions: {
      contractVersion: "runner-static-scheduled-v1",
      channel: "instagram",
      placement: "feed",
      mode: "customScheduled",
      dueAt: "2026-09-20T15:00:00.000Z",
      expectedAccountId: "ig-account",
      imageAltText: ["Alt one", "Alt two"],
    },
  });
});

test("holds unsupported Story intent", () => {
  assert.throws(
    () =>
      toStaticEnvelope({
        entry: {
          schemaVersion: 1,
          id: "troco-editorial-0001",
          brand: "troco",
          format: "image",
          timeZone: "America/Sao_Paulo",
          channels: [
            {
              channel: "facebook",
              placement: "story",
              publishAt: "2026-09-20T12:00:00-03:00",
              copy: "Story",
            },
          ],
          slides: [{ role: "cover", title: "One", body: "Body", alt: "Alt" }],
        },
        approvalRevision: `sha256:${"a".repeat(64)}`,
        intentGeneration: 1,
        artifacts: [
          {
            id: "one",
            storage: "external",
            sha256: "b".repeat(64),
            byteSize: 10,
            mediaType: "image/jpeg",
            locator: "https://media.troco.app/one.jpg",
          },
        ],
        expectedAccountIds: { facebook: "fb-account" },
      }),
    /STATIC_BUFFER_PLACEMENT_UNSUPPORTED/u,
  );
});
