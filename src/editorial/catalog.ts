import productCapabilities from "../../assets/facts/product-capabilities.json" with { type: "json" };
import cashierTips from "../../assets/facts/cashier-tips.json" with { type: "json" };
import safetyRules from "../../assets/facts/safety-rules.json" with { type: "json" };
import calendarMomentValues from "../../assets/facts/calendar-moments.json" with { type: "json" };

import { campaignFamilies, type CampaignFamily } from "../config/schedule.js";
import {
  calendarMomentSchema,
  assertFactUsable,
  ctaKinds,
  factSchema,
  palettes,
  type CalendarMoment,
  type CtaKind,
  type Fact,
  type Palette,
} from "./schema.js";

export type Recipe = Readonly<{
  id: string;
  version: number;
  family: CampaignFamily;
  mediaKind: "feed" | "carousel" | "video";
  slideCount: number;
}>;

export const recipes: readonly Recipe[] = [
  {
    id: "change-challenge-v1",
    version: 1,
    family: "change_challenge",
    mediaKind: "video",
    slideCount: 1,
  },
  {
    id: "cashier-shortcut-v1",
    version: 1,
    family: "cashier_shortcut",
    mediaKind: "carousel",
    slideCount: 4,
  },
  {
    id: "troco-explains-v1",
    version: 1,
    family: "troco_explains",
    mediaKind: "feed",
    slideCount: 1,
  },
  {
    id: "quick-calculation-v1",
    version: 1,
    family: "quick_calculation",
    mediaKind: "video",
    slideCount: 1,
  },
  {
    id: "safe-checkout-v1",
    version: 1,
    family: "safe_checkout",
    mediaKind: "carousel",
    slideCount: 4,
  },
  {
    id: "checkout-situation-v1",
    version: 1,
    family: "checkout_situation",
    mediaKind: "video",
    slideCount: 1,
  },
  {
    id: "save-this-rule-v1",
    version: 1,
    family: "save_this_rule",
    mediaKind: "feed",
    slideCount: 1,
  },
];

export const hooks: Readonly<Record<CampaignFamily, readonly string[]>> = {
  change_challenge: [
    "Consegue calcular antes da resposta?",
    "Conta rápida de caixa",
    "Quanto você devolveria?",
    "Desafio do troco certo",
  ],
  cashier_shortcut: [
    "Um atalho para conferir o caixa",
    "Menos conta de cabeça",
    "Faça esta conferência",
    "Troco organizado em segundos",
  ],
  troco_explains: [
    "Troco explica",
    "A conta por trás do troco",
    "Dois valores, uma resposta",
    "Entenda sem complicação",
  ],
  quick_calculation: [
    "Compra, recebido, resposta",
    "Faça a conta comigo",
    "Troco rápido",
    "Resposta em poucos segundos",
  ],
  safe_checkout: [
    "Pausa antes de confirmar",
    "Uma regra para o caixa",
    "Confira antes de concluir",
    "Segurança também é rotina",
  ],
  checkout_situation: [
    "Situação real de balcão",
    "E agora, quanto devolver?",
    "No ritmo do caixa",
    "Uma venda comum, uma conta importante",
  ],
  save_this_rule: [
    "Salve esta regra",
    "Uma conferência que vale lembrar",
    "Leve para o próximo atendimento",
    "Regra simples, caixa mais seguro",
  ],
};

export const facts: readonly Fact[] = factSchema
  .array()
  .parse([...productCapabilities, ...cashierTips, ...safetyRules]);

export const calendarMoments: readonly CalendarMoment[] = calendarMomentSchema
  .array()
  .parse(calendarMomentValues);

export const editorialPalettes: readonly Palette[] = palettes;
export const editorialCtaKinds: readonly CtaKind[] = ctaKinds;

export function recipeForFamily(family: CampaignFamily): Recipe {
  const recipe = recipes.find((value) => value.family === family);
  if (!recipe) throw new Error(`Missing recipe for ${family}`);
  return recipe;
}

export function calendarMomentForDate(
  localDate: string,
  family: CampaignFamily,
  moments: readonly CalendarMoment[] = calendarMoments,
): CalendarMoment | undefined {
  const monthDay = localDate.slice(5);
  return moments.find(
    (moment) =>
      moment.monthDay === monthDay &&
      moment.families.includes(family) &&
      (!moment.expiresOn || moment.expiresOn >= localDate),
  );
}

export function usableFactsForCampaign(
  values: readonly Fact[],
  localDate: string,
  family: CampaignFamily,
): readonly Fact[] {
  const usable = values.filter(
    (fact) =>
      fact.families.includes(family) &&
      (!fact.expiresOn || fact.expiresOn >= localDate),
  );
  for (const fact of usable) assertFactUsable(fact, localDate, family);
  return Object.freeze(usable);
}

if (recipes.length !== campaignFamilies.length) {
  throw new Error(
    "Editorial catalog must define exactly one recipe per family",
  );
}
