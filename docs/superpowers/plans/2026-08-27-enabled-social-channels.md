# Enabled Social Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish daily to Instagram, Facebook, and YouTube while TikTok is explicitly disabled and permanently skipped for campaigns created during the disabled period.

**Architecture:** Add strict per-channel enablement to the environment boundary, use it when campaign state is initialized, and pass only enabled providers into preflight and publication. Disabled channels use the existing terminal `skipped_disabled` state, so action selection and reconciliation remain unchanged and cannot backfill them.

**Tech Stack:** TypeScript 6, Node.js 24 test runner, Zod 4, Buffer GraphQL, YouTube Data API, GitHub Actions.

**Execution note:** Work directly on `main` with micro-commits because the user explicitly selected the shared main checkout.

---

## File map

- Create `src/config/channels.ts`: canonical channel names, Buffer subset, and enablement types/helpers.
- Modify `src/config/environment.ts`: strict flags, conditional provider requirements, and partial provider IDs.
- Create `tests/support/environment-fixture.ts`: one complete provider-environment fixture for gate tests.
- Create `src/state/channel-availability.ts`: legal initialization of disabled provider records.
- Modify `src/cli/plan.ts`: mark disabled records once and advance only active records.
- Modify `src/networks/buffer/preflight.ts`: verify a partial enabled Buffer set and ignore unrelated connections.
- Modify `src/cli/preflight.ts`: conditionally call Buffer and YouTube and report the real provider count.
- Modify `src/cli/publish.ts`: make the YouTube gate conditional and reject crafted actions for disabled channels.
- Modify `.github/workflows/publish.yml`, `.env.example`, `README.md`, and `docs/operations.md`: declare and operate the production channel set.
- Modify `src/validation/run.ts`: validate the new hosted workflow contract.
- Modify focused tests under `tests/`: prove strict configuration, legal state transitions, partial preflight, publication gates, and workflow wiring.

### Task 1: Parse an explicit enabled-channel set

**Files:**

- Create: `src/config/channels.ts`
- Create: `tests/support/environment-fixture.ts`
- Modify: `src/config/environment.ts`
- Test: `tests/environment.test.ts`

- [ ] **Step 1: Write failing environment tests**

Add cases that remove the TikTok ID while disabling TikTok, reject the same
missing ID when TikTok is enabled, reject zero enabled channels, and allow
provider parsing without YouTube credentials when YouTube is disabled. Also
prove the backward-compatible defaults and strict flag parsing:

