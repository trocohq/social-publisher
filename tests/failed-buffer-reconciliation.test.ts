import assert from "node:assert/strict";
import test from "node:test";
import { reconcileFailedBufferPublication } from "../src/publishing/failed-buffer-reconciliation.js";
import { campaignStateFixture } from "./support/state-fixture.js";
import type { CampaignState, PublicationChannel } from "../src/state/schema.js";
import type { AdapterOutcome } from "../src/publishing/execute.js";
import { transitionProvider } from "../src/state/transitions.js";
import { reconcileBufferPost } from "../src/networks/buffer/reconcile.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReconcile } from "../src/cli/reconcile.js";
import { readCampaignState, writeCampaignState } from "../src/state/storage.js";

const now = new Date("2026-09-09T12:00:00.000Z");
function failedState(channel: PublicationChannel = "facebook"): CampaignState {
  const state = campaignStateFixture({ [channel]: "failed" });
  state.channels[channel] = {
    ...state.channels[channel],
    providerId: "buffer_exact_1",
    attempts: 2,
    transitions: [
      { from: "scheduled", to: "failed", at: "2026-09-08T12:00:00.000Z" },
    ],
    lastError: {
      category: "buffer_async_failure",
      message: "Buffer reported an asynchronous delivery failure",
    },
  };
  return state;
}

test("recovers an exact observed Buffer ID without changing attempts or unrelated state", async () => {
  const state = failedState();
  const original = structuredClone(state);
  const persisted: CampaignState[] = [];
  const result = await reconcileFailedBufferPublication({
    state,
    channel: "facebook",
    bufferChannelId: "fb_1",
    now,
    reconcile: async () => ({
      kind: "success",
      value: { id: "buffer_exact_1", status: "published" },
    }),
    persist: async (value) => {
      persisted.push(value);
    },
  });
  assert.equal(result.matched, true);
  assert.equal(result.state.channels.facebook.stage, "published");
  assert.equal(result.state.channels.facebook.attempts, 2);
  assert.equal(result.state.channels.facebook.providerId, "buffer_exact_1");
  assert.equal(result.state.channels.facebook.lastError, undefined);
  assert.deepEqual(result.state.channels.facebook.transitions, [
    ...original.channels.facebook.transitions,
    { from: "failed", to: "published", at: now.toISOString() },
  ]);
  assert.equal(persisted.length, 1);
  assert.deepEqual({ ...result.state, channels: original.channels }, original);
  assert.deepEqual(state, original);
});

for (const channel of ["instagram", "facebook", "youtube"] as const) {
  for (const status of ["scheduled", "publishing", "published"] as const) {
    test(`recovers ${channel} to observed ${status}, then repeats without another transition or read`, async () => {
      let reads = 0;
      let writes = 0;
      const reconcile = async () => {
        reads++;
        return {
          id: "buffer_exact_1",
          status,
          dueAt: "2026-09-10T12:00:00.000Z",
        };
      };
      const options = {
        channel,
        bufferChannelId: "buffer-channel",
        now,
        reconcile,
        persist: async () => {
          writes++;
        },
      };
      const result = await reconcileFailedBufferPublication({
        ...options,
        state: failedState(channel),
      });
      assert.equal(result.matched, true);
      assert.equal(result.state.channels[channel].stage, status);
      const repeated = await reconcileFailedBufferPublication({
        ...options,
        state: result.state,
      });
      assert.equal(repeated.matched, false);
      assert.deepEqual(repeated.state, result.state);
      assert.equal(reads, 1);
      assert.equal(writes, 1);
    });
  }
}

