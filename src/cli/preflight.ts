import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bufferChannels,
  enabledBufferChannels,
  enabledPublicationChannels,
  publicationChannels,
  type BufferChannelName,
} from "../config/channels.js";
import { parseEnvironment } from "../config/environment.js";
import { mediaRecordFromState } from "../media/manifest.js";
import { publicMediaUrls } from "../media/pages.js";
import { verifyPublicAsset } from "../media/verify-public.js";
import { runBufferPreflight } from "../networks/buffer/preflight.js";
import type { CampaignState, PublicationChannel } from "../state/schema.js";
import { listCampaignStates, writeCampaignState } from "../state/storage.js";
import { transitionMedia, transitionProvider } from "../state/transitions.js";
import { parsePublishRequest, type PublishMode } from "./publish.js";

export function bufferSlotsNeeded(
  states: readonly CampaignState[],
  enabled: readonly BufferChannelName[] = bufferChannels,
): Readonly<Record<BufferChannelName, number>> {
  return Object.freeze(
    Object.fromEntries(
      bufferChannels.map((channel) => [
        channel,
        enabled.includes(channel)
          ? states.filter((state) =>
              ["deploying", "media_verified", "retryable"].includes(
                state.channels[channel].stage,
              ),
            ).length
          : 0,
      ]),
    ) as Record<BufferChannelName, number>,
  );
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
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
  for (const channel of publicationChannels) {
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
    youtubeEnabled: planning.enabled.youtube,
    youtubePublicationVerified: planning.youtube.publicationVerified,
    ...(campaignId ? { campaignId } : {}),
    ...(confirmation ? { confirmation } : {}),
    now: new Date(),
    publicationTimeZone: planning.publicationTimeZone,
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
  const activeBufferChannels = enabledBufferChannels(environment.enabled);
  if (activeBufferChannels.length > 0) {
    await runBufferPreflight({
      apiKey: environment.buffer.apiKey!,
      organizationId: environment.buffer.organizationId!,
      expectedChannelIds: environment.buffer.channelIds,
      expectedServiceIds:
        environment.enabled.youtube && environment.youtube.channelId
          ? { youtube: environment.youtube.channelId }
          : {},
      requiredSlots: bufferSlotsNeeded(operationStates, activeBufferChannels),
    });
  }

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
    `${JSON.stringify({ ok: true, providerChannels: enabledPublicationChannels(environment.enabled).length, verifiedCampaigns: verified })}\n`,
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
