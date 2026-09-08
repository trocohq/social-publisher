import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import { createPagesPayload } from "../src/media/pages.js";
import type { CampaignMediaRecord } from "../src/media/manifest.js";
import { sha256 } from "../src/shared/determinism.js";

async function fixture(t: TestContext, count = 1) {
  const root = await mkdtemp(join(tmpdir(), "troco-pages-budget-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const renderRoot = join(root, "render");
  const pagesRoot = join(root, "pages");
  await mkdir(pagesRoot);
  const sentinel = join(pagesRoot, "keep.txt");
  await writeFile(sentinel, "previous payload");
  const campaigns: CampaignMediaRecord[] = [];
  const paths: string[] = [];
  for (let index = 0; index < count; index++) {
    const campaign: CampaignMediaRecord = {
      schemaVersion: 1,
      localDate: "2026-08-26",
      campaignId: `2026-08-26-budget-v1-${index}`,
      assets: [
        {
          kind: "feed",
          filename: "slide-01.jpg",
          contentType: "image/jpeg",
          hash: sha256("original"),
          bytes: 1,
        },
        {
          kind: "video",
          filename: "short.mp4",
          contentType: "video/mp4",
          hash: sha256("original"),
          bytes: 1,
        },
      ],
    };
    for (const asset of campaign.assets) {
      const path = join(
        renderRoot,
        campaign.localDate,
        campaign.campaignId,
        asset.kind,
        asset.filename,
      );
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "original");
      paths.push(path);
    }
    campaigns.push(campaign);
  }
  return {
    today: "2026-08-26",
    campaigns,
    renderRoot,
    pagesRoot,
    paths,
    sentinel,
  };
}

test("Pages uses actual bytes despite manifest claims and writes exact JSON metadata", async (t) => {
  const input = await fixture(t);
  const completed = await createPagesPayload(input);
  assert.deepEqual(
    completed[0]?.assets.map((asset) => asset.bytes),
    [8, 8],
  );
  const campaign = completed[0]!;
  assert.equal(
    await readFile(
      join(
        input.pagesRoot,
        "media",
        campaign.localDate,
        campaign.campaignId,
        "manifest.json",
      ),
      "utf8",
    ),
    `${JSON.stringify(campaign, null, 2)}\n`,
  );
  assert.equal(
    await readFile(
      join(
        input.pagesRoot,
        "media",
        campaign.localDate,
        campaign.campaignId,
        "feed",
        "slide-01.jpg",
      ),
      "utf8",
    ),
    "original",
  );
});

test("Pages rejects aggregate asset overflow before hashing or replacing existing output", async (t) => {
  const input = await fixture(t, 6);
  for (const path of input.paths) await truncate(path, 45_000_000);
  await assert.rejects(
    createPagesPayload(input),
    /Pages payload exceeds 500000000-byte budget/,
  );
  assert.equal(await readFile(input.sentinel, "utf8"), "previous payload");
});

test("Pages budget includes exact completed manifests and index bytes", async (t) => {
  const input = await fixture(t, 5);
  const records = input.campaigns.map((campaign) => ({
    ...campaign,
    assets: campaign.assets.map((asset) => ({ ...asset, bytes: 50_000_000 })),
  }));
  const index = {
    schemaVersion: 1,
    today: input.today,
    campaigns: records.map((campaign) => ({
      localDate: campaign.localDate,
      campaignId: campaign.campaignId,
      manifest: `media/${campaign.localDate}/${campaign.campaignId}/manifest.json`,
    })),
  };
  const jsonBytes = (value: unknown) =>
    Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`);
  const metadataBytes = records.reduce(
    (total, record) => total + jsonBytes(record),
    jsonBytes(index),
  );
  for (const path of input.paths) await truncate(path, 50_000_000);
  // Assets alone fit; with the exact JSON bytes the payload is one byte over.
  await truncate(input.paths[0]!, 50_000_000 - metadataBytes + 1);
  await assert.rejects(
    createPagesPayload(input),
    /Pages payload exceeds 500000000-byte budget/,
  );
  assert.equal(await readFile(input.sentinel, "utf8"), "previous payload");
});

for (const sourceKind of [
  "oversize",
  "empty",
  "directory",
  "symlink",
] as const) {
  test(`Pages rejects ${sourceKind} sources before replacing existing output`, async (t) => {
    const input = await fixture(t);
    const path = input.paths[0]!;
    if (sourceKind === "oversize") await truncate(path, 50_000_001);
    if (sourceKind === "empty") await truncate(path, 0);
    if (sourceKind === "directory" || sourceKind === "symlink") {
      await rm(path);
      if (sourceKind === "directory") await mkdir(path);
      else await symlink(input.paths[1]!, path);
    }
    await assert.rejects(
      createPagesPayload(input),
      sourceKind === "oversize"
        ? /exceeds 50 MB/
        : sourceKind === "symlink"
          ? /Symlink/
          : /regular file with positive/,
    );
    assert.equal(await readFile(input.sentinel, "utf8"), "previous payload");
  });
}

test("Pages preflights only rolling and explicitly retained campaigns", async (t) => {
  const input = await fixture(t);
  input.today = "2026-10-01";
  await truncate(input.paths[0]!, 50_000_001);
  assert.deepEqual(await createPagesPayload(input), []);
  await assert.rejects(
    createPagesPayload({
      ...input,
      retainedIds: [input.campaigns[0]!.campaignId],
    }),
    /exceeds 50 MB/,
  );
});
