const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export type YouTubeAccessTokenProvider = Readonly<{
  getAccessToken: (now?: Date) => Promise<string>;
}>;

export function createYouTubeAccessTokenProvider({
  clientId,
  clientSecret,
  refreshToken,
  fetchImplementation = fetch,
}: Readonly<{
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImplementation?: typeof fetch;
}>): YouTubeAccessTokenProvider {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YouTube OAuth credentials are incomplete");
  }
  let cached: { value: string; expiresAt: number } | undefined;

  return Object.freeze({
    async getAccessToken(now = new Date()): Promise<string> {
      if (Number.isNaN(now.valueOf())) throw new Error("Invalid OAuth clock");
      if (cached && now.valueOf() < cached.expiresAt - 60_000) {
        return cached.value;
      }
      let response: Response;
      try {
        response = await fetchImplementation(TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new Error("YouTube OAuth endpoint could not be reached");
      }
      if (!response.ok) {
        throw new Error(
          response.status === 400 || response.status === 401
            ? "YouTube OAuth credentials were rejected"
            : "YouTube OAuth failed temporarily",
        );
      }
      const payload = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
        token_type?: string;
      };
      if (
        !payload.access_token ||
        payload.token_type?.toLowerCase() !== "bearer" ||
        !Number.isFinite(payload.expires_in) ||
        Number(payload.expires_in) < 120
      ) {
        throw new Error("YouTube OAuth returned an invalid token response");
      }
      cached = {
        value: payload.access_token,
        expiresAt: now.valueOf() + Number(payload.expires_in) * 1_000,
      };
      return cached.value;
    },
  });
}
