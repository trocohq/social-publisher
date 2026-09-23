import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { loadBrand } from "../brand/load-brand.js";
import { loadApprovedArt, approvedArtHashes } from "../render/approved-art.js";
import { editorial, premiumScene } from "../render/approved-lessons.js";
import { resolveMediaBinaries, runProcess } from "../render/binaries.js";
import { buildVideoFfmpegArguments } from "../render/video.js";
import { soundtrackForCampaign } from "../render/music.js";
import { createCampaign } from "../planning/create-campaign.js";
import { sha256 } from "../shared/determinism.js";

// Offline packaging only. Never reads credentials, writes campaign state or calls a provider.
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (
    args.length !== 6 ||
    args[0] !== "--art-root" ||
    args[2] !== "--brand-root" ||
    args[4] !== "--output"
  ) {
    throw new Error(
      "Usage: approved-package --art-root PATH --brand-root PATH --output NEW_DIRECTORY",
    );
  }
  const art = await loadApprovedArt(args[1]!);
  const brand = await loadBrand(pathToFileURL(`${resolve(args[3]!)}${sep}`));
  const output = resolve(args[5]!);
  // Exclusive directory creation prevents overwriting a previously reviewed release.
  await mkdir(output);
  const binaries = await resolveMediaBinaries();
  const scenes = ["hook", "scenario", "answer", "end_card"] as const;
  const base = createCampaign({
    localDate: "2026-09-08",
    publishTime: "12:17",
    history: [],
  });
  const records = [];
  for (const [index, draft] of editorial.entries()) {
    const revision = sha256(
      JSON.stringify({
        draft,
        renderer: "troco-editorial-v3-gap80",
        art: approvedArtHashes,
      }),
    ).slice(0, 12);
    const id = `troco-approved-${index}-${revision}`;
    const directory = resolve(output, id);
    await mkdir(directory);
    const images = [];
    for (const scene of scenes) {
      const svg = premiumScene({ brand, scene, index, art });
      const path = resolve(directory, `${scene}.png`);
      await sharp(Buffer.from(svg)).png().toFile(path);
      images.push(path);
      if (scene === "hook")
        await sharp(Buffer.from(svg))
          .jpeg({ quality: 92 })
          .toFile(resolve(directory, "thumbnail.jpg"));
    }
    const soundtrack = soundtrackForCampaign(id);
    const videoPath = resolve(directory, "short.mp4");
    await runProcess(
      binaries.ffmpegPath,
      buildVideoFfmpegArguments({
        plan: { ...base, id },
        sceneFiles: images,
        soundtrack,
        videoPath,
      }),
    );
    const caption = [
      draft.hook.join(" "),
      ...draft.slides.map((slide) => [...slide.title, ...slide.body].join(" ")),
      "→ Link na bio",
    ].join("\n\n");
    await writeFile(resolve(directory, "caption.txt"), caption);
    const files = await Promise.all(
      [
        ...scenes.map((scene) => `${scene}.png`),
        "thumbnail.jpg",
        "short.mp4",
        "caption.txt",
      ].map(async (file) => ({
        path: `${id}/${file}`,
        sha256: sha256(await readFile(resolve(directory, file))),
      })),
    );
    records.push({
      id,
      index,
      headline: draft.hook.join(" "),
      soundtrack: soundtrack.id,
      files,
    });
    console.log(`Packaged ${index + 1}/${editorial.length}`);
  }
  await writeFile(
    resolve(output, "manifest.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        status: "offline-ready-not-published",
        artHashes: approvedArtHashes,
        gap: 80,
        campaigns: records,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      ok: true,
      output,
      campaigns: records.length,
      published: false,
    }),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Packaging failed");
  process.exitCode = 1;
});
