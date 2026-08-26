import { formatMinor } from "@trocohq/core";
import { designTokens } from "@trocohq/design-tokens";

import type { BrandAssets } from "../brand/load-brand.js";
import type { CampaignFamily } from "../config/schedule.js";
import type { CampaignPlan, Palette } from "../editorial/schema.js";

const WIDTH = 1080;
const HEIGHT = 1350;
const SAFE = 96;

const familyLabels: Readonly<Record<CampaignFamily, string>> = {
  change_challenge: "DESAFIO DO TROCO",
  cashier_shortcut: "ATALHO DE CAIXA",
  troco_explains: "TROCO EXPLICA",
  quick_calculation: "CONTA RÁPIDA",
  safe_checkout: "CAIXA SEGURO",
  checkout_situation: "SITUAÇÃO DE BALCÃO",
  save_this_rule: "SALVE ESTA REGRA",
};

const backgroundByPalette: Readonly<Record<Palette, string>> = {
  green: designTokens.colors.primary,
  purple: designTokens.colors.purple,
  yellow: designTokens.colors.yellow,
  blue: designTokens.colors.blue,
};

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

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Readonly<Record<string, string>> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return escaped[character]!;
  });
}

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

function textBlock(
  layout: TextLayout,
  x: number,
  top: number,
  fontFamily: "Stolzl" | "Figtree",
  weight = 400,
  fill: string = designTokens.colors.ink,
): string {
  const spans = layout.lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : layout.lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${top + layout.fontSize}" fill="${fill}" font-family="${fontFamily}" font-size="${layout.fontSize}" font-weight="${weight}">${spans}</text>`;
}

function embeddedFonts(brand: BrandAssets): string {
  return `<style>
    @font-face{font-family:'Stolzl';src:url(data:font/woff2;base64,${brand.stolzl.toString("base64")}) format('woff2');font-weight:400}
    @font-face{font-family:'Figtree';src:url(data:font/ttf;base64,${brand.figtree.toString("base64")}) format('truetype');font-weight:400 900}
  </style>`;
}

function header(plan: CampaignPlan, brand: BrandAssets, slide: number): string {
  const mark = Buffer.from(brand.markSvg).toString("base64");
  const label = familyLabels[plan.family];
  return `
    <image x="${SAFE}" y="72" width="72" height="72" href="data:image/svg+xml;base64,${mark}"/>
    <text x="192" y="122" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="28" font-weight="700">TROCO</text>
    <rect x="690" y="80" width="294" height="58" rx="29" fill="${designTokens.colors.paper}" fill-opacity="0.74"/>
    <text x="837" y="117" text-anchor="middle" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="22" font-weight="700">${escapeXml(label)}</text>
    <text x="984" y="1300" text-anchor="end" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="22">${String(slide + 1).padStart(2, "0")}/${String(plan.slideCount).padStart(2, "0")}</text>`;
}

function scenarioCard(plan: CampaignPlan, top: number): string {
  const purchase = formatMinor(plan.scenario.purchaseMinor, "BRL", "pt-BR");
  const received = formatMinor(plan.scenario.receivedMinor, "BRL", "pt-BR");
  const answer = plan.copy.answer;
  return `
    <rect x="${SAFE}" y="${top}" width="888" height="350" rx="32" fill="${designTokens.colors.paper}"/>
    <text x="144" y="${top + 76}" fill="${designTokens.colors.midInk}" font-family="Figtree" font-size="30">COMPRA</text>
    <text x="936" y="${top + 76}" text-anchor="end" fill="${designTokens.colors.ink}" font-family="Stolzl" font-size="44">${escapeXml(purchase)}</text>
    <line x1="144" x2="936" y1="${top + 112}" y2="${top + 112}" stroke="${designTokens.colors.border}" stroke-width="2"/>
    <text x="144" y="${top + 176}" fill="${designTokens.colors.midInk}" font-family="Figtree" font-size="30">RECEBIDO</text>
    <text x="936" y="${top + 176}" text-anchor="end" fill="${designTokens.colors.ink}" font-family="Stolzl" font-size="44">${escapeXml(received)}</text>
    <rect x="128" y="${top + 218}" width="824" height="108" rx="24" fill="${designTokens.colors.ink}"/>
    <text x="168" y="${top + 287}" fill="${designTokens.colors.paper}" font-family="Figtree" font-size="28">TROCO</text>
    <text x="912" y="${top + 291}" text-anchor="end" fill="${designTokens.colors.primary}" font-family="Stolzl" font-size="52">${escapeXml(answer)}</text>`;
}

