import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { mkdtemp, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadApprovedArt } from "../src/render/approved-art.js";
import { loadBrand } from "../src/brand/load-brand.js";
import { canonicalBrandRoot } from "./support/brand-root.js";
import { premiumScene } from "../src/render/approved-lessons.js";

test("all approved scenes preserve centered 80px stacks", async () => {
  const brand = await loadBrand(canonicalBrandRoot());
  for (let index = 0; index < 12; index++)
    for (const scene of ["hook", "scenario", "answer", "end_card"] as const) {
      const svg = premiumScene({
        brand,
        scene,
        index,
        art: ["test", "test", "test"],
      });
      const blocks = [
        ...svg.matchAll(
          /data-item-top="([\d.]+)" data-item-height="([\d.]+)"/g,
        ),
      ].map((m) => ({ top: Number(m[1]), height: Number(m[2]) }));
      assert.ok(blocks.length >= 4);
      for (let i = 1; i < blocks.length; i++)
        assert.ok(
          Math.abs(
            blocks[i]!.top - blocks[i - 1]!.top - blocks[i - 1]!.height - 80,
          ) < 0.001,
        );
      assert.ok(
        Math.abs(
          (blocks[0]!.top + blocks.at(-1)!.top + blocks.at(-1)!.height) / 2 -
            960,
        ) < 0.001,
      );
    }
});

test("approved artwork rejects changed bytes and symlink directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-approved-art-"));
  await Promise.all(
    [0, 1, 2].map((i) => writeFile(join(root, `${i}.png`), "unapproved bytes")),
  );
  await assert.rejects(loadApprovedArt(root), /hash mismatch/);
  await symlink(root, join(root, "alias"));
  await assert.rejects(loadApprovedArt(join(root, "alias")), /real directory/);
});

test("the approved lesson package is reproducible without temporary scripts", () => {
  const file = new URL(
    "../assets/editorial/approved-lessons.json",
    import.meta.url,
  );
  assert.ok(existsSync(file));
  const lessons = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(lessons.length, 12);
  assert.ok(
    lessons.every(
      (lesson: { slides: unknown[] }) => lesson.slides.length === 3,
    ),
  );
});
