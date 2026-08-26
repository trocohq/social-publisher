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
