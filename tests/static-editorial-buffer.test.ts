import assert from "node:assert/strict";
import test from "node:test";

import { createStaticBufferAdapter } from "../src/static-editorial/buffer.js";
import { toStaticEnvelope } from "../src/static-editorial/envelope.js";

test("uses the existing Buffer mapping with ordered carousel media", async () => {
  const calls: unknown[] = [];
  const envelope = toStaticEnvelope({
    entry: {
      schemaVersion: 1,
      id: "troco-editorial-0001",
      brand: "troco",
      format: "carousel",
      timeZone: "America/Sao_Paulo",
      channels: [
        {
          channel: "facebook",
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
      {
        id: "two",
        storage: "external",
        sha256: "c".repeat(64),
        byteSize: 11,
        mediaType: "image/jpeg",
        locator: "https://media.troco.app/two.jpg",
      },
    ],
    expectedAccountIds: { facebook: "fb-account" },
  });
  const adapter = createStaticBufferAdapter({
    create: async (input) => {
      calls.push(input);
      return { kind: "accepted", providerId: "buffer-1" };
    },
  });
  assert.deepEqual(await adapter.create(envelope, "facebook-feed"), {
    kind: "accepted",
    providerId: "buffer-1",
  });
  assert.deepEqual(calls, [
    {
      channelId: "fb-account",
      text: "Copy",
      schedulingType: "automatic",
      mode: "customScheduled",
      dueAt: "2026-09-20T15:00:00.000Z",
      needsApproval: false,
      aiAssisted: false,
      assets: [
        { image: { url: "https://media.troco.app/one.jpg" } },
        { image: { url: "https://media.troco.app/two.jpg" } },
      ],
      metadata: { facebook: { type: "post" } },
    },
  ]);
});

test("rejects share-now before transport", async () => {
  let calls = 0;
  const adapter = createStaticBufferAdapter({
    create: async () => {
      calls++;
      return { kind: "accepted", providerId: "bad" };
    },
  });
  const envelope = {
    schemaVersion: 1,
    identity: {
      tenant: "troco",
      sourceType: "static-editorial",
      sourceId: "troco-editorial-0001",
      revision: `sha256:${"a".repeat(64)}`,
      idempotencyKey: "key",
    },
    canonical: { title: "Title", language: "pt-BR" },
    artifacts: [],
    deliveries: [
      {
        id: "facebook-feed",
        adapter: "social.buffer",
        operation: "publish",
        required: true,
        payload: { type: "social.post", text: "Copy", artifactIds: [] },
        providerOptions: {
          channel: "facebook",
          placement: "feed",
          mode: "shareNow",
          dueAt: "2026-09-20T15:00:00.000Z",
          expectedAccountId: "fb",
        },
      },
    ],
  } as const;
  await assert.rejects(
    () => adapter.create(envelope, "facebook-feed"),
    /STATIC_BUFFER_SCHEDULE_REQUIRED/u,
  );
  assert.equal(calls, 0);
});