for (const [name, value] of [
  ["missing", undefined],
  ["null", null],
  ["ambiguous array", [{ id: "buffer_exact_1", status: "published" }]],
  ["different ID", { id: "different", status: "published" }],
  ["missing ID", { status: "published" }],
  ["empty ID", { id: "", status: "published" }],
  ["unknown status", { id: "buffer_exact_1", status: "unknown" }],
  ["still failed", { id: "buffer_exact_1", status: "error" }],
  ["scheduled without dueAt", { id: "buffer_exact_1", status: "scheduled" }],
  [
    "scheduled invalid dueAt",
    { id: "buffer_exact_1", status: "scheduled", dueAt: "invalid" },
  ],
  [
    "scheduled past dueAt",
    {
      id: "buffer_exact_1",
      status: "scheduled",
      dueAt: "2026-09-09T11:59:59.999Z",
    },
  ],
  [
    "scheduled exact boundary",
    { id: "buffer_exact_1", status: "scheduled", dueAt: now.toISOString() },
  ],
  [
    "invalid permalink",
    {
      id: "buffer_exact_1",
      status: "published",
      permalink: "http://example.com/private",
    },
  ],
  [
    "error result",
    {
      kind: "permanent_error",
      category: "buffer_async_failure",
      message: "private provider detail",
    },
  ],
  [
    "retryable result",
    {
      kind: "retryable_error",
      category: "buffer_unavailable",
      message: "private provider detail",
    },
  ],
  ["empty success", { kind: "success", value: undefined }],
  [
    "malformed success",
    { kind: "success", value: { id: "buffer_exact_1", status: "unexpected" } },
  ],
] as const) {
  test(`leaves failed state and history unchanged for ${name}`, async () => {
    const state = failedState();
    const original = structuredClone(state);
    let writes = 0;
    const result = await reconcileFailedBufferPublication({
      state,
      channel: "facebook",
      bufferChannelId: "fb_1",
      now,
      reconcile: async () => value as AdapterOutcome,
      persist: async () => {
        writes++;
      },
    });
    assert.equal(result.matched, false);
    assert.deepEqual(result.state, original);
    assert.deepEqual(state, original);
    assert.equal(writes, 0);
  });
}

test("provider read exceptions never persist or replace the original failure", async () => {
  const state = failedState();
  let writes = 0;
  const result = await reconcileFailedBufferPublication({
    state,
    channel: "facebook",
    bufferChannelId: "fb_1",
    now,
    reconcile: async () => {
      throw new Error("private provider diagnostic");
    },
    persist: async () => {
      writes++;
    },
  });
  assert.equal(result.matched, false);
  assert.deepEqual(result.state, state);
  assert.equal(writes, 0);
});

test("snapshots channel, time and persistence callback before the provider read", async () => {
  const state = failedState();
  const time = new Date(now);
  const saved: CampaignState[] = [];
  let redirectedWrites = 0;
  const options = {
    state,
    channel: "facebook" as PublicationChannel,
    bufferChannelId: "fb_1",
    now: time,
    persist: async (value: CampaignState) => {
      saved.push(value);
    },
    reconcile: async (): Promise<AdapterOutcome> => {
      options.channel = "youtube";
      options.persist = async () => {
        redirectedWrites++;
      };
      time.setUTCFullYear(2030);
      return { id: "buffer_exact_1", status: "published" };
    },
  };
  const result = await reconcileFailedBufferPublication(options);
  assert.equal(result.state.channels.facebook.stage, "published");
  assert.deepEqual(result.state.channels.youtube, state.channels.youtube);
  assert.equal(
    result.state.channels.facebook.transitions.at(-1)?.at,
    now.toISOString(),
  );
  assert.equal(saved.length, 1);
  assert.equal(redirectedWrites, 0);
});

