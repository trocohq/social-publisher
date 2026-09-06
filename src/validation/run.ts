import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadBrand } from "../brand/load-brand.js";
import { createReview } from "../dry-run/create-review.js";
import { verifyPublicAsset } from "../media/verify-public.js";
import { runBufferPreflight } from "../networks/buffer/preflight.js";
import {
  createBufferPost,
  createBufferPostInput,
} from "../networks/buffer/posts.js";
import { reconcileBufferPost } from "../networks/buffer/reconcile.js";
import { createCampaign } from "../planning/create-campaign.js";
import { resolveMediaBinaries } from "../render/binaries.js";
import {
  soundtrackForCampaign,
  verifyVerticalSoundtrack,
  verticalSoundtracks,
} from "../render/music.js";
import { safeAreaFor } from "../render/safe-area.js";
import {
  createVerticalSceneSvg,
  createVerticalThumbnailSvg,
  verticalScenes,
  verticalStackLayout,
} from "../render/svg.js";
import {
  treatmentForCampaign,
  verticalTreatments,
} from "../render/vertical-treatment.js";
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
      const channelFlags = [
        "INSTAGRAM_ENABLED: ${{ vars.INSTAGRAM_ENABLED || 'true' }}",
        "FACEBOOK_ENABLED: ${{ vars.FACEBOOK_ENABLED || 'true' }}",
        "TIKTOK_ENABLED: ${{ vars.TIKTOK_ENABLED || 'false' }}",
        "YOUTUBE_ENABLED: ${{ vars.YOUTUBE_ENABLED || 'true' }}",
      ];
      if (
        !source.includes("AUTO_PUBLISH: ${{ vars.AUTO_PUBLISH || 'false' }}") ||
        !source.includes(
          "BUFFER_YOUTUBE_CHANNEL_ID: ${{ vars.BUFFER_YOUTUBE_CHANNEL_ID }}",
        ) ||
        channelFlags.some((flag) => !source.includes(flag)) ||
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

async function validateProductionProviderContracts(): Promise<void> {
  const createInputs: Record<string, unknown>[] = [];
  const bufferFetch: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      query: string;
      variables?: { input?: Record<string, unknown> };
    };
    if (request.query.includes("CreateTrocoPost")) {
      const input = request.variables?.input;
      if (!input) throw new Error("Buffer create input is missing");
      createInputs.push(input);
      if (input.text === "GraphQL failure") {
        return jsonResponse({ errors: [{ message: "Invalid input" }] });
      }
      return jsonResponse({
        data: {
          createPost: {
            post: {
              id: `post_${createInputs.length}`,
              status:
                input.text === "Async failure"
                  ? "error"
                  : input.mode === "shareNow"
                    ? "sending"
                    : "scheduled",
              ...(input.mode === "shareNow"
                ? { dueAt: "2026-08-26T16:01:00.000Z" }
                : {}),
            },
          },
        },
      });
    }
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
            {
              id: "yt_validation",
              service: "youtube",
              serviceId: "UC_validation",
              organizationId: "org_validation",
              isQueuePaused: false,
              isDisconnected: false,
              isLocked: false,
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
      const filter = request.variables?.input?.filter as
        Record<string, unknown> | undefined;
      const immediate = !filter?.dueAt;
      return jsonResponse({
        data: {
          posts: {
            edges: [
              {
                node: {
                  id: immediate
                    ? "post_immediate_validation"
                    : "post_validation",
                  channelId: immediate ? "fb_validation" : "ig_validation",
                  dueAt: immediate
                    ? "2026-08-26T16:01:00.000Z"
                    : "2026-08-26T15:17:00.000Z",
                  text: immediate ? "Immediate validation" : "Troco certo",
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
      youtube: "yt_validation",
    },
    expectedServiceIds: { youtube: "UC_validation" },
    requiredSlots: { instagram: 1, facebook: 1, tiktok: 1, youtube: 1 },
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
  const immediateReconciliation = await reconcileBufferPost({
    apiKey: "fake-buffer-key",
    organizationId: "org_validation",
    expected: {
      channelId: "fb_validation",
      attemptedAt: ["2026-08-26T16:00:00.000Z"],
      text: "Immediate validation",
      mediaUrls: ["https://example.test/slide.jpg"],
    },
    fetchImplementation: bufferFetch,
  });
  if (
    immediateReconciliation.kind !== "success" ||
    immediateReconciliation.value?.id !== "post_immediate_validation" ||
    immediateReconciliation.value.status !== "published"
  ) {
    throw new Error("Buffer immediate reconciliation validation failed");
  }
  const commonBufferInput = {
    channel: "facebook" as const,
    channelId: "fb_validation",
    dueAt: "2026-08-26T15:17:00.000Z",
    mediaKind: "feed" as const,
    mediaUrls: ["https://example.test/slide.jpg"],
  };
  const scheduled = await createBufferPost({
    apiKey: "fake-buffer-key",
    input: createBufferPostInput({
      ...commonBufferInput,
      text: "Scheduled validation",
      phase: "scheduling",
    }),
    fetchImplementation: bufferFetch,
  });
  const immediate = await createBufferPost({
    apiKey: "fake-buffer-key",
    input: createBufferPostInput({
      ...commonBufferInput,
      text: "Immediate validation",
      phase: "publishing",
    }),
    fetchImplementation: bufferFetch,
  });
  const asynchronousFailure = await createBufferPost({
    apiKey: "fake-buffer-key",
    input: createBufferPostInput({
      ...commonBufferInput,
      text: "Async failure",
      phase: "publishing",
    }),
    fetchImplementation: bufferFetch,
  });
  const graphqlFailure = await createBufferPost({
    apiKey: "fake-buffer-key",
    input: createBufferPostInput({
      ...commonBufferInput,
      text: "GraphQL failure",
      phase: "publishing",
    }),
    fetchImplementation: bufferFetch,
  });
  const youtubeShort = await createBufferPost({
    apiKey: "fake-buffer-key",
    input: createBufferPostInput({
      channel: "youtube",
      channelId: "yt_validation",
      text: "YouTube description",
      title: "YouTube title",
      dueAt: "2026-08-26T15:17:00.000Z",
      phase: "scheduling",
      mediaKind: "video",
      mediaUrls: ["https://example.test/short.mp4"],
    }),
    fetchImplementation: bufferFetch,
  });
  if (
    scheduled.kind !== "success" ||
    scheduled.value.status !== "scheduled" ||
    immediate.kind !== "success" ||
    immediate.value.status !== "publishing" ||
    asynchronousFailure.kind !== "permanent_error" ||
    asynchronousFailure.category !== "buffer_async_failure" ||
    graphqlFailure.kind !== "permanent_error" ||
    graphqlFailure.category !== "buffer_graphql" ||
    youtubeShort.kind !== "success" ||
    youtubeShort.value.status !== "scheduled"
  ) {
    throw new Error("Buffer production create adapter validation failed");
  }
  const [scheduledInput, immediateInput, , , youtubeInput] = createInputs;
  if (
    scheduledInput?.schedulingType !== "automatic" ||
    scheduledInput.mode !== "customScheduled" ||
    typeof scheduledInput.dueAt !== "string" ||
    immediateInput?.schedulingType !== "automatic" ||
    immediateInput.mode !== "shareNow" ||
    "dueAt" in immediateInput ||
    !youtubeInput ||
    JSON.stringify(youtubeInput.metadata) !==
      JSON.stringify({
        youtube: {
          title: "YouTube title",
          categoryId: "27",
          privacy: "public",
          madeForKids: false,
          notifySubscribers: true,
          embeddable: true,
          license: "youtube",
          isAiGenerated: false,
        },
      })
  ) {
    throw new Error("Buffer CreatePostInput contract validation failed");
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
}

function assertValidation(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function campaignIdFor<T extends Readonly<{ id: string }>>(
  expected: T,
  select: (campaignId: string) => T,
): string {
  const campaignId = Array.from(
    { length: 500 },
    (_, index) => `validation-${index}`,
  ).find((candidate) => select(candidate).id === expected.id);
  assertValidation(
    campaignId,
    `No deterministic campaign fixture reaches ${expected.id}`,
  );
  assertValidation(
    select(campaignId).id === expected.id,
    `Campaign fixture for ${expected.id} is not stable`,
  );
  return campaignId;
}

async function validateCenteredVerticalCampaigns(
  brandRoot: URL,
): Promise<void> {
  assertValidation(
    verticalSoundtracks.length === 2,
    "The vertical catalog must contain exactly two soundtracks",
  );
  const sourceFiles = (
    await readdir(dirname(verticalSoundtracks[0]!.filePath), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mp3"))
    .map((entry) => entry.name)
    .sort();
  const catalogFiles = verticalSoundtracks
    .map((soundtrack) => soundtrack.filePath.split("/").at(-1)!)
    .sort();
  assertValidation(
    JSON.stringify(sourceFiles) === JSON.stringify(catalogFiles),
    "The vertical catalog must contain exactly the approved soundtrack sources",
  );
  const binaries = await resolveMediaBinaries({
    ...(process.env.FFMPEG_PATH ? { ffmpegPath: process.env.FFMPEG_PATH } : {}),
    ...(process.env.FFPROBE_PATH
      ? { ffprobePath: process.env.FFPROBE_PATH }
      : {}),
  });
  for (const soundtrack of verticalSoundtracks) {
    const probe = await verifyVerticalSoundtrack(
      soundtrack,
      binaries.ffprobePath,
    );
    assertValidation(
      Math.abs(probe.durationSeconds - 9) <= 0.05 &&
        probe.channels === 2 &&
        probe.sampleRate === 48_000,
      `Soundtrack ${soundtrack.id} does not satisfy the 9-second stereo 48 kHz contract`,
    );
  }

  const fixtureIds = new Set<string>();
  for (const soundtrack of verticalSoundtracks) {
    fixtureIds.add(campaignIdFor(soundtrack, soundtrackForCampaign));
  }
  assertValidation(
    fixtureIds.size === verticalSoundtracks.length,
    "Both soundtrack IDs must be reachable from stable campaign fixtures",
  );
  assertValidation(
    verticalTreatments.length === 7,
    "The vertical catalog must contain exactly seven color treatments",
  );
  for (const treatment of verticalTreatments) {
    fixtureIds.add(campaignIdFor(treatment, treatmentForCampaign));
  }
  assertValidation(
    new Set([...fixtureIds].map((id) => treatmentForCampaign(id).id)).size ===
      verticalTreatments.length,
    "All color treatments must be reachable from stable campaign fixtures",
  );

  const basePlan = createCampaign({
    localDate: "2026-08-26",
    publishTime: "12:17",
    history: [],
  });
  const frame = safeAreaFor(1080, 1920);
  const brand = await loadBrand(brandRoot);
  for (const campaignId of fixtureIds) {
    const plan = Object.freeze({ ...basePlan, id: campaignId });
    for (const scene of verticalScenes) {
      const layout = verticalStackLayout(plan, scene);
      assertValidation(
        layout.safeTop >= frame.y &&
          layout.safeBottom <= frame.bottom &&
          layout.top >= layout.safeTop &&
          layout.bottom <= layout.safeBottom &&
          (layout.top + layout.bottom) / 2 ===
            (layout.safeTop + layout.safeBottom) / 2,
        `Vertical ${scene} stack is not centered inside its safe bounds`,
      );
    }
    const thumbnail = createVerticalThumbnailSvg({ plan, brand });
    assertValidation(
      createVerticalSceneSvg({ plan, brand, scene: "hook" }) === thumbnail,
      "The hook and thumbnail must use the same vertical stack",
    );
    const treatment = treatmentForCampaign(campaignId);
    const expectedMark = Buffer.from(
      treatment.inverse ? brand.inverseMarkSvg : brand.markSvg,
    ).toString("base64");
    assertValidation(
      thumbnail.includes(expectedMark),
      `Vertical ${treatment.id} treatment selects the wrong canonical mark`,
    );
    const lockup = thumbnail.match(
      /<clipPath id="vertical-brand-clip"><rect [^>]*width="([\d.]+)" height="([\d.]+)" rx="([\d.]+)"\/>/u,
    );
    assertValidation(
      lockup &&
        Number(lockup[1]) === Number(lockup[2]) &&
        Number(lockup[3]) === Number(lockup[1]) * 0.22,
      "The canonical vertical lockup must keep its 22% corner radius",
    );
  }
}

async function validate(): Promise<void> {
  const output = await mkdtemp(join(tmpdir(), "troco-social-validation-"));
  const brandPath = resolve(process.env.BRAND_ROOT ?? "../frontend/public");
  try {
    const states = await listCampaignStates(resolve("state"));
    for (const state of states) assertSanitizedState(state);
    await validateWorkflowGates();
    await validateProductionProviderContracts();
    await validateCenteredVerticalCampaigns(pathToFileURL(`${brandPath}/`));
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
