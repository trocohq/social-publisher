import { designTokens } from "@trocohq/design-tokens";

import { chooseSeeded } from "../shared/determinism.js";

export type VerticalTreatment = Readonly<{
  id: "paper" | "ink" | "primary" | "purple" | "yellow" | "blue" | "coral";
  background: string;
  foreground: string;
  surface: string;
  surfaceForeground: string;
  inverse: boolean;
}>;

const { colors } = designTokens;

export const verticalTreatments: readonly VerticalTreatment[] = Object.freeze([
  Object.freeze({
    id: "paper",
    background: colors.paper,
    foreground: colors.ink,
    surface: colors.paper,
    surfaceForeground: colors.ink,
    inverse: false,
  }),
  Object.freeze({
    id: "ink",
    background: colors.ink,
    foreground: colors.paper,
    surface: colors.paper,
    surfaceForeground: colors.ink,
    inverse: true,
  }),
  Object.freeze({
    id: "primary",
    background: colors.primary,
    foreground: colors.ink,
    surface: colors.paper,
    surfaceForeground: colors.ink,
    inverse: false,
  }),
  Object.freeze({
    id: "purple",
    background: colors.purple,
    foreground: colors.ink,
    surface: colors.paper,
    surfaceForeground: colors.ink,
    inverse: false,
  }),
  Object.freeze({
    id: "yellow",
    background: colors.yellow,
    foreground: colors.ink,
    surface: colors.paper,
    surfaceForeground: colors.ink,
    inverse: false,
  }),
  Object.freeze({
    id: "blue",
    background: colors.blue,
    foreground: colors.ink,
    surface: colors.paper,
    surfaceForeground: colors.ink,
    inverse: false,
  }),
  Object.freeze({
    id: "coral",
    background: colors.coral,
    foreground: colors.ink,
    surface: colors.paper,
    surfaceForeground: colors.ink,
    inverse: false,
  }),
]);

export function treatmentForCampaign(campaignId: string): VerticalTreatment {
  if (campaignId.trim() === "") {
    throw new Error("Campaign ID must not be empty or whitespace");
  }
  return chooseSeeded(verticalTreatments, campaignId, 43);
}