```ts
test("disabled channels do not require provider configuration", () => {
  const environment = parseEnvironment({
    ...valid,
    TIKTOK_ENABLED: "false",
    BUFFER_TIKTOK_CHANNEL_ID: "",
  });
  assert.deepEqual(environment.enabled, {
    instagram: true,
    facebook: true,
    tiktok: false,
    youtube: true,
  });
  assert.equal(environment.buffer.channelIds.tiktok, undefined);
});

test("all publication channels default enabled and flags are strict", () => {
  assert.deepEqual(parseEnvironment(valid).enabled, {
    instagram: true,
    facebook: true,
    tiktok: true,
    youtube: true,
  });
  for (const field of [
    "INSTAGRAM_ENABLED",
    "FACEBOOK_ENABLED",
    "TIKTOK_ENABLED",
    "YOUTUBE_ENABLED",
  ]) {
    assert.throws(
      () => parseEnvironment({ ...valid, [field]: "yes" }),
      new RegExp(field),
    );
  }
});

test("enabled channels require their own identifiers", () => {
  const { BUFFER_TIKTOK_CHANNEL_ID: _tiktok, ...withoutTikTokId } = valid;
  assert.throws(
    () => parseEnvironment(withoutTikTokId),
    /BUFFER_TIKTOK_CHANNEL_ID/,
  );
});

test("at least one publication channel must remain enabled", () => {
  assert.throws(
    () =>
      parseEnvironment({
        ...valid,
        INSTAGRAM_ENABLED: "false",
        FACEBOOK_ENABLED: "false",
        TIKTOK_ENABLED: "false",
        YOUTUBE_ENABLED: "false",
      }),
    /enabled social channel/,
  );
});

test("disabled YouTube does not require OAuth during provider execution", () => {
  const { YOUTUBE_CHANNEL_ID: _youtube, ...withoutYouTube } = valid;
  assert.doesNotThrow(() =>
    parseEnvironment(
      {
        ...withoutYouTube,
        BUFFER_API_KEY: "buffer-value",
        YOUTUBE_ENABLED: "false",
      },
      "provider",
    ),
  );
});

test("YouTube-only execution does not require Buffer configuration", () => {
  const {
    BUFFER_ORGANIZATION_ID: _organization,
    BUFFER_INSTAGRAM_CHANNEL_ID: _instagram,
    BUFFER_FACEBOOK_CHANNEL_ID: _facebook,
    BUFFER_TIKTOK_CHANNEL_ID: _tiktok,
    ...withoutBuffer
  } = valid;
  assert.doesNotThrow(() =>
    parseEnvironment(
      {
        ...withoutBuffer,
        INSTAGRAM_ENABLED: "false",
        FACEBOOK_ENABLED: "false",
        TIKTOK_ENABLED: "false",
        YOUTUBE_CLIENT_ID: "client",
        YOUTUBE_CLIENT_SECRET: "client-secret",
        YOUTUBE_REFRESH_TOKEN: "refresh",
      },
      "provider",
    ),
  );
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --import tsx --test tests/environment.test.ts
```

Expected: FAIL because enablement flags do not exist and provider IDs are still
unconditionally required.

- [ ] **Step 3: Add canonical channel types and helpers**

Create `src/config/channels.ts`:

```ts
export const publicationChannels = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
] as const;

export const bufferChannels = ["instagram", "facebook", "tiktok"] as const;

export type PublicationChannelName = (typeof publicationChannels)[number];
export type BufferChannelName = (typeof bufferChannels)[number];
export type ChannelEnablement = Readonly<
  Record<PublicationChannelName, boolean>
>;

export function enabledPublicationChannels(
  enabled: ChannelEnablement,
): readonly PublicationChannelName[] {
  return publicationChannels.filter((channel) => enabled[channel]);
}

export function enabledBufferChannels(
  enabled: ChannelEnablement,
): readonly BufferChannelName[] {
  return bufferChannels.filter((channel) => enabled[channel]);
}
```

- [ ] **Step 4: Make environment requirements conditional**

In `src/config/environment.ts`, add strict flags with `true` defaults. Normalize
empty optional provider values to `undefined` before applying `nonEmpty`, because
unset GitHub variables arrive as empty strings. Make provider IDs and the Buffer
organization ID optional in the Zod shape, and expose this shape:

```ts
enabled: ChannelEnablement;
buffer: Readonly<{
  organizationId?: string;
  channelIds: Readonly<Partial<Record<BufferChannelName, string>>>;
  apiKey?: string;
}>;
youtube: Readonly<{
  channelId?: string;
  publicationVerified: boolean;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}>;
```

After schema parsing, build the enabled set and validate it before returning:

```ts
const enabled = Object.freeze({
  instagram: parsed.INSTAGRAM_ENABLED,
  facebook: parsed.FACEBOOK_ENABLED,
  tiktok: parsed.TIKTOK_ENABLED,
  youtube: parsed.YOUTUBE_ENABLED,
});
if (enabledPublicationChannels(enabled).length === 0) {
  throw new Error("Invalid environment configuration: enabled social channel");
}

const requiredIds = [
  ["instagram", "BUFFER_INSTAGRAM_CHANNEL_ID"],
  ["facebook", "BUFFER_FACEBOOK_CHANNEL_ID"],
  ["tiktok", "BUFFER_TIKTOK_CHANNEL_ID"],
  ["youtube", "YOUTUBE_CHANNEL_ID"],
] as const;
const missingIds = requiredIds
  .filter(([channel, field]) => enabled[channel] && !parsed[field])
  .map(([, field]) => field);
if (missingIds.length > 0) {
  throw new Error(
    `Missing environment configuration: ${missingIds.join(", ")}`,
  );
}
```

