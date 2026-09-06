import { mediaRecordFromState } from "../media/manifest.js";
import { publicMediaUrls } from "../media/pages.js";
import {
  createBufferPost,
  createBufferPostInput,
} from "../networks/buffer/posts.js";
import { reconcileBufferPost } from "../networks/buffer/reconcile.js";
import type { PublisherEnvironment } from "../config/environment.js";
import {
  campaignStateSchema,
  type CampaignState,
  type InstagramStory,
} from "../state/schema.js";

function withStory(state: CampaignState, story: InstagramStory): CampaignState {
  return campaignStateSchema.parse({ ...state, instagramStory: story });
}

export function prepareStory(state: CampaignState, now: Date): CampaignState {
  if (
    state.instagramStory?.stage !== "pending" ||
    state.channels.instagram.stage !== "published" ||
    state.media.stage !== "media_verified"
  )
    return state;
  return withStory(state, { stage: "uncertain", intentAt: now.toISOString() });
}

export function storyText(state: CampaignState): string {
  // Distinct from the Reel caption so recovery cannot match the primary post.
  return `Novo no Troco: ${state.plan.copy.headline}\nStory • ${state.plan.id}`;
}

export async function deliverStory({
  state,
  environment,
  allowCreate,
  now,
  fetchImplementation,
}: Readonly<{
  state: CampaignState;
  environment: PublisherEnvironment;
  allowCreate: boolean;
  now: Date;
  fetchImplementation?: typeof fetch;
}>): Promise<CampaignState> {
  const story = state.instagramStory;
  if (
    !environment.enabled.instagram ||
    !story ||
    !["uncertain", "accepted"].includes(story.stage)
  )
    return state;
  if (
    state.channels.instagram.stage !== "published" ||
    state.media.stage !== "media_verified" ||
    !story.intentAt
  ) {
    throw new Error(
      "Story requires verified media, a published primary post and persisted intent",
    );
  }
  const { apiKey, organizationId } = environment.buffer;
  const channelId = environment.buffer.channelIds.instagram;
  if (!apiKey || !organizationId || !channelId) {
    throw new Error("Instagram Story provider credentials are unavailable");
  }
  const urls = publicMediaUrls(
    environment.pagesOrigin,
    mediaRecordFromState(state),
  );
  const text = storyText(state);
  const transport = fetchImplementation ? { fetchImplementation } : {};
  const found = await reconcileBufferPost({
    apiKey,
    organizationId,
    expected: {
      channelId,
      text,
      mediaUrls: [urls.video],
      attemptedAt: [story.intentAt],
      ...(story.providerId ? { providerId: story.providerId } : {}),
    },
    ...transport,
  });
  let outcome = found;
  if (found.kind === "success" && !found.value) {
    if (!allowCreate || story.providerId || story.stage !== "uncertain") {
      return withStory(state, {
        ...story,
        lastError: {
          category: "story_confirmation_pending",
          message:
            "Story delivery is unconfirmed; reconcile before any manual retry",
        },
      });
    }
    outcome = await createBufferPost({
      apiKey,
      input: createBufferPostInput({
        channel: "instagram",
        channelId,
        text,
        dueAt: story.intentAt,
        phase: "publishing",
        mediaKind: "video",
        mediaUrls: [urls.video],
        placement: "story",
      }),
      ...transport,
    });
  }
  if (outcome.kind !== "success") {
    return withStory(state, {
      ...story,
      stage: outcome.kind === "permanent_error" ? "failed" : story.stage,
      lastError: { category: outcome.category, message: outcome.message },
    });
  }
  if (!outcome.value) return state;
  return withStory(state, {
    ...story,
    lastError: undefined,
    providerId: outcome.value.id,
    stage: outcome.value.status === "published" ? "published" : "accepted",
    ...(outcome.value.status === "published"
      ? { publishedAt: now.toISOString() }
      : {}),
  });
}
