export type StaticIntent = Readonly<{
  logicalKey: string;
  fence: number;
  envelopeSha256: `sha256:${string}`;
  envelope: unknown;
}>;

type StoredIntent = StaticIntent &
  Readonly<{ state: "intent" | "uncertain" | "accepted" }>;
type CreateResult = Readonly<{ kind: "accepted"; providerId: string }>;
type ReconcileResult = Readonly<
  | { kind: "missing" }
  | {
      kind: "found";
      providerId: string;
      status: "scheduled" | "processing" | "published";
    }
>;

export interface StaticExecutionStore {
  claim(logicalKey: string, fence: number): Promise<boolean>;
  read(logicalKey: string): Promise<StoredIntent | null>;
  persistIntent(intent: StaticIntent): Promise<void>;
  persistOutcome(
    logicalKey: string,
    outcome: "accepted" | "uncertain",
    providerId?: string,
  ): Promise<void>;
}

export async function executeStaticIntent(
  input: Readonly<{
    intent: StaticIntent;
    store: StaticExecutionStore;
    transport: Readonly<{
      create(envelope: unknown): Promise<CreateResult>;
      reconcile(intent: StaticIntent): Promise<ReconcileResult>;
    }>;
  }>,
): Promise<CreateResult | ReconcileResult | Readonly<{ kind: "uncertain" }>> {
  if (!(await input.store.claim(input.intent.logicalKey, input.intent.fence)))
    throw new Error("STATIC_EXECUTION_NOT_OWNER");
  const stored = await input.store.read(input.intent.logicalKey);
  if (
    stored &&
    (stored.envelopeSha256 !== input.intent.envelopeSha256 ||
      JSON.stringify(stored.envelope) !== JSON.stringify(input.intent.envelope))
  )
    throw new Error("STATIC_EXECUTION_INTENT_MISMATCH");
  if (stored?.state === "uncertain" || stored?.state === "accepted")
    return input.transport.reconcile(input.intent);
  if (!stored) await input.store.persistIntent(input.intent);
  try {
    const result = await input.transport.create(
      structuredClone(input.intent.envelope),
    );
    await input.store.persistOutcome(
      input.intent.logicalKey,
      "accepted",
      result.providerId,
    );
    return result;
  } catch {
    await input.store.persistOutcome(input.intent.logicalKey, "uncertain");
    return { kind: "uncertain" };
  }
}

function sameIntent(left: StaticIntent, right: StaticIntent): boolean {
  return (
    left.logicalKey === right.logicalKey &&
    left.fence === right.fence &&
    left.envelopeSha256 === right.envelopeSha256 &&
    JSON.stringify(left.envelope) === JSON.stringify(right.envelope)
  );
}

function storedIntent(value: unknown): StoredIntent {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("STATIC_EXECUTION_RECORD_INVALID");
  const record = value as Partial<StoredIntent>;
  if (
    !record.logicalKey ||
    !Number.isSafeInteger(record.fence) ||
    !record.envelopeSha256 ||
    !(
      record.state === "intent" ||
      record.state === "uncertain" ||
      record.state === "accepted"
    )
  )
    throw new Error("STATIC_EXECUTION_RECORD_INVALID");
  return record as StoredIntent;
}

export async function executeStaticIntentWithCas(
  input: Readonly<{
    intent: StaticIntent;
    store: StaticStore;
    transport: Readonly<{
      create(envelope: unknown): Promise<CreateResult>;
      reconcile(intent: StaticIntent): Promise<ReconcileResult>;
    }>;
    failpoint?: "after-handoff" | "after-intent" | "after-create";
  }>,
): Promise<CreateResult | ReconcileResult | Readonly<{ kind: "uncertain" }>> {
  const savedHandoff = await input.store.readHandoff(input.intent.logicalKey);
  if (savedHandoff) {
    if (
      !sameIntent(
        storedIntent({ ...(savedHandoff.value as object), state: "intent" }),
        input.intent,
      )
    )
      throw new Error("STATIC_EXECUTION_INTENT_MISMATCH");
  } else {
    await input.store.compareAndSwapHandoff(
      input.intent.logicalKey,
      null,
      input.intent,
    );
  }
  if (input.failpoint === "after-handoff")
    throw new Error("STATIC_EXECUTION_FAILPOINT");
  const saved = await input.store.read(input.intent.logicalKey);
  if (saved) {
    const recorded = storedIntent(saved.value);
    if (recorded.fence !== input.intent.fence)
      throw new Error("STATIC_EXECUTION_NOT_OWNER");
    if (!sameIntent(recorded, input.intent))
      throw new Error("STATIC_EXECUTION_INTENT_MISMATCH");
    return input.transport.reconcile(recorded);
  }
  const persisted = await input.store.compareAndSwap(
    input.intent.logicalKey,
    null,
    { ...input.intent, state: "intent" },
  );
  if (input.failpoint === "after-intent")
    throw new Error("STATIC_EXECUTION_FAILPOINT");
  try {
    const result = await input.transport.create(
      structuredClone(input.intent.envelope),
    );
    if (input.failpoint === "after-create")
      throw new Error("STATIC_EXECUTION_FAILPOINT");
    await input.store.compareAndSwap(
      input.intent.logicalKey,
      persisted.version,
      { ...input.intent, state: "accepted", providerId: result.providerId },
    );
    return result;
  } catch {
    await input.store.compareAndSwap(
      input.intent.logicalKey,
      persisted.version,
      { ...input.intent, state: "uncertain" },
    );
    return { kind: "uncertain" };
  }
}
import type { StaticStore } from "./store.js";
