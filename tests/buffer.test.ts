import assert from "node:assert/strict";
import test from "node:test";

import {
  createBufferPost,
  createBufferPostInput,
  normalizeBufferCreateResponse,
} from "../src/networks/buffer/posts.js";
import { runBufferPreflight } from "../src/networks/buffer/preflight.js";
import {
  matchExistingBufferPost,
  reconcileBufferPost,
} from "../src/networks/buffer/reconcile.js";
import { bufferSlotsNeeded } from "../src/cli/preflight.js";
import { bufferFingerprintForAction } from "../src/cli/publish.js";
import { executePublication } from "../src/publishing/execute.js";
import { transitionProvider } from "../src/state/transitions.js";
import { campaignStateFixture } from "./support/state-fixture.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("Buffer uses custom scheduling and ordered public image assets", () => {
  const input = createBufferPostInput({
    channel: "instagram",
    channelId: "ig_1",
    text: "Legenda",
    dueAt: "2026-08-26T15:17:00.000Z",
    phase: "scheduling",
    mediaKind: "carousel",
    mediaUrls: [
      "https://trocohq.github.io/social-publisher/media/a.jpg",
      "https://trocohq.github.io/social-publisher/media/b.jpg",
    ],
  });
  assert.deepEqual(input.assets, [
    {
      image: {
        url: "https://trocohq.github.io/social-publisher/media/a.jpg",
      },
    },
    {
      image: {
        url: "https://trocohq.github.io/social-publisher/media/b.jpg",
      },
    },
  ]);
  assert.equal(input.mode, "customScheduled");
  assert.equal(input.metadata.instagram?.type, "post");
});

test("Buffer sends overdue posts now instead of scheduling them in the past", () => {
  const input = createBufferPostInput({
    channel: "facebook",
    channelId: "fb_1",
    text: "Legenda",
    dueAt: "2026-08-26T15:17:00.000Z",
    phase: "publishing",
    mediaKind: "feed",
    mediaUrls: ["https://trocohq.github.io/social-publisher/media/feed.jpg"],
  });
  assert.equal(input.mode, "shareNow");
  assert.equal("dueAt" in input, false);
  assert.equal(input.schedulingType, "automatic");
});

test("Buffer typed mutation errors become sanitized retry classes", () => {
  assert.deepEqual(
    normalizeBufferCreateResponse({
      data: { createPost: { message: "Rate limit exceeded" } },
    }),
    {
      kind: "retryable_error",
      category: "buffer_rate_limit",
      message: "Buffer temporarily rejected the post",
    },
  );
  assert.deepEqual(
    normalizeBufferCreateResponse({
      data: {
        createPost: {
          post: { id: "post_sending", status: "sending" },
        },
      },
    }),
    {
      kind: "success",
      value: { id: "post_sending", status: "publishing" },
    },
  );
  assert.deepEqual(
    normalizeBufferCreateResponse({
      data: {
        createPost: { post: { id: "post_error", status: "error" } },
      },
    }),
    {
      kind: "permanent_error",
      category: "buffer_async_failure",
      message: "Buffer reported an asynchronous delivery failure",
    },
  );
});

test("Buffer production create adapter sends valid scheduled and immediate inputs", async () => {
  const inputs: Record<string, unknown>[] = [];
  const fetchImplementation: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      variables: { input: Record<string, unknown> };
    };
    inputs.push(request.variables.input);
    const immediate = request.variables.input.mode === "shareNow";
    return jsonResponse({
      data: {
        createPost: {
          post: {
            id: immediate ? "post_now" : "post_later",
            status: immediate ? "sending" : "scheduled",
          },
        },
      },
    });
  };
  const common = {
    channel: "facebook" as const,
    channelId: "fb_1",
    text: "Legenda",
    dueAt: "2026-08-26T15:17:00.000Z",
    mediaKind: "feed" as const,
    mediaUrls: ["https://example.test/slide.jpg"],
  };
  await createBufferPost({
    apiKey: "buffer-key",
    input: createBufferPostInput({ ...common, phase: "scheduling" }),
    fetchImplementation,
  });
  await createBufferPost({
    apiKey: "buffer-key",
    input: createBufferPostInput({ ...common, phase: "publishing" }),
    fetchImplementation,
  });
  assert.deepEqual(
    inputs.map(({ mode, schedulingType, dueAt }) => ({
      mode,
      schedulingType,
      dueAt,
    })),
    [
      {
        mode: "customScheduled",
        schedulingType: "automatic",
        dueAt: "2026-08-26T15:17:00.000Z",
      },
      { mode: "shareNow", schedulingType: "automatic", dueAt: undefined },
    ],
  );
});

