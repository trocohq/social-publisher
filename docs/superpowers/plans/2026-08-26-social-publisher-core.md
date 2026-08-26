# Troco Social Publisher Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, zero-cost editorial planner and media renderer that creates one reviewable Troco campaign per local day as feed assets and a valid vertical Short.

**Architecture:** A standalone ESM TypeScript package turns repository-owned facts and BRL scenarios into immutable `CampaignPlan` values. Pure planning modules receive the date and history explicitly; rendering modules consume only validated plans and canonical brand assets, producing JPEG and MP4 files plus a hash manifest. The core performs no provider writes and exposes a dry-run CLI that is safe in pull requests.

**Tech Stack:** Node.js 20.19+, TypeScript 6, Zod 4, `@trocohq/core`, `@trocohq/design-tokens`, Sharp, FFmpeg/ffprobe, Node test runner, Prettier

---

## Repository and file map

All paths below are relative to the `social-publisher` repository.

- `AGENTS.md`: repository conventions, safety boundaries, and validation commands.
- `.npmrc`: GitHub Packages registry configuration using an environment token only.
- `.env.example`: documented non-secret local configuration.
- `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`: reproducible ESM TypeScript toolchain.
- `src/config/environment.ts`: validated runtime configuration with no direct reads elsewhere.
- `src/config/schedule.ts`: timezone, publication time, and weekday-family rotation.
- `src/shared/determinism.ts`: hashing, seeded choice, normalization, and campaign identity.
- `src/shared/time.ts`: São Paulo local-date arithmetic and rolling-window dates.
- `src/editorial/schema.ts`: facts, recipes, scenarios, copy, and campaign schemas.
- `src/editorial/catalog.ts`: reviewed campaign recipes, claims, hooks, CTAs, and sources.
- `src/editorial/scenario.ts`: BRL examples computed through `@trocohq/core`.
- `src/editorial/select.ts`: deterministic candidate generation and repetition guards.
- `src/editorial/copy.ts`: channel-specific Brazilian Portuguese copy and attributed links.
- `src/planning/create-campaign.ts`: immutable `CampaignPlan` assembly.
- `src/planning/rolling-window.ts`: local date through six days ahead without backfill.
- `src/brand/manifest.ts`: canonical asset names and reviewed SHA-256 values.
- `src/brand/load-brand.ts`: asset presence, hash, font, and SVG validation.
- `src/render/svg.ts`: escaped Product Editorial SVG scene construction.
- `src/render/image.ts`: 1080×1350 sRGB JPEG rendering and carousel manifests.
- `src/render/audio.ts`: deterministic original PCM tone-bed generation.
- `src/render/video.ts`: FFmpeg argument-array assembly and 1080×1920 MP4 rendering.
- `src/render/probe.ts`: `ffprobe` metadata normalization and media-contract validation.
- `src/dry-run/create-review.ts`: campaign JSON, captions, assets, metadata, and HTML review page.
- `src/cli/dry-run.ts`: read-only CLI entry point.
- `src/validation/run.ts`: complete deterministic and render validation entry point.
- `assets/facts/product-capabilities.json`: source-reviewed Troco capabilities.
- `assets/facts/cashier-tips.json`: source-reviewed cashier and safety facts.
- `assets/facts/safety-rules.json`: source-reviewed rules extracted from Troco's cited articles.
- `assets/facts/calendar-moments.json`: fixed Brazilian retail moments with authoritative references.
- `assets/fixtures/worst-case-campaign.json`: typography and media boundary fixture.
- `tests/**/*.test.ts`: focused unit, render, and CLI contracts.

## Task 1: Bootstrap the standalone TypeScript package

**Files:**

- Create: `AGENTS.md`
- Create: `.npmrc`
- Create: `.env.example`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `src/index.ts`
- Create: `tests/package-contract.test.ts`

- [ ] **Step 1: Write the package contract test**

```ts
// tests/package-contract.test.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the publisher is a public ESM package with deterministic validation scripts", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(packageJson.private, false);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.engines.node, ">=20.19.4");
  assert.equal(
    packageJson.scripts.test,
    "node --import tsx --test tests/*.test.ts",
  );
  assert.equal(
    packageJson.scripts.validate,
    "node --import tsx src/validation/run.ts",
  );
});
```

- [ ] **Step 2: Create the package and compiler configuration**

```json
// package.json
{
  "name": "@trocohq/social-publisher",
  "version": "1.0.0",
  "description": "Deterministic daily social publishing for Troco.",
  "type": "module",
  "private": false,
  "license": "MIT",
  "engines": { "node": ">=20.19.4" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.build.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "node --import tsx --test tests/*.test.ts",
    "dry-run": "node --import tsx src/cli/dry-run.ts",
    "validate": "node --import tsx src/validation/run.ts",
    "check": "npm run format:check && npm run typecheck && npm test"
  },
  "dependencies": {
    "@trocohq/core": "0.7.3",
    "@trocohq/design-tokens": "0.1.2",
    "ffmpeg-static": "5.3.0",
    "ffprobe-static": "3.1.0",
    "sharp": "0.35.3",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "24.10.0",
    "prettier": "3.9.0",
    "tsx": "4.20.6",
    "typescript": "6.0.3"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

```json
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

```ini
# .npmrc
@trocohq:registry=https://npm.pkg.github.com
```

