import type { CtaKind, Palette } from "./schema.js";
import { calendarDayDistance } from "../shared/time.js";

export type HistoryEntry = Readonly<{
  localDate: string;
  recipeId: string;
  purchaseMinor: number;
  receivedMinor: number;
  headlineFingerprint: string;
  captionFingerprint: string;
  palette: Palette;
  ctaKind: CtaKind;
}>;

export type CandidateIdentity = Readonly<{
  localDate: string;
  recipeId: string;
  purchaseMinor: number;
  receivedMinor: number;
  headlineFingerprint: string;
  captionFingerprint: string;
  palette: Palette;
  ctaKind: CtaKind;
  candidate?: number;
}>;

export type RejectionReason =
  | "recipe_scenario_within_90_days"
  | "scenario_within_90_days"
  | "headline_within_365_days"
  | "caption_within_365_days"
  | "consecutive_palette"
  | "consecutive_cta";

function withinDays(
  candidateDate: string,
  historyDate: string,
  maximumDays: number,
): boolean {
  return calendarDayDistance(candidateDate, historyDate) <= maximumDays;
}

export function rejectReason(
  candidate: CandidateIdentity,
  history: readonly HistoryEntry[],
): RejectionReason | undefined {
  if (
    history.some(
      (entry) =>
        withinDays(candidate.localDate, entry.localDate, 90) &&
        entry.recipeId === candidate.recipeId &&
        entry.purchaseMinor === candidate.purchaseMinor &&
        entry.receivedMinor === candidate.receivedMinor,
    )
  ) {
    return "recipe_scenario_within_90_days";
  }

  if (
    history.some(
      (entry) =>
        withinDays(candidate.localDate, entry.localDate, 90) &&
        entry.purchaseMinor === candidate.purchaseMinor &&
        entry.receivedMinor === candidate.receivedMinor,
    )
  ) {
    return "scenario_within_90_days";
  }

  if (
    history.some(
      (entry) =>
        withinDays(candidate.localDate, entry.localDate, 365) &&
        entry.headlineFingerprint === candidate.headlineFingerprint,
    )
  ) {
    return "headline_within_365_days";
  }

  if (
    history.some(
      (entry) =>
        withinDays(candidate.localDate, entry.localDate, 365) &&
        entry.captionFingerprint === candidate.captionFingerprint,
    )
  ) {
    return "caption_within_365_days";
  }

  const previous = [...history]
    .filter(
      (entry) =>
        entry.localDate < candidate.localDate &&
        calendarDayDistance(candidate.localDate, entry.localDate) === 1,
    )
    .sort((left, right) => right.localDate.localeCompare(left.localDate))[0];

  if (previous?.palette === candidate.palette) return "consecutive_palette";
  if (previous?.ctaKind === candidate.ctaKind) return "consecutive_cta";
  return undefined;
}

export function selectCandidate<T extends CandidateIdentity>({
  localDate,
  history,
  maximumCandidates = 256,
  createCandidate,
}: Readonly<{
  localDate: string;
  history: readonly HistoryEntry[];
  maximumCandidates?: number;
  createCandidate: (index: number) => T;
}>): T {
  if (!Number.isInteger(maximumCandidates) || maximumCandidates < 1) {
    throw new Error("Maximum candidates must be a positive integer");
  }

  for (let index = 0; index < maximumCandidates; index += 1) {
    const candidate = createCandidate(index);
    if (candidate.localDate !== localDate) {
      throw new Error("Candidate date differs from the requested date");
    }
    if (!rejectReason(candidate, history)) return candidate;
  }

  throw new Error(
    `No valid campaign candidate for ${localDate} after ${maximumCandidates} attempts`,
  );
}
