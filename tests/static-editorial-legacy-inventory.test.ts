import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildLegacyDeliveryInventory,
  classifyLegacyDelivery,
} from "../src/static-editorial/legacy-inventory.js";

function synthetic(
  mediaKind: "feed" | "carousel" | "video",
  channel: "facebook" | "youtube",
) {
  return {
    schemaVersion: 1,
    plan: { id: "campaign-1", mediaKind },
    channels: {
      [channel]: {
        stage: "failed",
        providerId: "provider-1",
        lastError: { category: "buffer_async_failure" },
      },
    },
  };
}

test("classifies actual selected media and preserves original IDs", () => {
  assert.deepEqual(
    classifyLegacyDelivery(synthetic("carousel", "facebook"), "facebook"),
    {
      campaignId: "campaign-1",
      channel: "facebook",
      providerId: "provider-1",
      mediaClass: "static",
      sourceMediaKind: "carousel",
    },
  );
  assert.deepEqual(
    classifyLegacyDelivery(synthetic("feed", "youtube"), "youtube"),
    {
      campaignId: "campaign-1",
      channel: "youtube",
      providerId: "provider-1",
      mediaClass: "video",
      sourceMediaKind: "feed",
    },
  );
  assert.deepEqual(
    classifyLegacyDelivery(synthetic("video", "facebook"), "facebook"),
    {
      campaignId: "campaign-1",
      channel: "facebook",
      providerId: "provider-1",
      mediaClass: "video",
      sourceMediaKind: "video",
    },
  );
});

test("returns unknown instead of guessing from incomplete or conflicting evidence", () => {
  assert.deepEqual(
    classifyLegacyDelivery(
      {
        ...synthetic("feed", "facebook"),
        plan: { id: "campaign-1", mediaKind: "mystery" },
      },
      "facebook",
    ),
    {
      campaignId: "campaign-1",
      channel: "facebook",
      providerId: "provider-1",
      mediaClass: "unknown",
      sourceMediaKind: "unknown",
    },
  );
  assert.equal(
    classifyLegacyDelivery(
      {
        ...synthetic("feed", "facebook"),
        channels: { facebook: { stage: "failed" } },
      },
      "facebook",
    ),
    null,
  );
});

test("audited local snapshot contains two static and four video failures", async () => {
  const states = await Promise.all(
    ["2026-09-04", "2026-09-05", "2026-09-06"].map(
      async (date) =>
        JSON.parse(
          await readFile(
            new URL(`../state/campaigns/${date}.json`, import.meta.url),
            "utf8",
          ),
        ) as unknown,
    ),
  );
  const inventory = buildLegacyDeliveryInventory(states);
  assert.deepEqual(inventory.counts, { static: 2, video: 4, unknown: 0 });
  assert.equal(inventory.records.length, 6);
  assert.equal(
    new Set(inventory.records.map((record) => record.providerId)).size,
    6,
  );
  assert.deepEqual(
    inventory.records.map(
      (record) => `${record.campaignId}:${record.channel}:${record.mediaClass}`,
    ),
    [
      "2026-09-04-safe-checkout-v1-0:facebook:static",
      "2026-09-04-safe-checkout-v1-0:youtube:video",
      "2026-09-05-checkout-situation-v1-1:facebook:video",
      "2026-09-05-checkout-situation-v1-1:youtube:video",
      "2026-09-06-save-this-rule-v1-4:facebook:static",
      "2026-09-06-save-this-rule-v1-4:youtube:video",
    ],
  );
});