Set `.env.example` to these non-secret defaults:

```dotenv
PUBLISH_TIME=12:17
PUBLICATION_TIME_ZONE=America/Sao_Paulo
PLAY_STORE_URL=https://play.google.com/store/apps/details?id=trocofacil.app
BRAND_ROOT=dependencies/frontend/public
FFMPEG_PATH=
FFPROBE_PATH=
```

Create `src/index.ts` with named exports only, and write `AGENTS.md` with these commands and the rules that money stays in integer minor units, runtime inputs pass Zod schemas, generated binaries never enter Git, code and commits are English, and external processes receive argument arrays.

- [ ] **Step 3: Install exact dependencies and generate the lockfile**

Run: `NODE_AUTH_TOKEN="$PACKAGES_READ_TOKEN" npm install`

Expected: `package-lock.json` is created, the install exits `0`, and no credential is written to tracked files. If the shell does not define `PACKAGES_READ_TOKEN`, retrieve the existing read-only GitHub Packages token through the normal operator secret setup before continuing.

- [ ] **Step 4: Run the contract test and compiler**

Run: `npm test && npm run typecheck`

Expected: the package contract passes and TypeScript exits `0`.

- [ ] **Step 5: Commit the package foundation**

```bash
git add AGENTS.md .npmrc .env.example package.json package-lock.json tsconfig.json tsconfig.build.json src/index.ts tests/package-contract.test.ts
git commit -m "chore: bootstrap social publisher"
```

## Task 2: Add deterministic time, identity, and schedule primitives

**Files:**

- Create: `src/config/schedule.ts`
- Create: `src/shared/determinism.ts`
- Create: `src/shared/time.ts`
- Create: `tests/schedule.test.ts`
- Create: `tests/determinism.test.ts`

- [ ] **Step 1: Write failing date and deterministic-choice tests**

```ts
// tests/schedule.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { campaignFamilyForDate } from "../src/config/schedule.js";
import { rollingLocalDates } from "../src/shared/time.js";

test("Monday selects the change challenge family", () => {
  assert.equal(campaignFamilyForDate("2026-08-31"), "change_challenge");
});

test("the rolling window contains today and six future São Paulo dates", () => {
  assert.deepEqual(rollingLocalDates(new Date("2026-08-26T16:00:00Z"), 7), [
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
  ]);
});
```

```ts
// tests/determinism.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignId,
  chooseSeeded,
  fingerprintCopy,
} from "../src/shared/determinism.js";

test("the same campaign inputs always produce the same identity and choice", () => {
  assert.equal(
    campaignId("2026-08-26", "troco_explains", 1, 0),
    "2026-08-26-troco-explains-v1-0",
  );
  assert.equal(
    chooseSeeded(["a", "b", "c"], "2026-08-26:1", 0),
    chooseSeeded(["a", "b", "c"], "2026-08-26:1", 0),
  );
  assert.equal(
    fingerprintCopy("  Troco  CERTO! "),
    fingerprintCopy("troco certo"),
  );
});
```

- [ ] **Step 2: Run the new tests and verify the missing-module failure**

Run: `node --import tsx --test --test-name-pattern="Monday|rolling window|campaign inputs" tests/*.test.ts`

Expected: FAIL because `schedule.ts`, `time.ts`, and `determinism.ts` do not exist.

- [ ] **Step 3: Implement exact schedule and deterministic primitives**

```ts
// src/config/schedule.ts
export const campaignFamilies = [
  "change_challenge",
  "cashier_shortcut",
  "troco_explains",
  "quick_calculation",
  "safe_checkout",
  "checkout_situation",
  "save_this_rule",
] as const;
export type CampaignFamily = (typeof campaignFamilies)[number];

const familyByUtcWeekday: Readonly<Record<number, CampaignFamily>> = {
  0: "save_this_rule",
  1: "change_challenge",
  2: "cashier_shortcut",
  3: "troco_explains",
  4: "quick_calculation",
  5: "safe_checkout",
  6: "checkout_situation",
};

export function campaignFamilyForDate(localDate: string): CampaignFamily {
  const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  return familyByUtcWeekday[weekday]!;
}
```

```ts
// src/shared/determinism.ts
import { createHash } from "node:crypto";

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
export function normalizeCopy(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function fingerprintCopy(value: string): string {
  return sha256(normalizeCopy(value));
}
export function chooseSeeded<T>(
  values: readonly T[],
  seed: string,
  offset: number,
): T {
  if (values.length === 0)
    throw new Error("Cannot choose from an empty collection");
  const index =
    Number.parseInt(sha256(`${seed}:${offset}`).slice(0, 8), 16) %
    values.length;
  return values[index]!;
}
export function campaignId(
  date: string,
  family: string,
  version: number,
  candidate: number,
): string {
  return `${date}-${family.replaceAll("_", "-")}-v${version}-${candidate}`;
}
```

Implement `src/shared/time.ts` with `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })`, strict `YYYY-MM-DD` parsing at UTC noon, calendar-day addition through `setUTCDate`, and `rollingLocalDates(now, count)` returning exactly `count` dates beginning at the current São Paulo date.

- [ ] **Step 4: Run the focused tests**

