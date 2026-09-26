import { Buffer } from "node:buffer";

import { sha256 } from "../shared/determinism.js";

type PublicArtifact = Readonly<{
  locator: string;
  sha256: string;
  byteSize: number;
  mediaType: "image/jpeg";
}>;

export async function verifyApprovedPublicMedia(
  artifacts: readonly PublicArtifact[],
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  if (artifacts.length < 1 || artifacts.length > 5)
    throw new Error("STATIC_PUBLIC_MEDIA_COUNT_INVALID");
  for (const artifact of artifacts) {
    const url = new URL(artifact.locator);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      artifact.byteSize < 1 ||
      artifact.byteSize > 8_000_000 ||
      !/^[a-f0-9]{64}$/u.test(artifact.sha256)
    )
      throw new Error("STATIC_PUBLIC_MEDIA_IDENTITY_INVALID");
    const response = await fetchImplementation(
      new Request(url, {
        method: "GET",
        headers: { accept: "image/jpeg", "cache-control": "no-cache" },
      }),
    );
    if (!response.ok) throw new Error("STATIC_PUBLIC_MEDIA_UNAVAILABLE");
    const contentType = response.headers.get("content-type")?.split(";", 1)[0];
    if (contentType !== artifact.mediaType)
      throw new Error("STATIC_PUBLIC_MEDIA_TYPE_MISMATCH");
    const declaredLength = response.headers.get("content-length");
    if (
      declaredLength !== null &&
      (!/^\d+$/u.test(declaredLength) ||
        Number(declaredLength) !== artifact.byteSize)
    )
      throw new Error("STATIC_PUBLIC_MEDIA_BYTES_MISMATCH");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.byteLength !== artifact.byteSize ||
      sha256(Buffer.from(bytes)) !== artifact.sha256
    )
      throw new Error("STATIC_PUBLIC_MEDIA_BYTES_MISMATCH");
  }
}