For provider purpose, require Buffer organization/key only when at least one
Buffer channel is enabled, and YouTube OAuth only when YouTube is enabled.
Build `channelIds` from enabled channels only. Even if a disabled channel has a
stale non-empty ID in the source environment, omit it from the returned map so
preflight cannot treat it as active.

- [ ] **Step 5: Create a complete provider-environment fixture**

Create `tests/support/environment-fixture.ts` so gate tests never depend on
implicit process variables:

```ts
import {
  parseEnvironment,
  type PublisherEnvironment,
} from "../../src/config/environment.js";
import type { ChannelEnablement } from "../../src/config/channels.js";

export function publisherEnvironmentFixture(
  overrides: Partial<ChannelEnablement> = {},
): PublisherEnvironment {
  const enabled: ChannelEnablement = {
    instagram: overrides.instagram ?? true,
    facebook: overrides.facebook ?? true,
    tiktok: overrides.tiktok ?? true,
    youtube: overrides.youtube ?? true,
  };

  return parseEnvironment(
    {
      AUTO_PUBLISH: "false",
      YOUTUBE_PUBLICATION_VERIFIED: "false",
      INSTAGRAM_ENABLED: String(enabled.instagram),
      FACEBOOK_ENABLED: String(enabled.facebook),
      TIKTOK_ENABLED: String(enabled.tiktok),
      YOUTUBE_ENABLED: String(enabled.youtube),
      PUBLICATION_TIME_ZONE: "America/Sao_Paulo",
      PUBLISH_TIME: "12:17",
      PAGES_ORIGIN: "https://trocohq.github.io/social-publisher",
      BUFFER_ORGANIZATION_ID: "org_1",
      BUFFER_INSTAGRAM_CHANNEL_ID: "ig_1",
      BUFFER_FACEBOOK_CHANNEL_ID: "fb_1",
      ...(enabled.tiktok ? { BUFFER_TIKTOK_CHANNEL_ID: "tt_1" } : {}),
      ...(enabled.youtube ? { YOUTUBE_CHANNEL_ID: "UC123" } : {}),
      PLAY_STORE_URL:
        "https://play.google.com/store/apps/details?id=trocofacil.app",
      BRAND_SOURCE_SHA: "298381c8e6c3220cde11a8109ddb727a28223d7c",
      DESIGN_TOKENS_SOURCE_SHA: "1fefd27a0de14a8d4115fe79c6076a3b17d3cf6d",
      BUFFER_API_KEY: "buffer-value",
      ...(enabled.youtube
        ? {
            YOUTUBE_CLIENT_ID: "client",
            YOUTUBE_CLIENT_SECRET: "client-secret",
            YOUTUBE_REFRESH_TOKEN: "refresh",
          }
        : {}),
    },
    "provider",
  );
}
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
node --import tsx --test tests/environment.test.ts
npm run typecheck
```

Expected: all environment tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit the configuration boundary**

```bash
git add src/config/channels.ts src/config/environment.ts tests/environment.test.ts tests/support/environment-fixture.ts
git commit -m "feat: configure enabled social channels"
```

### Task 2: Persist disabled channels as terminal state

**Files:**

- Create: `src/state/channel-availability.ts`
- Modify: `src/cli/plan.ts`
- Test: `tests/state.test.ts`

- [ ] **Step 1: Write the failing legal-transition test**

Add to `tests/state.test.ts`:

