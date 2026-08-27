import assert from "node:assert/strict";
import test from "node:test";

import { createCampaignCopy } from "../src/editorial/copy.js";

const input = {
  campaignId: "2026-08-27-quick-calculation-v1-0",
  family: "quick_calculation",
  scenario: {
    purchaseMinor: 780,
    receivedMinor: 1_000,
    resultMinor: 220,
    outcome: "change_due",
    breakdown: [
      { denominationMinor: 200, quantity: 1 },
      { denominationMinor: 10, quantity: 2 },
    ],
  },
  fact: {
    id: "product.android-download",
    statement: "O app completo do Troco está na Google Play.",
    source: "repo://frontend/lib/i18n/messages/pt-br.ts",
    reviewedOn: "2026-08-26",
    families: ["quick_calculation"],
  },
  ctaKind: "calculator",
} as const;

test("a question hook follows the values needed to answer it", () => {
  const copy = createCampaignCopy({ ...input, hook: "Quanto volta?" });

  assert.equal(
    copy.headline,
    "R$\u00a07,80 na compra. Pagou com R$\u00a010,00. Quanto volta?",
  );
});

test("headline generation enforces the editorial limit before channel limits", () => {
  assert.throws(
    () =>
      createCampaignCopy({
        ...input,
        hook: "Conta muito comprida ".repeat(4).trim(),
      }),
    /Headline exceeds its 120-character limit/,
  );
});
