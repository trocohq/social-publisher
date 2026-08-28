import {
  calendarMomentForDate,
  editorialCtaKinds,
  editorialPalettes,
  facts,
  hooks,
  recipeForFamily,
  usableFactsForCampaign,
} from "../editorial/catalog.js";
import { createCampaignCopy } from "../editorial/copy.js";
import { createScenario } from "../editorial/scenario.js";
import {
  campaignPlanSchema,
  type CampaignPlan,
  type Fact,
} from "../editorial/schema.js";
import {
  selectCandidate,
  type CandidateIdentity,
  type HistoryEntry,
} from "../editorial/select.js";
import { campaignFamilyForDate } from "../config/schedule.js";
import {
  campaignId,
  chooseSeeded,
  fingerprintCopy,
} from "../shared/determinism.js";

const curatedScenarioInputs = [
  [780, 1_000],
  [1_250, 2_000],
  [1_790, 2_000],
  [2_350, 5_000],
  [2_865, 5_000],
  [3_490, 5_000],
  [4_275, 5_000],
  [5_890, 10_000],
  [6_480, 10_000],
  [8_265, 10_000],
  [9_350, 10_000],
  [11_875, 20_000],
  [13_490, 20_000],
  [17_825, 20_000],
  [22_750, 50_000],
  [31_890, 50_000],
] as const;
const receivedAmounts = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000] as const;
const changeAmounts = [
  10, 20, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350,
  375, 400, 425, 450, 475, 500,
] as const;
const fallbackScenarioInputs = receivedAmounts.flatMap((receivedMinor) =>
  changeAmounts.map(
    (changeMinor) => [receivedMinor - changeMinor, receivedMinor] as const,
  ),
);

function scenarioInputFor(
  seed: string,
  candidate: number,
): readonly [number, number] {
  if (candidate === 0) return chooseSeeded(curatedScenarioInputs, seed, 0);
  return chooseSeeded(fallbackScenarioInputs, seed, candidate * 7);
}

function targetAt(localDate: string, publishTime: string): string {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(publishTime);
  if (!match) throw new Error("Invalid publish time; expected HH:mm");

  // Brazil has used UTC−03:00 year-round since 2019. The explicit offset also
  // keeps provider payloads unambiguous while the named zone remains runtime config.
  return `${localDate}T${publishTime}:00-03:00`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function compatibleFacts(
  family: CampaignPlan["family"],
  localDate: string,
): readonly Fact[] {
  const values = usableFactsForCampaign(facts, localDate, family);
  if (values.length === 0) throw new Error(`Missing fact for ${family}`);
  return values;
}

export type CreateCampaignInput = Readonly<{
  localDate: string;
  publishTime: string;
  history: readonly HistoryEntry[];
  appDownloadUrl?: string;
}>;

export function createCampaign({
  localDate,
  publishTime,
  history,
  appDownloadUrl,
}: CreateCampaignInput): CampaignPlan {
  const family = campaignFamilyForDate(localDate);
  const recipe = recipeForFamily(family);
  const seed = `${localDate}:${family}:v${recipe.version}`;
  const campaignTargetAt = targetAt(localDate, publishTime);
  const familyFacts = compatibleFacts(family, localDate);
  const calendarMoment = calendarMomentForDate(localDate, family);

  const selected = selectCandidate({
    localDate,
    history,
    createCandidate: (candidate) => {
      const [purchaseMinor, receivedMinor] = scenarioInputFor(seed, candidate);
      const scenario = createScenario(purchaseMinor, receivedMinor);
      const hook = chooseSeeded(hooks[family], seed, candidate * 7 + 1);
      const palette = chooseSeeded(editorialPalettes, seed, candidate * 7 + 2);
      const ctaKind = chooseSeeded(editorialCtaKinds, seed, candidate * 7 + 3);
      const fact = chooseSeeded(familyFacts, seed, candidate * 7 + 4);
      const id = campaignId(localDate, family, recipe.version, candidate);
      const copy = createCampaignCopy({
        campaignId: id,
        family,
        hook,
        scenario,
        fact,
        ...(calendarMoment ? { calendarMoment } : {}),
        ctaKind,
        ...(appDownloadUrl ? { appDownloadUrl } : {}),
      });
      const identity: CandidateIdentity = {
        localDate,
        recipeId: recipe.id,
        purchaseMinor,
        receivedMinor,
        headlineFingerprint: fingerprintCopy(copy.headline),
        captionFingerprint: fingerprintCopy(
          [copy.headline, copy.explanation, copy.cta].join(" "),
        ),
        palette,
        ctaKind,
        candidate,
      };

      return {
        ...identity,
        identity,
        id,
        scenario,
        copy,
        fact,
        palette,
        ctaKind,
        candidate,
      };
    },
  });

  const parsed = campaignPlanSchema.parse({
    schemaVersion: 1,
    id: selected.id,
    localDate,
    targetAt: campaignTargetAt,
    family,
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    candidate: selected.candidate,
    seed,
    palette: selected.palette,
    ctaKind: selected.ctaKind,
    mediaKind: recipe.mediaKind,
    slideCount: recipe.slideCount,
    scenario: selected.scenario,
    copy: selected.copy,
    sourceIds: [
      selected.fact.id,
      ...(calendarMoment ? [calendarMoment.id] : []),
    ],
    ...(calendarMoment ? { calendarMomentId: calendarMoment.id } : {}),
    fingerprints: {
      headline: selected.identity.headlineFingerprint,
      caption: selected.identity.captionFingerprint,
    },
  });

  return deepFreeze(parsed);
}

export function historyEntryFromCampaign(plan: CampaignPlan): HistoryEntry {
  return {
    localDate: plan.localDate,
    recipeId: plan.recipeId,
    purchaseMinor: plan.scenario.purchaseMinor,
    receivedMinor: plan.scenario.receivedMinor,
    headlineFingerprint: plan.fingerprints.headline,
    captionFingerprint: plan.fingerprints.caption,
    palette: plan.palette,
    ctaKind: plan.ctaKind,
  };
}
