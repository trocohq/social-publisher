import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readdir,
  symlink,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as bridge from "../src/publishing/platform-bridge.js";
import * as publish from "../src/cli/publish.js";
import { writeCampaignState, readCampaignState } from "../src/state/storage.js";
import { campaignStateFixture } from "./support/state-fixture.js";

const environment = {
  PUBLISHING_SHADOW_ENABLED: "true",
  PUBLISHING_ENDPOINT: "https://publishing.example",
  PUBLISHING_CLIENT_ID: "troco-shadow",
  PUBLISHING_CLIENT_SECRET: "test-secret",
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "troco-shadow-"));
  const state = campaignStateFixture({ instagram: "publishing" });
  const feed = Buffer.from("approved feed");
  const video = Buffer.from("approved video");
  state.renderHashes.feed = [createHash("sha256").update(feed).digest("hex")];
  state.renderHashes.video = createHash("sha256").update(video).digest("hex");
  const directory = join(root, state.plan.localDate, state.plan.id);
  await mkdir(join(directory, "feed"), { recursive: true });
  await mkdir(join(directory, "video"), { recursive: true });
  await writeFile(join(directory, "feed/slide-01.jpg"), feed);
  await writeFile(join(directory, "video/short.mp4"), video);
  return {
    state,
    renderRoot: root,
    outboxDirectory: join(root, "outbox"),
    environment,
    directory,
  };
}

test("shadow gate and dry run avoid every credential, file, and transport access", async () => {
  for (const flag of [undefined, "false", "TRUE"]) {
    const input = {
      environment: new Proxy(
        { PUBLISHING_SHADOW_ENABLED: flag },
        {
          get(target, key) {
            if (key === "PUBLISHING_SHADOW_ENABLED")
              return target.PUBLISHING_SHADOW_ENABLED;
            throw new Error("credential access");
          },
        },
      ),
      get state() {
        throw new Error("state access");
      },
      get renderRoot() {
        throw new Error("file access");
      },
      get outboxDirectory() {
        throw new Error("outbox access");
      },
      get fetchImplementation() {
        throw new Error("transport access");
      },
    };
    assert.deepEqual(await bridge.submitPlatformShadow(input), {
      outcome: "disabled",
    });
  }
  assert.deepEqual(
    await bridge.submitPlatformShadow({
      dryRun: true,
      get environment() {
        throw new Error("environment access");
      },
      get state() {
        throw new Error("state access");
      },
      get renderRoot() {
        throw new Error("file access");
      },
      get outboxDirectory() {
        throw new Error("outbox access");
      },
    }),
    { outcome: "disabled" },
  );
});

test("checks intake before sequential uploads and reuses persisted acceptance", async () => {
  const input = await fixture();
  const before = structuredClone(input.state);
  const requests: string[] = [];
  let active = false;
  const fetchImplementation: typeof fetch = async (url, init) => {
    assert.equal(active, false);
    active = true;
    requests.push(`${init?.method} ${new URL(String(url)).pathname}`);
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    if (init?.method === "PUT") {
      assert.ok((await new Response(init.body).arrayBuffer()).byteLength > 0);
    } else {
      const envelope = JSON.parse(String(init?.body));
      assert.ok(
        envelope.deliveries.every(
          (delivery: { adapter: string }) =>
            delivery.adapter === "social.shadow",
        ),
      );
    }
    active = false;
    if (requests.length === 1) {
      return Response.json({ code: "ARTIFACT_NOT_READY" }, { status: 409 });
    }
    return Response.json(
      init?.method === "PUT"
        ? { status: "stored" }
        : { publicationId: "shadow-1" },
    );
  };
  try {
    assert.deepEqual(
      await bridge.submitPlatformShadow({ ...input, fetchImplementation }),
      { outcome: "accepted", publicationId: "shadow-1" },
    );
    assert.deepEqual(requests, [
      "POST /v1/publications",
      "PUT /v1/artifacts",
      "PUT /v1/artifacts",
      "POST /v1/publications",
    ]);
    assert.deepEqual(
      await bridge.submitPlatformShadow({
        ...input,
        fetchImplementation: async () => {
          throw new Error("repeat network");
        },
      }),
      { outcome: "already-accepted", publicationId: "shadow-1" },
    );
    assert.deepEqual(input.state, before);
  } finally {
    await rm(input.renderRoot, { recursive: true, force: true });
  }
});

