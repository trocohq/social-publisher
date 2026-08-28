import type { ChannelEnablement } from "../../src/config/channels.js";
import {
  parseEnvironment,
  type PublisherEnvironment,
} from "../../src/config/environment.js";

export function publisherEnvironmentFixture(
  overrides: Partial<ChannelEnablement> = {},
): PublisherEnvironment {
  const enabled: ChannelEnablement = {
    instagram: overrides.instagram ?? true,
    facebook: overrides.facebook ?? true,
    tiktok: overrides.tiktok ?? true,
    youtube: overrides.youtube ?? true,
  };

  return parseEnvironment(
    {
      AUTO_PUBLISH: "false",
      YOUTUBE_PUBLICATION_VERIFIED: "false",
      INSTAGRAM_ENABLED: String(enabled.instagram),
      FACEBOOK_ENABLED: String(enabled.facebook),
      TIKTOK_ENABLED: String(enabled.tiktok),
      YOUTUBE_ENABLED: String(enabled.youtube),
      PUBLICATION_TIME_ZONE: "America/Sao_Paulo",
      PUBLISH_TIME: "12:17",
      PAGES_ORIGIN: "https://trocohq.github.io/social-publisher",
      BUFFER_ORGANIZATION_ID: "org_1",
      BUFFER_INSTAGRAM_CHANNEL_ID: "ig_1",
      BUFFER_FACEBOOK_CHANNEL_ID: "fb_1",
      ...(enabled.tiktok ? { BUFFER_TIKTOK_CHANNEL_ID: "tt_1" } : {}),
      ...(enabled.youtube
        ? {
            BUFFER_YOUTUBE_CHANNEL_ID: "yt_1",
            YOUTUBE_CHANNEL_ID: "UC123",
          }
        : {}),
      APP_DOWNLOAD_URL: "https://troco.net",
      BRAND_SOURCE_SHA: "298381c8e6c3220cde11a8109ddb727a28223d7c",
      DESIGN_TOKENS_SOURCE_SHA: "1fefd27a0de14a8d4115fe79c6076a3b17d3cf6d",
      BUFFER_API_KEY: "buffer-value",
    },
    "provider",
  );
}