test("ineligible records, invalid clock and missing Buffer ownership never consult the provider", async () => {
  for (const scenario of [
    "tiktok",
    "no provider ID",
    "blank ID",
    "wrong error",
    "missing error",
    "active",
    "missing Buffer channel",
    "invalid clock",
  ]) {
    const channel = scenario === "tiktok" ? "tiktok" : "facebook";
    const state = failedState(channel);
    if (scenario === "no provider ID")
      delete state.channels[channel].providerId;
    if (scenario === "blank ID") state.channels[channel].providerId = "   ";
    if (scenario === "missing error") delete state.channels[channel].lastError;
    if (scenario === "wrong error")
      state.channels[channel].lastError = {
        category: "other_failure",
        message: "Existing failure",
      };
    if (scenario === "active") state.channels[channel].stage = "scheduled";
    let reads = 0;
    let writes = 0;
    const result = await reconcileFailedBufferPublication({
      state,
      channel,
      bufferChannelId:
        scenario === "missing Buffer channel" ? undefined : "fb_1",
      now: scenario === "invalid clock" ? new Date(NaN) : now,
      reconcile: async () => {
        reads++;
        return { id: "buffer_exact_1", status: "published" };
      },
      persist: async () => {
        writes++;
      },
    });
    assert.equal(result.matched, false, scenario);
    assert.deepEqual(result.state, state, scenario);
    assert.equal(reads, 0, scenario);
    assert.equal(writes, 0, scenario);
  }
});

test("ordinary failed transitions remain terminal", () => {
  for (const status of [
    "scheduled",
    "publishing",
    "published",
    "retryable",
  ] as const) {
    assert.throws(
      () => transitionProvider(failedState(), "facebook", status, now),
      /Illegal transition from failed/,
    );
  }
});

