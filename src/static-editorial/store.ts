import { createHash } from "node:crypto";

import { canonicalJson } from "./revision.js";

export interface StaticStoreBackend {
  identity(): Promise<
    Readonly<{ accountId: string; namespace: string; private: boolean }>
  >;
  read(
    path: string,
  ): Promise<Readonly<{ bytes: Uint8Array; version: string }> | null>;
  compareAndSwap(
    input: Readonly<{
      path: string;
      expectedVersion: string | null;
      bytes: Uint8Array;
    }>,
  ): Promise<string>;
}

export type StoredStaticValue = Readonly<{ version: string; value: unknown }>;
export interface StaticStore {
  read(logicalKey: string): Promise<StoredStaticValue | null>;
  compareAndSwap(
    logicalKey: string,
    expectedVersion: string | null,
    next: unknown,
  ): Promise<Readonly<{ version: string }>>;
  readHandoff(logicalKey: string): Promise<StoredStaticValue | null>;
  compareAndSwapHandoff(
    logicalKey: string,
    expectedVersion: string | null,
    next: unknown,
  ): Promise<Readonly<{ version: string }>>;
}

function assertJson(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach(assertJson);
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (!key || child === undefined)
        throw new Error("STATIC_STORE_VALUE_INVALID");
      assertJson(child);
    }
    return;
  }
  throw new Error("STATIC_STORE_VALUE_INVALID");
}

function storagePath(kind: "records" | "handoffs", logicalKey: string): string {
  if (!/^[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/u.test(logicalKey))
    throw new Error("STATIC_STORE_KEY_INVALID");
  return `${kind}/${createHash("sha256").update(logicalKey).digest("hex")}.json`;
}

export async function openPrivateStaticStore(
  input: Readonly<{
    backend: StaticStoreBackend;
    expectedAccountId: string;
    expectedNamespace: string;
    maxBytes?: number;
  }>,
): Promise<StaticStore> {
  const identity = await input.backend.identity();
  if (
    !input.expectedAccountId.trim() ||
    !input.expectedNamespace.trim() ||
    identity.private !== true ||
    identity.accountId !== input.expectedAccountId ||
    identity.namespace !== input.expectedNamespace
  )
    throw new Error("STATIC_STORE_IDENTITY_INVALID");
  const maxBytes = input.maxBytes ?? 262_144;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error("STATIC_STORE_SIZE_INVALID");

  async function read(
    kind: "records" | "handoffs",
    logicalKey: string,
  ): Promise<StoredStaticValue | null> {
    const stored = await input.backend.read(storagePath(kind, logicalKey));
    if (!stored) return null;
    if (stored.bytes.byteLength > maxBytes)
      throw new Error("STATIC_STORE_SIZE_EXCEEDED");
    let decoded: unknown;
    try {
      decoded = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(stored.bytes),
      ) as unknown;
    } catch {
      throw new Error("STATIC_STORE_VALUE_INVALID");
    }
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      Array.isArray(decoded) ||
      Object.keys(decoded).sort().join(",") !== "logicalKey,value"
    )
      throw new Error("STATIC_STORE_VALUE_INVALID");
    const record = decoded as { logicalKey: unknown; value: unknown };
    if (record.logicalKey !== logicalKey)
      throw new Error("STATIC_STORE_KEY_INVALID");
    assertJson(record.value);
    const canonical = new TextEncoder().encode(`${canonicalJson(record)}\n`);
    if (
      canonical.byteLength !== stored.bytes.byteLength ||
      !canonical.every((byte, index) => byte === stored.bytes[index])
    )
      throw new Error("STATIC_STORE_VALUE_INVALID");
    return { version: stored.version, value: record.value };
  }

  async function compareAndSwap(
    kind: "records" | "handoffs",
    logicalKey: string,
    expectedVersion: string | null,
    next: unknown,
  ) {
    assertJson(next);
    const bytes = new TextEncoder().encode(
      `${canonicalJson({ logicalKey, value: next })}\n`,
    );
    if (bytes.byteLength > maxBytes)
      throw new Error("STATIC_STORE_SIZE_EXCEEDED");
    return {
      version: await input.backend.compareAndSwap({
        path: storagePath(kind, logicalKey),
        expectedVersion,
        bytes,
      }),
    };
  }

  return {
    read: (key) => read("records", key),
    compareAndSwap: (key, version, next) =>
      compareAndSwap("records", key, version, next),
    readHandoff: (key) => read("handoffs", key),
    compareAndSwapHandoff: (key, version, next) =>
      compareAndSwap("handoffs", key, version, next),
  };
}
