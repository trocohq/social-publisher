import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { prepareArtifactReference } from "@trebla/publishing";
import { mediaRecordFromState } from "../media/manifest.js";
import { campaignStateSchema, type CampaignState } from "../state/schema.js";

function approvalSha256(state: CampaignState): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        plan: state.plan,
        sourceCommits: state.sourceCommits,
        renderHashes: state.renderHashes,
      }),
    )
    .digest("hex");
}

export function checkpointMedia(input: CampaignState) {
  const state = campaignStateSchema.parse(input);
  const checkpoint = state.platformMedia;
  const media = mediaRecordFromState(state);
  if (
    !checkpoint ||
    checkpoint.approvalSha256 !== approvalSha256(state) ||
    checkpoint.assets.length !== media.assets.length
  ) {
    throw new Error("Platform media checkpoint does not match approval");
  }
  media.assets.forEach((asset, index) => {
    const verified = checkpoint.assets[index]!;
    if (verified.sha256 !== asset.hash) {
      throw new Error("Platform media checkpoint does not match artifact");
    }
    asset.bytes = verified.byteSize;
  });
  return media;
}

export function platformFilePaths(state: CampaignState, renderRoot: string) {
  const media = mediaRecordFromState(state);
  return media.assets.map((asset) =>
    resolve(
      renderRoot,
      media.localDate,
      media.campaignId,
      asset.kind,
      asset.filename,
    ),
  );
}

export async function verifyPlatformMedia(
  state: CampaignState,
  renderRoot: string,
) {
  const media = mediaRecordFromState(state);
  if (!(await lstat(renderRoot)).isDirectory())
    throw new Error("Platform render root must be a directory");
  const root = await realpath(renderRoot);
  const paths = platformFilePaths(state, root);
  for (const [index, asset] of media.assets.entries()) {
    const candidate = paths[index]!;
    for (const directory of [
      join(root, media.localDate),
      join(root, media.localDate, media.campaignId),
      join(root, media.localDate, media.campaignId, asset.kind),
    ]) {
      if (!(await lstat(directory)).isDirectory())
        throw new Error("Platform artifact parents must be directories");
    }
    const filePath = await realpath(candidate);
    const fromRoot = relative(root, filePath);
    if (
      fromRoot === ".." ||
      fromRoot.startsWith("../") ||
      isAbsolute(fromRoot) ||
      !(await lstat(candidate)).isFile()
    ) {
      throw new Error(
        "Platform artifact must be a regular file inside render root",
      );
    }
    const reference = await prepareArtifactReference({
      id: `media-${asset.hash}`,
      filePath,
      storage: "r2-temporary",
      locator: `temporary/troco/${media.campaignId}/${asset.kind}/${asset.hash}.${asset.kind === "feed" ? "jpg" : "mp4"}`,
      mediaType: asset.contentType,
      allowedMediaTypes: ["image/jpeg", "video/mp4"],
      maxByteSize: 50_000_000,
    });
    if (reference.sha256 !== asset.hash)
      throw new Error("Platform artifact does not match approved hash");
    asset.bytes = reference.byteSize;
  }
  if (state.platformMedia) {
    const expected = checkpointMedia(state);
    if (
      media.assets.some(
        (asset, index) => asset.bytes !== expected.assets[index]!.bytes,
      )
    ) {
      throw new Error("Platform artifact does not match verified size");
    }
  }
  return media;
}

export async function capturePlatformMedia(
  input: Readonly<{ state: CampaignState; renderRoot: string }>,
): Promise<CampaignState> {
  try {
    const state = campaignStateSchema.parse(input.state);
    if (state.platformMedia) {
      checkpointMedia(state);
      return state;
    }
    const media = await verifyPlatformMedia(state, input.renderRoot);
    return campaignStateSchema.parse({
      ...state,
      platformMedia: {
        schemaVersion: 1,
        approvalSha256: approvalSha256(state),
        assets: media.assets.map(({ hash, bytes }) => ({
          sha256: hash,
          byteSize: bytes,
        })),
      },
    });
  } catch {
    throw new Error("Platform shadow failed (PUBLISHING_SHADOW_MEDIA_INVALID)");
  }
}
