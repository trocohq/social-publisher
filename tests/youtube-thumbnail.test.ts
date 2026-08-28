import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { setYouTubeThumbnail } from "../src/networks/youtube/thumbnail.js";

test("YouTube uploads and verifies one authenticated custom thumbnail", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-youtube-thumbnail-"));
  const filePath = join(root, "thumbnail.jpg");
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  await writeFile(filePath, bytes);
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (init?.method === "POST") {
      return new Response(
        JSON.stringify({
          items: [{ default: { url: "https://i.ytimg.com/1.jpg" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({
        items: [
          {
            id: "video_1",
            snippet: {
              thumbnails: { default: { url: "https://i.ytimg.com/1.jpg" } },
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await setYouTubeThumbnail({
    accessToken: "access-token",
    videoId: "video_1",
    filePath,
    fetchImplementation,
  });

  assert.deepEqual(result, {
    videoId: "video_1",
    permalink: "https://www.youtube.com/watch?v=video_1",
  });
  assert.equal(requests.length, 2);
  assert.match(requests[0]!.url, /thumbnails\/set\?videoId=video_1/u);
  assert.equal(requests[0]!.init?.method, "POST");
  assert.deepEqual(Buffer.from(requests[0]!.init?.body as Uint8Array), bytes);
  for (const request of requests) {
    assert.equal(
      new Headers(request.init?.headers).get("authorization"),
      "Bearer access-token",
    );
  }
});

test("YouTube rejects a thumbnail over the API limit before network access", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-youtube-thumbnail-"));
  const filePath = join(root, "thumbnail.jpg");
  await writeFile(filePath, Buffer.alloc(2_000_001));
  await assert.rejects(
    setYouTubeThumbnail({
      accessToken: "access-token",
      videoId: "video_1",
      filePath,
      fetchImplementation: async () => {
        throw new Error("network must not run");
      },
    }),
    /2 MB/u,
  );
});

test("YouTube thumbnail failures retain sanitized retry metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-youtube-thumbnail-"));
  const filePath = join(root, "thumbnail.jpg");
  await writeFile(filePath, Buffer.from([1]));
  await assert.rejects(
    setYouTubeThumbnail({
      accessToken: "access-token",
      videoId: "video_1",
      filePath,
      fetchImplementation: async () => new Response(null, { status: 503 }),
    }),
    (error: unknown) => {
      const record = error as Record<string, unknown>;
      return (
        record.category === "youtube_thumbnail_server" &&
        record.retryable === true
      );
    },
  );
});
