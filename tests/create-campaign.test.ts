import assert from "node:assert/strict";
import test from "node:test";

import type { HistoryEntry } from "../src/editorial/select.js";
import {
  createCampaign,
  historyEntryFromCampaign,
} from "../src/planning/create-campaign.js";

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
  for (const copy of [
    plan.copy.channels.instagram.caption,
    plan.copy.channels.facebook.caption,
    plan.copy.channels.tiktok.caption,
    plan.copy.channels.youtube.description,
  ]) {
    const acquisitionUrl = copy
      .split("\n")
      .find((line) => line.startsWith("https://"));
    assert.ok(acquisitionUrl);
    assert.equal(new URL(acquisitionUrl).origin, "https://troco.net");
  }
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

test("a quick calculation sounds spoken and closes its numeric loop", () => {
  const plan = createCampaign({
    localDate: "2026-08-27",
    publishTime: "12:17",
    history: [],
  });

  assert.equal(
    plan.copy.headline,
    "Troco rápido. R$\u00a07,80 na compra. Pagou com R$\u00a010,00. Quanto volta?",
  );
  assert.match(
    plan.copy.channels.instagram.caption,
    /A resposta é R\$\s2,20\./u,
  );
  assert.match(
    plan.copy.channels.instagram.caption,
    /Uma forma: 1 nota de R\$\s2,00 \+ 2 moedas de R\$\s0,10\./u,
  );
  assert.match(
    plan.copy.channels.instagram.caption,
    /O app completo do Troco está na Google Play\./u,
  );
  assert.doesNotMatch(
    plan.copy.channels.instagram.caption,
    /^(Compra|Recebido|Troco):/mu,
  );
});

test("the save-and-share rotation ends with one concrete action", () => {
  const plan = createCampaign({
    localDate: "2026-08-26",
    publishTime: "12:17",
    history: [],
  });

  assert.equal(plan.ctaKind, "save_share");
  assert.equal(plan.copy.cta, "Salve para consultar no próximo atendimento.");
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

test("four months of campaigns rotate every official palette without repeats", () => {
  const history: HistoryEntry[] = [];
  const observed = new Set<string>();
  const start = new Date("2026-09-01T12:00:00Z");

  for (let offset = 0; offset < 120; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const plan = createCampaign({
      localDate: date.toISOString().slice(0, 10),
      publishTime: "12:17",
      history,
    });
    const previous = history.at(-1);
    assert.notEqual(plan.palette, previous?.palette);
    observed.add(plan.palette);
    history.push(historyEntryFromCampaign(plan));
  }

  assert.deepEqual([...observed].sort(), ["blue", "green", "purple", "yellow"]);
});
