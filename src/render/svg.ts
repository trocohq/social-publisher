import { formatMinor } from "@trocohq/core";
import { designTokens } from "@trocohq/design-tokens";

import type { BrandAssets } from "../brand/load-brand.js";
import type { CampaignFamily } from "../config/schedule.js";
import type { CampaignPlan, Palette } from "../editorial/schema.js";
import { createThumbnailCopy } from "./thumbnail-copy.js";
import {
  carouselTextLayouts,
  feedTextLayouts,
  fitText,
  measureText,
  thumbnailHeadlineLayout,
  verticalTextLayouts,
  type TextLayout,
} from "./text-layout.js";
import { safeAreaFor } from "./safe-area.js";
import {
  treatmentForCampaign,
  type VerticalTreatment,
} from "./vertical-treatment.js";

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

export const THUMBNAIL_SECTION_GAP = 40;
export const THUMBNAIL_CROP_TOP = 420;
export const THUMBNAIL_CROP_BOTTOM = 1500;
const VERTICAL_MARK_SIZE = 82;
const VERTICAL_BRAND_FONT_SIZE = VERTICAL_MARK_SIZE * (26 / 32);
const VERTICAL_BRAND_GAP = VERTICAL_MARK_SIZE * (10 / 32);
const VERTICAL_LABEL_HEIGHT = 28;
const VERTICAL_LABEL_GAP = 16;
const THUMBNAIL_HEADER_HEIGHT =
  VERTICAL_MARK_SIZE + VERTICAL_LABEL_GAP + VERTICAL_LABEL_HEIGHT;
const THUMBNAIL_KICKER_HEIGHT = 38;
const THUMBNAIL_MESSAGE_INSET = 16;
const THUMBNAIL_CTA_HEIGHT = 190;
const VERTICAL_SECTION_GAP = 40;
const VERTICAL_CARD_INSET = 48;
const VERTICAL_SCENARIO_CARD_HEIGHT = 620;
const VERTICAL_PROGRESS_HEIGHT = 28;
const VERTICAL_SUPPORT_LABEL_HEIGHT = 36;
const VERTICAL_SUPPORT_GAP = 24;
const VERTICAL_URL_HEIGHT = 44;

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

export type VerticalStackLayout = Readonly<{
  top: number;
  bottom: number;
  safeTop: number;
  safeBottom: number;
  height: number;
}>;

type VerticalItem = Readonly<{
  kind:
    | "brand"
    | "label"
    | "kicker"
    | "message"
    | "scenario_card"
    | "answer_card"
    | "cta"
    | "progress";
  top: number;
  height: number;
  text?: TextLayout;
}>;

