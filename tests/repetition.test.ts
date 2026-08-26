import assert from "node:assert/strict";
import test from "node:test";

import {
  rejectReason,
  selectCandidate,
  type CandidateIdentity,
  type HistoryEntry,
} from "../src/editorial/select.js";

const history: readonly HistoryEntry[] = [
  {
    localDate: "2026-08-20",
    recipeId: "quick-v1",
    purchaseMinor: 8265,
    receivedMinor: 10000,
    headlineFingerprint: "same",
    captionFingerprint: "same-caption",
    palette: "green",
    ctaKind: "download",
  },
];

function candidate(overrides: Partial<CandidateIdentity> = {}): CandidateIdentity {
  return {
    localDate: "2026-08-26",
    recipeId: "other-v1",
    purchaseMinor: 1290,
    receivedMinor: 2000,
    headlineFingerprint: "new",
    captionFingerprint: "new-caption",
    palette: "purple",
    ctaKind: "save_share",
    ...overrides,
  };
}

test("the same recipe and scenario are rejected within 90 days", () => {
  assert.equal(
    rejectReason(
      candidate({ recipeId: "quick-v1", purchaseMinor: 8265, receivedMinor: 10000 }),
      history,
    ),
    "recipe_scenario_within_90_days",
  );
});

test("scenario pairs and annual copy fingerprints are rejected", () => {
  assert.equal(
    rejectReason(candidate({ purchaseMinor: 8265, receivedMinor: 10000 }), history),
    "scenario_within_90_days",
  );
  assert.equal(
    rejectReason(candidate({ headlineFingerprint: "same" }), history),
    "headline_within_365_days",
  );
  assert.equal(
    rejectReason(candidate({ captionFingerprint: "same-caption" }), history),
    "caption_within_365_days",
  );
});

test("consecutive palette and CTA use are rejected", () => {
  const yesterday = [{ ...history[0]!, localDate: "2026-08-25" }];
  assert.equal(
    rejectReason(candidate({ palette: "green" }), yesterday),
    "consecutive_palette",
  );
  assert.equal(
    rejectReason(candidate({ ctaKind: "download" }), yesterday),
    "consecutive_cta",
  );
});

test("selection advances deterministically until it finds a valid candidate", () => {
  const result = selectCandidate({
    localDate: "2026-08-26",
    history,
    maximumCandidates: 3,
    createCandidate: (index) =>
      candidate(index === 0 ? { headlineFingerprint: "same" } : { candidate: index }),
  });
  assert.equal(result.candidate, 1);
});

test("selection fails safely when every candidate repeats", () => {
  assert.throws(
    () =>
      selectCandidate({
        localDate: "2026-08-26",
        history,
        maximumCandidates: 2,
        createCandidate: () => candidate({ headlineFingerprint: "same" }),
      }),
    /No valid campaign candidate/,
  );
});
