// Read-only recovery experiment: never updates campaign or provider state.
import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadBrand } from "../src/brand/load-brand.ts";
import { listCampaignStates } from "../src/state/storage.ts";
import { renderFeed } from "../src/render/image.ts";
import { renderVideo } from "../src/render/video.ts";
import { listBufferPosts } from "../src/networks/buffer/list-posts.ts";

const brand = await loadBrand(
  pathToFileURL(resolve("dependencies/frontend/public") + "/"),
);
const states = (await listCampaignStates("state")).filter(
  (s) => s.plan.localDate >= "2026-09-04",
);
for (const state of states) {
  const root = resolve(".tmp/diagnosis", state.plan.localDate, state.plan.id);
  const feed = await renderFeed({
    plan: state.plan,
    brand,
    output: root + "/feed",
  });
  const video = await renderVideo({
    plan: state.plan,
    brand,
    output: root + "/video",
  });
  console.log(
    JSON.stringify({
      campaign: state.plan.id,
      feedMatch:
        JSON.stringify(feed.hashes) === JSON.stringify(state.renderHashes.feed),
      videoMatch: video.hash === state.renderHashes.video,
      actualFeed: feed.hashes,
      actualVideo: video.hash,
      binaries: video.binaries,
    }),
  );
  if (
    JSON.stringify(feed.hashes) === JSON.stringify(state.renderHashes.feed) &&
    video.hash === state.renderHashes.video
  ) {
    const dest = resolve(".tmp/verified", state.plan.localDate, state.plan.id);
    await mkdir(dest + "/feed", { recursive: true });
    await mkdir(dest + "/video", { recursive: true });
    for (let i = 0; i < feed.hashes.length; i++) {
      const name = `slide-${String(i + 1).padStart(2, "0")}.jpg`;
      await copyFile(root + "/feed/" + name, dest + "/feed/" + name);
    }
    await copyFile(video.file, dest + "/video/short.mp4");
  }
}
const posts = await listBufferPosts({
  apiKey: process.env.BUFFER_API_KEY,
  organizationId: process.env.BUFFER_ORGANIZATION_ID,
  channelIds: [
    process.env.BUFFER_INSTAGRAM_CHANNEL_ID,
    process.env.BUFFER_YOUTUBE_CHANNEL_ID,
  ].filter(Boolean),
  statuses: ["scheduled", "sent", "sending", "error"],
  dueAt: { start: "2026-09-04T00:00:00Z", end: "2026-09-11T23:59:59Z" },
});
if (posts.kind === "success") {
  for (const post of posts.value)
    console.log(
      JSON.stringify({
        providerId: post.id,
        status: post.status,
        assetHosts: post.assets?.map((a) => new URL(a.source).hostname),
      }),
    );
} else
  console.log(
    JSON.stringify({ providerRead: posts.kind, category: posts.category }),
  );