```ts
test("new campaigns permanently skip disabled channels", () => {
  const now = new Date("2026-08-27T12:00:00Z");
  const state = campaignStateFixture({
    instagram: "planned",
    facebook: "planned",
    tiktok: "planned",
    youtube: "planned",
  });
  const configured = markDisabledChannels(
    state,
    {
      instagram: true,
      facebook: true,
      tiktok: false,
      youtube: true,
    },
    now,
  );

  assert.equal(configured.channels.instagram.stage, "planned");
  assert.equal(configured.channels.tiktok.stage, "skipped_disabled");
  assert.deepEqual(configured.channels.tiktok.transitions, [
    {
      from: "planned",
      to: "skipped_disabled",
      at: now.toISOString(),
    },
  ]);
  assert.throws(
    () => transitionProvider(configured, "tiktok", "rendered", now),
    /Illegal transition/,
  );
});
```

- [ ] **Step 2: Run the state test and verify RED**

Run:

```bash
node --import tsx --test tests/state.test.ts
```

Expected: FAIL because `markDisabledChannels` does not exist.

- [ ] **Step 3: Implement the state initializer**

Create `src/state/channel-availability.ts`:

```ts
import {
  publicationChannels,
  type ChannelEnablement,
} from "../config/channels.js";
import type { CampaignState } from "./schema.js";
import { transitionProvider } from "./transitions.js";

export function markDisabledChannels(
  state: CampaignState,
  enabled: ChannelEnablement,
  now: Date,
): CampaignState {
  let next = state;
  for (const channel of publicationChannels) {
    if (enabled[channel]) continue;
    if (next.channels[channel].stage !== "planned") {
      throw new Error(`Disabled ${channel} channel must begin at planned`);
    }
    next = transitionProvider(next, channel, "skipped_disabled", now);
  }
  return next;
}
```

- [ ] **Step 4: Apply enablement only when campaign state is created**

In `src/cli/plan.ts`, replace the local channel constant with
`publicationChannels`, call `markDisabledChannels` immediately after parsing a
new state, and make `transitionAll` skip `skipped_disabled` records:

```ts
function transitionAll(
  state: CampaignState,
  to: "rendered" | "deploying",
  now: Date,
): CampaignState {
  let next = transitionMedia(state, to, now);
  for (const channel of publicationChannels) {
    if (next.channels[channel].stage === "skipped_disabled") continue;
    next = transitionProvider(next, channel, to, now);
  }
  return next;
}
```

Use this initialization order:

```ts
state = markDisabledChannels(state, environment.enabled, now);
state = transitionAll(state, "rendered", now);
```

- [ ] **Step 5: Run state, planning, and action tests**

Run:

```bash
node --import tsx --test tests/state.test.ts tests/publishing.test.ts tests/rolling-window.test.ts
npm run typecheck
```

Expected: all selected tests pass; terminal TikTok records never become actions.

- [ ] **Step 6: Commit durable disabled-channel state**

```bash
git add src/state/channel-availability.ts src/cli/plan.ts tests/state.test.ts
git commit -m "feat: persist disabled publication channels"
```

### Task 3: Make Buffer preflight operate on enabled channels only

**Files:**

- Modify: `src/networks/buffer/preflight.ts`
- Modify: `src/cli/preflight.ts`
- Test: `tests/buffer.test.ts`

- [ ] **Step 1: Write a failing two-channel Buffer test**

Add a test whose channel query returns Instagram, Facebook, and an unrelated
paused TikTok connection, while the expected map includes only Instagram and
Facebook. Assert that the posts query contains only the two enabled IDs:

```ts
await runBufferPreflight({
  apiKey: "buffer-key",
  organizationId: "org_1",
  expectedChannelIds: {
    instagram: "ig_1",
    facebook: "fb_1",
  },
  requiredSlots: { instagram: 7, facebook: 7, tiktok: 0 },
  fetchImplementation,
});

assert.deepEqual(postVariables.input.filter.channelIds, ["ig_1", "fb_1"]);
```