function feedContent(plan: CampaignPlan): string {
  const headline = fitText(plan.copy.headline, {
    maxWidth: 888,
    maxHeight: 330,
    maximumFontSize: 78,
    minimumFontSize: 64,
  });
  const explanation = fitText(plan.copy.explanation, {
    maxWidth: 888,
    maxHeight: 150,
    maximumFontSize: 36,
    minimumFontSize: 34,
  });
  const cta = fitText(plan.copy.cta, {
    maxWidth: 888,
    maxHeight: 90,
    maximumFontSize: 34,
    minimumFontSize: 34,
  });
  return [
    textBlock(headline, SAFE, 200, "Stolzl"),
    scenarioCard(plan, 565),
    textBlock(explanation, SAFE, 950, "Figtree"),
    textBlock(cta, SAFE, 1170, "Figtree", 700),
  ].join("");
}

function carouselContent(plan: CampaignPlan, slide: number): string {
  if (slide === 0) {
    const headline = fitText(plan.copy.headline, {
      maxWidth: 888,
      maxHeight: 690,
      maximumFontSize: 92,
      minimumFontSize: 64,
    });
    return `${textBlock(headline, SAFE, 260, "Stolzl")}
      <text x="96" y="1170" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="34" font-weight="700">DESLIZE PARA CONFERIR →</text>`;
  }
  if (slide === 1) {
    const title = fitText("Qual é o troco?", {
      maxWidth: 888,
      maxHeight: 160,
      maximumFontSize: 80,
      minimumFontSize: 64,
    });
    return `${textBlock(title, SAFE, 250, "Stolzl")}${scenarioCard(plan, 530)}`;
  }
  if (slide === 2) {
    const answer = fitText(plan.copy.answer, {
      maxWidth: 888,
      maxHeight: 260,
      maximumFontSize: 150,
      minimumFontSize: 64,
    });
    const detail = plan.scenario.breakdown
      .map(
        (item) =>
          `${item.quantity}× ${formatMinor(item.denominationMinor, "BRL", "pt-BR")}`,
      )
      .join("  •  ");
    const breakdown = fitText(detail || "Pagamento exato, sem troco.", {
      maxWidth: 888,
      maxHeight: 250,
      maximumFontSize: 42,
      minimumFontSize: 34,
    });
    return `<text x="96" y="310" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="32" font-weight="700">A RESPOSTA É</text>
      ${textBlock(answer, SAFE, 350, "Stolzl")}
      <rect x="96" y="710" width="888" height="360" rx="32" fill="${designTokens.colors.paper}"/>
      ${textBlock(breakdown, 144, 770, "Figtree")}`;
  }

  const explanation = fitText(plan.copy.explanation, {
    maxWidth: 888,
    maxHeight: 600,
    maximumFontSize: 48,
    minimumFontSize: 34,
  });
  const cta = fitText(plan.copy.cta, {
    maxWidth: 888,
    maxHeight: 170,
    maximumFontSize: 42,
    minimumFontSize: 34,
  });
  return `${textBlock(explanation, SAFE, 250, "Figtree")}
    <rect x="96" y="980" width="888" height="200" rx="32" fill="${designTokens.colors.ink}"/>
    ${textBlock(cta, 144, 1015, "Figtree", 700, designTokens.colors.paper)}`;
}

export function createFeedSlideSvg({
  plan,
  brand,
  slide,
}: Readonly<{
  plan: CampaignPlan;
  brand: BrandAssets;
  slide: number;
}>): string {
  if (!Number.isInteger(slide) || slide < 0 || slide >= plan.slideCount) {
    throw new Error(`Invalid slide index ${slide}`);
  }
  const background = backgroundByPalette[plan.palette];
  const content =
    plan.mediaKind === "carousel"
      ? carouselContent(plan, slide)
      : feedContent(plan);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${embeddedFonts(brand)}
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${background}"/>
    ${header(plan, brand, slide)}
    ${content}
  </svg>`;
}
