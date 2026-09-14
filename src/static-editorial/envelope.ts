import {
  validatePublicationEnvelope,
  type ArtifactReference,
  type PublicationEnvelope,
} from "@trebla/publishing";

import { sha256 } from "../shared/determinism.js";
import { canonicalJson } from "./revision.js";
import type { StaticEditorialEntry } from "./schema.js";

type AccountIds = Partial<
  Record<StaticEditorialEntry["channels"][number]["channel"], string>
>;

export function toStaticEnvelope(
  input: Readonly<{
    entry: StaticEditorialEntry;
    approvalRevision: `sha256:${string}`;
    intentGeneration: number;
    artifacts: readonly ArtifactReference[];
    expectedAccountIds: AccountIds;
  }>,
): PublicationEnvelope {
  if (
    !Number.isSafeInteger(input.intentGeneration) ||
    input.intentGeneration < 0
  )
    throw new Error("STATIC_INTENT_GENERATION_INVALID");
  if (input.artifacts.length !== input.entry.slides.length)
    throw new Error("STATIC_ARTIFACT_COUNT_MISMATCH");
  const artifactIds = input.artifacts.map((artifact) => artifact.id);
  const deliveries = input.entry.channels.map((target) => {
    if (target.placement !== "feed")
      throw new Error("STATIC_BUFFER_PLACEMENT_UNSUPPORTED");
    const expectedAccountId = input.expectedAccountIds[target.channel];
    if (!expectedAccountId?.trim())
      throw new Error("STATIC_BUFFER_ACCOUNT_REQUIRED");
    return {
      id: `${target.channel}-${target.placement}`,
      adapter: "social.buffer",
      operation: "publish",
      required: true,
      payload: { type: "social.post", text: target.copy, artifactIds },
      providerOptions: {
        contractVersion: "runner-static-scheduled-v1",
        channel: target.channel,
        placement: target.placement,
        mode: "customScheduled",
        dueAt: new Date(target.publishAt).toISOString(),
        expectedAccountId,
        imageAltText: input.entry.slides.map((slide) => slide.alt),
      },
    };
  });
  const intentRevision = `sha256:${sha256(
    canonicalJson({
      logicalKey: input.entry.id,
      approvalRevision: input.approvalRevision,
      intentGeneration: input.intentGeneration,
    }),
  )}`;
  return validatePublicationEnvelope({
    schemaVersion: 1,
    identity: {
      tenant: input.entry.brand,
      sourceType: "static-editorial",
      sourceId: input.entry.id,
      revision: input.approvalRevision,
      idempotencyKey: `${input.entry.id}:${intentRevision}:${input.intentGeneration}`,
    },
    canonical: {
      title: input.entry.slides[0]!.title,
      summary: input.entry.slides[0]!.body,
      language: "pt-BR",
    },
    artifacts: [...input.artifacts],
    deliveries,
  });
}
