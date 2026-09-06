import { formatMinor } from "@trocohq/core";
import { z } from "zod";

import { campaignFamilies, type CampaignFamily } from "../config/schedule.js";
import {
  carouselTextLayouts,
  feedTextLayouts,
  fitText,
  verticalTextLayouts,
  type CopyTextLayouts,
} from "../render/text-layout.js";

export const channels = ["instagram", "facebook", "tiktok", "youtube"] as const;
export const channelSchema = z.enum(channels);
export type Channel = z.infer<typeof channelSchema>;

export const palettes = ["green", "purple", "yellow", "blue"] as const;
export const paletteSchema = z.enum(palettes);
export type Palette = z.infer<typeof paletteSchema>;

export const ctaKinds = ["download", "calculator", "save_share"] as const;
export const ctaKindSchema = z.enum(ctaKinds);
export type CtaKind = z.infer<typeof ctaKindSchema>;

const sourceSchema = z.string().refine((value) => {
  if (value.startsWith("repo://")) return value.length > "repo://".length;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "A fact source must be a repository reference or HTTPS URL");

const safePublicText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), "Markup is forbidden");

export const lessonSchema = z.object({
  headline: safePublicText(100),
  setup: safePublicText(180),
  takeaway: safePublicText(180),
});

export const factSchema = z.object({
  id: z.string().regex(/^[a-z0-9._-]+$/),
  statement: safePublicText(600),
  source: sourceSchema,
  reviewedOn: z.iso.date(),
  expiresOn: z.iso.date().optional(),
  families: z.array(z.enum(campaignFamilies)).min(1),
  lesson: lessonSchema.optional(),
});
export type Fact = z.infer<typeof factSchema>;

export const calendarMomentSchema = factSchema.extend({
  monthDay: z.string().regex(/^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/),
});
export type CalendarMoment = z.infer<typeof calendarMomentSchema>;

export function assertFactUsable(
  fact: Fact,
  localDate: string,
  family: CampaignFamily,
): void {
  if (!fact.families.includes(family)) {
    throw new Error(
      `Fact ${fact.id} is not allowed for campaign family ${family}`,
    );
  }
  if (fact.expiresOn && fact.expiresOn < localDate) {
    throw new Error(`Fact ${fact.id} expired on ${fact.expiresOn}`);
  }
}

export const scenarioSchema = z.object({
  purchaseMinor: z.number().int().nonnegative(),
  receivedMinor: z.number().int().nonnegative(),
  resultMinor: z.number().int().nonnegative(),
  outcome: z.enum(["change_due", "exact_amount", "insufficient_amount"]),
  breakdown: z.array(
    z.object({
      denominationMinor: z.number().int().positive(),
      quantity: z.number().int().positive(),
    }),
  ),
});
export type Scenario = z.infer<typeof scenarioSchema>;

const captionSchema = (maximum: number) =>
  z.object({ caption: safePublicText(maximum) });

export const campaignCopySchema = z.object({
  lesson: lessonSchema.optional(),
  headline: safePublicText(100),
  answer: safePublicText(80),
  explanation: safePublicText(600),
  cta: safePublicText(220),
  channels: z.object({
    instagram: captionSchema(2_200),
    facebook: captionSchema(5_000),
    tiktok: captionSchema(2_200).extend({ title: safePublicText(150) }),
    youtube: z.object({
      title: safePublicText(100),
      description: safePublicText(5_000),
    }),
  }),
});
export type CampaignCopy = z.infer<typeof campaignCopySchema>;

function requiredVisualLayouts(
  mediaKind: "feed" | "carousel" | "video",
): readonly Readonly<{ name: string; layouts: CopyTextLayouts }>[] {
  if (mediaKind === "carousel") {
    return [{ name: "carousel", layouts: carouselTextLayouts }];
  }
  if (mediaKind === "video") {
    return [
      { name: "feed", layouts: feedTextLayouts },
      { name: "vertical", layouts: verticalTextLayouts },
    ];
  }
  return [{ name: "feed", layouts: feedTextLayouts }];
}

export const campaignPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+-v\d+-\d+$/),
    localDate: z.iso.date(),
    targetAt: z.iso.datetime({ offset: true }),
    family: z.enum(campaignFamilies),
    recipeId: z.string().regex(/^[a-z0-9-]+$/),
    recipeVersion: z.number().int().positive(),
    candidate: z.number().int().nonnegative(),
    seed: z.string().min(1).max(160),
    palette: paletteSchema,
    ctaKind: ctaKindSchema,
    mediaKind: z.enum(["feed", "carousel", "video"]),
    slideCount: z.number().int().min(1).max(5),
    scenario: scenarioSchema,
    copy: campaignCopySchema,
    sourceIds: z.array(z.string().regex(/^[a-z0-9._-]+$/)).min(1),
    calendarMomentId: z
      .string()
      .regex(/^[a-z0-9._-]+$/)
      .optional(),
    fingerprints: z.object({
      headline: z.string().regex(/^[a-f0-9]{64}$/),
      caption: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  })
  .superRefine((plan, context) => {
    const expectedAnswer = formatMinor(
      plan.scenario.resultMinor,
      "BRL",
      "pt-BR",
    );
    if (plan.copy.answer !== expectedAnswer) {
      context.addIssue({
        code: "custom",
        message: "Campaign answer must match the scenario result",
        path: ["copy", "answer"],
      });
    }
    if (plan.mediaKind === "feed" && plan.slideCount !== 1) {
      context.addIssue({
        code: "custom",
        message: "Feed campaigns have one slide",
        path: ["slideCount"],
      });
    }
    if (plan.mediaKind === "carousel" && plan.slideCount < 2) {
      context.addIssue({
        code: "custom",
        message: "Carousel campaigns need at least two slides",
        path: ["slideCount"],
      });
    }
    if (plan.mediaKind === "video" && plan.slideCount !== 1) {
      context.addIssue({
        code: "custom",
        message: "Video campaigns have one poster",
        path: ["slideCount"],
      });
    }
    for (const { name, layouts } of requiredVisualLayouts(plan.mediaKind)) {
      for (const field of ["headline", "explanation", "cta"] as const) {
        try {
          fitText(plan.copy[field], layouts[field]);
        } catch {
          context.addIssue({
            code: "custom",
            message: `${field} does not fit the visual ${name} layout`,
            path: ["copy", field],
          });
        }
      }
    }
  });

export type CampaignPlan = z.infer<typeof campaignPlanSchema>;