function verticalItems(
  plan: Pick<CampaignPlan, "scenario" | "copy">,
  scene: VerticalScene,
): readonly VerticalItem[] {
  const items: VerticalItem[] = [];
  let cursor = 0;
  const add = (
    kind: VerticalItem["kind"],
    height: number,
    gap = VERTICAL_SECTION_GAP,
    text?: TextLayout,
  ) => {
    items.push({ kind, top: cursor, height, ...(text ? { text } : {}) });
    cursor += height + gap;
  };
  add("brand", VERTICAL_MARK_SIZE, VERTICAL_LABEL_GAP);
  add("label", VERTICAL_LABEL_HEIGHT);
  try {
    if (scene === "hook") {
      add("kicker", THUMBNAIL_KICKER_HEIGHT, THUMBNAIL_MESSAGE_INSET);
      const headline = fitText(
        createThumbnailCopy(plan),
        thumbnailHeadlineLayout,
      );
      add("message", headline.height, VERTICAL_SECTION_GAP, headline);
      add("cta", THUMBNAIL_CTA_HEIGHT);
    } else if (scene === "scenario") {
      const title = fitText("Dois valores. Uma conta.", {
        maxWidth: VERTICAL_FRAME.width,
        maxHeight: 260,
        maximumFontSize: 96,
        minimumFontSize: 72,
      });
      add("message", title.height, VERTICAL_SECTION_GAP, title);
      add("scenario_card", VERTICAL_SCENARIO_CARD_HEIGHT);
    } else if (scene === "answer") {
      add("kicker", THUMBNAIL_KICKER_HEIGHT, THUMBNAIL_MESSAGE_INSET);
      const answer = fitText(plan.copy.answer, {
        maxWidth: VERTICAL_FRAME.width,
        maxHeight: 390,
        maximumFontSize: 180,
        minimumFontSize: 80,
      });
      add("message", answer.height, VERTICAL_SECTION_GAP, answer);
      const detail = plan.scenario.breakdown
        .map(
          (item) =>
            `${item.quantity}× ${formatMinor(item.denominationMinor, "BRL", "pt-BR")}`,
        )
        .join("  •  ");
      const breakdown = fitText(detail || "Pagamento exato, sem troco.", {
        maxWidth: VERTICAL_FRAME.width - VERTICAL_CARD_INSET * 2,
        maxHeight: 420,
        maximumFontSize: 52,
        minimumFontSize: 40,
      });
      add(
        "answer_card",
        VERTICAL_CARD_INSET * 2 +
          VERTICAL_SUPPORT_LABEL_HEIGHT +
          VERTICAL_SUPPORT_GAP +
          breakdown.height,
        VERTICAL_SECTION_GAP,
        breakdown,
      );
    } else {
      const explanation = fitText(
        plan.copy.explanation,
        verticalTextLayouts.explanation,
      );
      const cta = fitText(plan.copy.cta, verticalTextLayouts.cta);
      add("message", explanation.height, VERTICAL_SECTION_GAP, explanation);
      add(
        "cta",
        VERTICAL_CARD_INSET * 2 +
          cta.height +
          VERTICAL_SUPPORT_GAP +
          VERTICAL_URL_HEIGHT,
        VERTICAL_SECTION_GAP,
        cta,
      );
    }
  } catch (cause) {
    throw new Error(
      `Vertical scene ${scene} text does not fit: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  if (scene !== "hook") add("progress", VERTICAL_PROGRESS_HEIGHT);
  return items;
}

function centeredVerticalLayout(
  scene: VerticalScene,
  items: readonly VerticalItem[],
): VerticalStackLayout {
  const last = items.at(-1)!;
  const height = last.top + last.height;
  const safeTop =
    scene === "hook"
      ? Math.max(VERTICAL_FRAME.y, THUMBNAIL_CROP_TOP)
      : VERTICAL_FRAME.y;
  const safeBottom =
    scene === "hook"
      ? Math.min(VERTICAL_FRAME.bottom, THUMBNAIL_CROP_BOTTOM)
      : VERTICAL_FRAME.bottom;
  if (height > safeBottom - safeTop) {
    throw new Error(
      `Vertical scene ${scene} stack (${height}px) does not fit its safe area (${safeBottom - safeTop}px)`,
    );
  }
  const top = (safeTop + safeBottom - height) / 2;
  return Object.freeze({
    top,
    bottom: top + height,
    safeTop,
    safeBottom,
    height,
  });
}

export function verticalStackLayout(
  plan: CampaignPlan,
  scene: VerticalScene,
): VerticalStackLayout {
  if (!verticalScenes.includes(scene))
    throw new Error(`Invalid vertical scene: ${String(scene)}`);
  return centeredVerticalLayout(scene, verticalItems(plan, scene));
}

export type ThumbnailStackLayout = Readonly<{
  top: number;
  headerBottom: number;
  messageTop: number;
  messageBottom: number;
  ctaTop: number;
  bottom: number;
  headline: TextLayout;
}>;

export function thumbnailStackLayout(
  plan: Pick<CampaignPlan, "scenario">,
): ThumbnailStackLayout {
  const headline = fitText(createThumbnailCopy(plan), thumbnailHeadlineLayout);
  const messageHeight =
    THUMBNAIL_KICKER_HEIGHT + THUMBNAIL_MESSAGE_INSET + headline.height;
  const height =
    THUMBNAIL_HEADER_HEIGHT +
    THUMBNAIL_SECTION_GAP * 2 +
    messageHeight +
    THUMBNAIL_CTA_HEIGHT;
  const layout = centeredVerticalLayout("hook", [
    { kind: "message", top: 0, height },
  ]);
  const headerBottom = layout.top + THUMBNAIL_HEADER_HEIGHT;
  const messageTop = headerBottom + THUMBNAIL_SECTION_GAP;
  const messageBottom = messageTop + messageHeight;
  return Object.freeze({
    top: layout.top,
    headerBottom,
    messageTop,
    messageBottom,
    ctaTop: messageBottom + THUMBNAIL_SECTION_GAP,
    bottom: layout.bottom,
    headline,
  });
}

function verticalBrand(
  brand: BrandAssets,
  treatment: VerticalTreatment,
): Readonly<{ definitions: string; content: string }> {
  const mark = Buffer.from(
    treatment.inverse ? brand.inverseMarkSvg : brand.markSvg,
  ).toString("base64");
  const wordWidth =
    measureText("Troco", VERTICAL_BRAND_FONT_SIZE) -
    5 * 0.04 * VERTICAL_BRAND_FONT_SIZE;
  const left = -(VERTICAL_MARK_SIZE + VERTICAL_BRAND_GAP + wordWidth) / 2;
  const wordCenter =
    left + VERTICAL_MARK_SIZE + VERTICAL_BRAND_GAP + wordWidth / 2;
  return {
    definitions: `<defs><clipPath id="vertical-brand-clip"><rect x="${left}" y="0" width="${VERTICAL_MARK_SIZE}" height="${VERTICAL_MARK_SIZE}" rx="${VERTICAL_MARK_SIZE * 0.22}"/></clipPath></defs>`,
    content: `<image x="${left}" y="0" width="${VERTICAL_MARK_SIZE}" height="${VERTICAL_MARK_SIZE}" clip-path="url(#vertical-brand-clip)" href="data:image/svg+xml;base64,${mark}"/>
    <text data-brand-word="true" x="${wordCenter}" y="${VERTICAL_MARK_SIZE / 2}" dominant-baseline="central" fill="${treatment.foreground}" font-family="Figtree" font-size="${VERTICAL_BRAND_FONT_SIZE}" font-weight="700" letter-spacing="-0.04em">Troco</text>`,
  };
}

function verticalItemSvg(
  plan: CampaignPlan,
  scene: VerticalScene,
  item: VerticalItem,
  treatment: VerticalTreatment,
): string {
  const { top, height } = item;
  const left = -VERTICAL_FRAME.width / 2;
  const contentLeft = left + VERTICAL_CARD_INSET;
  const contentRight = -contentLeft;
  const label = (
    value: string,
    y: number,
    size: number,
    fill = treatment.foreground,
    weight = 700,
  ) =>
    `<text x="0" y="${y}" fill="${fill}" font-family="Figtree" font-size="${size}" font-weight="${weight}">${escapeXml(value)}</text>`;
  const card = (fill: string) =>
    `<rect x="${left}" y="${top}" width="${VERTICAL_FRAME.width}" height="${height}" rx="40" fill="${fill}"/>`;
  switch (item.kind) {
    case "brand":
      return "";
    case "label":
      return label(familyLabels[plan.family], top + height, 24);
    case "kicker":
      return label(
        scene === "hook" ? "FAÇA A CONTA" : "O TROCO CERTO É",
        top + height,
        38,
        treatment.foreground,
        800,
      );
    case "message":
      return textBlock(item.text!, 0, top, "Stolzl", 400, treatment.foreground);
    case "progress":
      return label(
        `${String(verticalScenes.indexOf(scene) + 1).padStart(2, "0")}/04`,
        top + height,
        24,
        treatment.foreground,
        400,
      );
    case "scenario_card": {
      const purchase = formatMinor(plan.scenario.purchaseMinor, "BRL", "pt-BR");
      const received = formatMinor(plan.scenario.receivedMinor, "BRL", "pt-BR");
      return `${card(treatment.surface)}
        <text x="${contentLeft}" y="${top + 150}" text-anchor="start" fill="${treatment.surfaceForeground}" font-family="Figtree" font-size="40">COMPRA</text>
        <text x="${contentRight}" y="${top + 154}" text-anchor="end" fill="${treatment.surfaceForeground}" font-family="Figtree" font-size="72" font-weight="700">${escapeXml(purchase)}</text>
        <line x1="${contentLeft}" x2="${contentRight}" y1="${top + 230}" y2="${top + 230}" stroke="${treatment.surfaceForeground}" stroke-width="2"/>
        <text x="${contentLeft}" y="${top + 370}" text-anchor="start" fill="${treatment.surfaceForeground}" font-family="Figtree" font-size="40">RECEBIDO</text>
        <text x="${contentRight}" y="${top + 374}" text-anchor="end" fill="${treatment.surfaceForeground}" font-family="Figtree" font-size="72" font-weight="700">${escapeXml(received)}</text>
        <rect x="${left + 32}" y="${top + 458}" width="${VERTICAL_FRAME.width - 64}" height="126" rx="30" fill="${treatment.surfaceForeground}"/>
        ${label("QUAL É O TROCO?", top + 538, 48, treatment.surface)}`;
    }
    case "answer_card":
      return `${card(treatment.surface)}
      ${label("UMA FORMA DE SEPARAR", top + VERTICAL_CARD_INSET + VERTICAL_SUPPORT_LABEL_HEIGHT, 30, treatment.surfaceForeground)}
      ${textBlock(item.text!, 0, top + VERTICAL_CARD_INSET + VERTICAL_SUPPORT_LABEL_HEIGHT + VERTICAL_SUPPORT_GAP, "Figtree", 400, treatment.surfaceForeground)}`;
    case "cta":
      if (scene === "hook")
        return `${card(treatment.surfaceForeground)}
        ${label("DESCUBRA NO VÍDEO", top + 80, 46, treatment.surface)}
        ${label("12s →", top + 140, 40, treatment.surface)}`;
      return `${card(treatment.surfaceForeground)}
        ${textBlock(item.text!, 0, top + VERTICAL_CARD_INSET, "Figtree", 700, treatment.surface)}
        ${label("troco.net", top + VERTICAL_CARD_INSET + item.text!.height + VERTICAL_SUPPORT_GAP + VERTICAL_URL_HEIGHT, 36, treatment.surface)}`;
  }
}

function verticalSvg(
  plan: CampaignPlan,
  brand: BrandAssets,
  scene: VerticalScene,
): string {
  if (!verticalScenes.includes(scene))
    throw new Error(`Invalid vertical scene: ${String(scene)}`);
  const treatment = treatmentForCampaign(plan.id);
  const items = verticalItems(plan, scene);
  const layout = centeredVerticalLayout(scene, items);
  // The clip definition lives outside the stack; only visible items contribute to its bounds.
  const lockup = verticalBrand(brand, treatment);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${VERTICAL_HEIGHT}" viewBox="0 0 ${WIDTH} ${VERTICAL_HEIGHT}">
    ${embeddedFonts(brand)}
    <rect width="${WIDTH}" height="${VERTICAL_HEIGHT}" fill="${treatment.background}"/>
    ${lockup.definitions}
    <g data-vertical-stack="true" transform="translate(540 ${layout.top})" text-anchor="middle">
      ${lockup.content}
      ${items.map((item) => verticalItemSvg(plan, scene, item, treatment)).join("")}
    </g>
  </svg>`;
}

export function createVerticalThumbnailSvg({
  plan,
  brand,
}: Readonly<{ plan: CampaignPlan; brand: BrandAssets }>): string {
  return verticalSvg(plan, brand, "hook");
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
  if (scene === "hook") return createVerticalThumbnailSvg({ plan, brand });
  return verticalSvg(plan, brand, scene);
}
