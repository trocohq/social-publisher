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
