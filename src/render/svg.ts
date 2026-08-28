import { formatMinor } from "@trocohq/core";
import { designTokens } from "@trocohq/design-tokens";

import type { BrandAssets } from "../brand/load-brand.js";
import type { CampaignFamily } from "../config/schedule.js";
import type { CampaignPlan, Palette } from "../editorial/schema.js";
import {
  carouselTextLayouts,
  feedTextLayouts,
  fitText,
  verticalTextLayouts,
  type TextLayout,
} from "./text-layout.js";
import { safeAreaFor } from "./safe-area.js";

export {
  fitText,
  measureText,
  type FitTextOptions,
  type TextLayout,
} from "./text-layout.js";

const WIDTH = 1080;
const HEIGHT = 1350;
const VERTICAL_HEIGHT = 1920;
const FEED_FRAME = safeAreaFor(WIDTH, HEIGHT);
const VERTICAL_FRAME = safeAreaFor(WIDTH, VERTICAL_HEIGHT);
const CONTAINER_INSET = 48;

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
    <image x="${FEED_FRAME.x}" y="${FEED_FRAME.y}" width="72" height="72" href="data:image/svg+xml;base64,${mark}"/>
    <text x="${FEED_FRAME.x + 96}" y="${FEED_FRAME.y + 50}" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="28" font-weight="700">TROCO</text>
    <rect x="720" y="${FEED_FRAME.y + 8}" width="330" height="58" rx="29" fill="${designTokens.colors.paper}" fill-opacity="0.74"/>
    <text x="885" y="${FEED_FRAME.y + 45}" text-anchor="middle" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="22" font-weight="700">${escapeXml(label)}</text>
    <text x="${FEED_FRAME.right}" y="1270" text-anchor="end" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="22">${String(slide + 1).padStart(2, "0")}/${String(plan.slideCount).padStart(2, "0")}</text>`;
}

function scenarioCard(plan: CampaignPlan, top: number): string {
  const purchase = formatMinor(plan.scenario.purchaseMinor, "BRL", "pt-BR");
  const received = formatMinor(plan.scenario.receivedMinor, "BRL", "pt-BR");
  const answer = plan.copy.answer;
  const contentLeft = FEED_FRAME.x + CONTAINER_INSET;
  const contentRight = FEED_FRAME.right - CONTAINER_INSET;
  const answerBandLeft = FEED_FRAME.x + 32;
  const answerBandRight = FEED_FRAME.right - 32;
  return `
    <rect x="${FEED_FRAME.x}" y="${top}" width="${FEED_FRAME.width}" height="390" rx="36" fill="${designTokens.colors.paper}"/>
    <text x="${contentLeft}" y="${top + 86}" fill="${designTokens.colors.midInk}" font-family="Figtree" font-size="32">COMPRA</text>
    <text x="${contentRight}" y="${top + 88}" text-anchor="end" fill="${designTokens.colors.ink}" font-family="Stolzl" font-size="54">${escapeXml(purchase)}</text>
    <line x1="${contentLeft}" x2="${contentRight}" y1="${top + 128}" y2="${top + 128}" stroke="${designTokens.colors.border}" stroke-width="2"/>
    <text x="${contentLeft}" y="${top + 210}" fill="${designTokens.colors.midInk}" font-family="Figtree" font-size="32">RECEBIDO</text>
    <text x="${contentRight}" y="${top + 212}" text-anchor="end" fill="${designTokens.colors.ink}" font-family="Stolzl" font-size="54">${escapeXml(received)}</text>
    <rect x="${answerBandLeft}" y="${top + 246}" width="${answerBandRight - answerBandLeft}" height="120" rx="28" fill="${designTokens.colors.ink}"/>
    <text x="${answerBandLeft + CONTAINER_INSET}" y="${top + 322}" fill="${designTokens.colors.paper}" font-family="Figtree" font-size="30">TROCO</text>
    <text x="${answerBandRight - CONTAINER_INSET}" y="${top + 326}" text-anchor="end" fill="${designTokens.colors.primary}" font-family="Stolzl" font-size="68">${escapeXml(answer)}</text>`;
}

function feedContent(plan: CampaignPlan): string {
  const headline = fitText(plan.copy.headline, feedTextLayouts.headline);
  const explanation = fitText(
    plan.copy.explanation,
    feedTextLayouts.explanation,
  );
  const cta = fitText(plan.copy.cta, feedTextLayouts.cta);
  return [
    textBlock(headline, FEED_FRAME.x, 178, "Stolzl"),
    scenarioCard(plan, 610),
    textBlock(explanation, FEED_FRAME.x, 1005, "Figtree", 700),
    `<rect x="${FEED_FRAME.x}" y="1160" width="${FEED_FRAME.width}" height="130" rx="28" fill="${designTokens.colors.ink}"/>`,
    textBlock(
      cta,
      FEED_FRAME.x + CONTAINER_INSET,
      1174,
      "Figtree",
      700,
      designTokens.colors.paper,
    ),
  ].join("");
}

function carouselContent(plan: CampaignPlan, slide: number): string {
  if (slide === 0) {
    const headline = fitText(plan.copy.headline, carouselTextLayouts.headline);
    return `${textBlock(headline, FEED_FRAME.x, 260, "Stolzl")}
      <text x="${FEED_FRAME.x}" y="1170" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="34" font-weight="700">DESLIZE PARA CONFERIR →</text>`;
  }
  if (slide === 1) {
    const title = fitText("Qual é o troco?", {
      maxWidth: FEED_FRAME.width,
      maxHeight: 160,
      maximumFontSize: 80,
      minimumFontSize: 64,
    });
    return `${textBlock(title, FEED_FRAME.x, 250, "Stolzl")}${scenarioCard(plan, 530)}`;
  }
  if (slide === 2) {
    const answer = fitText(plan.copy.answer, {
      maxWidth: FEED_FRAME.width,
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
      maxWidth: FEED_FRAME.width - CONTAINER_INSET * 2,
      maxHeight: 250,
      maximumFontSize: 42,
      minimumFontSize: 34,
    });
    return `<text x="${FEED_FRAME.x}" y="310" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="32" font-weight="700">A RESPOSTA É</text>
      ${textBlock(answer, FEED_FRAME.x, 350, "Stolzl")}
      <rect x="${FEED_FRAME.x}" y="710" width="${FEED_FRAME.width}" height="360" rx="32" fill="${designTokens.colors.paper}"/>
      ${textBlock(breakdown, FEED_FRAME.x + CONTAINER_INSET, 770, "Figtree")}`;
  }

  const explanation = fitText(
    plan.copy.explanation,
    carouselTextLayouts.explanation,
  );
  const cta = fitText(plan.copy.cta, carouselTextLayouts.cta);
  return `${textBlock(explanation, FEED_FRAME.x, 250, "Figtree", 700)}
    <rect x="${FEED_FRAME.x}" y="980" width="${FEED_FRAME.width}" height="200" rx="32" fill="${designTokens.colors.ink}"/>
    ${textBlock(cta, FEED_FRAME.x + CONTAINER_INSET, 1015, "Figtree", 700, designTokens.colors.paper)}`;
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

export const verticalScenes = [
  "hook",
  "scenario",
  "answer",
  "end_card",
] as const;
export type VerticalScene = (typeof verticalScenes)[number];

function verticalHeader(
  plan: CampaignPlan,
  brand: BrandAssets,
  sceneIndex: number,
): string {
  const mark = Buffer.from(brand.markSvg).toString("base64");
  return `
    <image x="${VERTICAL_FRAME.x}" y="${VERTICAL_FRAME.y}" width="82" height="82" href="data:image/svg+xml;base64,${mark}"/>
    <text x="${VERTICAL_FRAME.x + 106}" y="${VERTICAL_FRAME.y + 65}" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="32" font-weight="700">TROCO</text>
    <rect x="706" y="${VERTICAL_FRAME.y + 19}" width="344" height="62" rx="31" fill="${designTokens.colors.paper}" fill-opacity="0.78"/>
    <text x="878" y="${VERTICAL_FRAME.y + 59}" text-anchor="middle" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="22" font-weight="700">${escapeXml(familyLabels[plan.family])}</text>
    <text x="${VERTICAL_FRAME.right}" y="1810" text-anchor="end" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="24">${String(sceneIndex + 1).padStart(2, "0")}/04</text>`;
}

function verticalSceneContent(
  plan: CampaignPlan,
  scene: VerticalScene,
): string {
  if (scene === "hook") {
    const headline = fitText(plan.copy.headline, verticalTextLayouts.headline);
    return `${textBlock(headline, VERTICAL_FRAME.x, 320, "Stolzl")}
      <rect x="${VERTICAL_FRAME.x}" y="1490" width="${VERTICAL_FRAME.width}" height="190" rx="40" fill="${designTokens.colors.ink}"/>
      <text x="540" y="1606" text-anchor="middle" fill="${designTokens.colors.paper}" font-family="Figtree" font-size="46" font-weight="700">CALCULE ANTES DA RESPOSTA</text>`;
  }

  if (scene === "scenario") {
    const purchase = formatMinor(plan.scenario.purchaseMinor, "BRL", "pt-BR");
    const received = formatMinor(plan.scenario.receivedMinor, "BRL", "pt-BR");
    const title = fitText("Dois valores. Uma conta.", {
      maxWidth: VERTICAL_FRAME.width,
      maxHeight: 260,
      maximumFontSize: 96,
      minimumFontSize: 72,
    });
    return `${textBlock(title, VERTICAL_FRAME.x, 280, "Stolzl")}
      <rect x="${VERTICAL_FRAME.x}" y="670" width="${VERTICAL_FRAME.width}" height="620" rx="44" fill="${designTokens.colors.paper}"/>
      <text x="${VERTICAL_FRAME.x + CONTAINER_INSET}" y="820" fill="${designTokens.colors.midInk}" font-family="Figtree" font-size="40">COMPRA</text>
      <text x="${VERTICAL_FRAME.right - CONTAINER_INSET}" y="824" text-anchor="end" fill="${designTokens.colors.ink}" font-family="Stolzl" font-size="72">${escapeXml(purchase)}</text>
      <line x1="${VERTICAL_FRAME.x + CONTAINER_INSET}" x2="${VERTICAL_FRAME.right - CONTAINER_INSET}" y1="900" y2="900" stroke="${designTokens.colors.border}" stroke-width="3"/>
      <text x="${VERTICAL_FRAME.x + CONTAINER_INSET}" y="1040" fill="${designTokens.colors.midInk}" font-family="Figtree" font-size="40">RECEBIDO</text>
      <text x="${VERTICAL_FRAME.right - CONTAINER_INSET}" y="1044" text-anchor="end" fill="${designTokens.colors.ink}" font-family="Stolzl" font-size="72">${escapeXml(received)}</text>
      <rect x="${VERTICAL_FRAME.x + 32}" y="1128" width="${VERTICAL_FRAME.width - 64}" height="126" rx="30" fill="${designTokens.colors.ink}"/>
      <text x="540" y="1208" text-anchor="middle" fill="${designTokens.colors.primary}" font-family="Figtree" font-size="48" font-weight="700">QUAL É O TROCO?</text>`;
  }

  if (scene === "answer") {
    const answer = fitText(plan.copy.answer, {
      maxWidth: VERTICAL_FRAME.width,
      maxHeight: 390,
      maximumFontSize: 180,
      minimumFontSize: 80,
    });
    const detail = plan.scenario.breakdown
      .map(
        (item) =>
          `${item.quantity}× ${formatMinor(item.denominationMinor, "BRL", "pt-BR")}`,
      )
      .join("  •  ");
    const breakdown = fitText(detail || "Pagamento exato, sem troco.", {
      maxWidth: VERTICAL_FRAME.width - CONTAINER_INSET * 2,
      maxHeight: 420,
      maximumFontSize: 52,
      minimumFontSize: 40,
    });
    return `<text x="${VERTICAL_FRAME.x}" y="410" fill="${designTokens.colors.ink}" font-family="Figtree" font-size="38" font-weight="700">O TROCO CERTO É</text>
      ${textBlock(answer, VERTICAL_FRAME.x, 470, "Stolzl")}
      <rect x="${VERTICAL_FRAME.x}" y="980" width="${VERTICAL_FRAME.width}" height="470" rx="40" fill="${designTokens.colors.paper}"/>
      <text x="${VERTICAL_FRAME.x + CONTAINER_INSET}" y="1070" fill="${designTokens.colors.midInk}" font-family="Figtree" font-size="30" font-weight="700">UMA FORMA DE SEPARAR</text>
      ${textBlock(breakdown, VERTICAL_FRAME.x + CONTAINER_INSET, 1120, "Figtree")}`;
  }

  const explanation = fitText(
    plan.copy.explanation,
    verticalTextLayouts.explanation,
  );
  const cta = fitText(plan.copy.cta, verticalTextLayouts.cta);
  return `${textBlock(explanation, VERTICAL_FRAME.x, 300, "Figtree", 700)}
    <rect x="${VERTICAL_FRAME.x}" y="1280" width="${VERTICAL_FRAME.width}" height="430" rx="44" fill="${designTokens.colors.ink}"/>
    ${textBlock(cta, VERTICAL_FRAME.x + CONTAINER_INSET, 1360, "Figtree", 700, designTokens.colors.paper)}
    <text x="${VERTICAL_FRAME.x + CONTAINER_INSET}" y="1640" fill="${designTokens.colors.primary}" font-family="Figtree" font-size="36" font-weight="700">troco.net</text>`;
}

export function createVerticalSceneSvg({
  plan,
  brand,
  scene,
}: Readonly<{
  plan: CampaignPlan;
  brand: BrandAssets;
  scene: VerticalScene;
}>): string {
  const sceneIndex = verticalScenes.indexOf(scene);
  if (sceneIndex < 0)
    throw new Error(`Invalid vertical scene: ${String(scene)}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${VERTICAL_HEIGHT}" viewBox="0 0 ${WIDTH} ${VERTICAL_HEIGHT}">
    ${embeddedFonts(brand)}
    <rect width="${WIDTH}" height="${VERTICAL_HEIGHT}" fill="${backgroundByPalette[plan.palette]}"/>
    ${verticalHeader(plan, brand, sceneIndex)}
    ${verticalSceneContent(plan, scene)}
  </svg>`;
}