test("rejects mutation in the last artifact before any request or outbox write", async () => {
  const input = await fixture();
  try {
    await writeFile(join(input.directory, "video/short.mp4"), "mutated video!");
    await assert.rejects(
      bridge.submitPlatformShadow({
        ...input,
        fetchImplementation: async () => {
          throw new Error("network accessed");
        },
      }),
      /PUBLISHING_SHADOW_MEDIA_INVALID/,
    );
    await assert.rejects(readdir(input.outboxDirectory), { code: "ENOENT" });
  } finally {
    await rm(input.renderRoot, { recursive: true, force: true });
  }
});

test("intake capacity deferral retains durable outbox without uploads", async () => {
  const input = await fixture();
  const requests: string[] = [];
  try {
    const result = await bridge.submitPlatformShadow({
      ...input,
      fetchImplementation: async (url) => {
        requests.push(new URL(String(url)).pathname);
        return Response.json(
          { code: "ARTIFACT_CAPACITY_REJECTED" },
          { status: 429, headers: { "retry-after": "30" } },
        );
      },
    });
    assert.deepEqual(result, {
      outcome: "retry-later",
      code: "ARTIFACT_CAPACITY_REJECTED",
      retryAfter: "30",
    });
    assert.deepEqual(requests, ["/v1/publications"]);
    const [id] = await readdir(input.outboxDirectory);
    assert.ok(
      (await readdir(join(input.outboxDirectory, id!))).includes(
        "handoff.json",
      ),
    );
  } finally {
    await rm(input.renderRoot, { recursive: true, force: true });
  }
});

test("real publish execute entrypoint blocks provider calls on shadow capacity and enforces authorization first", async () => {
  assert.equal(typeof publish.runPublish, "function");
  const input = await fixture();
  const source = {
    ...environment,
    AUTO_PUBLISH: "true",
    YOUTUBE_ENABLED: "false",
    FACEBOOK_ENABLED: "false",
    TIKTOK_ENABLED: "false",
    PUBLICATION_TIME_ZONE: "America/Sao_Paulo",
    PUBLISH_TIME: "12:17",
    PAGES_ORIGIN: "https://media.example",
    BRAND_SOURCE_SHA: "a".repeat(40),
    DESIGN_TOKENS_SOURCE_SHA: "b".repeat(40),
    BUFFER_INSTAGRAM_CHANNEL_ID: "instagram",
    BUFFER_ORGANIZATION_ID: "test-org",
    BUFFER_API_KEY: "test-key",
  };
  const requests: string[] = [];
  const fetchImplementation: typeof fetch = async (url, init) => {
    requests.push(String(url));
    await new Response(init?.body).arrayBuffer();
    return Response.json(
      { code: "ARTIFACT_CAPACITY_REJECTED" },
      { status: 429 },
    );
  };
  const stateRoot = join(input.renderRoot, "state");
  const args = [
    "--phase",
    "execute",
    "--action",
    `${input.state.plan.id}:instagram`,
    "--mode",
    "scheduled",
    "--state-root",
    stateRoot,
    "--render-root",
    input.renderRoot,
    "--publishing-outbox-root",
    input.outboxDirectory,
  ];
  try {
    await writeCampaignState(stateRoot, input.state);
    await assert.rejects(
      publish.runPublish(args, {
        environment: { ...source, AUTO_PUBLISH: "false" },
        fetchImplementation,
      }),
      /disabled by AUTO_PUBLISH/,
    );
    assert.equal(requests.length, 0);
    const inactive = structuredClone(input.state);
    inactive.channels.instagram.stage = "media_verified";
    await writeCampaignState(stateRoot, inactive);
    await assert.rejects(
      publish.runPublish(args, { environment: source, fetchImplementation }),
      /persisted active intent/,
    );
    assert.equal(requests.length, 0);
    await writeCampaignState(stateRoot, input.state);
    await assert.rejects(
      publish.runPublish(args, { environment: source, fetchImplementation }),
      /Platform shadow deferred/,
    );
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0]!).origin, "https://publishing.example");
    assert.deepEqual(
      await readCampaignState(stateRoot, input.state.plan.localDate),
      input.state,
    );
    assert.equal((await readdir(input.outboxDirectory)).length, 1);
    requests.length = 0;
    await writeCampaignState(stateRoot, inactive);
    const intentArgs = args.map((value) =>
      value === "execute" ? "intent" : value,
    );
    await publish.runPublish(intentArgs, {
      environment: source,
      fetchImplementation,
    });
    assert.equal(requests.length, 0);
  } finally {
    await rm(input.renderRoot, { recursive: true, force: true });
  }
});

