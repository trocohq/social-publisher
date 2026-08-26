import { sha256 } from "../shared/determinism.js";

export type VerifiedPublicAsset = Readonly<{
  url: string;
  hash: string;
  bytes: number;
  contentType: string;
}>;

export async function verifyPublicAsset({
  url,
  expectedHash,
  expectedContentType,
  expectedLength,
  allowHttpForTest = false,
  fetchImplementation = fetch,
}: Readonly<{
  url: string;
  expectedHash: string;
  expectedContentType: "image/jpeg" | "video/mp4";
  expectedLength?: number;
  allowHttpForTest?: boolean;
  fetchImplementation?: typeof fetch;
}>): Promise<VerifiedPublicAsset> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !(allowHttpForTest && parsed.protocol === "http:")
  ) {
    throw new Error("Public media verification requires HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Public media URL cannot contain credentials");
  }
  const response = await fetchImplementation(parsed, {
    method: "GET",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200) {
    throw new Error(`Public media returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType !== expectedContentType) {
    throw new Error(
      `Public media content type mismatch: expected ${expectedContentType}, received ${contentType}`,
    );
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    expectedLength !== undefined &&
    Number.isFinite(declaredLength) &&
    declaredLength !== expectedLength
  ) {
    throw new Error("Public media byte length mismatch");
  }
  if (declaredLength > 50_000_000) {
    throw new Error("Public media exceeds 50 MB");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 50_000_000) throw new Error("Public media exceeds 50 MB");
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error("Public media byte length mismatch");
  }
  const hash = sha256(bytes);
  if (hash !== expectedHash) throw new Error("Public media hash mismatch");
  return Object.freeze({
    url: parsed.toString(),
    hash,
    bytes: bytes.length,
    contentType,
  });
}
