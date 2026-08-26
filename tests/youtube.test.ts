import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignTag,
  matchYouTubeUpload,
} from "../src/networks/youtube/reconcile.js";
import { youtubeVideoResource } from "../src/networks/youtube/upload.js";

test("YouTube schedules a private upload with campaign fingerprint metadata", () => {
  const resource = youtubeVideoResource({
    campaignId: "2026-08-26-troco-explains-v1-0",
    title: "Troco certo em segundos #Shorts",
    description: "Descrição",
    publishAt: "2026-08-26T15:17:00.000Z",
  });
  assert.equal(resource.status.privacyStatus, "private");
  assert.equal(resource.status.publishAt, "2026-08-26T15:17:00.000Z");
  assert.equal(resource.status.selfDeclaredMadeForKids, false);
  assert.ok(
    resource.snippet.tags.includes(
      campaignTag("2026-08-26-troco-explains-v1-0"),
    ),
  );
});

test("YouTube reconciliation finds one authenticated upload by campaign tag", () => {
  assert.equal(
    matchYouTubeUpload("campaign-a", [
      {
        id: "video_1",
        snippet: { tags: [campaignTag("campaign-a")] },
        status: { uploadStatus: "uploaded", privacyStatus: "private" },
      },
    ])?.id,
    "video_1",
  );
});