test("rejects non-origin endpoints and empty credentials before files", async () => {
  for (const override of [
    { PUBLISHING_ENDPOINT: "http://publishing.example" },
    { PUBLISHING_ENDPOINT: "https://publishing.example/path" },
    { PUBLISHING_ENDPOINT: "https://user:secret@publishing.example" },
    { PUBLISHING_ENDPOINT: "https://publishing.example?q=1" },
    { PUBLISHING_CLIENT_ID: " " },
    { PUBLISHING_CLIENT_SECRET: "" },
  ]) {
    await assert.rejects(
      bridge.submitPlatformShadow({
        state: campaignStateFixture(),
        renderRoot: "/missing",
        outboxDirectory: "/missing",
        environment: { ...environment, ...override },
      }),
      /PUBLISHING_SHADOW_CONFIGURATION_INVALID/,
    );
  }
});

test("rejects symlinked files and kind directories escaping render root before requests", async () => {
  for (const kind of ["file", "directory"]) {
    const input = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "troco-shadow-outside-"));
    let requests = 0;
    try {
      const target =
        kind === "file"
          ? join(input.directory, "video/short.mp4")
          : join(input.directory, "video");
      const destination = join(outside, kind);
      await rename(target, destination);
      await symlink(destination, target);
      await assert.rejects(
        bridge.submitPlatformShadow({
          ...input,
          fetchImplementation: async (_url, init) => {
            requests++;
            await new Response(init?.body).arrayBuffer();
            return Response.json(
              init?.method === "PUT"
                ? { status: "stored" }
                : { publicationId: "must-not-submit" },
            );
          },
        }),
        /PUBLISHING_SHADOW_MEDIA_INVALID/,
      );
      assert.equal(requests, 0);
      await assert.rejects(readdir(input.outboxDirectory), { code: "ENOENT" });
    } finally {
      await rm(input.renderRoot, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  }
});

test("filesystem and transport failures expose fixed codes without paths, credentials, or causes", async () => {
  const input = await fixture();
  const assertSafe = (expectedCode: string) => (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, `Platform shadow failed (${expectedCode})`);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(
      error.message,
      /test-secret|troco-shadow-.*\/|sensitive-detail/,
    );
    return true;
  };
  try {
    await assert.rejects(
      bridge.submitPlatformShadow({
        ...input,
        renderRoot: join(input.renderRoot, "test-secret-missing"),
      }),
      assertSafe("PUBLISHING_SHADOW_MEDIA_INVALID"),
    );
    await assert.rejects(
      bridge.submitPlatformShadow({
        ...input,
        fetchImplementation: async (_url, init) => {
          await new Response(init?.body).arrayBuffer();
          throw new Error(
            `sensitive-detail ${environment.PUBLISHING_CLIENT_SECRET} ${input.directory}`,
          );
        },
      }),
      assertSafe("PUBLISHING_SHADOW_SUBMISSION_FAILED"),
    );
    await writeFile(
      join(input.renderRoot, "test-secret-not-directory"),
      "blocked",
    );
    await assert.rejects(
      bridge.submitPlatformShadow({
        ...input,
        outboxDirectory: join(
          input.renderRoot,
          "test-secret-not-directory/outbox",
        ),
      }),
      assertSafe("PUBLISHING_SHADOW_SUBMISSION_FAILED"),
    );
  } finally {
    await rm(input.renderRoot, { recursive: true, force: true });
  }
});
