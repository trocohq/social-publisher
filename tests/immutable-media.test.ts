import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ensureImmutableMedia } from "../src/media/immutable.js";
import { sha256 } from "../src/shared/determinism.js";
import { campaignStateFixture } from "./support/state-fixture.js";

const feed = Buffer.from("original-feed");
const video = Buffer.from("original-video");
const state = {
  ...campaignStateFixture(),
  renderHashes: { feed: [sha256(feed)], video: sha256(video) },
};

test("an incomplete archive cannot redirect recovery through a symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "troco-outside-"));
  const directory = join(root, state.plan.localDate, state.plan.id);
  await mkdir(directory, { recursive: true });
  await symlink(outside, join(directory, "video"));
  await assert.rejects(
    ensureImmutableMedia({
      state,
      renderRoot: root,
      pagesOrigin: "https://example.com",
      render: async () => {
        throw new Error("Must not render");
      },
      fetchImplementation: async () => {
        throw new Error("Must not fetch");
      },
    }),
    /Symlink/,
  );
});
async function writeMedia(root: string, correct = true) {
  for (const [kind, filename, bytes] of [
    ["feed", "slide-01.jpg", feed],
    ["video", "short.mp4", correct ? video : Buffer.from("different")],
  ] as const) {
    const path = join(root, state.plan.localDate, state.plan.id, kind);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, filename), bytes);
  }
}

test("verified archived media avoids rendering and public-site dependency", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-archive-"));
  await writeMedia(root);
  const result = await ensureImmutableMedia({
    state,
    renderRoot: root,
    pagesOrigin: "https://example.com",
    render: async () => {
      throw new Error("Must not render immutable media");
    },
    fetchImplementation: async () => {
      throw new Error("Must not access Pages");
    },
  });
  assert.equal(result, "local");
  assert.deepEqual(
    await readFile(
      join(root, state.plan.localDate, state.plan.id, "video/short.mp4"),
    ),
    video,
  );
});

test("missing archive falls back to verified public originals", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-public-original-"));
  assert.equal(
    await ensureImmutableMedia({
      state,
      renderRoot: root,
      pagesOrigin: "https://example.com",
      render: async () => {
        throw new Error("Must not render");
      },
      fetchImplementation: async (url) =>
        new Response(String(url).endsWith(".jpg") ? feed : video, {
          headers: {
            "content-type": String(url).endsWith(".jpg")
              ? "image/jpeg"
              : "video/mp4",
          },
        }),
    }),
    "public",
  );
});

test("reproducible original rendering recovers an unavailable public site", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-reproducible-"));
  assert.equal(
    await ensureImmutableMedia({
      state,
      renderRoot: root,
      pagesOrigin: "https://example.com",
      render: async (scratch) => writeMedia(scratch),
      fetchImplementation: async () => new Response("missing", { status: 404 }),
    }),
    "render",
  );
});

test("changed renderer cannot silently replace missing immutable assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-immutable-failure-"));
  const before = JSON.stringify(state);
  await assert.rejects(
    ensureImmutableMedia({
      state,
      renderRoot: root,
      pagesOrigin: "https://example.com",
      render: async (scratch) => writeMedia(scratch, false),
      fetchImplementation: async () => new Response("missing", { status: 404 }),
    }),
    /original media.*restore.*archive/i,
  );
  assert.equal(JSON.stringify(state), before);
  await assert.rejects(
    readFile(
      join(root, state.plan.localDate, state.plan.id, "video/short.mp4"),
    ),
    { code: "ENOENT" },
  );
});
