# README Operations Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the root README with a verified English guide to production status, workflow timing, publication volume, editorial output, capacity, and remaining work.

**Architecture:** Keep `README.md` as the concise operational entry point and retain `docs/operations.md` as the detailed runbook for activation, recovery, credentials, and incidents. Add one documentation contract test so schedule, volume, status, and remaining-work headings cannot disappear silently. Work directly on `main` as requested and create one small documentation commit without pushing.

**Tech Stack:** Markdown, Node.js 24, Node test runner, TypeScript, Prettier, Git.

---

## File map

- Modify `README.md`: add the production overview, stable schedule and volume,
  editorial rotation, provider output, capacity, current snapshot, and remaining
  work.
- Modify `tests/package-contract.test.ts`: assert the README continues to expose
  the operational facts requested by maintainers.
- Reference `docs/operations.md`: keep sensitive and procedural details in the
  existing runbook; do not duplicate them.

### Task 1: Lock the operational README contract

**Files:**

- Modify: `tests/package-contract.test.ts`
- Test: `tests/package-contract.test.ts`

- [ ] **Step 1: Add the failing documentation contract test**

Append this test after the existing README test:

```ts
test("the README explains production schedule, volume, status, and remaining work", async () => {
  const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
  );

  for (const phrase of [
    "Current production status",
    "Schedule and publishing volume",
    "17 */3 * * *",
    "12:17",
    "21 provider posts",
    "Weekly editorial rotation",
    "Remaining work",
  ]) {
    assert.ok(readme.includes(phrase), `README is missing ${phrase}`);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```sh
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH \
  node --import tsx --test tests/package-contract.test.ts
```

Expected: the new test fails because `README.md` does not yet contain
`Current production status` and the other new operational sections.

### Task 2: Add the production operations guide

**Files:**

- Modify: `README.md`
- Test: `tests/package-contract.test.ts`

- [ ] **Step 1: Replace the existing `Automated delivery` section with the expanded guide**

Keep the existing introduction, requirements, local workflow, brand, and
architecture sections unchanged. Replace the content from `## Automated
delivery` to the end of the file with these sections and facts:

```markdown
## Current production status

Automated publication is active. Instagram `@trocohq`, Facebook `trocohq`, and
YouTube `@trocohq` use all three channel slots in Troco's free Buffer account.
TikTok `@trocofacil.app` remains disabled while authentication and a free
fourth-channel path are unresolved.

Activation snapshot from 2026-08-27:

- `AUTO_PUBLISH=true`;
- `YOUTUBE_PUBLICATION_VERIFIED=true` after a controlled public Short was
  reconciled against the exact Troco channel;
- six posts scheduled per active channel for 2026-08-28 through 2026-09-02;
- 18 scheduled provider posts in total;
- TikTok stored as terminal `skipped_disabled`, with no provider request.

Queue counts above are a dated activation snapshot, not live metrics. Campaign
state under `state/campaigns/` is the durable audit record.

## Schedule and publishing volume

GitHub Actions runs the serialized publisher at minute 17 of every third UTC
hour (`17 */3 * * *`): nominally 00:17, 03:17, 06:17, 09:17, 12:17, 15:17,
18:17, and 21:17 UTC. GitHub may delay a scheduled start. This cadence is a
health, reconciliation, and queue-refill loop; it does not create eight new
campaigns per day.

Every campaign is due at 12:17 in `America/Sao_Paulo`. The planner maintains D
through D+6 and never backfills an earlier local date.

| Measure                 | Per active channel | Three active channels |
| ----------------------- | -----------------: | --------------------: |
| Campaigns per day       |                  1 |     1 shared campaign |
| Provider posts per day  |                  1 |                     3 |
| Provider posts per week |                  7 |     21 provider posts |
| Maximum planned queue   |                  7 |                    21 |

## Weekly editorial rotation

| Day       | Campaign family    | Instagram and Facebook output |
| --------- | ------------------ | ----------------------------- |
| Monday    | Change challenge   | Reel                          |
| Tuesday   | Cashier shortcut   | Four-slide carousel           |
| Wednesday | Troco explains     | Single feed image             |
| Thursday  | Quick calculation  | Reel                          |
| Friday    | Safe checkout      | Four-slide carousel           |
| Saturday  | Checkout situation | Reel                          |
| Sunday    | Save this rule     | Single feed image             |

