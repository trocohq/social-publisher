import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { restorePublicMedia } from "../src/media/restore-public.js";
import { sha256 } from "../src/shared/determinism.js";
import { campaignStateFixture } from "./support/state-fixture.js";

test("immutable campaign media can be restored from its verified Pages deployment", async () => {
  const renderRoot = await mkdtemp(join(tmpdir(), "troco-restored-media-"));
  const feed = Buffer.from("immutable-feed");
  const video = Buffer.from("immutable-video");
  const fixture = campaignStateFixture();
  const state = {
    ...fixture,
    renderHashes: {
      feed: [sha256(feed)],
      video: sha256(video),
    },
  };

  await restorePublicMedia({
    state,
    pagesOrigin: "https://trocohq.github.io/social-publisher",
    renderRoot,
    fetchImplementation: async (input) => {
      const url = String(input);
      if (url.endsWith("slide-01.jpg")) {
        return new Response(feed, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }
      if (url.endsWith("short.mp4")) {
        return new Response(video, {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      }
      return new Response("missing", { status: 404 });
    },
  });

  const campaignRoot = join(renderRoot, state.plan.localDate, state.plan.id);
  assert.deepEqual(
    await readFile(join(campaignRoot, "feed", "slide-01.jpg")),
    feed,
  );
  assert.deepEqual(
    await readFile(join(campaignRoot, "video", "short.mp4")),
    video,
  );
});

test("restoration rejects public media that does not match immutable state", async () => {
  const renderRoot = await mkdtemp(join(tmpdir(), "troco-rejected-media-"));
  const state = campaignStateFixture();

  await assert.rejects(
    restorePublicMedia({
      state,
      pagesOrigin: "https://trocohq.github.io/social-publisher",
      renderRoot,
      fetchImplementation: async () =>
        new Response("wrong", {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    }),
    /hash mismatch/,
  );
});
