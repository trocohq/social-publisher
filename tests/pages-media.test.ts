import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createPagesPayload,
  datesInPagesPayload,
  publicMediaUrls,
} from "../src/media/pages.js";
import { verifyPublicAsset } from "../src/media/verify-public.js";
import { sha256 } from "../src/shared/determinism.js";

test("Pages keeps two past and seven future dates", () => {
  assert.deepEqual(datesInPagesPayload("2026-08-26"), [
    "2026-08-24",
    "2026-08-25",
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
  ]);
});

test("Pages copies only verified rolling campaign assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-pages-"));
  const renderRoot = join(root, "render");
  const pagesRoot = join(root, "pages");
  const localDate = "2026-08-26";
  const campaignId = "2026-08-26-troco-explains-v1-0";
  const feed = Buffer.from("feed-bytes");
  const video = Buffer.from("video-bytes");
  const campaignRoot = join(renderRoot, localDate, campaignId);
  await mkdir(join(campaignRoot, "feed"), { recursive: true });
  await mkdir(join(campaignRoot, "video"), { recursive: true });
  await writeFile(join(campaignRoot, "feed", "slide-01.jpg"), feed);
  await writeFile(join(campaignRoot, "video", "short.mp4"), video);

  const [record] = await createPagesPayload({
    today: localDate,
    renderRoot,
    pagesRoot,
    campaigns: [
      {
        schemaVersion: 1,
        localDate,
        campaignId,
        assets: [
          {
            kind: "feed",
            filename: "slide-01.jpg",
            hash: sha256(feed),
            contentType: "image/jpeg",
          },
          {
            kind: "video",
            filename: "short.mp4",
            hash: sha256(video),
            contentType: "video/mp4",
          },
        ],
      },
    ],
  });

  assert.equal(record?.assets[0]?.bytes, feed.length);
  const index = JSON.parse(
    await readFile(join(pagesRoot, "index.json"), "utf8"),
  );
  assert.equal(index.campaigns[0].campaignId, campaignId);
});

test("public media URLs encode segments and stay below the Pages origin", () => {
  const urls = publicMediaUrls("https://trocohq.github.io/social-publisher", {
    schemaVersion: 1,
    localDate: "2026-08-26",
    campaignId: "2026-08-26-troco-explains-v1-0",
    assets: [
      {
        kind: "feed",
        filename: "slide-01.jpg",
        hash: "a".repeat(64),
        contentType: "image/jpeg",
      },
      {
        kind: "video",
        filename: "short.mp4",
        hash: "b".repeat(64),
        contentType: "video/mp4",
      },
    ],
  });
  assert.match(urls.feed[0] ?? "", /\/feed\/slide-01\.jpg$/);
  assert.match(urls.video, /\/video\/short\.mp4$/);
});

test("public verification rejects a byte-hash mismatch", async () => {
  await assert.rejects(
    verifyPublicAsset({
      url: "http://media.test/slide.jpg",
      expectedHash: sha256("right"),
      expectedContentType: "image/jpeg",
      allowHttpForTest: true,
      fetchImplementation: async () =>
        new Response("wrong", {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    }),
    /hash mismatch/,
  );
});
