import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createReview } from "../dry-run/create-review.js";
import { verifyPublicAsset } from "../media/verify-public.js";
import { runBufferPreflight } from "../networks/buffer/preflight.js";
import { reconcileBufferPost } from "../networks/buffer/reconcile.js";
import { createYouTubeAccessTokenProvider } from "../networks/youtube/oauth.js";
import {
  uploadYouTubeVideo,
  youtubeVideoResource,
} from "../networks/youtube/upload.js";
import { sha256 } from "../shared/determinism.js";
import { listCampaignStates } from "../state/storage.js";

const suspiciousKey =
  /authorization|(?:^|[_-])token|token$|secret$|password|cookie|api[-_]?key/i;

function assertSanitizedState(value: unknown, path = "state"): void {
  if (typeof value === "string") {
    if (
      /\bBearer\s+\S+|https:\/\/[^\s]*googleapis\.com\/upload\//i.test(value)
    ) {
      throw new Error(`Sensitive value found in ${path}`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (suspiciousKey.test(key)) {
      throw new Error(`Suspicious key found in tracked state: ${path}.${key}`);
    }
    assertSanitizedState(nested, `${path}.${key}`);
  }
}

async function validateWorkflowGates(): Promise<void> {
  const workflowRoot = new URL("../../.github/workflows/", import.meta.url);
  const files = ["validate.yml", "publish.yml"];
  for (const file of files) {
    const source = await readFile(new URL(file, workflowRoot), "utf8");
    for (const line of source
      .split("\n")
      .filter((value) => value.includes("uses:"))) {
      if (!/@[0-9a-f]{40}(?:\s|$)/.test(line)) {
        throw new Error(`Unpinned workflow action in ${file}`);
      }
    }
    if (file === "publish.yml") {
      if (
        !source.includes("AUTO_PUBLISH: ${{ vars.AUTO_PUBLISH || 'false' }}") ||
        !source.includes("group: troco-social-publication") ||
        source.includes("pull_request:")
      ) {
        throw new Error("Production workflow activation gate is invalid");
      }
    }
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function validateProductionProviderContracts(
  root: string,
): Promise<void> {
  const bufferFetch: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      query: string;
      variables?: { input?: { organizationId?: string } };
    };
    if (request.variables?.input?.organizationId !== "org_validation") {
      throw new Error("Buffer organization variable validation failed");
    }
    if (request.query.includes("TrocoChannels")) {
      return jsonResponse({
        data: {
          channels: [
            {
              id: "ig_validation",
              service: "instagram",
              organizationId: "org_validation",
              isQueuePaused: false,
            },
            {
              id: "fb_validation",
              service: "facebook",
              organizationId: "org_validation",
              isQueuePaused: false,
            },
            {
              id: "tt_validation",
              service: "tiktok",
              organizationId: "org_validation",
              isQueuePaused: false,
            },
          ],
        },
      });
    }
    if (request.query.includes("TrocoScheduledPosts")) {
      return jsonResponse({
        data: {
          posts: {
            edges: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    }
    if (request.query.includes("TrocoPosts")) {
      return jsonResponse({
        data: {
          posts: {
            edges: [
              {
                node: {
                  id: "post_validation",
                  channelId: "ig_validation",
                  dueAt: "2026-08-26T15:17:00.000Z",
                  text: "Troco certo",
                  status: "sent",
                  assets: [{ source: "https://example.test/slide.jpg" }],
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    }
    throw new Error("Unexpected Buffer production operation");
  };
  await runBufferPreflight({
    apiKey: "fake-buffer-key",
    organizationId: "org_validation",
    expectedChannelIds: {
      instagram: "ig_validation",
      facebook: "fb_validation",
      tiktok: "tt_validation",
    },
    requiredSlots: { instagram: 1, facebook: 1, tiktok: 1 },
    fetchImplementation: bufferFetch,
  });
  const reconciliation = await reconcileBufferPost({
    apiKey: "fake-buffer-key",
    organizationId: "org_validation",
    expected: {
      channelId: "ig_validation",
      dueAt: "2026-08-26T15:17:00.000Z",
      text: "Troco certo",
      mediaUrls: ["https://example.test/slide.jpg"],
    },
    fetchImplementation: bufferFetch,
  });
  if (
    reconciliation.kind !== "success" ||
    reconciliation.value?.status !== "published"
  ) {
    throw new Error("Buffer production reconciliation validation failed");
  }

  const bytes = Buffer.from("verified-media");
  await verifyPublicAsset({
    url: "http://media.test/slide.jpg",
    expectedHash: sha256(bytes),
    expectedContentType: "image/jpeg",
    expectedLength: bytes.length,
    allowHttpForTest: true,
    fetchImplementation: async () =>
      new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(bytes.length),
        },
      }),
  });

  const tokens = createYouTubeAccessTokenProvider({
    clientId: "fake-client",
    clientSecret: "fake-secret",
    refreshToken: "fake-refresh",
    fetchImplementation: async () =>
      new Response(
        JSON.stringify({
          access_token: "process-local-token",
          expires_in: 3_600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  if (
    (await tokens.getAccessToken(new Date("2026-08-26T10:00:00Z"))).length < 1
  ) {
    throw new Error("YouTube in-memory OAuth validation failed");
  }

  const videoPath = join(root, "provider-contract.mp4");
  await writeFile(videoPath, Buffer.from("provider-contract"));
  let uploadRequests = 0;
  const uploaded = await uploadYouTubeVideo({
    accessToken: "process-local-token",
    filePath: videoPath,
    resource: youtubeVideoResource({
      campaignId: "2026-08-27-quick-calculation-v1-0",
      title: "Private validation #Shorts",
      description: "Production upload protocol validation",
    }),
    fetchImplementation: async (_input, init) => {
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization !== "Bearer process-local-token") {
        throw new Error("YouTube production request is not authorized");
      }
      if (init?.method === "POST") {
        return new Response(null, {
          status: 200,
          headers: {
            location:
              "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=validation",
          },
        });
      }
      uploadRequests += 1;
      return jsonResponse({
        id: "video_validation",
        status: { uploadStatus: "uploaded", privacyStatus: "private" },
      });
    },
  });
  if (uploaded.id !== "video_validation" || uploadRequests !== 1) {
    throw new Error("YouTube production upload protocol validation failed");
  }
}

async function validate(): Promise<void> {
  const output = await mkdtemp(join(tmpdir(), "troco-social-validation-"));
  const brandPath = resolve(process.env.BRAND_ROOT ?? "../frontend/public");
  try {
    const states = await listCampaignStates(resolve("state"));
    for (const state of states) assertSanitizedState(state);
    await validateWorkflowGates();
    await validateProductionProviderContracts(output);
    const review = await createReview({
      localDate: "2026-08-26",
      output,
      brandRoot: pathToFileURL(`${brandPath}/`),
      ...(process.env.FFMPEG_PATH
        ? { ffmpegPath: process.env.FFMPEG_PATH }
        : {}),
      ...(process.env.FFPROBE_PATH
        ? { ffprobePath: process.env.FFPROBE_PATH }
        : {}),
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, campaignId: review.plan.id, trackedCampaigns: states.length, providerContracts: 3 })}\n`,
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

validate().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown validation error";
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = 1;
});
