import { formatMinor } from "@trocohq/core";

import type { CampaignFamily } from "../config/schedule.js";
import type {
  CalendarMoment,
  CampaignCopy,
  Channel,
  CtaKind,
  Fact,
  Scenario,
} from "./schema.js";

export const DEFAULT_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=trocofacil.app";

const channelLimits = {
  instagram: 2_200,
  facebook: 5_000,
  tiktok: 2_200,
  youtube: 5_000,
} as const satisfies Readonly<Record<Channel, number>>;

const ctaByKind: Readonly<Record<CtaKind, string>> = {
  download: "Baixe o Troco grátis no Android.",
  calculator: "Faça a próxima conta com o Troco.",
  save_share: "Salve e compartilhe com quem trabalha no caixa.",
};

function attributedUrl(
  baseUrl: string,
  channel: Channel,
  campaignId: string,
  family: CampaignFamily,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", campaignId);
  url.searchParams.set("utm_content", family);
  return url.toString();
}

function assertLength(value: string, maximum: number, label: string): string {
  if (value.length > maximum) {
    throw new Error(`${label} exceeds its ${maximum}-character limit`);
  }
  return value;
}

function scenarioLines(scenario: Scenario): readonly string[] {
  return [
    `Compra: ${formatMinor(scenario.purchaseMinor, "BRL", "pt-BR")}`,
    `Recebido: ${formatMinor(scenario.receivedMinor, "BRL", "pt-BR")}`,
    `Troco: ${formatMinor(scenario.resultMinor, "BRL", "pt-BR")}`,
  ];
}

export type CreateCampaignCopyInput = Readonly<{
  campaignId: string;
  family: CampaignFamily;
  hook: string;
  scenario: Scenario;
  fact: Fact;
  calendarMoment?: CalendarMoment;
  ctaKind: CtaKind;
  playStoreUrl?: string;
}>;

export function createCampaignCopy({
  campaignId,
  family,
  hook,
  scenario,
  fact,
  calendarMoment,
  ctaKind,
  playStoreUrl = DEFAULT_PLAY_STORE_URL,
}: CreateCampaignCopyInput): CampaignCopy {
  const purchase = formatMinor(scenario.purchaseMinor, "BRL", "pt-BR");
  const received = formatMinor(scenario.receivedMinor, "BRL", "pt-BR");
  const answer = formatMinor(scenario.resultMinor, "BRL", "pt-BR");
  const headline = assertLength(
    `${hook}: ${purchase} pagos com ${received}`,
    120,
    "Headline",
  );
  const explanation = [fact.statement, calendarMoment?.statement]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const cta = ctaByKind[ctaKind];
  const common = [
    headline,
    "",
    ...scenarioLines(scenario),
    "",
    explanation,
    "",
    cta,
  ];

  const captionFor = (channel: Channel, hashtags: string): string =>
    assertLength(
      [
        ...common,
        attributedUrl(playStoreUrl, channel, campaignId, family),
        "",
        hashtags,
      ].join("\n"),
      channelLimits[channel],
      `${channel} copy`,
    );

  const youtubeTitle = assertLength(headline, 100, "YouTube title");

  return {
    headline,
    answer,
    explanation,
    cta,
    channels: {
      instagram: {
        caption: captionFor("instagram", "#Troco #Varejo #Caixa"),
      },
      facebook: {
        caption: captionFor("facebook", "#Troco #Varejo"),
      },
      tiktok: {
        title: assertLength(hook, 150, "TikTok title"),
        caption: captionFor("tiktok", "#Troco #TrocoCerto #Caixa"),
      },
      youtube: {
        title: youtubeTitle,
        description: captionFor("youtube", "#Troco #Shorts #Varejo"),
      },
    },
  };
}
