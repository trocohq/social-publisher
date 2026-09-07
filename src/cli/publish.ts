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
import {
  assertPublicationSucceeded,
  executePublication,
  type AdapterOutcome,
} from "../publishing/execute.js";
import { persistPublicationIntent } from "../publishing/intent.js";
import type { PublicationAction } from "../publishing/next-action.js";
import {
  capturePlatformMedia,
  submitPlatformShadow,
} from "../publishing/platform-bridge.js";
import { localDateAt } from "../shared/time.js";
import type { CampaignState, PublicationChannel } from "../state/schema.js";
import { readCampaignState, writeCampaignState } from "../state/storage.js";

export type PublishMode = "scheduled" | "controlled";

export function parsePublishRequest(
  input: Readonly<{
    mode: PublishMode;
    autoPublish: boolean;
    youtubeEnabled?: boolean;
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
    if (input.youtubeEnabled !== false && !input.youtubePublicationVerified) {
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
  channel: PublicationChannel;
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

export function providerAdaptersForAction(
  input: Readonly<{
    state: CampaignState;
    channel: PublicationChannel;
    mode: PublishMode;
    phase: PublicationAction["phase"];
    environment: PublisherEnvironment;
    renderRoot: string;
    bufferFetchImplementation?: typeof fetch;
  }>,
): Readonly<{
  reconcile: () => Promise<AdapterOutcome>;
  create: () => Promise<AdapterOutcome>;
}> {
  const { state, channel, phase, environment, bufferFetchImplementation } =
    input;
  assertPublicationChannelEnabled(environment, channel);
  const record = mediaRecordFromState(state);
  const urls = publicMediaUrls(environment.pagesOrigin, record);
  const dueAt = new Date(state.plan.targetAt).toISOString();
  const apiKey = environment.buffer.apiKey;
  const channelId = environment.buffer.channelIds[channel];
  const organizationId = environment.buffer.organizationId;
  if (!apiKey || !channelId || !organizationId) {
    throw new Error("Buffer provider credentials are unavailable");
  }
  const mediaKind =
    channel === "youtube"
      ? "video"
      : state.plan.mediaKind === "video"
        ? "video"
        : state.plan.mediaKind;
  const mediaUrls = mediaKind === "video" ? [urls.video] : urls.feed;
  const postInput = createBufferPostInput({
    channel,
    channelId,
    text: channelText(state, channel),
    dueAt,
    phase,
    mediaKind,
    mediaUrls,
    ...(channel === "tiktok"
      ? { title: state.plan.copy.channels.tiktok.title }
      : channel === "youtube"
        ? { title: state.plan.copy.channels.youtube.title }
        : {}),
  });
  return {
    reconcile: () =>
      reconcileBufferPost({
        apiKey,
        organizationId,
        expected: bufferFingerprintForAction({
          state,
          channel,
          channelId,
          phase,
          dueAt,
          text: postInput.text,
          mediaUrls,
        }),
        ...(bufferFetchImplementation
          ? { fetchImplementation: bufferFetchImplementation }
          : {}),
      }),
    create: () =>
      createBufferPost({
        apiKey,
        input: postInput,
        ...(bufferFetchImplementation
          ? { fetchImplementation: bufferFetchImplementation }
          : {}),
      }),
  };
}

export function assertPublicationChannelEnabled(
  environment: PublisherEnvironment,
  channel: PublicationChannel,
): void {
  if (!environment.enabled[channel]) {
    throw new Error(`${channel} publication channel is disabled`);
  }
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

export async function runPublish(
  args: readonly string[],
  dependencies: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    fetchImplementation?: typeof fetch;
  }> = {},
): Promise<void> {
  const source = dependencies.environment ?? process.env;
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
  const planningEnvironment = parseEnvironment(source, "planning");
  assertPublicationChannelEnabled(planningEnvironment, parsedAction.channel);
  const confirmation = flags.get("--confirm");
  const now = new Date();
  parsePublishRequest({
    mode,
    autoPublish: planningEnvironment.autoPublish,
    youtubeEnabled: planningEnvironment.enabled.youtube,
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

  const renderRoot = resolve(flags.get("--render-root") ?? ".tmp/render");
  if (phase === "intent") {
    const intended = await persistPublicationIntent({
      state:
        source.PUBLISHING_SHADOW_ENABLED === "true"
          ? await capturePlatformMedia({ state, renderRoot })
          : state,
      action,
      now,
      stateRoot,
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, phase, campaignId: action.campaignId, channel: action.channel, stage: intended.channels[action.channel].stage })}\n`,
    );
    return;
  }

  const environment = parseEnvironment(source, "provider");
  const activeStage = state.channels[action.channel].stage;
  if (activeStage !== "scheduling" && activeStage !== "publishing") {
    throw new Error("Publication execution requires a persisted active intent");
  }
  if (source.PUBLISHING_SHADOW_ENABLED === "true" && !state.platformMedia) {
    throw new Error(
      "Publication execution requires a persisted platform media checkpoint",
    );
  }
  const shadow = await submitPlatformShadow({
    state,
    renderRoot,
    outboxDirectory: resolve(
      flags.get("--publishing-outbox-root") ?? ".publishing/shadow",
    ),
    environment: source,
    ...(dependencies.fetchImplementation
      ? { fetchImplementation: dependencies.fetchImplementation }
      : {}),
  });
  if (shadow.outcome === "retry-later") {
    throw new Error("Platform shadow deferred; retry this invocation later");
  }
  const adapters = providerAdaptersForAction({
    state,
    channel: action.channel,
    mode,
    phase: action.phase,
    environment,
    renderRoot,
    ...(dependencies.fetchImplementation
      ? { bufferFetchImplementation: dependencies.fetchImplementation }
      : {}),
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
  runPublish(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Publication failed" })}\n`,
    );
    process.exitCode = 1;
  });
}
