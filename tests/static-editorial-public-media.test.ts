import assert from "node:assert/strict";
import test from "node:test";

import { verifyApprovedPublicMedia } from "../src/static-editorial/public-media.js";
import { sha256 } from "../src/shared/determinism.js";

const bytes = Buffer.from("jpeg-bytes");
const artifact = {
  locator: "https://trocohq.github.io/social-publisher/static/post/slide.jpg",
  sha256: sha256(bytes),
  byteSize: bytes.byteLength,
  mediaType: "image/jpeg" as const,
};

test("verifies the complete public response against approved bytes", async () => {
  const requests: Request[] = [];
  await verifyApprovedPublicMedia([artifact], async (request) => {
    requests.push(request);
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(bytes.byteLength),
      },
    });
  });
  assert.equal(requests[0]!.method, "GET");
  assert.equal(requests[0]!.headers.get("cache-control"), "no-cache");
});

test("rejects unavailable, wrong-type and changed public media", async () => {
  await assert.rejects(
    verifyApprovedPublicMedia(
      [artifact],
      async () => new Response(null, { status: 404 }),
    ),
    /STATIC_PUBLIC_MEDIA_UNAVAILABLE/u,
  );
  await assert.rejects(
    verifyApprovedPublicMedia(
      [artifact],
      async () =>
        new Response(bytes, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    ),
    /STATIC_PUBLIC_MEDIA_TYPE_MISMATCH/u,
  );
  await assert.rejects(
    verifyApprovedPublicMedia(
      [artifact],
      async () =>
        new Response("changed!!", {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    ),
    /STATIC_PUBLIC_MEDIA_BYTES_MISMATCH/u,
  );
});
