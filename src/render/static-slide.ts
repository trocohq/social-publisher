import { designTokens } from "@trocohq/design-tokens";

import type { BrandAssets } from "../brand/load-brand.js";
import { canonicalTextMeasure, outlineText } from "./font-paths.js";
import { safeAreaFor } from "./safe-area.js";
import { escapeXml, fitText } from "./svg.js";

export type StaticSlideInput = Readonly<{
  role: "cover" | "content" | "closing";
  title: string;
  body: string;
  index: number;
  count: number;
}>;

function outlinedLines(
  brand: BrandAssets,
  value: string,
  font: "stolzl" | "figtree",
  top: number,
  maximumFontSize: number,
  minimumFontSize: number,
): string {
  const bytes = font === "stolzl" ? brand.stolzl : brand.figtree;
  const layout = fitText(value, {
    measure: canonicalTextMeasure(bytes),
    maxWidth: 900,
    maxHeight: font === "stolzl" ? 410 : 260,
    maximumFontSize,
    minimumFontSize,
  });
  return layout.lines
    .map((line, index) => {
      const glyphs = outlineText({
        bytes,
        text: line,
        size: layout.fontSize,
        weight: 400,
      });
      const baseline = top + layout.fontSize + index * layout.lineHeight;
      return `<g transform="translate(${90 - Math.min(0, glyphs.left)} ${baseline})" fill="${designTokens.colors.ink}" aria-label="${escapeXml(line)}">${glyphs.paths}</g>`;
    })
    .join("");
}

export function createStaticSlideSvg(
  input: Readonly<{
    slide: StaticSlideInput;
    brand: BrandAssets;
  }>,
): string {
  const { slide, brand } = input;
  if (slide.index < 0 || slide.index >= slide.count) {
    throw new Error("STATIC_SLIDE_INDEX_INVALID");
  }
  const frame = safeAreaFor(1080, 1350);
  const mark = Buffer.from(brand.markSvg).toString("base64");
  const title = outlinedLines(brand, slide.title, "stolzl", 310, 112, 58);
  const body = outlinedLines(brand, slide.body, "figtree", 790, 48, 30);
  const role =
    slide.role === "cover"
      ? "ABRA E CONFIRA"
      : slide.role === "closing"
        ? "LEVE PARA O CAIXA"
        : "PASSO A PASSO";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" fill="${designTokens.colors.primary}"/>
    <image x="${frame.x}" y="${frame.y}" width="72" height="72" href="data:image/svg+xml;base64,${mark}"/>
    <text x="${frame.x + 96}" y="${frame.y + 50}" fill="${designTokens.colors.ink}" font-family="sans-serif" font-size="28" font-weight="700">TROCO</text>
    <text x="${frame.right}" y="${frame.y + 48}" text-anchor="end" fill="${designTokens.colors.ink}" font-family="sans-serif" font-size="22">${role}</text>
    ${title}${body}
    <text x="${frame.right}" y="1270" text-anchor="end" fill="${designTokens.colors.ink}" font-family="sans-serif" font-size="22">${String(slide.index + 1).padStart(2, "0")}/${String(slide.count).padStart(2, "0")}</text>
  </svg>`;
}
