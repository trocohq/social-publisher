import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toPlatformShadowEnvelope } from "../src/publishing/platform-envelope.js";
import { campaignStateFixture } from "./support/state-fixture.js";

function media() {
  const state = campaignStateFixture();
  return {
    schemaVersion: 1 as const,
    localDate: state.plan.localDate,
    campaignId: state.plan.id,
    assets: [
      {
        kind: "feed" as const,
        filename: "slide-01.jpg",
        hash: "a".repeat(64),
        contentType: "image/jpeg" as const,
        bytes: 1234,
      },
      {
        kind: "video" as const,
        filename: "short.mp4",
        hash: "b".repeat(64),
        contentType: "video/mp4" as const,
        bytes: 5678,
      },
    ],
  };
}

describe("publishing platform shadow envelope", () => {
  it("maps a verified Troco campaign without provider capability", () => {
    const state = campaignStateFixture();
    const envelope = toPlatformShadowEnvelope({ state, media: media() });

    assert.deepEqual(envelope.identity, {
      tenant: "troco",
      sourceType: "campaign",
      sourceId: state.plan.id,
      revision: envelope.identity.revision,
      idempotencyKey: `troco:campaign:${state.plan.id}:${envelope.identity.revision}`,
    });
    assert.match(envelope.identity.revision, /^sha256:[a-f0-9]{64}$/);
    assert.equal(envelope.artifacts.length, 2);
    assert.deepEqual(
      envelope.deliveries.map(({ id, adapter, required }) => ({
        id,
        adapter,
        required,
      })),
      [
        { id: "instagram", adapter: "social.shadow", required: false },
        { id: "facebook", adapter: "social.shadow", required: false },
        { id: "tiktok", adapter: "social.shadow", required: false },
        { id: "youtube", adapter: "social.shadow", required: false },
      ],
    );
    assert.doesNotMatch(JSON.stringify(envelope), /token|secret|credential/iu);
  });

  it("rejects media whose deployed byte size was not verified", () => {
    const incomplete = media();
    delete incomplete.assets[0]!.bytes;

    assert.throws(
      () =>
        toPlatformShadowEnvelope({
          state: campaignStateFixture(),
          media: incomplete,
        }),
      /Platform artifacts require verified byte sizes/,
    );
  });
});
