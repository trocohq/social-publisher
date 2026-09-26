import { fileURLToPath } from "node:url";

import type { PublicationEnvelope } from "@trebla/publishing";

import { createBufferPost } from "../networks/buffer/posts.js";
import { reconcileBufferPost } from "../networks/buffer/reconcile.js";
import { runBufferPreflight } from "../networks/buffer/preflight.js";
import { createStaticBufferAdapter } from "../static-editorial/buffer.js";

import {
  runStaticEditorialCycle,
  type ApprovedStaticTarget,
  type PendingStaticIntent,
  type StaticCycleSummary,
} from "../static-editorial/cycle.js";
import {
  createGitHubPrivateInputTransport,
  createGitHubStaticStoreBackend,
} from "../static-editorial/github-runtime.js";
import { createStaticProductionRuntime } from "../static-editorial/production-runtime.js";
import { verifyApprovedPublicMedia } from "../static-editorial/public-media.js";
import { loadApprovedRuntimeManifest } from "../static-editorial/runtime-manifest.js";
import { openPrivateStaticStore } from "../static-editorial/store.js";

type ExecutionMode = "scheduled" | "reconcile-only";
type Environment = Readonly<Record<string, string | undefined>>;
export type StaticExecutionPlan = Readonly<{
  mode: ExecutionMode;
  repositoryId: number;
  ref: string;
  status: "ready";
}>;

export function planStaticEditorialExecution(
  input: Readonly<{ args: readonly string[]; env: Environment }>,
): StaticExecutionPlan {
  if (
    input.args.length !== 2 ||
    input.args[0] !== "--mode" ||
    (input.args[1] !== "scheduled" && input.args[1] !== "reconcile-only")
  )
    throw new Error("STATIC_EXECUTION_ARGUMENT_INVALID");
  const mode = input.args[1];
  const expectedEvent = mode === "scheduled" ? "schedule" : "workflow_dispatch";
  if (input.env.GITHUB_EVENT_NAME !== expectedEvent)
    throw new Error("STATIC_EXECUTION_MODE_FORBIDDEN");
  if (input.env.STATIC_EDITORIAL_ENABLED !== "true")
    throw new Error("STATIC_EXECUTION_DISABLED");
  if (input.env.ZERO_COST_CONFIRMED !== "true")
    throw new Error("STATIC_ZERO_COST_UNVERIFIED");
  for (const name of [
    "STATIC_EDITORIAL_REPOSITORY",
    "PRIVATE_EDITORIAL_TOKEN",
    "STATIC_STATE_TOKEN",
    "BUFFER_API_KEY",
  ] as const) {
    if (!input.env[name])
      throw new Error(`STATIC_EXECUTION_CONFIG_MISSING:${name}`);
  }
  const repositoryId = Number(input.env.STATIC_EDITORIAL_REPOSITORY_ID);
  const ref = input.env.STATIC_EDITORIAL_REF ?? "";
  if (
    !Number.isSafeInteger(repositoryId) ||
    repositoryId < 1 ||
    !/^[0-9a-f]{40}$/u.test(ref)
  )
    throw new Error("STATIC_EXECUTION_IDENTITY_INVALID");
  return { mode, repositoryId, ref, status: "ready" };
}

export async function executePlannedStaticEditorial(
  input: Readonly<{
    plan: StaticExecutionPlan;
    runtime: Readonly<{
      loadPending(
        plan: StaticExecutionPlan,
      ): Promise<readonly PendingStaticIntent[]>;
      loadApproved(
        plan: StaticExecutionPlan,
      ): Promise<readonly ApprovedStaticTarget[]>;
      reconcile(item: PendingStaticIntent): Promise<"reconciled" | "uncertain">;
      schedule(item: ApprovedStaticTarget): Promise<"accepted" | "uncertain">;
    }>;
  }>,
): Promise<StaticCycleSummary> {
  const pending = await input.runtime.loadPending(input.plan);
  const approved =
    input.plan.mode === "scheduled"
      ? await input.runtime.loadApproved(input.plan)
      : [];
  return runStaticEditorialCycle({
    mode: input.plan.mode,
    pending,
    approved,
    reconcile: input.runtime.reconcile,
    schedule: input.runtime.schedule,
  });
}

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`STATIC_EXECUTION_CONFIG_MISSING:${name}`);
  return value;
}

