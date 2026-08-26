import assert from "node:assert/strict";
import test from "node:test";

import { createCampaign } from "../src/planning/create-campaign.js";

test("a Wednesday campaign is immutable, attributed, and complete for four channels", () => {
  const plan = createCampaign({
    localDate: "2026-08-26",
    publishTime: "12:17",
    history: [],
  });

  assert.equal(plan.family, "troco_explains");
  assert.equal(plan.targetAt, "2026-08-26T12:17:00-03:00");
  assert.match(plan.copy.channels.instagram.caption, /utm_source=instagram/);
  assert.match(plan.copy.channels.facebook.caption, /utm_source=facebook/);
  assert.match(plan.copy.channels.tiktok.caption, /utm_source=tiktok/);
  assert.match(plan.copy.channels.youtube.description, /utm_source=youtube/);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.copy.channels), true);
  assert.equal(Object.isFrozen(plan.scenario.breakdown), true);
});

test("campaign generation is deterministic and preserves one numeric answer", () => {
  const input = {
    localDate: "2026-08-31",
    publishTime: "08:05",
    history: [],
  } as const;
  const first = createCampaign(input);
  const second = createCampaign(input);

  assert.deepEqual(first, second);
  assert.ok(first.copy.channels.instagram.caption.includes(first.copy.answer));
  assert.ok(first.copy.channels.facebook.caption.includes(first.copy.answer));
  assert.ok(first.copy.channels.tiktok.caption.includes(first.copy.answer));
  assert.ok(
    first.copy.channels.youtube.description.includes(first.copy.answer),
  );
  assert.ok(first.sourceIds.length >= 1);
});

test("campaign generation advances past a conflicting history entry", () => {
  const first = createCampaign({
    localDate: "2026-08-26",
    publishTime: "12:17",
    history: [],
  });
  const next = createCampaign({
    localDate: "2026-09-02",
    publishTime: "12:17",
    history: [
      {
        localDate: first.localDate,
        recipeId: first.recipeId,
        purchaseMinor: first.scenario.purchaseMinor,
        receivedMinor: first.scenario.receivedMinor,
        headlineFingerprint: first.fingerprints.headline,
        captionFingerprint: first.fingerprints.caption,
        palette: first.palette,
        ctaKind: first.ctaKind,
      },
    ],
  });

  assert.notDeepEqual(
    [next.scenario.purchaseMinor, next.scenario.receivedMinor],
    [first.scenario.purchaseMinor, first.scenario.receivedMinor],
  );
});

test("publish time is validated before creating a campaign", () => {
  assert.throws(
    () =>
      createCampaign({
        localDate: "2026-08-26",
        publishTime: "25:90",
        history: [],
      }),
    /publish time/i,
  );
});
