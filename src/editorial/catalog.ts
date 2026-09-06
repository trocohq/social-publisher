import productCapabilities from "../../assets/facts/product-capabilities.json" with { type: "json" };
import practicalLessons from "../../assets/facts/practical-lessons.json" with { type: "json" };
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
    "Faz de cabeça?",
    "Seu cálculo bate?",
    "Quanto você devolveria?",
    "Valendo o troco certo",
  ],
  cashier_shortcut: [
    "Um jeito rápido de conferir",
    "Confira sem refazer a conta",
    "Notas e moedas na ordem",
    "Conta feita, troco conferido",
  ],
  troco_explains: [
    "Como o Troco chega ao valor",
    "A conta do começo ao fim",
    "De onde saiu esse troco?",
    "Veja a conta por partes",
  ],
  quick_calculation: [
    "Compra, pagamento, troco",
    "Faz essa conta comigo?",
    "Troco rápido",
    "Quanto volta?",
  ],
  safe_checkout: [
    "Pare e confira",
    "Uma regra para o caixa",
    "Confira antes de concluir",
    "Olhou o valor? Agora confirme",
  ],
  checkout_situation: [
    "Aconteceu no balcão",
    "Quanto você devolveria?",
    "No ritmo do caixa",
    "E o troco?",
  ],
  save_this_rule: [
    "Guarde esta regra",
    "Use no próximo atendimento",
    "Confira antes de entregar",
    "Um lembrete para o caixa",
  ],
};

export const facts: readonly Fact[] = factSchema
  .array()
  .parse([
    ...productCapabilities,
    ...cashierTips,
    ...safetyRules,
    ...practicalLessons,
  ]);

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