Run: `node --import tsx --test --test-name-pattern="Monday|rolling window|campaign inputs" tests/*.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the primitives**

```bash
git add src/config/schedule.ts src/shared/determinism.ts src/shared/time.ts tests/schedule.test.ts tests/determinism.test.ts
git commit -m "feat: add deterministic campaign schedule"
```

## Task 3: Model reviewed editorial sources and campaign plans

**Files:**

- Create: `src/editorial/schema.ts`
- Create: `src/editorial/catalog.ts`
- Create: `assets/facts/product-capabilities.json`
- Create: `assets/facts/cashier-tips.json`
- Create: `assets/facts/safety-rules.json`
- Create: `assets/facts/calendar-moments.json`
- Create: `tests/editorial-schema.test.ts`

- [ ] **Step 1: Write failing source validation tests**

```ts
// tests/editorial-schema.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { factSchema, campaignPlanSchema } from "../src/editorial/schema.js";

test("facts require a source and reject expired use", () => {
  assert.throws(() =>
    factSchema.parse({
      id: "unsafe",
      statement: "Invented",
      families: ["safe_checkout"],
      reviewedOn: "2026-08-26",
    }),
  );
});

test("campaign plans reject markup in public copy", () => {
  assert.throws(() =>
    campaignPlanSchema.parse({
      schemaVersion: 1,
      id: "x",
      localDate: "2026-08-26",
      targetAt: "2026-08-26T12:17:00-03:00",
      family: "troco_explains",
      recipeVersion: 1,
      candidate: 0,
      palette: "green",
      scenario: {
        purchaseMinor: 8265,
        receivedMinor: 10000,
        resultMinor: 1735,
        outcome: "change_due",
        breakdown: [],
      },
      copy: {
        headline: "<script>",
        answer: "R$ 17,35",
        explanation: "Certo",
        cta: "Baixe o Troco",
        channels: {},
      },
      sourceIds: ["core.change"],
      fingerprints: { headline: "a", caption: "b" },
    }),
  );
});
```

- [ ] **Step 2: Run the tests and verify schema imports fail**

Run: `node --import tsx --test --test-name-pattern="facts require|reject markup" tests/*.test.ts`

Expected: FAIL because `src/editorial/schema.ts` is absent.

- [ ] **Step 3: Implement schemas and checked catalogs**

Use Zod enums derived from `campaignFamilies`. Define:

```ts
const safePublicText = z
  .string()
  .min(1)
  .max(2_200)
  .refine((value) => !/[<>]/.test(value), "Markup is forbidden");
export const factSchema = z.object({
  id: z.string().regex(/^[a-z0-9._-]+$/),
  statement: safePublicText,
  source: z
    .string()
    .url()
    .or(z.string().regex(/^repo:\/\//)),
  reviewedOn: z.iso.date(),
  expiresOn: z.iso.date().optional(),
  families: z.array(z.enum(campaignFamilies)).min(1),
});
export const calendarMomentSchema = factSchema.extend({
  monthDay: z.string().regex(/^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/),
});
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
```

`campaignPlanSchema` must validate the fields used by the test plus channel copy for `instagram`, `facebook`, `tiktok`, and `youtube`; its final `.superRefine` rejects `<`, `>`, expired sources, an answer inconsistent with the scenario, and any channel caption over its configured limit. Export `Fact`, `Scenario`, `CampaignPlan`, `Channel`, and `CampaignFamily` types inferred from schemas.

Populate the four JSON catalogs only with reviewed statements and real source references. `product-capabilities.json` contains these six records:

```json
[
  {
    "id": "product.change-calculation",
    "statement": "O Troco calcula a diferença entre o valor da compra e o valor recebido.",
    "source": "repo://core/src/money.ts",
    "reviewedOn": "2026-08-26",
    "families": [
      "change_challenge",
      "troco_explains",
      "quick_calculation",
      "checkout_situation"
    ]
  },
  {
    "id": "product.denomination-breakdown",
    "statement": "O Troco mostra uma combinação de notas e moedas para montar o valor calculado.",
    "source": "repo://core/src/denominations.ts",
    "reviewedOn": "2026-08-26",
    "families": ["cashier_shortcut", "troco_explains", "save_this_rule"]
  },
  {
    "id": "product.supported-currencies",
    "statement": "O Troco oferece cálculo em real brasileiro, dólar americano e euro.",
    "source": "repo://core/src/currency-codes.ts",
    "reviewedOn": "2026-08-26",
    "families": ["troco_explains"]
  },
  {
    "id": "product.no-account",
    "statement": "O Troco pode ser usado sem criar uma conta.",
    "source": "repo://frontend/lib/i18n/messages/pt-br.ts",
    "reviewedOn": "2026-08-26",
    "families": ["troco_explains", "save_this_rule"]
  },
  {
    "id": "product.web-calculator",
    "statement": "A calculadora web do Troco está disponível em troco.net/calculate.",
    "source": "repo://frontend/app/calculate/page.tsx",
    "reviewedOn": "2026-08-26",
    "families": ["quick_calculation", "troco_explains"]
  },
  {
    "id": "product.android-download",
    "statement": "O aplicativo completo do Troco está disponível para Android na Google Play.",
    "source": "repo://frontend/lib/i18n/messages/pt-br.ts",
    "reviewedOn": "2026-08-26",
    "families": [
      "change_challenge",
      "cashier_shortcut",
      "troco_explains",
      "quick_calculation",
      "safe_checkout",
      "checkout_situation",
      "save_this_rule"
    ]
  }
]
```

```json
[
  {
    "id": "cashier.check-before-completing",
    "statement": "Confira os valores e as cédulas antes de concluir cada operação.",
    "source": "repo://frontend/lib/i18n/messages/pt-br.ts",
    "reviewedOn": "2026-08-26",
    "families": ["cashier_shortcut", "safe_checkout", "save_this_rule"]
  },
  {
    "id": "cashier.confirm-received",
    "statement": "Confirme o valor da compra e o valor recebido antes de calcular o troco.",
    "source": "repo://frontend/lib/i18n/messages/pt-br.ts",
    "reviewedOn": "2026-08-26",
    "families": ["cashier_shortcut", "checkout_situation", "save_this_rule"]
  },
  {
    "id": "cashier.count-breakdown",
    "statement": "Use a combinação de notas e moedas como conferência antes de entregar o troco.",
    "source": "repo://core/src/denominations.ts",
    "reviewedOn": "2026-08-26",
    "families": ["cashier_shortcut", "checkout_situation"]
  }
]
```

Populate `safety-rules.json` with these exact reviewed records:

```json
[
  {
    "id": "safety.confirm-pix-credit",
    "statement": "Print não confirma pagamento. Sem crédito confirmado na conta recebedora, não libere produto, serviço ou devolução.",
    "source": "repo://frontend/lib/blog/articles.ts#falso-comprovante-pix-5-sinais",
    "reviewedOn": "2026-08-26",
    "families": ["safe_checkout", "save_this_rule"]
  },
  {
    "id": "safety.refund-original-transaction",
    "statement": "Se o recebimento for legítimo, use a função de devolução vinculada à própria transação. Não envie para outra chave indicada por mensagem.",
    "source": "repo://frontend/lib/blog/articles.ts#golpe-do-estorno",
    "reviewedOn": "2026-08-26",
    "families": ["safe_checkout", "save_this_rule"]
  },
  {
    "id": "safety.verify-qr-recipient",
    "statement": "Leia o nome exibido pelo seu banco, confira o valor e observe se existe adesivo ou código sobreposto no ponto de pagamento.",
    "source": "repo://frontend/lib/blog/articles.ts#qr-code-trocado-teste-3-segundos",
    "reviewedOn": "2026-08-26",
    "families": ["safe_checkout", "checkout_situation"]
  },
  {
    "id": "safety.verify-terminal-amount",
    "statement": "Veja o valor completo no visor. Se a tela estiver danificada, escondida ou ilegível, peça outra máquina ou outro meio de pagamento.",
    "source": "repo://frontend/lib/blog/articles.ts#maquininha-adulterada-checklist",
    "reviewedOn": "2026-08-26",
    "families": ["safe_checkout", "save_this_rule"]
  }
]
```

Populate `calendar-moments.json` with `05-01` (Dia do Trabalho) and `12-25` (Natal), sourced to `https://www.planalto.gov.br/ccivil_03/leis/l662.htm`, reviewed on `2026-08-26`, and allowed only for retail-relevant `safe_checkout`, `checkout_situation`, and `save_this_rule` recipes. Calendar entries may influence the hook only when `localDate.slice(5)` equals `monthDay`; they never override factual scenario math or the weekly family.

`src/editorial/catalog.ts` must import all four JSON files, validate every entry at module load, export seven versioned recipes (one per family), four palettes (`green`, `purple`, `yellow`, `blue`), at least four useful hooks per family, and the three CTA kinds `download`, `calculator`, and `save_share`.

- [ ] **Step 4: Run editorial validation**

Run: `node --import tsx --test --test-name-pattern="facts require|reject markup" tests/*.test.ts && npm run typecheck`

Expected: both tests PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit the editorial contracts**

```bash
git add src/editorial/schema.ts src/editorial/catalog.ts assets/facts tests/editorial-schema.test.ts
git commit -m "feat: add reviewed editorial contracts"
```

## Task 4: Generate valid BRL scenarios and enforce anti-repetition

**Files:**

- Create: `src/editorial/scenario.ts`
- Create: `src/editorial/select.ts`
- Create: `tests/scenario.test.ts`
- Create: `tests/repetition.test.ts`

- [ ] **Step 1: Write failing scenario and history tests**

```ts
// tests/scenario.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createScenario } from "../src/editorial/scenario.js";

test("a BRL scenario comes from shared integer-money contracts", () => {
  assert.deepEqual(createScenario(8265, 10000), {
    purchaseMinor: 8265,
    receivedMinor: 10000,
    resultMinor: 1735,
    outcome: "change_due",
    breakdown: [
      { denominationMinor: 1000, quantity: 1 },
      { denominationMinor: 500, quantity: 1 },
      { denominationMinor: 200, quantity: 1 },
      { denominationMinor: 25, quantity: 1 },
      { denominationMinor: 10, quantity: 1 },
    ],
  });
});
```

```ts
// tests/repetition.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { rejectReason } from "../src/editorial/select.js";

test("recent scenario pairs and annual copy fingerprints are rejected", () => {
  const history = [
    {
      localDate: "2026-08-20",
      recipeId: "quick-v1",
      purchaseMinor: 8265,
      receivedMinor: 10000,
      headlineFingerprint: "same",
      captionFingerprint: "same-caption",
      palette: "green",
      cta: "download",
    },
  ] as const;
  assert.equal(
    rejectReason(
      {
        localDate: "2026-08-26",
        recipeId: "quick-v1",
        purchaseMinor: 8265,
        receivedMinor: 10000,
        headlineFingerprint: "new",
        captionFingerprint: "new-caption",
        palette: "purple",
        cta: "save_share",
      },
      history,
    ),
    "scenario_within_90_days",
  );
  assert.equal(
    rejectReason(
      {
        localDate: "2026-08-26",
        recipeId: "other",
        purchaseMinor: 1290,
        receivedMinor: 2000,
        headlineFingerprint: "same",
        captionFingerprint: "other",
        palette: "purple",
        cta: "save_share",
      },
      history,
    ),
    "headline_within_365_days",
  );
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --import tsx --test --test-name-pattern="BRL scenario|recent scenario" tests/*.test.ts`

Expected: FAIL because scenario and selection modules are missing.

- [ ] **Step 3: Implement computation and guard order**

```ts
// src/editorial/scenario.ts
import { buildDenominationBreakdown, calculateChange } from "@trocohq/core";
import { scenarioSchema, type Scenario } from "./schema.js";

export function createScenario(
  purchaseMinor: number,
  receivedMinor: number,
): Scenario {
  const result = calculateChange({ purchaseMinor, receivedMinor });
  const breakdown =
    result.outcome === "change_due"
      ? buildDenominationBreakdown(result.resultMinor, "BRL").map(
          ({ denomination, quantity }) => ({
            denominationMinor: denomination.valueMinor,
            quantity,
          }),
        )
      : [];
  return scenarioSchema.parse({
    purchaseMinor,
    receivedMinor,
    resultMinor: result.resultMinor,
    outcome: result.outcome,
    breakdown,
  });
}
```

In `select.ts`, define exported `HistoryEntry` and `CandidateIdentity` types and implement `rejectReason(candidate, history)` in this exact precedence: same recipe+scenario within 90 days, same purchase/payment pair within 90 days, same headline fingerprint within 365 days, same caption fingerprint within 365 days, then same palette or CTA as the immediately previous date. Use calendar-day distance, not millisecond division. Export `selectCandidate({ localDate, family, history, maximumCandidates: 256 })`; it advances candidate indices deterministically and throws `CandidateExhaustedError` only after all 256 candidates fail.

- [ ] **Step 4: Run the scenario and repetition suite**

Run: `node --import tsx --test --test-name-pattern="BRL scenario|recent scenario" tests/*.test.ts`

Expected: both tests PASS.

- [ ] **Step 5: Commit scenario selection**

```bash
git add src/editorial/scenario.ts src/editorial/select.ts tests/scenario.test.ts tests/repetition.test.ts
git commit -m "feat: generate non-repeating BRL campaigns"
```

## Task 5: Compose immutable campaign plans and the rolling window

**Files:**

- Create: `src/editorial/copy.ts`
- Create: `src/planning/create-campaign.ts`
- Create: `src/planning/rolling-window.ts`
- Create: `tests/create-campaign.test.ts`
- Create: `tests/rolling-window.test.ts`

- [ ] **Step 1: Write failing planning tests**

```ts
// tests/create-campaign.test.ts
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
  assert.match(plan.copy.channels.youtube.description, /utm_source=youtube/);
  assert.equal(Object.isFrozen(plan), true);
});
```

```ts
// tests/rolling-window.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { datesNeedingPlans } from "../src/planning/rolling-window.js";

test("planning creates today through six days ahead and never backfills yesterday", () => {
  assert.deepEqual(
    datesNeedingPlans(new Date("2026-08-26T18:00:00Z"), ["2026-08-27"]),
    [
      "2026-08-26",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ],
  );
});
```

- [ ] **Step 2: Run the planning tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="Wednesday campaign|never backfills" tests/*.test.ts`

Expected: FAIL because the planning modules do not exist.

- [ ] **Step 3: Implement copy adapters and campaign assembly**

`copy.ts` must format all money with `formatMinor(amount, "BRL", "pt-BR")`, preserve the same numeric answer across all channels, and create attributed download URLs with `utm_source=${channel}`, `utm_medium=social`, `utm_campaign=${campaignId}`, and `utm_content=${family}` through `URL.searchParams`. Apply these explicit limits before schema validation: Instagram 2,200 characters, Facebook 5,000, TikTok 2,200, YouTube title 100 and description 5,000.

```ts
// src/planning/rolling-window.ts
import { rollingLocalDates } from "../shared/time.js";
export function datesNeedingPlans(
  now: Date,
  existingDates: readonly string[],
): string[] {
  const existing = new Set(existingDates);
  return rollingLocalDates(now, 7).filter((date) => !existing.has(date));
}
```

`createCampaign` must select the family, recipe, scenario, palette, CTA, facts, and copy from explicit inputs; create `targetAt` with the correct São Paulo UTC offset for that date; run `campaignPlanSchema.parse`; deep-freeze the parsed value recursively; and return it without filesystem or network access. Include source IDs, copy fingerprints, recipe version, candidate index, and campaign ID in the result.

- [ ] **Step 4: Run planning tests and the typechecker**

Run: `node --import tsx --test --test-name-pattern="Wednesday campaign|never backfills" tests/*.test.ts && npm run typecheck`

Expected: both tests PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit immutable planning**

```bash
git add src/editorial/copy.ts src/planning tests/create-campaign.test.ts tests/rolling-window.test.ts
git commit -m "feat: compose immutable daily campaign plans"
```

## Task 6: Validate canonical Troco brand assets

**Files:**

- Create: `src/brand/manifest.ts`
- Create: `src/brand/load-brand.ts`
- Create: `tests/brand.test.ts`

- [ ] **Step 1: Write failing hash and missing-logo tests**

```ts
// tests/brand.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { loadBrand } from "../src/brand/load-brand.js";

const frontendPublic = new URL("../../frontend/public/", import.meta.url);

test("the current canonical Troco mark and fonts pass the reviewed manifest", async () => {
  const brand = await loadBrand(frontendPublic);
  assert.match(brand.markSvg, /viewBox="0 0 1080 1080"/);
  assert.ok(brand.stolzl.length > 1_000);
  assert.ok(brand.figtree.length > 1_000);
});

test("brand loading has no substitute mark", async () => {
  await assert.rejects(
    loadBrand(new URL("./missing/", import.meta.url)),
    /Missing canonical brand asset/,
  );
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --import tsx --test --test-name-pattern="canonical Troco|substitute mark" tests/*.test.ts`

Expected: FAIL because the brand loader is missing.

- [ ] **Step 3: Implement the reviewed manifest and strict loader**

```ts
// src/brand/manifest.ts
export const brandManifest = {
  "brand/troco-mark.svg":
    "d577f306ff034f6ee86fbc497a2d28158aa46b3cbb667d1068009a1f4631a422",
  "brand/troco-mark-inverse.svg":
    "4dddbd9361cd8bb0e77319705ece8152499a189d0d5f5d3be374767828b8bb43",
  "fonts/stolzl-regular.woff2":
    "c9d162816a718cbc2127556f95f6ffcad24bd2b0cb2ee1104f32ae39091ff881",
  "fonts/figtree-variable.ttf":
    "1851150b35645dab3a4ef935a349a2d1f5373221c0d5b6993d145210766c54de",
} as const;
```

`loadBrand(root)` must resolve only the four fixed relative paths, reject symlinks or paths outside `root`, require every exact hash above, require both fonts to be non-empty, reject SVG script/foreign-object/external-reference nodes, and return `{ markSvg, inverseMarkSvg, stolzl, figtree }`. Do not add a fallback or generated mark. The manifest corresponds to frontend commit `298381c8e6c3220cde11a8109ddb727a28223d7c`.

- [ ] **Step 4: Run the brand suite**

Run: `node --import tsx --test --test-name-pattern="canonical Troco|substitute mark" tests/*.test.ts`

Expected: both tests PASS against `../frontend/public`.

- [ ] **Step 5: Commit brand integrity checks**

```bash
git add src/brand tests/brand.test.ts
git commit -m "feat: enforce canonical Troco brand assets"
```

## Task 7: Render feed cards and carousels

**Files:**

- Create: `src/render/svg.ts`
- Create: `src/render/image.ts`
- Create: `tests/image-render.test.ts`
- Create: `assets/fixtures/worst-case-campaign.json`

- [ ] **Step 1: Write failing raster and deterministic-hash tests**

```ts
// tests/image-render.test.ts
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createCampaign } from "../src/planning/create-campaign.js";
import { loadBrand } from "../src/brand/load-brand.js";
import { renderFeed } from "../src/render/image.js";

test("feed output is deterministic 1080 by 1350 sRGB JPEG", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-feed-"));
  const plan = createCampaign({
    localDate: "2026-08-26",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(
    new URL("../../frontend/public/", import.meta.url),
  );
  const first = await renderFeed({ plan, brand, output });
  const second = await renderFeed({ plan, brand, output });
  const metadata = await sharp(first.files[0]).metadata();
  assert.deepEqual(
    [metadata.width, metadata.height, metadata.format, metadata.space],
    [1080, 1350, "jpeg", "srgb"],
  );
  assert.equal(first.files.length, 1);
  assert.equal(first.hashes[0], second.hashes[0]);
  assert.ok((await readFile(first.files[0])).length < 8_000_000);
});

test("a carousel campaign renders two to five equal-size slides", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-carousel-"));
  const plan = createCampaign({
    localDate: "2026-08-25",
    publishTime: "12:17",
    history: [],
  });
  const brand = await loadBrand(
    new URL("../../frontend/public/", import.meta.url),
  );
  const rendered = await renderFeed({ plan, brand, output });
  assert.ok(rendered.files.length >= 2 && rendered.files.length <= 5);
  for (const file of rendered.files) {
    const metadata = await sharp(file).metadata();
    assert.deepEqual([metadata.width, metadata.height], [1080, 1350]);
  }
});
```

- [ ] **Step 2: Run the render test and verify failure**

Run: `node --import tsx --test --test-name-pattern="feed output|carousel campaign" tests/*.test.ts`

Expected: FAIL because `render/image.ts` does not exist.

- [ ] **Step 3: Implement safe Product Editorial SVG and JPEG rendering**

`svg.ts` must expose `escapeXml`, `measureText`, `fitText`, and `createFeedSlideSvg`. Embed the validated Stolzl and Figtree bytes as data URLs, insert only the validated canonical mark, escape every content string, use the approved token colors from `@trocohq/design-tokens`, and calculate text boxes inside a 96 px side safe area. Reject a layout if the fitted display size drops below 64 px or body size below 34 px.

`image.ts` must render one scene for feed-image families and two to five scene SVGs for carousel families through:

```ts
await sharp(Buffer.from(svg))
  .flatten({ background: designTokens.colors.paper })
  .toColourspace("srgb")
  .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
  .toFile(filePath);
```

Return `{ files, hashes, width: 1080, height: 1350, format: "jpeg" }`; use stable filenames `slide-01.jpg` through `slide-05.jpg`; verify each output through Sharp metadata; and reject any file over 8 MB. Create a worst-case fixture containing the longest allowed headline, explanation, CTA, and currency strings, then assert every computed bounding box remains inside the safe area.

- [ ] **Step 4: Run image tests twice**

Run: `node --import tsx --test --test-name-pattern="feed output|carousel campaign" tests/*.test.ts && node --import tsx --test --test-name-pattern="feed output|carousel campaign" tests/*.test.ts`

Expected: both runs PASS with identical output hashes on the same machine/runtime.

- [ ] **Step 5: Commit image rendering**

```bash
git add src/render/svg.ts src/render/image.ts tests/image-render.test.ts assets/fixtures/worst-case-campaign.json
git commit -m "feat: render deterministic social images"
```

## Task 8: Render valid vertical Shorts with original audio

**Files:**

- Create: `src/render/audio.ts`
- Create: `src/render/binaries.ts`
- Create: `src/render/probe.ts`
- Create: `src/render/video.ts`
- Create: `src/types/ffprobe-static.d.ts`
- Create: `tests/video-render.test.ts`
- Create: `tests/support/render-fixture.ts`

- [ ] **Step 1: Write the failing MP4 technical-contract test**

```ts
// tests/video-render.test.ts
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { renderFixtureCampaign } from "./support/render-fixture.js";
import { probeVideo } from "../src/render/probe.js";

test("short output is a muted-safe H.264 AAC 1080 by 1920 MP4", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-short-"));
  const { video } = await renderFixtureCampaign(output);
  const probe = await probeVideo(video);
  assert.deepEqual(
    {
      width: probe.width,
      height: probe.height,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      frameRate: probe.frameRate,
    },
    {
      width: 1080,
      height: 1920,
      videoCodec: "h264",
      audioCodec: "aac",
      frameRate: 30,
    },
  );
  assert.ok(probe.duration >= 8 && probe.duration <= 20);
});
```

- [ ] **Step 2: Run the video test and verify failure**

Run: `node --import tsx --test --test-name-pattern="short output" tests/*.test.ts`

Expected: FAIL because the video renderer, probe, and fixture helper are missing.

- [ ] **Step 3: Implement deterministic scene video, tone bed, and probing**

Create `tests/support/render-fixture.ts` to create the 2026-08-26 campaign, load the canonical brand, render feed scenes, and call `renderVideo`.

`audio.ts` must write a mono 48 kHz signed 16-bit PCM WAV whose samples combine quiet sine tones at 220 Hz and 330 Hz with 20 ms fade-in/out around transition cues. Derive cue timing from scene durations and cap peak amplitude at 0.12; the generated bed is original and deterministic.

`src/types/ffprobe-static.d.ts` declares the package default export as `{ path: string; version: string }`. `binaries.ts` imports the exact locked `ffmpeg-static` and `ffprobe-static` paths, accepts explicit CLI overrides for local diagnosis, verifies executable files, and records `ffmpeg -version` plus `ffprobe -version` in the media manifest.

`video.ts` must call FFmpeg through `spawn` or `execFile` with an argument array, never a shell string. Use vertical 1080×1920 scene PNGs derived from the same SVG scene model, 30 fps, `libx264`, `yuv420p`, AAC at 128 kbps, `-movflags +faststart`, and fixed encoder metadata. The scene timeline is `hook`, `scenario`, `answer`, `end_card`, with total duration between 8 and 20 seconds. All meaning must remain in on-screen text.

`probe.ts` must execute:

```ts
const args = [
  "-v",
  "error",
  "-show_streams",
  "-show_format",
  "-of",
  "json",
  filePath,
];
```

Normalize codec names, dimensions, exact rational frame rate, duration, and byte size; reject anything other than MP4/H.264/AAC/1080×1920/30 fps/8–20 seconds and a 50 MB maximum.

- [ ] **Step 4: Run the MP4 contract test**

Run: `node --import tsx --test --test-name-pattern="short output" tests/*.test.ts`

Expected: PASS and `ffprobe` reports H.264 video, AAC audio, 1080×1920, 30 fps, and 8–20 seconds.

- [ ] **Step 5: Commit video rendering**

```bash
git add src/render/audio.ts src/render/binaries.ts src/render/probe.ts src/render/video.ts src/types/ffprobe-static.d.ts tests/video-render.test.ts tests/support/render-fixture.ts
git commit -m "feat: render deterministic vertical shorts"
```

## Task 9: Produce a read-only dry-run review bundle

**Files:**

- Create: `src/dry-run/create-review.ts`
- Create: `src/cli/arguments.ts`
- Create: `src/cli/dry-run.ts`
- Create: `src/validation/run.ts`
- Create: `tests/dry-run.test.ts`

- [ ] **Step 1: Write a failing no-state-mutation dry-run test**

```ts
// tests/dry-run.test.ts
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createReview } from "../src/dry-run/create-review.js";

test("dry run writes a complete review bundle and no durable state", async () => {
  const output = await mkdtemp(join(tmpdir(), "troco-review-"));
  const review = await createReview({
    localDate: "2026-08-26",
    output,
    brandRoot: new URL("../../frontend/public/", import.meta.url),
  });
  assert.match(
    await readFile(join(output, "index.html"), "utf8"),
    /Troco Social Review/,
  );
  assert.equal(
    JSON.parse(await readFile(join(output, "campaign.json"), "utf8")).id,
    review.plan.id,
  );
  await assert.rejects(stat(join(output, "state")), /ENOENT/);
  assert.ok(review.media.video.hash.length === 64);
});
```

- [ ] **Step 2: Run the dry-run test and verify failure**

Run: `node --import tsx --test --test-name-pattern="complete review bundle" tests/*.test.ts`

Expected: FAIL because the dry-run module is missing.

- [ ] **Step 3: Implement the bundle and strict CLI arguments**

`createReview` must write:

```text
.tmp/review/index.html
.tmp/review/campaign.json
.tmp/review/captions.json
.tmp/review/manifest.json
.tmp/review/feed/slide-01.jpg
.tmp/review/feed/slide-02.jpg (carousel campaigns only, continuing through slide-05.jpg)
.tmp/review/video/short.mp4
```

Use atomic writes (`temporary file` then `rename`) for JSON and HTML. The HTML may reference only relative local assets, must escape all text, and must show the four final channel copies, every image, the video, media dimensions/codecs/duration, and SHA-256 values. It must not import remote scripts or fonts.

`arguments.ts` must accept exactly `--date 2026-08-26`, `--output .tmp/review`, `--brand-root ../frontend/public`, `--ffmpeg /opt/homebrew/bin/ffmpeg`, and `--ffprobe /opt/homebrew/bin/ffprobe` shapes, with the last two optional because the locked static binaries are the default. Reject unknown arguments and constrain the output to a caller-provided working root. `dry-run.ts` invokes `createReview`, prints one sanitized JSON summary line, and performs no state or network writes.

`validation/run.ts` must run schema/catalog checks, generate the worst-case review bundle in a temporary directory, probe all media, and exit nonzero on any violation.

- [ ] **Step 4: Run dry run and full core validation**

Run: `npm test && npm run typecheck && npm run dry-run -- --date 2026-08-26 --brand-root ../frontend/public --output .tmp/review --ffmpeg /opt/homebrew/bin/ffmpeg --ffprobe /opt/homebrew/bin/ffprobe && npm run validate`

Expected: all tests PASS; `.tmp/review/index.html`, feed JPEGs, and `video/short.mp4` exist; validation exits `0`; no tracked state file changes.

- [ ] **Step 5: Commit dry-run validation**

```bash
git add src/dry-run src/cli src/validation tests/dry-run.test.ts
git commit -m "feat: add complete social dry run"
```

## Task 10: Document and verify the core release boundary

**Files:**

- Create: `README.md`
- Modify: `.gitignore`
- Modify: `src/index.ts`

- [ ] **Step 1: Add a documentation contract test**

Add to `tests/package-contract.test.ts`:

```ts
test("the README documents the safe local workflow", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );
  for (const phrase of [
    "npm run dry-run",
    "No provider writes",
    "Canonical brand assets",
    "FFmpeg",
    "NODE_AUTH_TOKEN",
  ]) {
    assert.match(readme, new RegExp(phrase));
  }
});
```

- [ ] **Step 2: Run the documentation contract and verify failure**

Run: `node --import tsx --test --test-name-pattern="safe local workflow" tests/*.test.ts`

Expected: FAIL because `README.md` is absent.

- [ ] **Step 3: Write operator-focused core documentation**

Document the architecture, required Node/FFmpeg versions, GitHub Packages read token, exact local install/check/dry-run commands, generated review contents, canonical asset rule, deterministic limitations, and the fact that this plan contains no provider writes. Export only public schemas and pure entry points from `src/index.ts`. Add `.tmp/`, `dist/`, `node_modules/`, `.env`, and generated media patterns to `.gitignore`, while keeping `docs/`, `assets/facts/`, and `assets/fixtures/` tracked.

- [ ] **Step 4: Run complete verification from a clean generated-output state**

Run: `npm run format && npm run check && npm run validate && git status --short`

Expected: formatting, typecheck, tests, and render validation all exit `0`; Git status shows only the intended README, ignore, export, and formatting changes; no JPEG, MP4, token, or `.env` file is tracked.

- [ ] **Step 5: Commit the core release documentation**

```bash
git add README.md .gitignore src tests assets package.json package-lock.json tsconfig.json tsconfig.build.json AGENTS.md .npmrc .env.example
git commit -m "docs: document social publisher core"
```

## Core-plan completion gate

Before starting provider delivery, run:

```bash
npm run check
npm run validate
git status --short
```

Expected: both commands exit `0`, the working tree is clean, the dry-run bundle contains valid feed images and a valid Short, and no network call or durable state mutation occurs during dry run.