Extend the slot-count test:

```ts
assert.deepEqual(bufferSlotsNeeded(states, ["instagram", "facebook"]), {
  instagram: 1,
  facebook: 2,
  tiktok: 0,
});
```

- [ ] **Step 2: Run Buffer tests and verify RED**

Run:

```bash
node --import tsx --test tests/buffer.test.ts
```

Expected: FAIL because preflight requires exactly three channels and complete ID
records.

- [ ] **Step 3: Generalize Buffer preflight without weakening validation**

Change `expectedChannelIds` to
`Readonly<Partial<Record<BufferChannelName, string>>>`. Derive enabled entries in
canonical Buffer order:

```ts
const expectedEntries = bufferChannels.flatMap((service) => {
  const id = expectedChannelIds[service];
  return id ? [[service, id] as const] : [];
});
if (expectedEntries.length === 0) {
  throw new Error("Buffer preflight requires an enabled channel");
}
```

Remove the `channels.length === 3` assertion. For each expected entry, continue
to require exactly one matching ID/service, the configured organization, an
unpaused queue, and capacity at or below ten. Build the posts query `channelIds`
from `expectedEntries.map(([, id]) => id)`.

- [ ] **Step 4: Count slots only for active Buffer services**

Update `bufferSlotsNeeded` to accept an enabled list while retaining a full
three-key result:

```ts
export function bufferSlotsNeeded(
  states: readonly CampaignState[],
  enabled: readonly BufferChannelName[] = bufferChannels,
): Readonly<Record<BufferChannelName, number>> {
  return Object.freeze(
    Object.fromEntries(
      bufferChannels.map((channel) => [
        channel,
        enabled.includes(channel)
          ? states.filter((state) =>
              ["deploying", "media_verified", "retryable"].includes(
                state.channels[channel].stage,
              ),
            ).length
          : 0,
      ]),
    ) as Record<BufferChannelName, number>,
  );
}
```

- [ ] **Step 5: Run Buffer tests and typecheck**

Run:

```bash
node --import tsx --test tests/buffer.test.ts
npm run typecheck
```

Expected: all Buffer tests pass, including the original three-channel contract.

- [ ] **Step 6: Commit partial Buffer support**

```bash
git add src/networks/buffer/preflight.ts src/cli/preflight.ts tests/buffer.test.ts
git commit -m "feat: preflight enabled Buffer channels"
```

### Task 4: Apply channel enablement to provider gates and adapters

**Files:**

- Modify: `src/cli/preflight.ts`
- Modify: `src/cli/publish.ts`
- Test: `tests/cli-gates.test.ts`
- Test: `tests/buffer.test.ts`

- [ ] **Step 1: Write failing publication-gate tests**

Add these assertions:

```ts
import {
  assertPublicationChannelEnabled,
  parsePublishRequest,
  providerAdaptersForAction,
} from "../src/cli/publish.js";
import { publisherEnvironmentFixture } from "./support/environment-fixture.js";

assert.deepEqual(
  parsePublishRequest({
    mode: "scheduled",
    autoPublish: true,
    youtubeEnabled: false,
    youtubePublicationVerified: false,
  }),
  { mode: "scheduled" },
);

assert.throws(
  () =>
    providerAdaptersForAction({
      state: campaignStateFixture({ tiktok: "media_verified" }),
      channel: "tiktok",
      mode: "controlled",
      phase: "scheduling",
      environment: publisherEnvironmentFixture({ tiktok: false }),
      renderRoot: "/tmp/troco-render",
    }),
  /tiktok.*disabled/i,
);

assert.throws(
  () =>
    assertPublicationChannelEnabled(
      publisherEnvironmentFixture({ tiktok: false }),
      "tiktok",
    ),
  /tiktok.*disabled/i,
);
```

- [ ] **Step 2: Run gate tests and verify RED**

