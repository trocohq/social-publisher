import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseEnvironment,
  type PublisherEnvironment,
} from "../config/environment.js";
import { mediaRecordFromState } from "../media/manifest.js";
import { publicMediaUrls } from "../media/pages.js";
import {
  createBufferPost,
  createBufferPostInput,
} from "../networks/buffer/posts.js";
import {
  reconcileBufferPost,
  type BufferPostFingerprint,
} from "../networks/buffer/reconcile.js";
import { createYouTubeAccessTokenProvider } from "../networks/youtube/oauth.js";
import {
  reconcileYouTubeUpload,
  youtubeReconciliationResult,
} from "../networks/youtube/reconcile.js";
import {
  uploadYouTubeVideo,
  youtubeVideoResource,
} from "../networks/youtube/upload.js";
import {
  assertPublicationSucceeded,
  executePublication,
  type AdapterOutcome,
} from "../publishing/execute.js";
import { persistPublicationIntent } from "../publishing/intent.js";
import type { PublicationAction } from "../publishing/next-action.js";
import { localDateAt } from "../shared/time.js";
import type { CampaignState, PublicationChannel } from "../state/schema.js";
import { readCampaignState, writeCampaignState } from "../state/storage.js";

export type PublishMode = "scheduled" | "controlled";

export function parsePublishRequest(
  input: Readonly<{
    mode: PublishMode;
    autoPublish: boolean;
    youtubePublicationVerified?: boolean;
    campaignId?: string;
    confirmation?: string;
    now?: Date;
    publicationTimeZone?: string;
  }>,
): Readonly<{ mode: PublishMode; campaignId?: string }> {
  if (input.mode === "scheduled") {
    if (!input.autoPublish) {
      throw new Error("Scheduled provider writes are disabled by AUTO_PUBLISH");
    }
    if (!input.youtubePublicationVerified) {
      throw new Error("YouTube publication has not been verified");
    }
    return Object.freeze({ mode: "scheduled" });
  }
  if (
    !input.campaignId ||
    !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/.test(input.campaignId)
  ) {
    throw new Error("Controlled execution requires an exact campaign ID");
  }
  if (input.confirmation !== "PUBLISH_ONE_CAMPAIGN") {
    throw new Error("Controlled execution requires PUBLISH_ONE_CAMPAIGN");
  }
  const campaignDate = input.campaignId.slice(0, 10);
  if (
    campaignDate <=
    localDateAt(
      input.now ?? new Date(),
      input.publicationTimeZone ?? "America/Sao_Paulo",
    )
  ) {
    throw new Error("Controlled execution requires a future campaign");
  }
  return Object.freeze({ mode: "controlled", campaignId: input.campaignId });
}

export function parseAction(value: string): PublicationAction {
  const separator = value.lastIndexOf(":");
  if (separator < 1) throw new Error("Invalid publication action");
  const campaignId = value.slice(0, separator);
  const channel = value.slice(separator + 1) as PublicationChannel;
  if (
    !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/.test(campaignId) ||
    !["instagram", "facebook", "tiktok", "youtube"].includes(channel)
  ) {
    throw new Error("Invalid publication action");
  }
  return {
    campaignId,
    localDate: campaignId.slice(0, 10),
    channel,
    phase: "scheduling",
  };
}

function channelText(
  state: CampaignState,
  channel: PublicationChannel,
): string {
  if (channel === "instagram")
    return state.plan.copy.channels.instagram.caption;
  if (channel === "facebook") return state.plan.copy.channels.facebook.caption;
  if (channel === "tiktok") return state.plan.copy.channels.tiktok.caption;
  return state.plan.copy.channels.youtube.description;
}

export function bufferFingerprintForAction({
  state,
  channel,
  channelId,
  phase,
  dueAt,
  text,
  mediaUrls,
}: Readonly<{
  state: CampaignState;
  channel: Exclude<PublicationChannel, "youtube">;
  channelId: string;
  phase: PublicationAction["phase"];
  dueAt: string;
  text: string;
  mediaUrls: readonly string[];
}>): BufferPostFingerprint {
  const record = state.channels[channel];
  if (phase === "scheduling") {
    return {
      channelId,
      ...(record.providerId ? { providerId: record.providerId } : {}),
      dueAt,
      text,
      mediaUrls,
    };
  }

  const attemptedAt = record.transitions
    .filter((transition) => transition.to === "publishing")
    .map((transition) => transition.at);
  if (!record.providerId && attemptedAt.length === 0) {
    throw new Error("Immediate Buffer intent has no persisted attempt time");
  }
  return {
    channelId,
    ...(record.providerId ? { providerId: record.providerId } : {}),
    attemptedAt,
    text,
    mediaUrls,
  };
}

