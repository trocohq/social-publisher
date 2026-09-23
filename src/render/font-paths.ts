import { create, type Font } from "fontkit";

type TextOutline = Readonly<{
  paths: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}>;

const parsedFonts = new WeakMap<Buffer, Map<number, Font>>();

export function canonicalTextMeasure(
  bytes: Buffer,
  weight = 400,
): (text: string, size: number) => number {
  const font = fontFor(bytes, weight);
  const widths = new Map<string, number>();
  return (text, size) => {
    let width = widths.get(text);
    if (width === undefined) {
      const run = font.layout(text);
      // Include advance and ink overhangs, not just character count.
      width =
        Math.max(run.advanceWidth, run.bbox.maxX) - Math.min(0, run.bbox.minX);
      widths.set(text, width);
    }
    return Math.ceil((width * size) / font.unitsPerEm);
  };
}

function fontFor(bytes: Buffer, weight: number): Font {
  let weights = parsedFonts.get(bytes);
  if (!weights) {
    weights = new Map();
    parsedFonts.set(bytes, weights);
  }
  const cached = weights.get(weight);
  if (cached) return cached;
  const parsed = create(bytes);
  if (!("layout" in parsed))
    throw new Error("Expected a single canonical font");
  const font = parsed.variationAxes.wght
    ? parsed.getVariation({ wght: weight })
    : parsed;
  weights.set(weight, font);
  return font;
}

// Shape only from the supplied, hash-verified font bytes. Paths make the final
// SVG independent of renderer font discovery, @font-face and textLength support.
export function outlineText({
  bytes,
  text,
  size,
  weight,
  tracking = 0,
}: Readonly<{
  bytes: Buffer;
  text: string;
  size: number;
  weight: number;
  tracking?: number;
}>): TextOutline {
  const font = fontFor(bytes, weight);
  const run = font.layout(text);
  const scale = size / font.unitsPerEm;
  let penX = 0;
  let penY = 0;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  const paths: string[] = [];
  for (const [index, glyph] of run.glyphs.entries()) {
    const position = run.positions[index]!;
    const x = (penX + position.xOffset) * scale + index * tracking * size;
    const y = -(penY + position.yOffset) * scale;
    const path = glyph.path;
    if (path.commands.length > 0) {
      left = Math.min(left, x + path.bbox.minX * scale);
      right = Math.max(right, x + path.bbox.maxX * scale);
      top = Math.min(top, y - path.bbox.maxY * scale);
      bottom = Math.max(bottom, y - path.bbox.minY * scale);
      paths.push(
        `<path transform="translate(${x} ${y}) scale(${scale} ${-scale})" d="${path.toSVG()}"/>`,
      );
    }
    penX += position.xAdvance;
    penY += position.yAdvance;
  }
  if (paths.length === 0)
    throw new Error("Cannot outline empty editorial text");
  return { paths: paths.join(""), left, right, top, bottom };
}
