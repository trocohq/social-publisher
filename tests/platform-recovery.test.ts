import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { recoverPlatformShadows } from "../src/publishing/platform-recovery.js";
import { campaignStateFixture } from "./support/state-fixture.js";
import { createCampaign } from "../src/planning/create-campaign.js";
import { writeCampaignState, readCampaignState } from "../src/state/storage.js";

const environment = {
  PUBLISHING_SHADOW_ENABLED: "true",
  AUTO_PUBLISH: "true",
  PUBLISHING_ENDPOINT: "https://publishing.example",
  PUBLISHING_CLIENT_ID: "troco-shadow",
  PUBLISHING_CLIENT_SECRET: "test-secret",
};

test("missing-media recovery allows restoration then completes with the same envelope", async () => {
  const { runPlatformRecovery, platformRecoveryExitCode } =
    await import("../src/cli/recover-platform.js");
  const root = await mkdtemp(join(tmpdir(), "troco-restore-cycle-"));
  try {
    const state = fixture();
    await writeCampaignState(root, state);
    const renderRoot = join(root, "render");
    const args = [
      "--mode",
      "scheduled",
      "--state-root",
      root,
      "--render-root",
      renderRoot,
      "--publishing-outbox-root",
      join(root, "outbox"),
    ];
    let uploads = 0;
    let body: string | undefined;
    const dependencies = {
      environment,
      fetchImplementation: (async (_url, init) => {
        if (init?.method === "PUT") {
          uploads++;
          return Response.json({ status: "stored" });
        }
        if (body === undefined) body = String(init?.body);
        assert.equal(String(init?.body), body);
        return uploads < 2
          ? Response.json({ code: "ARTIFACT_NOT_READY" }, { status: 409 })
          : Response.json({ publicationId: "restored" }, { status: 202 });
      }) as typeof fetch,
    };
    const missing = await runPlatformRecovery(args, dependencies);
    assert.equal(missing.outcome, "pending");
    assert.equal(
      platformRecoveryExitCode(missing),
      0,
      "must reach archive restoration",
    );
    const directory = join(renderRoot, state.plan.localDate, state.plan.id);
    await mkdir(join(directory, "feed"), { recursive: true });
    await mkdir(join(directory, "video"), { recursive: true });
    await writeFile(join(directory, "feed/slide-01.jpg"), "approved feed");
    await writeFile(join(directory, "video/short.mp4"), "approved video");
    assert.equal(
      (await runPlatformRecovery(args, dependencies)).outcome,
      "accepted",
    );
    assert.equal(uploads, 2);
    assert.equal(platformRecoveryExitCode({ outcome: "retry-later" }), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function fixture(date = "2026-09-07") {
  const state = campaignStateFixture({ instagram: "publishing" });
  state.plan = createCampaign({
    localDate: date,
    publishTime: "12:17",
    history: [],
  });
  state.renderHashes.feed = [
    createHash("sha256").update("approved feed").digest("hex"),
  ];
  state.renderHashes.video = createHash("sha256")
    .update("approved video")
    .digest("hex");
  return {
    ...state,
    platformMedia: {
      schemaVersion: 1 as const,
      approvalSha256: createHash("sha256")
        .update(
          JSON.stringify({
            plan: state.plan,
            sourceCommits: state.sourceCommits,
            renderHashes: state.renderHashes,
          }),
        )
        .digest("hex"),
      assets: [
        { sha256: state.renderHashes.feed[0]!, byteSize: 13 },
        { sha256: state.renderHashes.video, byteSize: 14 },
      ],
    },
  };
}

test("recovery uses persisted intent before media restoration and never invokes native providers", async () => {
  const recovery = await import("../src/publishing/platform-recovery.js").catch(
    () => null,
  );
  assert.equal(typeof recovery?.recoverPlatformShadows, "function");
  const root = await mkdtemp(join(tmpdir(), "troco-resume-"));
  try {
    const state = fixture();
    await writeCampaignState(root, state);
    const requests: string[] = [];
    const input = {
      stateRoot: root,
      renderRoot: join(root, "missing"),
      outboxDirectory: join(root, "outbox"),
      environment,
      now: new Date("2026-09-07T12:00:00Z"),
      fetchImplementation: (async (url, init) => {
        requests.push(`${init?.method} ${new URL(String(url)).origin}`);
        return Response.json(
          { publicationId: "private-remote-id" },
          { status: 202 },
        );
      }) as typeof fetch,
    };
    assert.deepEqual(await recovery!.recoverPlatformShadows(input), {
      outcome: "accepted",
      attempted: 1,
      recovered: 1,
      invalid: 0,
    });
    const saved = await readCampaignState(root, state.plan.localDate);
    assert.deepEqual(saved.channels, state.channels);
    assert.match(
      saved.platformShadow!.acknowledgedEnvelopeSha256!,
      /^[a-f0-9]{64}$/,
    );
    assert.doesNotMatch(
      JSON.stringify(saved),
      /private-remote-id|test-secret|outbox/,
    );
    assert.deepEqual(requests, ["POST https://publishing.example"]);
    await recovery!.recoverPlatformShadows({
      ...input,
      outboxDirectory: join(root, "fresh-outbox"),
    });
    assert.equal(requests.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bounded recovery rotates missing media, stops on capacity, and preserves invalid records", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-resume-bounds-"));
  try {
    for (const date of [
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ])
      await writeCampaignState(root, fixture(date));
    const invalidPath = join(root, "campaigns/2026-09-11.json");
    await writeFile(invalidPath, "{ invalid record");
    const requests: string[] = [];
    const input = {
      stateRoot: root,
      renderRoot: join(root, "missing"),
      outboxDirectory: join(root, "outbox"),
      environment,
      now: new Date("2026-09-07T12:00:00Z"),
      fetchImplementation: (async (_url, init) => {
        assert.equal(init?.method, "POST");
        const id = JSON.parse(String(init?.body)).identity.sourceId as string;
        requests.push(id.slice(0, 10));
        return id.startsWith("2026-09-10")
          ? Response.json({ publicationId: "accepted" }, { status: 202 })
          : Response.json({ code: "ARTIFACT_NOT_READY" }, { status: 409 });
      }) as typeof fetch,
    };
    assert.deepEqual(await recoverPlatformShadows(input), {
      outcome: "pending",
      attempted: 3,
      recovered: 0,
      invalid: 1,
    });
    assert.deepEqual(requests, ["2026-09-07", "2026-09-08", "2026-09-09"]);
    assert.deepEqual(
      await recoverPlatformShadows({
        ...input,
        now: new Date("2026-09-07T13:00:00Z"),
      }),
      { outcome: "pending", attempted: 3, recovered: 1, invalid: 1 },
    );
    assert.equal(requests[3], "2026-09-10");
    assert.equal(await readFile(invalidPath, "utf8"), "{ invalid record");
    requests.length = 0;
    const deferred = await recoverPlatformShadows({
      ...input,
      fetchImplementation: async (_url, init) => {
        requests.push(init!.method!);
        return Response.json(
          { code: "ARTIFACT_CAPACITY_REJECTED" },
          { status: 429 },
        );
      },
    });
    assert.equal(deferred.outcome, "retry-later");
    assert.equal(deferred.attempted, 1);
    assert.deepEqual(requests, ["POST"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a mismatched acknowledgement is not replaced and does not block independent recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "troco-resume-conflict-"));
  try {
    const bad = {
      ...fixture(),
      platformShadow: { acknowledgedEnvelopeSha256: "f".repeat(64) },
    };
    await writeCampaignState(root, bad);
    await writeCampaignState(root, fixture("2026-09-08"));
    const result = await recoverPlatformShadows({
      stateRoot: root,
      renderRoot: join(root, "missing"),
      outboxDirectory: join(root, "outbox"),
      environment,
      now: new Date(),
      fetchImplementation: async () =>
        Response.json({ publicationId: "accepted" }, { status: 202 }),
    });
    assert.deepEqual(result, {
      outcome: "pending",
      attempted: 1,
      recovered: 1,
      invalid: 1,
    });
    assert.deepEqual(await readCampaignState(root, bad.plan.localDate), bad);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovery CLI is disabled by default and requires scheduled or exact controlled authorization", async () => {
  const cli = await import("../src/cli/recover-platform.js").catch(() => null);
  assert.equal(typeof cli?.runPlatformRecovery, "function");
  const disabled = await cli!.runPlatformRecovery([], {
    environment: new Proxy(
      {},
      {
        get(_target, key) {
          if (key === "PUBLISHING_SHADOW_ENABLED") return "false";
          throw new Error("credential access");
        },
      },
    ),
  });
  assert.equal(disabled.outcome, "disabled");
  await assert.rejects(
    cli!.runPlatformRecovery(["--mode", "scheduled"], {
      environment: { ...environment, AUTO_PUBLISH: "false" },
    }),
    /AUTHORIZATION_REQUIRED/,
  );
  await assert.rejects(
    cli!.runPlatformRecovery(
      [
        "--mode",
        "controlled",
        "--campaign",
        fixture().plan.id,
        "--confirm",
        "wrong",
      ],
      { environment },
    ),
    /AUTHORIZATION_REQUIRED/,
  );
  const root = await mkdtemp(join(tmpdir(), "troco-resume-cli-"));
  try {
    const chosen = fixture("2026-09-10");
    await writeCampaignState(root, chosen);
    await writeCampaignState(root, fixture("2026-09-11"));
    let calls = 0;
    const result = await cli!.runPlatformRecovery(
      [
        "--mode",
        "controlled",
        "--campaign",
        chosen.plan.id,
        "--confirm",
        "PUBLISH_ONE_CAMPAIGN",
        "--state-root",
        root,
        "--render-root",
        join(root, "missing"),
        "--publishing-outbox-root",
        join(root, "outbox"),
      ],
      {
        environment: { ...environment, AUTO_PUBLISH: "false" },
        now: new Date("2026-09-07T12:00:00Z"),
        fetchImplementation: async (_url, init) => {
          calls++;
          assert.equal(
            JSON.parse(String(init?.body)).identity.sourceId,
            chosen.plan.id,
          );
          return Response.json({ publicationId: "accepted" }, { status: 202 });
        },
      },
    );
    assert.equal(result.recovered, 1);
    assert.equal(calls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
