import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseStaticBatch } from "../src/static-editorial/markdown.js";

const fixture = readFileSync(
  new URL("./fixtures/static-editorial-batch.md", import.meta.url),
  "utf8",
);

test("accepts static owner copy without campaign recipe or video fields", () => {
  const original = parseStaticBatch(fixture, "troco").entries[0]!;
  const revised = parseStaticBatch(
    fixture.replace(
      "A short fixture introduction.",
      "A revised fixture introduction.",
    ),
    "troco",
  ).entries[0]!;

  assert.equal(original.id, "troco-editorial-0001");
  assert.equal(original.slides.length, 2);
  assert.equal("video" in original, false);
  assert.equal(revised.id, original.id);
  assert.notEqual(revised.contentRevision, original.contentRevision);
});

test("rejects video, YouTube, duplicate IDs, and forged approval", () => {
  for (const source of [
    fixture.replace("format: carousel", "format: video"),
    fixture.replace("channel: instagram", "channel: youtube"),
    `${fixture}\n${fixture}`,
    fixture.replace("format: carousel", "format: carousel\napproved: true"),
  ]) {
    assert.throws(() => parseStaticBatch(source, "troco"));
  }
});

test("rejects ambiguous YAML, executable prose, duplicate targets, and invalid dates", () => {
  for (const source of [
    fixture.replace("schemaVersion: 1", "schemaVersion: 1\nschemaVersion: 1"),
    fixture
      .replace(
        "title: Synthetic fixture title",
        "title: &shared Synthetic fixture title",
      )
      .replace("title: A concrete fixture conclusion", "title: *shared"),
    fixture.replace("# September static batch", "Unrecognized prose"),
    fixture.replace("# September static batch", "<script>alert(1)</script>"),
    fixture.replace("# September static batch", "{dangerousExpression}"),
    fixture.replace("channel: facebook", "channel: instagram"),
    fixture.replace("2026-09-20T12:17:00-03:00", "2026-02-30T12:17:00-03:00"),
    fixture.replaceAll("-03:00", "+00:00"),
  ]) {
    assert.throws(() => parseStaticBatch(source, "troco"));
  }
});

test("binds source and slide order to deterministic revisions", () => {
  const original = parseStaticBatch(fixture, "troco").entries[0]!;
  const repeated = parseStaticBatch(fixture, "troco").entries[0]!;
  const reversedSource = fixture.replace(
    /(  - role: cover[\s\S]*?)(  - role: closing[\s\S]*?)(?=sources:)/u,
    (_all, cover: string, closing: string) => `${closing}${cover}`,
  );
  const reversed = parseStaticBatch(reversedSource, "troco").entries[0]!;

  assert.equal(repeated.contentRevision, original.contentRevision);
  assert.equal(reversed.slides[0]?.role, "closing");
  assert.notEqual(reversed.contentRevision, original.contentRevision);
});

test("rejects batches beyond the byte cap", () => {
  assert.throws(
    () => parseStaticBatch(`${fixture}${" ".repeat(256 * 1024)}`, "troco"),
    /STATIC_EDITORIAL_BATCH_TOO_LARGE/u,
  );
});