test("Buffer reconciliation rejects an unknown raw status rather than normalizing it to scheduled", async () => {
  const result = await reconcileBufferPost({
    apiKey: "test-key",
    organizationId: "org_1",
    expected: {
      channelId: "fb_1",
      providerId: "buffer_exact_1",
      text: "",
      mediaUrls: [],
    },
    fetchImplementation: async () =>
      new Response(
        JSON.stringify({
          data: {
            posts: {
              edges: [
                {
                  node: {
                    id: "buffer_exact_1",
                    channelId: "fb_1",
                    status: "mystery",
                    dueAt: "2026-09-10T12:00:00.000Z",
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  assert.notEqual(result.kind, "success");
});

function environment() {
  return {
    PUBLICATION_TIME_ZONE: "America/Sao_Paulo",
    PUBLISH_TIME: "12:17",
    PAGES_ORIGIN: "https://trocohq.github.io/social-publisher",
    BUFFER_ORGANIZATION_ID: "org_1",
    BUFFER_INSTAGRAM_CHANNEL_ID: "ig_1",
    BUFFER_FACEBOOK_CHANNEL_ID: "fb_1",
    BUFFER_YOUTUBE_CHANNEL_ID: "yt_1",
    YOUTUBE_CHANNEL_ID: "UC123",
    TIKTOK_ENABLED: "false",
    BUFFER_API_KEY: "test-key",
    BRAND_SOURCE_SHA: "298381c8e6c3220cde11a8109ddb727a28223d7c",
    DESIGN_TOKENS_SOURCE_SHA: "1fefd27a0de14a8d4115fe79c6076a3b17d3cf6d",
  };
}

async function stateDirectory(state: CampaignState) {
  const root = await mkdtemp(join(tmpdir(), "troco-failed-recovery-"));
  await writeCampaignState(root, state);
  return root;
}

for (const channel of ["instagram", "facebook", "youtube"] as const) {
  test(`explicit CLI recovery uses a read-only Buffer query and persists only selected ${channel}`, async () => {
    const state = failedState(channel);
    const root = await stateDirectory(state);
    const queries: string[] = [];
    const dependencies = {
      environment: environment(),
      now: () => now,
      fetchImplementation: (async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          query: string;
          variables: { input: { filter: { channelIds: string[] } } };
        };
        queries.push(body.query);
        assert.match(body.query, /^query /);
        assert.doesNotMatch(body.query, /mutation|createPost|editPost/);
        assert.deepEqual(body.variables.input.filter.channelIds, [
          channel === "instagram"
            ? "ig_1"
            : channel === "facebook"
              ? "fb_1"
              : "yt_1",
        ]);
        return new Response(
          JSON.stringify({
            data: {
              posts: {
                edges: [
                  {
                    node: {
                      id: "buffer_exact_1",
                      channelId: body.variables.input.filter.channelIds[0],
                      status: "sent",
                    },
                  },
                ],
                pageInfo: { hasNextPage: false },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    };
    try {
      const args = [
        "--recover-failed",
        "--action",
        `${state.plan.id}:${channel}`,
        "--state-root",
        root,
      ];
      await runReconcile(args, dependencies);
      const recovered = await readCampaignState(root, state.plan.localDate);
      assert.equal(recovered.channels[channel].stage, "published");
      assert.equal(recovered.channels[channel].attempts, 2);
      const persistedBytes = await readFile(
        join(root, "campaigns", `${state.plan.localDate}.json`),
        "utf8",
      );
      await runReconcile(args, dependencies);
      assert.equal(
        await readFile(
          join(root, "campaigns", `${state.plan.localDate}.json`),
          "utf8",
        ),
        persistedBytes,
      );
      assert.equal(queries.length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("CLI recovery requires an explicit action and never scans failed records automatically", async () => {
  const state = failedState();
  const root = await stateDirectory(state);
  let reads = 0;
  const dependencies = {
    environment: environment(),
    fetchImplementation: (async () => {
      reads++;
      throw new Error("must not read");
    }) as typeof fetch,
  };
  try {
    await assert.rejects(
      runReconcile(["--recover-failed", "--state-root", root], dependencies),
      /explicit.*action/i,
    );
    await runReconcile(["--state-root", root], dependencies);
    assert.deepEqual(
      await readCampaignState(root, state.plan.localDate),
      state,
    );
    assert.equal(reads, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI fails closed without configured Buffer ownership for YouTube", async () => {
  const state = failedState("youtube");
  const root = await stateDirectory(state);
  let reads = 0;
  try {
    await assert.rejects(
      runReconcile(
        [
          "--recover-failed",
          "--action",
          `${state.plan.id}:youtube`,
          "--state-root",
          root,
        ],
        {
          environment: {
            ...environment(),
            BUFFER_YOUTUBE_CHANNEL_ID: undefined,
          },
          fetchImplementation: async () => {
            reads++;
            throw new Error("must not read");
          },
        },
      ),
      /BUFFER_YOUTUBE_CHANNEL_ID/,
    );
    assert.equal(reads, 0);
    assert.deepEqual(
      await readCampaignState(root, state.plan.localDate),
      state,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const scenario of [
  "missing",
  "error",
  "ambiguous",
  "malformed",
  "wrong channel",
  "wrong ID",
  "unavailable",
] as const) {
  test(`CLI ${scenario} observation leaves campaign and index bytes untouched`, async () => {
    const state = failedState();
    const root = await stateDirectory(state);
    const campaignPath = join(
      root,
      "campaigns",
      `${state.plan.localDate}.json`,
    );
    const indexPath = join(root, "index.json");
    const before = await readFile(campaignPath, "utf8");
    const index = await readFile(indexPath, "utf8");
    try {
      await assert.rejects(
        runReconcile(
          [
            "--recover-failed",
            "--action",
            `${state.plan.id}:facebook`,
            "--state-root",
            root,
          ],
          {
            environment: environment(),
            now: () => now,
            fetchImplementation: async () => {
              if (scenario === "unavailable")
                throw new Error("private token detail");
              const node = {
                id: scenario === "wrong ID" ? "other-post" : "buffer_exact_1",
                channelId:
                  scenario === "wrong channel" ? "other-channel" : "fb_1",
                status:
                  scenario === "error"
                    ? "error"
                    : scenario === "malformed"
                      ? "invalid"
                      : "sent",
              };
              const edges =
                scenario === "missing"
                  ? []
                  : scenario === "ambiguous"
                    ? [{ node }, { node }]
                    : [{ node }];
              return new Response(
                JSON.stringify({
                  data: { posts: { edges, pageInfo: { hasNextPage: false } } },
                }),
                {
                  status: 200,
                  headers: { "content-type": "application/json" },
                },
              );
            },
          },
        ),
        /recovery.*not confirmed/i,
      );
      assert.equal(await readFile(campaignPath, "utf8"), before);
      assert.equal(await readFile(indexPath, "utf8"), index);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