Every active day also produces one public YouTube Short. Copy is written in
Brazilian Portuguese around change calculations, cashier routines, checkout
safety, practical scenarios, and product education. Each channel receives its
own Google Play URL with `utm_source`, `utm_medium`, `utm_campaign`, and
`utm_content`.

The renderer rotates the official green, blue, yellow, and purple palettes. A
palette deterministically selects one original generated 100 BPM arrangement:
warm, airy, bright, or pulse. The same campaign always produces the same visual
and audio choice.

## What the workflow does

For scheduled or controlled execution, the workflow:

1. loads the canonical frontend brand assets and shared design tokens at pinned
   commits;
2. plans the D through D+6 campaign window and renders any missing media;
3. validates copy, amounts, typography, brand hashes, images, video, and audio;
4. commits sanitized campaign state before and after each external action;
5. publishes verified rolling media to GitHub Pages and verifies the served
   bytes;
6. checks the Buffer organization, exact channels, queue capacity, and public
   media before scheduling;
7. reconciles channel, due time, normalized copy, and ordered media to avoid
   duplicates;
8. creates one isolated provider action at a time and records its provider ID;
9. reconciles active intents, verifies publication health, and opens or closes
   one sanitized GitHub incident when required.

Overdue work is sent immediately instead of being scheduled in the past.
Retryable work expires when the São Paulo day changes, so missed dates are not
backfilled.

## Formats, capacity, and retention

- Feed and carousel media: deterministic 1080×1350 sRGB JPEG.
- Reels and Shorts: 1080×1920 H.264/AAC MP4 with on-screen meaning preserved
  when muted.
- Buffer Free capacity used by this design: three connected channels and ten
  queued posts per channel.
- The seven-day rolling window uses at most seven queue slots per active
  channel.
- GitHub Pages retains media only from D−2 through D+7; tracked sanitized state
  remains available for audits and repetition checks.

Scheduled writes require `AUTO_PUBLISH=true`. YouTube additionally requires
`YOUTUBE_PUBLICATION_VERIFIED=true`. Channel flags keep Instagram, Facebook,
and YouTube enabled and TikTok disabled. See the
[operations runbook](docs/operations.md) for activation, emergency stops,
retries, incidents, and token rotation.

## Remaining work

- Resolve TikTok authentication. Because all three Buffer Free channel slots
  are occupied, an all-free TikTok path also needs a separate free integration
  or a deliberate channel replacement before controlled verification.
- Run and review the initial seven days of real publication across Instagram,
  Facebook, and YouTube, including provider delivery after each due time.
- Review Google Play acquisition manually using the channel-specific UTM links.
  Automatic Play Console ingestion and attribution export are not implemented.
- Periodically review editorial facts, copy quality, palette and music rotation,
  Buffer limits, and provider contracts as external platforms change.
```

- [ ] **Step 2: Run the focused test and confirm it passes**

Run:

```sh
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH \
  node --import tsx --test tests/package-contract.test.ts
```

Expected: all package contract tests pass, including the new operational README
contract.

### Task 3: Verify and commit the documentation update

**Files:**

- Verify: `README.md`
- Verify: `tests/package-contract.test.ts`

- [ ] **Step 1: Run the full publisher verification**

Run:

```sh
PATH=/Users/guilherme/.nvm/versions/node/v24.14.1/bin:$PATH npm run check
```

Expected: Prettier check passes, TypeScript emits no errors, and all tests pass
with zero failures.

- [ ] **Step 2: Scan for contradictions and placeholders**

Run:

```sh
rg -n "TBD|TODO|AUTO_PUBLISH|YOUTUBE_PUBLICATION_VERIFIED|TIKTOK_ENABLED|17 \\*/3|12:17|21 provider posts" README.md
git diff --check
```

Expected: no placeholders, the two active gates and disabled TikTok state are
present, cadence and volume appear consistently, and `git diff --check` emits
no output.

- [ ] **Step 3: Review the final diff and working tree**

Run:

```sh
git diff -- README.md tests/package-contract.test.ts
git status --short --branch
```

Expected: only the README and its contract test are modified; `main` is ahead
of `origin/main` only by the approved design and plan commits.

- [ ] **Step 4: Create the implementation micro-commit without pushing**

Run:

```sh
git add README.md tests/package-contract.test.ts
git commit -m "docs: explain social publisher operations"
```

Expected: one local commit containing only the README guide and its contract
test. Do not run `git push`.
