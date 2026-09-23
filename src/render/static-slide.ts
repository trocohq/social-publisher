import { designTokens } from "@trocohq/design-tokens";

import type { BrandAssets } from "../brand/load-brand.js";
import { canonicalTextMeasure, outlineText } from "./font-paths.js";
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
  font: "manrope" | "figtree",
  top: number,
  maximumFontSize: number,
  minimumFontSize: number,
  options: Readonly<{
    x?: number;
    maxWidth?: number;
    maxHeight?: number;
    color?: string;
    weight?: number;
  }> = {},
): string {
  const bytes = font === "manrope" ? brand.manrope : brand.figtree;
  const layout = fitText(value, {
    measure: canonicalTextMeasure(bytes),
    maxWidth: options.maxWidth ?? 900,
    maxHeight: options.maxHeight ?? (font === "manrope" ? 410 : 260),
    maximumFontSize,
    minimumFontSize,
  });
  return layout.lines
    .map((line, index) => {
      const glyphs = outlineText({
        bytes,
        text: line,
        size: layout.fontSize,
        weight: options.weight ?? 400,
      });
      const baseline = top + layout.fontSize + index * layout.lineHeight;
      return `<g transform="translate(${(options.x ?? 90) - Math.min(0, glyphs.left)} ${baseline})" fill="${options.color ?? designTokens.colors.ink}" aria-label="${escapeXml(line)}">${glyphs.paths}</g>`;
    })
    .join("");
}

const palettes = [
  designTokens.colors.coral,
  designTokens.colors.paper,
  designTokens.colors.blue,
  designTokens.colors.purple,
  designTokens.colors.ink,
] as const;

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
  const frame = {
    x: 80,
    y: 80,
    right: 1000,
    bottom: 1270,
    width: 920,
  } as const;
  const mark = Buffer.from(
    slide.role === "closing" ? brand.inverseMarkSvg : brand.markSvg,
  ).toString("base64");
  const background = palettes[Math.min(slide.index, palettes.length - 1)]!;
  const dark = slide.role === "closing";
  const ink = dark ? designTokens.colors.paper : designTokens.colors.ink;
  const card = dark ? designTokens.colors.coral : designTokens.colors.paper;
  const titleTop = slide.role === "cover" ? 280 : 250;
  const title = outlinedLines(
    brand,
    slide.title,
    "manrope",
    titleTop,
    slide.role === "cover" ? 118 : 92,
    54,
    {
      x: frame.x,
      maxWidth: slide.role === "cover" ? 880 : 820,
      maxHeight: slide.role === "cover" ? 440 : 350,
      color: ink,
      weight: 700,
    },
  );
  const body = outlinedLines(
    brand,
    slide.body,
    "figtree",
    slide.role === "cover" ? 870 : 790,
    48,
    28,
    {
      x: frame.x + 44,
      maxWidth: frame.width - 88,
      maxHeight: 300,
      color: dark ? designTokens.colors.ink : designTokens.colors.ink,
      weight: 500,
    },
  );
  const role =
    slide.role === "cover"
      ? "NÃO CAIA NESSA"
      : slide.role === "closing"
        ? "SALVE ESTE PASSO A PASSO"
        : "COMO FUNCIONA";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" data-static-layout="editorial-v2" data-slide-role="${slide.role}">
    <rect width="1080" height="1350" fill="${background}"/>
    <image x="${frame.x}" y="${frame.y}" width="72" height="72" href="data:image/svg+xml;base64,${mark}"/>
    <text x="${frame.x + 96}" y="${frame.y + 50}" fill="${ink}" font-family="sans-serif" font-size="28" font-weight="700">TROCO</text>
    <rect x="${frame.right - 298}" y="${frame.y + 5}" width="298" height="54" rx="27" fill="${dark ? designTokens.colors.coral : designTokens.colors.ink}"/>
    <text x="${frame.right - 149}" y="${frame.y + 41}" text-anchor="middle" fill="${dark ? designTokens.colors.ink : designTokens.colors.paper}" font-family="sans-serif" font-size="19" font-weight="700">${role}</text>
    ${title}
    <rect x="${frame.x + 2}" y="760" width="${frame.width - 4}" height="410" rx="2" fill="${card}" stroke="${designTokens.colors.ink}" stroke-width="3"/>
    ${body}
    <rect x="${frame.x}" y="1212" width="${Math.round(frame.width * ((slide.index + 1) / slide.count))}" height="8" fill="${dark ? designTokens.colors.coral : designTokens.colors.ink}"/>
    <text x="${frame.right}" y="1260" text-anchor="end" fill="${ink}" font-family="sans-serif" font-size="22">${String(slide.index + 1).padStart(2, "0")}/${String(slide.count).padStart(2, "0")}</text>
  </svg>`;
}
