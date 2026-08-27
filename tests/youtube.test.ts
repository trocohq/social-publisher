import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createYouTubeAccessTokenProvider } from "../src/networks/youtube/oauth.js";
import {
  campaignTag,
  matchYouTubeUpload,
  youtubeReconciliationResult,
  reconcileYouTubeUpload,
} from "../src/networks/youtube/reconcile.js";
import {
  uploadYouTubeVideo,
  youtubeVideoResource,
} from "../src/networks/youtube/upload.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

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

test("controlled YouTube verification remains private without publishAt", () => {
  const resource = youtubeVideoResource({
    campaignId: "2026-08-27-quick-calculation-v1-0",
    title: "Validação privada #Shorts",
    description: "Descrição",
  });
  assert.equal(resource.status.privacyStatus, "private");
  assert.equal(resource.status.publishAt, undefined);
});

test("YouTube authorizes every resumable request and resumes after a server failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-youtube-"));
  const filePath = join(root, "short.mp4");
  await writeFile(filePath, Buffer.from([1, 2, 3, 4, 5]));
  const requests: { url: string; init?: RequestInit }[] = [];
  let uploadRequests = 0;
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (init?.method === "POST") {
      return new Response(null, {
        status: 200,
        headers: {
          location:
            "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session-1",
        },
      });
    }
    const contentRange = new Headers(init?.headers).get("content-range");
    if (contentRange === "bytes */5") {
      return new Response(null, {
        status: 308,
        headers: { range: "bytes=0-2" },
      });
    }
    uploadRequests += 1;
    if (uploadRequests === 1) return new Response(null, { status: 503 });
    assert.equal(contentRange, "bytes 3-4/5");
    return jsonResponse({
      id: "video_1",
      status: { uploadStatus: "uploaded", privacyStatus: "private" },
    });
  };

  try {
    const result = await uploadYouTubeVideo({
      accessToken: "access-token",
      filePath,
      resource: youtubeVideoResource({
        campaignId: "2026-08-27-quick-calculation-v1-0",
        title: "Validação privada #Shorts",
        description: "Descrição",
      }),
      fetchImplementation,
      wait: async () => undefined,
    });
    assert.equal(result.id, "video_1");
    assert.equal(requests.length, 4);
    for (const request of requests) {
      assert.equal(
        new Headers(request.init?.headers).get("authorization"),
        "Bearer access-token",
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("temporary OAuth failures keep retry metadata", async () => {
  const provider = createYouTubeAccessTokenProvider({
    clientId: "client",
    clientSecret: "secret",
    refreshToken: "refresh",
    fetchImplementation: async () => new Response(null, { status: 503 }),
  });
  await assert.rejects(provider.getAccessToken(), (error: unknown) => {
    const record = error as Record<string, unknown>;
    return (
      record.retryable === true &&
      record.category === "youtube_oauth_server" &&
      record.statusCode === 503
    );
  });
});

test("OAuth rejection identifies refresh-token and client failures safely", async () => {
  for (const failure of [
    {
      googleError: "invalid_grant",
      category: "youtube_oauth_refresh",
      message: /refresh token was rejected/i,
    },
    {
      googleError: "invalid_client",
      category: "youtube_oauth_client",
      message: /client credentials were rejected/i,
    },
  ]) {
    const provider = createYouTubeAccessTokenProvider({
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "refresh",
      fetchImplementation: async () =>
        new Response(JSON.stringify({ error: failure.googleError }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    });
    await assert.rejects(provider.getAccessToken(), (error: unknown) => {
      const record = error as Record<string, unknown>;
      return (
        failure.message.test(String(record.message)) &&
        record.category === failure.category &&
        record.statusCode === 400 &&
        record.retryable === false
      );
    });
  }
});

test("YouTube reconciliation exposes terminal asynchronous upload states", () => {
  assert.deepEqual(
    youtubeReconciliationResult(
      {
        id: "video_failed",
        status: { uploadStatus: "rejected", privacyStatus: "private" },
      },
      "2026-08-27T15:17:00.000Z",
    ),
    {
      kind: "permanent_error",
      category: "youtube_async_failure",
      message: "YouTube reported a terminal upload failure",
    },
  );
});

test("YouTube reconciliation preserves retry metadata for transient requests", async () => {
  await assert.rejects(
    reconcileYouTubeUpload({
      campaignId: "2026-08-27-quick-calculation-v1-0",
      accessToken: "access-token",
      fetchImplementation: async () => new Response(null, { status: 503 }),
    }),
    (error: unknown) => {
      const record = error as Record<string, unknown>;
      return (
        record.retryable === true &&
        record.category === "youtube_reconciliation_server" &&
        record.statusCode === 503
      );
    },
  );
});
