import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createReview } from "../dry-run/create-review.js";
import { verifyPublicAsset } from "../media/verify-public.js";
import { bufferGraphql } from "../networks/buffer/graphql.js";
import { createYouTubeAccessTokenProvider } from "../networks/youtube/oauth.js";
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

async function validateFakeProviderTransports(): Promise<void> {
  let bufferBody = "";
  const buffer = await bufferGraphql<{ viewer: { id: string } }>({
    apiKey: "fake-buffer-key",
    query: "query TrocoValidation($id: ID!) { viewer(id: $id) { id } }",
    variables: { id: "viewer_1" },
    fetchImplementation: async (_input, init) => {
      bufferBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({ data: { viewer: { id: "viewer_1" } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  if (
    buffer.kind !== "success" ||
    !JSON.parse(bufferBody).variables?.id ||
    JSON.parse(bufferBody).query.includes("viewer_1")
  ) {
    throw new Error("Buffer variables-only transport validation failed");
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
}

async function validate(): Promise<void> {
  const output = await mkdtemp(join(tmpdir(), "troco-social-validation-"));
  const brandPath = resolve(process.env.BRAND_ROOT ?? "../frontend/public");
  try {
    const states = await listCampaignStates(resolve("state"));
    for (const state of states) assertSanitizedState(state);
    await validateWorkflowGates();
    await validateFakeProviderTransports();
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
      `${JSON.stringify({ ok: true, campaignId: review.plan.id, trackedCampaigns: states.length, fakeProviders: 3 })}\n`,
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
