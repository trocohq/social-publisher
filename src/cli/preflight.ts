import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnvironment } from "../config/environment.js";
import { mediaRecordFromState } from "../media/manifest.js";
import { publicMediaUrls } from "../media/pages.js";
import { verifyPublicAsset } from "../media/verify-public.js";
import { runBufferPreflight } from "../networks/buffer/preflight.js";
import { createYouTubeAccessTokenProvider } from "../networks/youtube/oauth.js";
import type { CampaignState, PublicationChannel } from "../state/schema.js";
import { listCampaignStates, writeCampaignState } from "../state/storage.js";
import { transitionMedia, transitionProvider } from "../state/transitions.js";
import { parsePublishRequest, type PublishMode } from "./publish.js";

const channels = ["instagram", "facebook", "tiktok", "youtube"] as const;
const bufferChannels = ["instagram", "facebook", "tiktok"] as const;

export function bufferSlotsNeeded(
  states: readonly CampaignState[],
): Readonly<Record<(typeof bufferChannels)[number], number>> {
  return Object.freeze(
    Object.fromEntries(
      bufferChannels.map((channel) => [
        channel,
        states.filter((state) =>
          ["deploying", "media_verified", "retryable"].includes(
            state.channels[channel].stage,
          ),
        ).length,
      ]),
    ) as Record<(typeof bufferChannels)[number], number>,
  );
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function assertYouTubeChannel(
  accessToken: string,
  expectedChannelId: string,
): Promise<void> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "id");
  url.searchParams.set("mine", "true");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("YouTube channel preflight failed");
  const payload = (await response.json()) as {
    items?: readonly { id?: string }[];
  };
  const ids = payload.items?.map((item) => item.id).filter(Boolean) ?? [];
  if (ids.length !== 1 || ids[0] !== expectedChannelId) {
    throw new Error(
      "Authenticated YouTube channel does not match configuration",
    );
  }
}

async function verifyCampaignMedia(
  state: CampaignState,
  pagesOrigin: string,
): Promise<void> {
  const record = mediaRecordFromState(state);
  const urls = publicMediaUrls(pagesOrigin, record);
  let feedIndex = 0;
  for (const asset of record.assets) {
    const url = asset.kind === "video" ? urls.video : urls.feed[feedIndex++]!;
    await verifyPublicAsset({
      url,
      expectedHash: asset.hash,
      expectedContentType: asset.contentType,
      ...(asset.bytes ? { expectedLength: asset.bytes } : {}),
    });
  }
}

function markMediaVerified(state: CampaignState, now: Date): CampaignState {
  let next = transitionMedia(state, "media_verified", now);
  for (const channel of channels) {
    if (next.channels[channel].stage === "deploying") {
      next = transitionProvider(next, channel, "media_verified", now);
    }
  }
  return next;
}

async function run(args: readonly string[]): Promise<void> {
  const planning = parseEnvironment(process.env, "planning");
  const mode = (valueAfter(args, "--mode") ?? "scheduled") as PublishMode;
  const campaignId = valueAfter(args, "--campaign");
  const confirmation = valueAfter(args, "--confirm");
  parsePublishRequest({
    mode,
    autoPublish: planning.autoPublish,
    ...(campaignId ? { campaignId } : {}),
    ...(confirmation ? { confirmation } : {}),
  });
  const environment = parseEnvironment(process.env, "provider");
  const stateRoot = resolve(valueAfter(args, "--state-root") ?? "state");
  const states = await listCampaignStates(stateRoot);
  const operationStates = campaignId
    ? states.filter((state) => state.plan.id === campaignId)
    : states;
  if (campaignId && operationStates.length !== 1) {
    throw new Error("Controlled campaign was not found in state");
  }
  await runBufferPreflight({
    apiKey: environment.buffer.apiKey!,
    organizationId: environment.buffer.organizationId,
    expectedChannelIds: environment.buffer.channelIds,
    requiredSlots: bufferSlotsNeeded(operationStates),
  });
  const tokenProvider = createYouTubeAccessTokenProvider({
    clientId: environment.youtube.clientId!,
    clientSecret: environment.youtube.clientSecret!,
    refreshToken: environment.youtube.refreshToken!,
  });
  await assertYouTubeChannel(
    await tokenProvider.getAccessToken(),
    environment.youtube.channelId,
  );

  const selected = campaignId
    ? operationStates
    : states.filter((state) => state.media.stage === "deploying");
  let verified = 0;
  for (const state of selected) {
    if (
      state.sourceCommits.brand !== environment.brandSourceSha ||
      state.sourceCommits.designTokens !== environment.designTokensSourceSha
    ) {
      throw new Error(`Source commit mismatch for ${state.plan.id}`);
    }
    if (state.media.stage !== "deploying") continue;
    await verifyCampaignMedia(state, environment.pagesOrigin);
    await writeCampaignState(stateRoot, markMediaVerified(state, new Date()));
    verified += 1;
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, providerChannels: 4, verifiedCampaigns: verified })}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Preflight failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