Run:

```bash
node --import tsx --test tests/cli-gates.test.ts tests/buffer.test.ts
```

Expected: FAIL because scheduled mode always requires verified YouTube and
adapters do not check channel enablement.

- [ ] **Step 3: Make the YouTube public gate conditional**

Add `youtubeEnabled?: boolean` to `parsePublishRequest` and change the gate to:

```ts
if (input.youtubeEnabled !== false && !input.youtubePublicationVerified) {
  throw new Error("YouTube publication has not been verified");
}
```

Pass `planningEnvironment.enabled.youtube` from publish and preflight call sites.

- [ ] **Step 4: Reject disabled actions before intent and at the adapter boundary**

Export one shared guard from `src/cli/publish.ts`:

```ts
export function assertPublicationChannelEnabled(
  environment: PublisherEnvironment,
  channel: PublicationChannel,
): void {
  if (!environment.enabled[channel]) {
    throw new Error(`${channel} publication channel is disabled`);
  }
}
```

Call the guard in the CLI immediately after parsing the planning environment
and action, before `persistPublicationIntent`. Call it again at the beginning of
`providerAdaptersForAction` as defense in depth for direct callers and
reconciliation. This prevents a crafted action from writing an intent for a
channel that was disabled after an older campaign was planned.

For Buffer actions, assert the selected channel ID, organization ID, and API key
before building a fingerprint. For YouTube, assert its channel ID and OAuth
values only on the enabled YouTube path.

- [ ] **Step 5: Make provider preflight conditional**

In `src/cli/preflight.ts`:

```ts
const activeBufferChannels = enabledBufferChannels(environment.enabled);
if (activeBufferChannels.length > 0) {
  await runBufferPreflight({
    apiKey: environment.buffer.apiKey!,
    organizationId: environment.buffer.organizationId!,
    expectedChannelIds: environment.buffer.channelIds,
    requiredSlots: bufferSlotsNeeded(operationStates, activeBufferChannels),
  });
}

if (environment.enabled.youtube) {
  const tokenProvider = createYouTubeAccessTokenProvider({
    clientId: environment.youtube.clientId!,
    clientSecret: environment.youtube.clientSecret!,
    refreshToken: environment.youtube.refreshToken!,
  });
  await assertYouTubeChannel(
    await tokenProvider.getAccessToken(),
    environment.youtube.channelId!,
  );
}
```

Return `providerChannels: enabledPublicationChannels(environment.enabled).length`.

- [ ] **Step 6: Run provider tests and typecheck**

Run:

```bash
node --import tsx --test tests/cli-gates.test.ts tests/buffer.test.ts tests/publishing.test.ts tests/youtube.test.ts
npm run typecheck
```

Expected: all selected tests pass and disabled channels cannot reach an adapter.

- [ ] **Step 7: Commit conditional provider execution**

```bash
git add src/cli/preflight.ts src/cli/publish.ts tests/cli-gates.test.ts tests/buffer.test.ts
git commit -m "feat: gate providers by enabled channels"
```

### Task 5: Wire the production workflow and operations contract

**Files:**

- Modify: `.github/workflows/publish.yml`
- Modify: `.env.example`
- Modify: `src/validation/run.ts`
- Modify: `tests/workflows.test.ts`
- Modify: `tests/operations-doc.test.ts`
- Modify: `README.md`
- Modify: `docs/operations.md`

- [ ] **Step 1: Write failing workflow and operations tests**

Require these exact workflow expressions:

```ts
for (const pattern of [
  /INSTAGRAM_ENABLED: \$\{\{ vars\.INSTAGRAM_ENABLED \|\| 'true' \}\}/,
  /FACEBOOK_ENABLED: \$\{\{ vars\.FACEBOOK_ENABLED \|\| 'true' \}\}/,
  /TIKTOK_ENABLED: \$\{\{ vars\.TIKTOK_ENABLED \|\| 'false' \}\}/,
  /YOUTUBE_ENABLED: \$\{\{ vars\.YOUTUBE_ENABLED \|\| 'true' \}\}/,
]) {
  assert.match(workflow, pattern);
}
```

