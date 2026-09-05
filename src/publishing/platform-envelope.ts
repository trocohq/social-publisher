import { createHash } from "node:crypto";

import {
  campaignMediaRecordSchema,
  type CampaignMediaRecord,
  type MediaAsset,
} from "../media/manifest.js";
import {
  campaignStateSchema,
  type CampaignState,
  type PublicationChannel,
} from "../state/schema.js";

type PlatformArtifact = Readonly<{
  id: string;
  storage: "r2-temporary";
  sha256: string;
  byteSize: number;
  mediaType: string;
  locator: string;
}>;

export type PlatformShadowEnvelope = Readonly<{
  schemaVersion: 1;
  identity: Readonly<{
    tenant: "troco";
    sourceType: "campaign";
    sourceId: string;
    revision: string;
    idempotencyKey: string;
  }>;
  canonical: Readonly<{
    title: string;
    summary: string;
    language: "pt-BR";
  }>;
  artifacts: readonly PlatformArtifact[];
  deliveries: readonly Readonly<{
    id: PublicationChannel;
    adapter: "social.shadow";
    operation: "compare";
    required: false;
    payload: Readonly<{
      type: "social.post";
      text: string;
      artifactIds: readonly string[];
      title?: string;
    }>;
    providerOptions: Readonly<{
      channel: PublicationChannel;
      targetAt: string;
    }>;
  }>[];
}>;

function revision(state: CampaignState, media: CampaignMediaRecord): string {
  const canonical = JSON.stringify({
    campaignId: state.plan.id,
    plan: state.plan,
    assets: media.assets.map(({ kind, filename, hash, bytes }) => ({
      kind,
      filename,
      hash,
      bytes,
    })),
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function artifactId(asset: MediaAsset): string {
  return `media-${asset.hash}`;
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

function channelTitle(
  state: CampaignState,
  channel: PublicationChannel,
): string | undefined {
  if (channel === "tiktok") return state.plan.copy.channels.tiktok.title;
  if (channel === "youtube") return state.plan.copy.channels.youtube.title;
  return undefined;
}

function mediaKind(
  state: CampaignState,
  channel: PublicationChannel,
): MediaAsset["kind"] {
  return channel === "youtube" || state.plan.mediaKind === "video"
    ? "video"
    : "feed";
}

export function toPlatformShadowEnvelope(
  input: Readonly<{
    state: CampaignState;
    media: CampaignMediaRecord;
  }>,
): PlatformShadowEnvelope {
  const state = campaignStateSchema.parse(input.state);
  const media = campaignMediaRecordSchema.parse(input.media);
  if (
    media.campaignId !== state.plan.id ||
    media.localDate !== state.plan.localDate
  ) {
    throw new Error("Platform media does not match campaign state");
  }
  if (["planned", "rendered", "deploying"].includes(state.media.stage)) {
    throw new Error("Platform shadow preparation requires verified media");
  }
  if (media.assets.some(({ bytes }) => bytes === undefined)) {
    throw new Error("Platform artifacts require verified byte sizes");
  }

  const artifacts = media.assets.map((asset): PlatformArtifact => ({
    id: artifactId(asset),
    storage: "r2-temporary",
    sha256: asset.hash,
    byteSize: asset.bytes!,
    mediaType: asset.contentType,
    locator: `temporary/troco/${media.campaignId}/${asset.kind}/${asset.filename}`,
  }));
  const contentRevision = revision(state, media);
  const channels: readonly PublicationChannel[] = [
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
  ];

  return {
    schemaVersion: 1,
    identity: {
      tenant: "troco",
      sourceType: "campaign",
      sourceId: state.plan.id,
      revision: contentRevision,
      idempotencyKey: `troco:campaign:${state.plan.id}:${contentRevision}`,
    },
    canonical: {
      title: state.plan.copy.headline,
      summary: state.plan.copy.explanation,
      language: "pt-BR",
    },
    artifacts,
    deliveries: channels.map((channel) => {
      const title = channelTitle(state, channel);
      return {
        id: channel,
        adapter: "social.shadow",
        operation: "compare",
        required: false,
        payload: {
          type: "social.post",
          text: channelText(state, channel),
          artifactIds: artifacts
            .filter(
              (_, index) =>
                media.assets[index]?.kind === mediaKind(state, channel),
            )
            .map(({ id }) => id),
          ...(title ? { title } : {}),
        },
        providerOptions: { channel, targetAt: state.plan.targetAt },
      };
    }),
  };
}