export async function runStaticEditorialMain(
  input: Readonly<{
    args: readonly string[];
    env: Environment;
    fetchImplementation?: typeof fetch;
    now?: () => Date;
  }>,
): Promise<StaticCycleSummary> {
  const plan = planStaticEditorialExecution(input);
  const repository = required(input.env, "STATIC_EDITORIAL_REPOSITORY");
  const inputToken = required(input.env, "PRIVATE_EDITORIAL_TOKEN");
  const stateToken = required(input.env, "STATIC_STATE_TOKEN");
  const bufferApiKey = required(input.env, "BUFFER_API_KEY");
  const organizationId = required(input.env, "BUFFER_ORGANIZATION_ID");
  const instagramId = required(input.env, "BUFFER_INSTAGRAM_CHANNEL_ID");
  const facebookId = required(input.env, "BUFFER_FACEBOOK_CHANNEL_ID");
  const manifestPath = required(input.env, "STATIC_EDITORIAL_MANIFEST_PATH");
  const publicOrigin = required(input.env, "STATIC_MEDIA_ORIGIN");
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const namespace = "static-editorial-v1";
  const store = await openPrivateStaticStore({
    backend: createGitHubStaticStoreBackend({
      repository,
      repositoryId: plan.repositoryId,
      branch: "main",
      namespace,
      token: stateToken,
      fetchImplementation: async (request) =>
        fetchImplementation(request) as Promise<Response>,
    }),
    expectedAccountId: String(plan.repositoryId),
    expectedNamespace: namespace,
  });
  const privateTransport = createGitHubPrivateInputTransport(
    inputToken,
    async (request) => fetchImplementation(request) as Promise<Response>,
  );
  const expectedAccountIds = {
    instagram: instagramId,
    facebook: facebookId,
  } as const;
  const adapter = createStaticBufferAdapter({
    create: async (postInput) => {
      const result = await createBufferPost({
        apiKey: bufferApiKey,
        input: postInput,
        fetchImplementation,
      });
      if (result.kind !== "success") throw new Error(result.category);
      return { kind: "accepted", providerId: result.value.id };
    },
  });
  const runtime = createStaticProductionRuntime({
    now: input.now ?? (() => new Date()),
    loadManifest: () =>
      loadApprovedRuntimeManifest({
        repository,
        repositoryId: plan.repositoryId,
        ref: plan.ref,
        manifestPath,
        publicOrigin,
        transport: privateTransport,
      }),
    store,
    expectedAccountIds,
    preflight: ({ channel }) =>
      runBufferPreflight({
        apiKey: bufferApiKey,
        organizationId,
        expectedChannelIds: { [channel]: expectedAccountIds[channel] },
        requiredSlots: {
          instagram: channel === "instagram" ? 1 : 0,
          facebook: channel === "facebook" ? 1 : 0,
          tiktok: 0,
          youtube: 0,
        },
        fetchImplementation,
      }),
    verifyPublic: (approved) =>
      verifyApprovedPublicMedia(approved.artifacts, fetchImplementation),
    create: async (target) => {
      const result = await adapter.create(
        target.intent.envelope as PublicationEnvelope,
        target.deliveryId,
      );
      return { providerId: result.providerId };
    },
    reconcile: async (target, existingProviderId) => {
      const channelTarget = target.input.entry.channels.find(
        (candidate) => candidate.channel === target.channel,
      )!;
      const result = await reconcileBufferPost({
        apiKey: bufferApiKey,
        organizationId,
        expected: {
          channelId: expectedAccountIds[target.channel],
          ...(existingProviderId ? { providerId: existingProviderId } : {}),
          dueAt: new Date(channelTarget.publishAt).toISOString(),
          text: channelTarget.copy,
          mediaUrls: target.input.artifacts.map((artifact) => artifact.locator),
        },
        fetchImplementation,
      });
      if (result.kind !== "success") throw new Error(result.category);
      if (!result.value) return { kind: "missing" };
      return {
        kind: "found",
        providerId: result.value.id,
        status:
          result.value.status === "publishing"
            ? "processing"
            : result.value.status,
      };
    },
  });
  return executePlannedStaticEditorial({ plan, runtime });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const summary = await runStaticEditorialMain({
    args: process.argv.slice(2),
    env: process.env,
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