Require the operations document to include `TIKTOK_ENABLED=false`,
`skipped_disabled`, and the statement that enabling TikTok affects newly
created campaigns only.

- [ ] **Step 2: Run workflow/document tests and verify RED**

Run:

```bash
node --import tsx --test tests/workflows.test.ts tests/operations-doc.test.ts
```

Expected: FAIL because the four channel flags are absent.

- [ ] **Step 3: Declare production channel flags**

Add to the workflow job environment:

```yaml
INSTAGRAM_ENABLED: ${{ vars.INSTAGRAM_ENABLED || 'true' }}
FACEBOOK_ENABLED: ${{ vars.FACEBOOK_ENABLED || 'true' }}
TIKTOK_ENABLED: ${{ vars.TIKTOK_ENABLED || 'false' }}
YOUTUBE_ENABLED: ${{ vars.YOUTUBE_ENABLED || 'true' }}
```

Add the same four flags to `.env.example`, with TikTok false and the other three
true. Keep `BUFFER_TIKTOK_CHANNEL_ID` blank.

- [ ] **Step 4: Update validation and operator documentation**

Extend `src/validation/run.ts` to reject a workflow that omits or changes the
four expressions above. Document the active three-channel schedule, terminal
TikTok state, future-only re-enablement, controlled YouTube verification, and
the existing emergency stop in `README.md` and `docs/operations.md`.

- [ ] **Step 5: Run workflow, documentation, and validation tests**

Run:

```bash
node --import tsx --test tests/workflows.test.ts tests/operations-doc.test.ts tests/environment.test.ts
npm run validate
```

Expected: selected tests pass and validation prints JSON with `"ok":true`.

- [ ] **Step 6: Commit production wiring**

```bash
git add .github/workflows/publish.yml .env.example src/validation/run.ts tests/workflows.test.ts tests/operations-doc.test.ts README.md docs/operations.md
git commit -m "ci: disable TikTok publication explicitly"
```

### Task 6: Verify locally and on GitHub without posting

**Files:**

- Modify: `docs/superpowers/specs/2026-08-27-enabled-social-channels-design.md`

- [ ] **Step 1: Run the complete local verification**

Run:

```bash
npm run check
npm run validate
git diff --check
git status --short --branch
```

Expected: formatting and typecheck pass; the full test count passes with zero
failures; validation returns `ok: true`; the working tree contains only the
pending spec-status edit.

- [ ] **Step 2: Record verified implementation status**

Change the design header to:

```markdown
**Status:** Implemented and verified
```

Then run:

```bash
npx prettier --check docs/superpowers/specs/2026-08-27-enabled-social-channels-design.md
```

Expected: Prettier reports that the spec matches style.

- [ ] **Step 3: Commit and push the verified status**

```bash
git add docs/superpowers/specs/2026-08-27-enabled-social-channels-design.md
git commit -m "docs: record enabled-channel verification"
git push
```

- [ ] **Step 4: Wait for hosted validation**

Open the GitHub Actions run for the final commit and wait until `Validate social
publisher` completes successfully. If it fails, fetch the exact failed job logs,
reproduce the difference locally, add a regression test, and fix the root cause
in a new micro-commit.

- [ ] **Step 5: Run a hosted dry-run only**

Dispatch `Publish Troco social campaigns` with mode `dry-run`. Confirm a success
status and one `controlled-social-review` artifact. Do not select `controlled` or
`scheduled` in this task.

- [ ] **Step 6: Stop at the public-action boundary**

Report the exact future campaign ID, target time, and enabled destinations for
the controlled provider test. Obtain action-time confirmation before scheduling
Instagram/Facebook or uploading the private YouTube object.
