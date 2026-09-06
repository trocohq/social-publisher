import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hosting and archive gates precede planning, with durable backup before state commit", async () => {
  const source = await readFile(
    new URL("../.github/workflows/publish.yml", import.meta.url),
    "utf8",
  );
  const steps = [
    "Verify Pages destination",
    "Restore immutable media archive",
    "Plan rolling campaigns",
    "Preserve immutable media archive",
    "Commit campaign plans",
    "Deploy Pages media",
  ].map((name) => source.indexOf("- name: " + name));
  assert.ok(
    steps.every(
      (position, index) =>
        position >= 0 && (index === 0 || position > steps[index - 1]!),
    ),
  );
  assert.match(source, /path: publisher\/\.tmp\/pages\/media/);
  assert.match(source, /retention-days: 30/);
  assert.match(source, /actions: read/);
  assert.match(source, /\.expired == false/);
  const backup = source.slice(steps[3], steps[4]);
  assert.match(backup, /steps\.mode\.outputs\.value == 'controlled'/);
  assert.match(backup, /steps\.mode\.outputs\.value == 'scheduled'/);
  assert.doesNotMatch(backup, /dry-run/);
});
