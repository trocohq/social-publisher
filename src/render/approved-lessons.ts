import { readFileSync } from "node:fs";
import { z } from "zod";
import type { BrandAssets } from "../brand/load-brand.js";
import { outlineText } from "./font-paths.js";
const line = z
  .string()
  .min(1)
  .max(180)
  .refine((value) => !/[<>]/.test(value));
const slide = z.object({
  title: z.array(line).min(1).max(3),
  body: z.array(line).min(1).max(3),
  number: z.boolean().optional(),
});
export const editorial = z
  .array(
    z.object({
      hook: z.array(line).min(1).max(3),
      slides: z.array(slide).length(3),
    }),
  )
  .length(12)
  .parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../assets/editorial/approved-lessons.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
export function premiumScene({
  brand,
  scene,
  index,
  art,
}: Readonly<{
  brand: BrandAssets;
  scene: "hook" | "scenario" | "answer" | "end_card";
  index: number;
  art: readonly string[];
}>): string {
  const group = Math.floor(index / 4),
    cover = scene === "hook",
    ending = scene === "end_card";
  const step = ["hook", "scenario", "answer", "end_card"].indexOf(scene);
  const draft = editorial[index];
  if (!draft) throw new Error("Unknown approved lesson");
  const card = draft.slides[step - 1]!;
  const paper = "#FEFDFB",
    ink = "#213130",
    accents = ["#D8F1D0", "#FFEBC2", "#E6DBFF"];
  const bg = cover ? paper : ending ? ink : accents[group],
    fg = ending ? paper : ink;
  const label = ["CAIXA SEGURO", "CONTA RÁPIDA", "DIA A DIA NO CAIXA"][group]!;
  const textBlock = (
    values: readonly string[],
    maxSize: number,
    font: "manrope" | "figtree" = "manrope",
    weight = 400,
    leading = 1.16,
  ) => {
    let size = maxSize;
    const outline = () =>
      values.map((text) =>
        outlineText({ bytes: brand[font], text, size, weight }),
      );
    let outlines = outline();
    while (outlines.some((o) => o.right - o.left > 904)) {
      size--;
      outlines = outline();
    }
    if (size < Math.min(48, maxSize)) throw Error("Text exceeds margins");
    const lineHeight = size * leading;
    const top = Math.min(...outlines.map((o, i) => i * lineHeight + o.top));
    const bottom = Math.max(
      ...outlines.map((o, i) => i * lineHeight + o.bottom),
    );
    return {
      height: bottom - top,
      svg: outlines
        .map(
          (o, i) =>
            `<g fill="${fg}" transform="translate(${540 - (o.left + o.right) / 2} ${i * lineHeight - top})">${o.paths}</g>`,
        )
        .join(""),
    };
  };
  const word = outlineText({
    bytes: brand.figtree,
    text: "Troco",
    size: 52,
    weight: 700,
    tracking: -0.04,
  });
  const left = (1080 - 64 - 20 - (word.right - word.left)) / 2;
  const mark = Buffer.from(
    ending ? brand.inverseMarkSvg : brand.markSvg,
  ).toString("base64");
  const blocks = [
    {
      height: 64,
      svg: `<defs><clipPath id="brand"><rect x="${left}" y="0" width="64" height="64" rx="14.08"/></clipPath></defs><image x="${left}" y="0" width="64" height="64" clip-path="url(#brand)" href="data:image/svg+xml;base64,${mark}"/><g fill="${fg}" transform="translate(${left + 84 - word.left} ${32 - (word.top + word.bottom) / 2})">${word.paths}</g>`,
    },
  ];
  const tag = textBlock([label], 27, "figtree", 600);
  blocks.push({
    height: 60,
    svg: `<rect x="310" y="0" width="460" height="60" rx="30" fill="${ending ? "#344544" : cover ? accents[group] : paper}"/><g transform="translate(0 ${(60 - tag.height) / 2})">${tag.svg}</g>`,
  });
  if (cover) {
    blocks.push(textBlock(draft.hook, 112));
    blocks.push({
      height: 720,
      svg: `<defs><linearGradient id="fx"><stop offset="0" stop-color="black"/><stop offset=".08" stop-color="white"/><stop offset=".92" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><linearGradient id="fy" x2="0" y2="1"><stop offset="0" stop-color="black"/><stop offset=".08" stop-color="white"/><stop offset=".92" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><mask id="mx"><rect x="180" y="0" width="720" height="720" fill="url(#fx)"/></mask><mask id="my"><rect x="180" y="0" width="720" height="720" fill="url(#fy)"/></mask></defs><g mask="url(#mx)"><image mask="url(#my)" x="180" y="0" width="720" height="720" href="data:image/png;base64,${art[group]}"/></g>`,
    });
  } else {
    blocks.push(
      textBlock(
        card.title,
        card.number ? 180 : 108,
        card.number ? "figtree" : "manrope",
        card.number ? 650 : 400,
      ),
    );
    blocks.push(textBlock(card.body, 48, "figtree", 400, 64 / 48));
    if (ending) blocks.push(textBlock(["→ Link na bio"], 48, "figtree", 600));
  }
  blocks.push({
    height: 12,
    svg: [0, 1, 2, 3]
      .map(
        (n) =>
          `<circle cx="${498 + n * 28}" cy="6" r="${n === step ? 6 : 4}" fill="${fg}" opacity="${n === step ? 1 : 0.28}"/>`,
      )
      .join(""),
  });
  const total =
    blocks.reduce((sum, b) => sum + b.height, 0) + (blocks.length - 1) * 80;
  if (total > 1640) throw Error("Stack exceeds safe frame");
  let y = (1920 - total) / 2;
  const content = blocks
    .map((block) => {
      const top = y;
      y += block.height + 80;
      return `<g data-item-top="${top}" data-item-height="${block.height}" transform="translate(0 ${top})">${block.svg}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="${bg}"/>${content}</svg>`;
}
