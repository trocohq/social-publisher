import assert from "node:assert/strict";
import test from "node:test";

import { parseEnvironment } from "../src/config/environment.js";

const valid = {
  AUTO_PUBLISH: "false",
  PUBLICATION_TIME_ZONE: "America/Sao_Paulo",
  PUBLISH_TIME: "12:17",
  PAGES_ORIGIN: "https://trocohq.github.io/social-publisher",
  BUFFER_ORGANIZATION_ID: "org_1",
  BUFFER_INSTAGRAM_CHANNEL_ID: "ig_1",
  BUFFER_FACEBOOK_CHANNEL_ID: "fb_1",
  BUFFER_TIKTOK_CHANNEL_ID: "tt_1",
  YOUTUBE_CHANNEL_ID: "UC123",
  PLAY_STORE_URL:
    "https://play.google.com/store/apps/details?id=trocofacil.app",
  BRAND_SOURCE_SHA: "298381c8e6c3220cde11a8109ddb727a28223d7c",
  DESIGN_TOKENS_SOURCE_SHA: "1fefd27a0de14a8d4115fe79c6076a3b17d3cf6d",
};

test("automatic publishing defaults false and accepts only allowlisted HTTPS origins", () => {
  const environment = parseEnvironment(valid);
  assert.equal(environment.autoPublish, false);
  assert.equal(environment.youtube.publicationVerified, false);
  assert.equal(environment.origins.buffer, "https://api.buffer.com");
  assert.throws(
    () => parseEnvironment({ ...valid, AUTO_PUBLISH: "yes" }),
    /AUTO_PUBLISH/,
  );
  assert.throws(
    () => parseEnvironment({ ...valid, PAGES_ORIGIN: "http://example.com" }),
    /PAGES_ORIGIN/,
  );
  assert.throws(
    () => parseEnvironment({ ...valid, PUBLICATION_TIME_ZONE: "Mars/Olympus" }),
    /PUBLICATION_TIME_ZONE/,
  );
  assert.throws(
    () =>
      parseEnvironment({
        ...valid,
        PUBLICATION_TIME_ZONE: "America/New_York",
      }),
    /PUBLICATION_TIME_ZONE/,
  );
  assert.equal(
    parseEnvironment({ ...valid, YOUTUBE_PUBLICATION_VERIFIED: "true" }).youtube
      .publicationVerified,
    true,
  );
  assert.throws(
    () => parseEnvironment({ ...valid, YOUTUBE_PUBLICATION_VERIFIED: "yes" }),
    /YOUTUBE_PUBLICATION_VERIFIED/,
  );
});

test("production secrets are required only for provider execution", () => {
  assert.doesNotThrow(() => parseEnvironment(valid, "planning"));
  assert.throws(() => parseEnvironment(valid, "provider"), /BUFFER_API_KEY/);
  assert.doesNotThrow(() =>
    parseEnvironment(
      {
        ...valid,
        BUFFER_API_KEY: "buffer-value",
        YOUTUBE_CLIENT_ID: "client",
        YOUTUBE_CLIENT_SECRET: "client-secret",
        YOUTUBE_REFRESH_TOKEN: "refresh",
      },
      "provider",
    ),
  );
});

test("disabled channels do not require provider configuration", () => {
  const environment = parseEnvironment({
    ...valid,
    TIKTOK_ENABLED: "false",
    BUFFER_TIKTOK_CHANNEL_ID: "",
  });
  assert.deepEqual(environment.enabled, {
    instagram: true,
    facebook: true,
    tiktok: false,
    youtube: true,
  });
  assert.equal(environment.buffer.channelIds.tiktok, undefined);
});

test("all publication channels default enabled and flags are strict", () => {
  assert.deepEqual(parseEnvironment(valid).enabled, {
    instagram: true,
    facebook: true,
    tiktok: true,
    youtube: true,
  });
  for (const field of [
    "INSTAGRAM_ENABLED",
    "FACEBOOK_ENABLED",
    "TIKTOK_ENABLED",
    "YOUTUBE_ENABLED",
  ]) {
    assert.throws(
      () => parseEnvironment({ ...valid, [field]: "yes" }),
      new RegExp(field),
    );
  }
});

test("enabled channels require their own identifiers", () => {
  const { BUFFER_TIKTOK_CHANNEL_ID: _tiktok, ...withoutTikTokId } = valid;
  assert.throws(
    () => parseEnvironment(withoutTikTokId),
    /BUFFER_TIKTOK_CHANNEL_ID/,
  );
});

test("at least one publication channel must remain enabled", () => {
  assert.throws(
    () =>
      parseEnvironment({
        ...valid,
        INSTAGRAM_ENABLED: "false",
        FACEBOOK_ENABLED: "false",
        TIKTOK_ENABLED: "false",
        YOUTUBE_ENABLED: "false",
      }),
    /enabled social channel/,
  );
});

test("disabled YouTube does not require OAuth during provider execution", () => {
  const { YOUTUBE_CHANNEL_ID: _youtube, ...withoutYouTube } = valid;
  assert.doesNotThrow(() =>
    parseEnvironment(
      {
        ...withoutYouTube,
        BUFFER_API_KEY: "buffer-value",
        YOUTUBE_ENABLED: "false",
      },
      "provider",
    ),
  );
});

test("YouTube-only execution does not require Buffer configuration", () => {
  const {
    BUFFER_ORGANIZATION_ID: _organization,
    BUFFER_INSTAGRAM_CHANNEL_ID: _instagram,
    BUFFER_FACEBOOK_CHANNEL_ID: _facebook,
    BUFFER_TIKTOK_CHANNEL_ID: _tiktok,
    ...withoutBuffer
  } = valid;
  assert.doesNotThrow(() =>
    parseEnvironment(
      {
        ...withoutBuffer,
        INSTAGRAM_ENABLED: "false",
        FACEBOOK_ENABLED: "false",
        TIKTOK_ENABLED: "false",
        YOUTUBE_CLIENT_ID: "client",
        YOUTUBE_CLIENT_SECRET: "client-secret",
        YOUTUBE_REFRESH_TOKEN: "refresh",
      },
      "provider",
    ),
  );
});