test("reconciliation matches channel, due time, normalized copy, and media", () => {
  const match = matchExistingBufferPost(
    {
      channelId: "ig_1",
      dueAt: "2026-08-26T15:17:00.000Z",
      text: "Troco certo",
      mediaUrls: ["https://example.test/slide.jpg"],
    },
    [
      {
        id: "post_1",
        channelId: "ig_1",
        dueAt: "2026-08-26T15:17:00.000Z",
        text: " Troco  certo ",
        status: "scheduled",
        assets: [{ source: "https://example.test/slide.jpg" }],
      },
    ],
  );
  assert.equal(match?.id, "post_1");
});

test("immediate reconciliation uses persisted attempt times and prevents a duplicate create", async () => {
  const state = transitionProvider(
    campaignStateFixture(),
    "instagram",
    "publishing",
    new Date("2026-08-26T16:00:00Z"),
  );
  const expected = bufferFingerprintForAction({
    state,
    channel: "instagram",
    channelId: "ig_1",
    phase: "publishing",
    dueAt: state.plan.targetAt,
    text: "Troco certo",
    mediaUrls: ["https://example.test/slide.jpg"],
  });
  assert.deepEqual(expected.attemptedAt, ["2026-08-26T16:00:00.000Z"]);
  assert.equal(expected.dueAt, undefined);

  let createCalls = 0;
  const result = await executePublication({
    state,
    channel: "instagram",
    reconcile: () =>
      reconcileBufferPost({
        apiKey: "buffer-key",
        organizationId: "org_1",
        expected,
        fetchImplementation: async (_input, init) => {
          const request = JSON.parse(String(init?.body)) as {
            variables: {
              input: { filter: { dueAt?: unknown } };
            };
          };
          assert.equal(request.variables.input.filter.dueAt, undefined);
          return jsonResponse({
            data: {
              posts: {
                edges: [
                  {
                    node: {
                      id: "post_now",
                      channelId: "ig_1",
                      dueAt: "2026-08-26T16:01:00.000Z",
                      text: "Troco certo",
                      status: "sent",
                      assets: [{ source: "https://example.test/slide.jpg" }],
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          });
        },
      }),
    create: async () => {
      createCalls += 1;
      return undefined;
    },
    now: new Date("2026-08-26T16:02:00Z"),
  });
  assert.equal(createCalls, 0);
  assert.equal(result.channels.instagram.providerId, "post_now");
  assert.equal(result.channels.instagram.stage, "published");
});

test("reconciliation prefers a persisted Buffer provider ID", async () => {
  const result = await reconcileBufferPost({
    apiKey: "buffer-key",
    organizationId: "org_1",
    expected: {
      channelId: "ig_1",
      providerId: "post_exact",
      dueAt: "2026-08-26T15:17:00.000Z",
      attemptedAt: ["2026-08-26T16:00:00.000Z"],
      text: "Original copy",
      mediaUrls: ["https://example.test/original.jpg"],
    },
    fetchImplementation: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        variables: { input: { filter: { dueAt?: unknown } } };
      };
      assert.equal(request.variables.input.filter.dueAt, undefined);
      return jsonResponse({
        data: {
          posts: {
            edges: [
              {
                node: {
                  id: "post_exact",
                  channelId: "ig_1",
                  dueAt: "2026-08-26T17:00:00.000Z",
                  status: "sending",
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    },
  });
  assert.equal(result.kind, "success");
  assert.equal(result.kind === "success" && result.value?.id, "post_exact");
});

test("Buffer preflight uses current channel and paginated post inputs", async () => {
  const requests: { query: string; variables: Record<string, unknown> }[] = [];
  const fetchImplementation: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    requests.push(request);
    if (request.query.includes("TrocoChannels")) {
      return jsonResponse({
        data: {
          channels: [
            {
              id: "ig_1",
              service: "instagram",
              organizationId: "org_1",
              isQueuePaused: false,
            },
            {
              id: "fb_1",
              service: "facebook",
              organizationId: "org_1",
              isQueuePaused: false,
            },
            {
              id: "tt_1",
              service: "tiktok",
              organizationId: "org_1",
              isQueuePaused: false,
            },
          ],
        },
      });
    }
    if (request.query.includes("TrocoScheduledPosts")) {
      return jsonResponse({
        data: {
          posts: {
            edges: [
              { node: { id: "ig_existing", channelId: "ig_1" } },
              { node: { id: "fb_existing", channelId: "fb_1" } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    }
    throw new Error("Unexpected Buffer operation");
  };

  await runBufferPreflight({
    apiKey: "buffer-key",
    organizationId: "org_1",
    expectedChannelIds: {
      instagram: "ig_1",
      facebook: "fb_1",
      tiktok: "tt_1",
    },
    requiredSlots: { instagram: 7, facebook: 7, tiktok: 7 },
    fetchImplementation,
  });

  assert.equal(requests.length, 2);
  assert.match(requests[0]!.query, /channels\(input: \$input\)/);
  assert.deepEqual(requests[0]!.variables, {
    input: { organizationId: "org_1" },
  });
  assert.match(
    requests[1]!.query,
    /posts\(first: \$first, after: \$after, input: \$input\)/,
  );
  assert.deepEqual(requests[1]!.variables, {
    first: 100,
    after: null,
    input: {
      organizationId: "org_1",
      filter: {
        status: ["scheduled"],
        channelIds: ["ig_1", "fb_1", "tt_1"],
      },
      sort: [{ field: "dueAt", direction: "asc" }],
    },
  });
});

test("Buffer preflight checks only enabled channels", async () => {
  let postVariables: {
    input?: { filter?: { channelIds?: string[] } };
  } = {};
  const fetchImplementation: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      query: string;
      variables: typeof postVariables;
    };
    if (request.query.includes("TrocoChannels")) {
      return jsonResponse({
        data: {
          channels: [
            {
              id: "ig_1",
              service: "instagram",
              organizationId: "org_1",
              isQueuePaused: false,
            },
            {
              id: "fb_1",
              service: "facebook",
              organizationId: "org_1",
              isQueuePaused: false,
            },
            {
              id: "tt_unrelated",
              service: "tiktok",
              organizationId: "org_1",
              isQueuePaused: true,
            },
          ],
        },
      });
    }
    if (request.query.includes("TrocoScheduledPosts")) {
      postVariables = request.variables;
      return jsonResponse({
        data: {
          posts: {
            edges: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    }
    throw new Error("Unexpected Buffer operation");
  };

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

  assert.deepEqual(postVariables.input?.filter?.channelIds, ["ig_1", "fb_1"]);
});

test("Buffer reconciliation paginates the current posts connection", async () => {
  const cursors: unknown[] = [];
  const fetchImplementation: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      query: string;
      variables: {
        after?: unknown;
        input?: { organizationId?: string; filter?: unknown };
      };
    };
    cursors.push(request.variables.after);
    assert.match(request.query, /edges\s*{\s*node/);
    assert.equal(request.variables.input?.organizationId, "org_1");
    if (request.variables.after === null) {
      return jsonResponse({
        data: {
          posts: {
            edges: [],
            pageInfo: { hasNextPage: true, endCursor: "page-2" },
          },
        },
      });
    }
    return jsonResponse({
      data: {
        posts: {
          edges: [
            {
              node: {
                id: "post_1",
                channelId: "ig_1",
                dueAt: "2026-08-26T15:17:00.000Z",
                text: "Troco certo",
                status: "scheduled",
                assets: [{ source: "https://example.test/slide.jpg" }],
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
  };

  const result = await reconcileBufferPost({
    apiKey: "buffer-key",
    organizationId: "org_1",
    expected: {
      channelId: "ig_1",
      dueAt: "2026-08-26T15:17:00.000Z",
      text: "Troco certo",
      mediaUrls: ["https://example.test/slide.jpg"],
    },
    fetchImplementation,
  });

  assert.equal(result.kind, "success");
  if (result.kind === "success") assert.equal(result.value?.id, "post_1");
  assert.deepEqual(cursors, [null, "page-2"]);
});

test("Buffer reconciliation exposes asynchronous delivery errors", async () => {
  let statuses: unknown;
  const result = await reconcileBufferPost({
    apiKey: "buffer-key",
    organizationId: "org_1",
    expected: {
      channelId: "ig_1",
      dueAt: "2026-08-26T15:17:00.000Z",
      text: "Troco certo",
      mediaUrls: ["https://example.test/slide.jpg"],
    },
    fetchImplementation: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        variables: { input: { filter: { status: unknown } } };
      };
      statuses = request.variables.input.filter.status;
      return jsonResponse({
        data: {
          posts: {
            edges: [
              {
                node: {
                  id: "post_error",
                  channelId: "ig_1",
                  dueAt: "2026-08-26T15:17:00.000Z",
                  text: "Troco certo",
                  status: "error",
                  assets: [{ source: "https://example.test/slide.jpg" }],
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    },
  });
  assert.deepEqual(statuses, ["scheduled", "sending", "sent", "error"]);
  assert.deepEqual(result, {
    kind: "permanent_error",
    category: "buffer_async_failure",
    message: "Buffer reported an asynchronous delivery failure",
  });
});

test("Buffer queue capacity counts only channel posts still needing creation", () => {
  assert.deepEqual(
    bufferSlotsNeeded([
      campaignStateFixture(),
      campaignStateFixture({
        instagram: "scheduled",
        facebook: "retryable",
        tiktok: "failed",
      }),
    ]),
    { instagram: 1, facebook: 2, tiktok: 1 },
  );
  assert.deepEqual(
    bufferSlotsNeeded(
      [
        campaignStateFixture(),
        campaignStateFixture({
          instagram: "scheduled",
          facebook: "retryable",
          tiktok: "failed",
        }),
      ],
      ["instagram", "facebook"],
    ),
    { instagram: 1, facebook: 2, tiktok: 0 },
  );
});
