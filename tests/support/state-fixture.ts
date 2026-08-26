import { createCampaign } from "../../src/planning/create-campaign.js";
import {
  campaignStateSchema,
  type CampaignState,
  type Stage,
} from "../../src/state/schema.js";

type ChannelOverrides = Partial<
  Readonly<Record<"instagram" | "facebook" | "tiktok" | "youtube", Stage>>
>;

export function campaignStateFixture(
  overrides: ChannelOverrides = {},
): CampaignState {
  const plan = createCampaign({
    localDate: "2026-08-26",
    publishTime: "12:17",
    history: [],
  });
  const channel = (stage: Stage) => ({
    stage,
    attempts: 0,
    transitions: [],
  });

  return campaignStateSchema.parse({
    schemaVersion: 1,
    plan,
    sourceCommits: {
      brand: "298381c8e6c3220cde11a8109ddb727a28223d7c",
      designTokens: "1fefd27a0de14a8d4115fe79c6076a3b17d3cf6d",
    },
    renderHashes: {
      feed: ["a".repeat(64)],
      video: "b".repeat(64),
    },
    media: channel("media_verified"),
    channels: {
      instagram: channel(overrides.instagram ?? "media_verified"),
      facebook: channel(overrides.facebook ?? "media_verified"),
      tiktok: channel(overrides.tiktok ?? "media_verified"),
      youtube: channel(overrides.youtube ?? "media_verified"),
    },
  });
}
