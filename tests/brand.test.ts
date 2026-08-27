import assert from "node:assert/strict";
import test from "node:test";

import { loadBrand } from "../src/brand/load-brand.js";
import { canonicalBrandRoot } from "./support/brand-root.js";

const frontendPublic = canonicalBrandRoot();

test("the current canonical Troco mark and fonts pass the reviewed manifest", async () => {
  const brand = await loadBrand(frontendPublic);

  assert.match(brand.markSvg, /viewBox="0 0 1080 1080"/);
  assert.match(brand.inverseMarkSvg, /viewBox="0 0 1080 1080"/);
  assert.ok(brand.stolzl.length > 1_000);
  assert.ok(brand.figtree.length > 1_000);
});

test("brand loading has no substitute mark", async () => {
  await assert.rejects(
    loadBrand(new URL("./missing/", import.meta.url)),
    /Missing canonical brand asset/,
  );
});