export function providerAdaptersForAction({
  state,
  channel,
  mode,
  phase,
  environment,
  renderRoot,
}: Readonly<{
  state: CampaignState;
  channel: PublicationChannel;
  mode: PublishMode;
  phase: PublicationAction["phase"];
  environment: PublisherEnvironment;
  renderRoot: string;
}>): Readonly<{
  reconcile: () => Promise<AdapterOutcome>;
  create: () => Promise<AdapterOutcome>;
}> {
  const record = mediaRecordFromState(state);
  const urls = publicMediaUrls(environment.pagesOrigin, record);
  const dueAt = new Date(state.plan.targetAt).toISOString();

  if (channel !== "youtube") {
    const apiKey = environment.buffer.apiKey;
    if (!apiKey) throw new Error("Buffer provider credentials are unavailable");
    const channelId = environment.buffer.channelIds[channel];
    const mediaKind =
      state.plan.mediaKind === "video" ? "video" : state.plan.mediaKind;
    const mediaUrls = mediaKind === "video" ? [urls.video] : urls.feed;
    const input = createBufferPostInput({
      channel,
      channelId,
      text: channelText(state, channel),
      dueAt,
      phase,
      mediaKind,
      mediaUrls,
      ...(channel === "tiktok"
        ? { title: state.plan.copy.channels.tiktok.title }
        : {}),
    });
    return {
      reconcile: () =>
        reconcileBufferPost({
          apiKey,
          organizationId: environment.buffer.organizationId,
          expected: bufferFingerprintForAction({
            state,
            channel,
            channelId,
            phase,
            dueAt,
            text: input.text,
            mediaUrls,
          }),
        }),
      create: () => createBufferPost({ apiKey, input }),
    };
  }

  const { clientId, clientSecret, refreshToken } = environment.youtube;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YouTube provider credentials are unavailable");
  }
  const tokenProvider = createYouTubeAccessTokenProvider({
    clientId,
    clientSecret,
    refreshToken,
  });
  return {
    reconcile: async (): Promise<AdapterOutcome> => {
      const match = await reconcileYouTubeUpload({
        campaignId: state.plan.id,
        accessToken: await tokenProvider.getAccessToken(),
      });
      if (!match) return undefined;
      return youtubeReconciliationResult(
        match,
        mode === "scheduled" ? dueAt : undefined,
      );
    },
    create: async () => {
      if (mode === "scheduled" && !environment.youtube.publicationVerified) {
        throw new Error("YouTube publication has not been verified");
      }
      return uploadYouTubeVideo({
        accessToken: await tokenProvider.getAccessToken(),
        filePath: resolve(
          renderRoot,
          state.plan.localDate,
          state.plan.id,
          "video/short.mp4",
        ),
        resource: youtubeVideoResource({
          campaignId: state.plan.id,
          title: state.plan.copy.channels.youtube.title,
          description: state.plan.copy.channels.youtube.description,
          ...(mode === "scheduled" ? { publishAt: dueAt } : {}),
        }),
      });
    },
  };
}

function flagValues(args: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !value || !flag.startsWith("--")) {
      throw new Error("Publish arguments must be flag-value pairs");
    }
    values.set(flag, value);
  }
  return values;
}

async function run(args: readonly string[]): Promise<void> {
  const flags = flagValues(args);
  const phase = flags.get("--phase");
  const actionValue = flags.get("--action");
  const mode = flags.get("--mode") as PublishMode | undefined;
  if (!actionValue || (phase !== "intent" && phase !== "execute") || !mode) {
    throw new Error(
      "Required: --phase intent|execute --action ID:channel --mode scheduled|controlled",
    );
  }
  const parsedAction = parseAction(actionValue);
  const planningEnvironment = parseEnvironment(process.env, "planning");
  const confirmation = flags.get("--confirm");
  const now = new Date();
  parsePublishRequest({
    mode,
    autoPublish: planningEnvironment.autoPublish,
    youtubePublicationVerified: planningEnvironment.youtube.publicationVerified,
    campaignId: parsedAction.campaignId,
    ...(confirmation ? { confirmation } : {}),
    now,
    publicationTimeZone: planningEnvironment.publicationTimeZone,
  });
  const stateRoot = resolve(flags.get("--state-root") ?? "state");
  const state = await readCampaignState(stateRoot, parsedAction.localDate);
  if (state.plan.id !== parsedAction.campaignId)
    throw new Error("Action campaign does not match state");
  const action: PublicationAction = {
    ...parsedAction,
    phase:
      new Date(state.plan.targetAt).valueOf() > now.valueOf()
        ? "scheduling"
        : "publishing",
  };

  if (phase === "intent") {
    const intended = await persistPublicationIntent({
      state,
      action,
      now,
      stateRoot,
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, phase, campaignId: action.campaignId, channel: action.channel, stage: intended.channels[action.channel].stage })}\n`,
    );
    return;
  }

  const environment = parseEnvironment(process.env, "provider");
  const adapters = providerAdaptersForAction({
    state,
    channel: action.channel,
    mode,
    phase: action.phase,
    environment,
    renderRoot: resolve(flags.get("--render-root") ?? ".tmp/render"),
  });
  const completed = await executePublication({
    state,
    channel: action.channel,
    reconcile: adapters.reconcile,
    create: adapters.create,
    now,
    persist: (value) => writeCampaignState(stateRoot, value),
  });
  assertPublicationSucceeded(completed, action.channel);
  process.stdout.write(
    `${JSON.stringify({ ok: true, phase, campaignId: action.campaignId, channel: action.channel, stage: completed.channels[action.channel].stage })}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Publication failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
