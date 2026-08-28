export type TextLayout = Readonly<{
  lines: readonly string[];
  fontSize: number;
  lineHeight: number;
  width: number;
  height: number;
}>;

export type FitTextOptions = Readonly<{
  maxWidth: number;
  maxHeight: number;
  maximumFontSize: number;
  minimumFontSize: number;
  lineHeightRatio?: number;
}>;

export type CopyTextLayouts = Readonly<{
  headline: FitTextOptions;
  explanation: FitTextOptions;
  cta: FitTextOptions;
}>;

export const feedTextLayouts: CopyTextLayouts = Object.freeze({
  headline: Object.freeze({
    maxWidth: 1020,
    maxHeight: 420,
    maximumFontSize: 96,
    minimumFontSize: 72,
  }),
  explanation: Object.freeze({
    maxWidth: 1020,
    maxHeight: 150,
    maximumFontSize: 54,
    minimumFontSize: 48,
    lineHeightRatio: 1.04,
  }),
  cta: Object.freeze({
    maxWidth: 924,
    maxHeight: 100,
    maximumFontSize: 40,
    minimumFontSize: 36,
  }),
});

export const carouselTextLayouts: CopyTextLayouts = Object.freeze({
  headline: Object.freeze({
    maxWidth: 1020,
    maxHeight: 690,
    maximumFontSize: 92,
    minimumFontSize: 64,
  }),
  explanation: Object.freeze({
    maxWidth: 1020,
    maxHeight: 600,
    maximumFontSize: 60,
    minimumFontSize: 46,
    lineHeightRatio: 1.1,
  }),
  cta: Object.freeze({
    maxWidth: 924,
    maxHeight: 170,
    maximumFontSize: 42,
    minimumFontSize: 34,
  }),
});

export const verticalTextLayouts: CopyTextLayouts = Object.freeze({
  headline: Object.freeze({
    maxWidth: 1020,
    maxHeight: 980,
    maximumFontSize: 124,
    minimumFontSize: 76,
  }),
  explanation: Object.freeze({
    maxWidth: 1020,
    maxHeight: 760,
    maximumFontSize: 72,
    minimumFontSize: 52,
    lineHeightRatio: 1.1,
  }),
  cta: Object.freeze({
    maxWidth: 924,
    maxHeight: 260,
    maximumFontSize: 56,
    minimumFontSize: 46,
  }),
});

export const thumbnailHeadlineLayout: FitTextOptions = Object.freeze({
  maxWidth: 1020,
  maxHeight: 600,
  maximumFontSize: 124,
  minimumFontSize: 80,
  lineHeightRatio: 1.02,
});

export function measureText(value: string, fontSize: number): number {
  let units = 0;
  for (const character of value) {
    if (/\s/.test(character)) units += 0.31;
    else if (/[MWÁÀÃÂÉÊÍÓÔÕÚÇ]/.test(character)) units += 0.76;
    else if (/[A-Z0-9]/.test(character)) units += 0.62;
    else if (/[.,:;!?'´`]/.test(character)) units += 0.3;
    else units += 0.54;
  }
  return Math.ceil(units * fontSize);
}

function wrapText(value: string, fontSize: number, maxWidth: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const originalWord of words) {
    const pieces: string[] = [];
    let word = originalWord;
    while (measureText(word, fontSize) > maxWidth) {
      let end = 1;
      while (
        end < word.length &&
        measureText(`${word.slice(0, end + 1)}-`, fontSize) <= maxWidth
      ) {
        end += 1;
      }
      pieces.push(`${word.slice(0, end)}-`);
      word = word.slice(end);
    }
    pieces.push(word);

    for (const piece of pieces) {
      const proposed = current ? `${current} ${piece}` : piece;
      if (current && measureText(proposed, fontSize) > maxWidth) {
        lines.push(current);
        current = piece;
      } else {
        current = proposed;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function fitText(value: string, options: FitTextOptions): TextLayout {
  const lineHeightRatio = options.lineHeightRatio ?? 1.16;
  if (!value.trim()) throw new Error("Cannot fit empty editorial text");
  if (options.minimumFontSize > options.maximumFontSize) {
    throw new Error("Minimum font size cannot exceed maximum font size");
  }

  for (
    let fontSize = options.maximumFontSize;
    fontSize >= options.minimumFontSize;
    fontSize -= 1
  ) {
    const lines = wrapText(value, fontSize, options.maxWidth);
    const lineHeight = Math.ceil(fontSize * lineHeightRatio);
    const width = Math.max(...lines.map((line) => measureText(line, fontSize)));
    const height = lines.length * lineHeight;
    if (width <= options.maxWidth && height <= options.maxHeight) {
      return { lines, fontSize, lineHeight, width, height };
    }
  }
  throw new Error(
    `Editorial text does not fit without dropping below ${options.minimumFontSize}px`,
  );
}
