import assert from "node:assert/strict";
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

test("the npm registry configuration uses current supported keys", async () => {
  const npmrc = await readFile(new URL("../.npmrc", import.meta.url), "utf8");
  assert.match(npmrc, /@trocohq:registry=https:\/\/npm\.pkg\.github\.com/);
  assert.doesNotMatch(npmrc, /always-auth/);
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
