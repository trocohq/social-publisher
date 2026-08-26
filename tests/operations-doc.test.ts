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
    "PUBLISH_ONE_CAMPAIGN",
    "Buffer",
    "YouTube",
    "GitHub Pages",
    "private",
    "verification",
    "token rotation",
    "never backfills",
  ]) {
    assert.match(document, new RegExp(phrase, "i"));
  }
});
