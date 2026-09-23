import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

test("keeps the scheduled private executor serialized, pinned and disabled by default", async () => {
  const source = await readFile(
    new URL("../.github/workflows/static-editorial.yml", import.meta.url),
    "utf8",
  );
  const workflow = parse(source) as Record<string, unknown>;
  assert.match(source, /cron: ["']7,22,37,52 \* \* \* \*["']/u);
  assert.match(source, /group: troco-static-editorial/u);
  assert.match(source, /cancel-in-progress: false/u);
  assert.match(source, /vars\.STATIC_EDITORIAL_ENABLED == 'true'/u);
  assert.match(source, /vars\.ZERO_COST_CONFIRMED == 'true'/u);
  assert.match(
    source,
    /STATIC_EXECUTION_MODE: \$\{\{ github\.event_name == 'schedule' && 'scheduled' \|\| 'reconcile-only' \}\}/u,
  );
  assert.match(
    source,
    /PRIVATE_EDITORIAL_TOKEN: \$\{\{ secrets\.PRIVATE_EDITORIAL_READ_TOKEN \}\}/u,
  );
  assert.match(
    source,
    /STATIC_STATE_TOKEN: \$\{\{ secrets\.STATIC_STATE_WRITE_TOKEN \}\}/u,
  );
  assert.doesNotMatch(source, /(?:push|pull_request|pull_request_target):/u);
  assert.doesNotMatch(
    source,
    /upload-artifact|ffmpeg|blog|web-deploy|deploy-pages/iu,
  );
  assert.deepEqual(workflow.permissions, { contents: "read" });
  for (const line of source
    .split("\n")
    .filter((line) => line.includes("uses:")))
    assert.match(line, /@[0-9a-f]{40}\s*$/u);
});

test("allows manual execution only in reconcile-only mode", async () => {
  const source = await readFile(
    new URL("../.github/workflows/static-editorial.yml", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /workflow_dispatch:[\s\S]*options:\s*\n\s*- reconcile-only/u,
  );
  assert.doesNotMatch(source, /options:[\s\S]*- scheduled/u);
  assert.match(source, /timeout-minutes: 10/u);
});
