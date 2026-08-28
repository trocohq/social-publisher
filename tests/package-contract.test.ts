import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the publisher is a public ESM package with deterministic validation scripts", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(packageJson.private, false);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.engines.node, ">=20.19.4");
  assert.equal(
    packageJson.scripts.test,
    "node --import tsx --test tests/*.test.ts",
  );
  assert.equal(
    packageJson.scripts.validate,
    "node --import tsx src/validation/run.ts",
  );
  assert.equal(packageJson.devDependencies.typescript, "6.0.3");
});

test("the approved Enterprise music source is available to packaged renders", async () => {
  const bytes = await readFile(
    new URL("../assets/music/enterprise.mp3", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "d3884500099f06adc74583242056be7249f7758c4d1919efc6de3ccdf468029e",
  );
});

test("the npm registry configuration uses current supported keys", async () => {
  const npmrc = await readFile(new URL("../.npmrc", import.meta.url), "utf8");
  assert.match(npmrc, /@trocohq:registry=https:\/\/npm\.pkg\.github\.com/);
  assert.doesNotMatch(npmrc, /always-auth/);
});

test("workflow dependency checkouts stay outside publisher formatting and Git state", async () => {
  const [gitignore, prettierignore] = await Promise.all([
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../.prettierignore", import.meta.url), "utf8"),
  ]);

  assert.match(gitignore, /^dependencies\/$/m);
  assert.match(prettierignore, /^dependencies\/$/m);
  assert.match(prettierignore, /^state\/$/m);
});

test("media tests resolve the canonical brand through the workflow environment", async () => {
  const testFiles = [
    "brand.test.ts",
    "dry-run.test.ts",
    "image-render.test.ts",
    "video-render.test.ts",
    "support/render-fixture.ts",
  ];

  for (const file of testFiles) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /new URL\([^\n]*frontend\/public/);
  }
});

test("the README documents the safe local workflow", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );
  for (const phrase of [
    "npm run dry-run",
    "No provider writes",
    "Canonical brand assets",
    "FFmpeg",
    "NODE_AUTH_TOKEN",
  ]) {
    assert.match(readme, new RegExp(phrase));
  }
});

test("the README explains production schedule, volume, status, and remaining work", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );

  for (const phrase of [
    "Current production status",
    "Schedule and publishing volume",
    "17 */3 * * *",
    "12:17",
    "21 provider posts",
    "Weekly editorial rotation",
    "TIKTOK_ENABLED=false",
    "Remaining work",
  ]) {
    assert.ok(readme.includes(phrase), `README is missing ${phrase}`);
  }
});

test("the README documents the approved Enterprise excerpt rotation", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );
  assert.match(readme, /nine deterministic 12-second excerpts/u);
  assert.doesNotMatch(readme, /100\s+BPM\s+arrangements/u);
});

test("operations document the deterministic crop-safe video cover", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );
  const operations = await readFile(
    new URL("../docs/operations.md", import.meta.url),
    "utf8",
  );
  assert.match(readme, /dedicated 1080×1920 video thumbnail/u);
  assert.match(readme, /same\s+opening scene/iu);
  assert.match(operations, /40-pixel gaps/u);
  assert.match(operations, /two-second frame/u);
  assert.match(operations, /square crop-safe region/u);
});

test("operations document immutable published thumbnail backfills", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );
  const operations = await readFile(
    new URL("../docs/operations.md", import.meta.url),
    "utf8",
  );
  assert.match(readme, /backfill-thumbnails/u);
  assert.match(readme, /does not replace the published video/u);
  assert.match(operations, /exact campaign ID/u);
  assert.match(operations, /ALTERE SOMENTE A CAPA/u);
  assert.match(operations, /thumbnails\.set/u);
  assert.match(operations, /never delete or republish/u);
});
