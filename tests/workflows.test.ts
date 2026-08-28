import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production workflow is serialized, disabled by default, and runs every three hours", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/publish.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /cron: ['"]17 \*\/3 \* \* \*['"]/);
  assert.match(workflow, /group: troco-social-publication/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(
    workflow,
    /AUTO_PUBLISH: \$\{\{ vars\.AUTO_PUBLISH \|\| 'false' \}\}/,
  );
  assert.match(
    workflow,
    /YOUTUBE_PUBLICATION_VERIFIED: \$\{\{ vars\.YOUTUBE_PUBLICATION_VERIFIED \|\| 'false' \}\}/,
  );
  for (const pattern of [
    /INSTAGRAM_ENABLED: \$\{\{ vars\.INSTAGRAM_ENABLED \|\| 'true' \}\}/,
    /FACEBOOK_ENABLED: \$\{\{ vars\.FACEBOOK_ENABLED \|\| 'true' \}\}/,
    /TIKTOK_ENABLED: \$\{\{ vars\.TIKTOK_ENABLED \|\| 'false' \}\}/,
    /YOUTUBE_ENABLED: \$\{\{ vars\.YOUTUBE_ENABLED \|\| 'true' \}\}/,
  ]) {
    assert.match(workflow, pattern);
  }
  assert.match(
    workflow,
    /BUFFER_YOUTUBE_CHANNEL_ID: \$\{\{ vars\.BUFFER_YOUTUBE_CHANNEL_ID \}\}/,
  );
  assert.match(workflow, /APP_DOWNLOAD_URL: https:\/\/troco\.net/u);
  assert.doesNotMatch(workflow, /PLAY_STORE_URL/u);
  assert.doesNotMatch(workflow, /secrets\.YOUTUBE_(?:CLIENT|REFRESH)/);
  assert.match(workflow, /echo "value=disabled"/);
  assert.doesNotMatch(workflow, /steps\.mode\.outputs\.value != 'dry-run'/);
  assert.match(workflow, /publish_status=\$\?/);
  assert.match(workflow, /reconcile_status=\$\?/);
  assert.match(workflow, /npm run health/);
  assert.match(workflow, /npm run expire/);
  assert.doesNotMatch(workflow, /pull_request:/);
});

test("every third-party action is pinned to a full commit SHA", async () => {
  const files = ["validate.yml", "publish.yml"];
  for (const file of files) {
    const workflow = await readFile(
      new URL(`../.github/workflows/${file}`, import.meta.url),
      "utf8",
    );
    for (const line of workflow
      .split("\n")
      .filter((value) => value.includes("uses:"))) {
      assert.match(line, /@[0-9a-f]{40}(?:\s|$)/);
    }
  }
});

test("state commits cannot stage generated media or environment files", async () => {
  const script = await readFile(
    new URL("../scripts/commit-state.sh", import.meta.url),
    "utf8",
  );
  assert.match(script, /state\/index\.json/);
  assert.match(script, /state\/campaigns\/\*\.json/);
  assert.doesNotMatch(script, /git add (?:-A|\.)/);
  assert.doesNotMatch(script, /\.tmp|\.env|\.mp4|\.jpg/);
});
