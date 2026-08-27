import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("operations document keeps unattended publication behind verified activation", async () => {
  const document = await readFile(
    new URL("../docs/operations.md", import.meta.url),
    "utf8",
  );
  for (const phrase of [
    "AUTO_PUBLISH=false",
    "YOUTUBE_PUBLICATION_VERIFIED=false",
    "BUFFER_YOUTUBE_CHANNEL_ID",
    "PUBLISH_ONE_CAMPAIGN",
    "Buffer",
    "YouTube",
    "GitHub Pages",
    "private",
    "verification",
    "token rotation",
    "never backfills",
    "TIKTOK_ENABLED=false",
    "skipped_disabled",
    "newly created campaigns only",
    "MIGRATE_PRIVATE_YOUTUBE_TO_BUFFER",
  ]) {
    assert.match(document, new RegExp(phrase, "i"));
  }
});
