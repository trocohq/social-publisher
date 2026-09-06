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

export const DEFAULT_APP_DOWNLOAD_URL = "https://troco.net";

const channelLimits = {
  instagram: 2_200,
  facebook: 5_000,
  tiktok: 2_200,
  youtube: 5_000,
} as const satisfies Readonly<Record<Channel, number>>;

export const SOCIAL_CTA = "→ Link na bio";

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

function finishSentence(value: string): string {
  return /[.!?]$/u.test(value) ? value : `${value}.`;
}

function headlineFor({
  family,
  hook,
  purchase,
  received,
}: Readonly<{
  family: CampaignFamily;
  hook: string;
  purchase: string;
  received: string;
}>): string {
  const opening = finishSentence(hook);
  const setup = `${purchase} na compra. Pagou com ${received}.`;
  const asksForAnswer = [
    "change_challenge",
    "quick_calculation",
    "checkout_situation",
  ].includes(family);
  if (asksForAnswer && hook.endsWith("?")) return `${setup} ${opening}`;
  if (asksForAnswer) return `${opening} ${setup} Quanto volta?`;
  return `${opening} ${purchase} na compra. Recebeu ${received}.`;
}

function breakdownLine(scenario: Scenario): string | undefined {
  if (scenario.breakdown.length === 0) return undefined;
  const pieces = scenario.breakdown.map(({ denominationMinor, quantity }) => {
    const isNote = denominationMinor >= 200;
    const unit = isNote
      ? quantity === 1
        ? "nota"
        : "notas"
      : quantity === 1
        ? "moeda"
        : "moedas";
    return `${quantity} ${unit} de ${formatMinor(denominationMinor, "BRL", "pt-BR")}`;
  });
  return `Uma forma: ${pieces.join(" + ")}.`;
}

export type CreateCampaignCopyInput = Readonly<{
  campaignId: string;
  family: CampaignFamily;
  hook: string;
  scenario: Scenario;
  fact: Fact;
  calendarMoment?: CalendarMoment;
  ctaKind: CtaKind;
  appDownloadUrl?: string;
}>;

export function createCampaignCopy({
  campaignId,
  family,
  hook,
  scenario,
  fact,
  calendarMoment,
  appDownloadUrl = DEFAULT_APP_DOWNLOAD_URL,
}: CreateCampaignCopyInput): CampaignCopy {
  const purchase = formatMinor(scenario.purchaseMinor, "BRL", "pt-BR");
  const received = formatMinor(scenario.receivedMinor, "BRL", "pt-BR");
  const answer = formatMinor(scenario.resultMinor, "BRL", "pt-BR");
  const headline = assertLength(
    fact.lesson?.headline ?? headlineFor({ family, hook, purchase, received }),
    100,
    "Headline",
  );
  const explanation = fact.statement;
  const cta = SOCIAL_CTA;
  const breakdown = breakdownLine(scenario);
  const common = [
    headline,
    "",
    ...(fact.lesson
      ? [fact.lesson.setup, fact.lesson.takeaway]
      : [`A resposta é ${answer}.`, ...(breakdown ? [breakdown] : [])]),
    "",
    explanation,
    ...(calendarMoment ? [calendarMoment.statement] : []),
    "",
    cta,
  ];

  const captionFor = (channel: Channel, hashtags: string): string =>
    assertLength(
      [
        ...common,
        attributedUrl(appDownloadUrl, channel, campaignId, family),
        "",
        hashtags,
      ].join("\n"),
      channelLimits[channel],
      `${channel} copy`,
    );

  const youtubeTitle = assertLength(headline, 100, "YouTube title");

  return {
    ...(fact.lesson ? { lesson: fact.lesson } : {}),
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
        title: assertLength(fact.lesson?.headline ?? hook, 150, "TikTok title"),
        caption: captionFor("tiktok", "#Troco #TrocoCerto #Caixa"),
      },
      youtube: {
        title: youtubeTitle,
        description: captionFor("youtube", "#Troco #Shorts #Varejo"),
      },
    },
  };
}
