import { Buffer } from "node:buffer";
import type { StaticStoreBackend } from "./store.js";

type FetchRequest = (request: Request) => Promise<Response>;
const API_ROOT = "https://api.github.com";

function apiRequest(token: string, url: string, init?: RequestInit): Request {
  if (!token.trim()) throw new Error("STATIC_GITHUB_TOKEN_REQUIRED");
  return new Request(url, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}
function repositoryUrl(repository: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository))
    throw new Error("STATIC_GITHUB_REPOSITORY_INVALID");
  return `${API_ROOT}/repos/${repository}`;
}
function contentUrl(
  repository: string,
  pathValue: string,
  ref?: string,
): string {
  if (
    !pathValue ||
    pathValue.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("STATIC_GITHUB_PATH_INVALID");
  const encoded = pathValue.split("/").map(encodeURIComponent).join("/");
  return `${repositoryUrl(repository)}/contents/${encoded}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
}
async function json(response: Response): Promise<Record<string, unknown>> {
  const value = (await response.json()) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("STATIC_GITHUB_RESPONSE_INVALID");
  return value as Record<string, unknown>;
}
function decodeFile(value: Record<string, unknown>): Uint8Array {
  if (
    value.type !== "file" ||
    value.encoding !== "base64" ||
    typeof value.content !== "string"
  )
    throw new Error("STATIC_GITHUB_RESPONSE_INVALID");
  return new Uint8Array(
    Buffer.from(value.content.replaceAll("\n", ""), "base64"),
  );
}

export function createGitHubPrivateInputTransport(
  token: string,
  fetchImplementation: FetchRequest = fetch,
) {
  return {
    async repository(repository: string) {
      const response = await fetchImplementation(
        apiRequest(token, repositoryUrl(repository)),
      );
      if (!response.ok)
        throw new Error(`STATIC_GITHUB_REPOSITORY_HTTP_${response.status}`);
      const value = await json(response);
      if (
        typeof value.id !== "number" ||
        typeof value.full_name !== "string" ||
        typeof value.private !== "boolean"
      )
        throw new Error("STATIC_GITHUB_RESPONSE_INVALID");
      return {
        id: value.id,
        fullName: value.full_name,
        private: value.private,
        authenticated: true as const,
      };
    },
    async readFile(
      repository: string,
      ref: string,
      pathValue: string,
    ): Promise<Uint8Array> {
      if (!/^[0-9a-f]{40}$/u.test(ref))
        throw new Error("STATIC_PRIVATE_REF_NOT_PINNED");
      const response = await fetchImplementation(
        apiRequest(token, contentUrl(repository, pathValue, ref)),
      );
      if (!response.ok)
        throw new Error(`STATIC_GITHUB_CONTENT_HTTP_${response.status}`);
      return decodeFile(await json(response));
    },
  };
}

export function createGitHubStaticStoreBackend(
  input: Readonly<{
    repository: string;
    repositoryId: number;
    branch: string;
    namespace: string;
    token: string;
    fetchImplementation?: FetchRequest;
  }>,
): StaticStoreBackend {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  if (!/^[A-Za-z0-9._/-]+$/u.test(input.branch) || !input.namespace.trim())
    throw new Error("STATIC_STORE_CONFIG_INVALID");
  return {
    async identity() {
      const response = await fetchImplementation(
        apiRequest(input.token, repositoryUrl(input.repository)),
      );
      if (!response.ok)
        throw new Error(`STATIC_STORE_IDENTITY_HTTP_${response.status}`);
      const value = await json(response);
      if (
        value.id !== input.repositoryId ||
        value.full_name !== input.repository ||
        value.private !== true
      )
        throw new Error("STATIC_STORE_IDENTITY_INVALID");
      return {
        accountId: String(input.repositoryId),
        namespace: input.namespace,
        private: true,
      };
    },
    async read(pathValue) {
      const response = await fetchImplementation(
        apiRequest(
          input.token,
          contentUrl(input.repository, pathValue, input.branch),
        ),
      );
      if (response.status === 404) return null;
      if (!response.ok)
        throw new Error(`STATIC_STORE_READ_HTTP_${response.status}`);
      const value = await json(response);
      if (typeof value.sha !== "string")
        throw new Error("STATIC_GITHUB_RESPONSE_INVALID");
      return { bytes: decodeFile(value), version: value.sha };
    },
    async compareAndSwap(change) {
      const body = {
        message: "chore(state): update static editorial record [skip ci]",
        content: Buffer.from(change.bytes).toString("base64"),
        branch: input.branch,
        ...(change.expectedVersion ? { sha: change.expectedVersion } : {}),
      };
      const response = await fetchImplementation(
        apiRequest(input.token, contentUrl(input.repository, change.path), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      if (response.status === 409 || response.status === 422)
        throw new Error("STATIC_STORE_CONFLICT");
      if (!response.ok)
        throw new Error(`STATIC_STORE_WRITE_HTTP_${response.status}`);
      const value = await json(response);
      const content = value.content;
      if (
        typeof content !== "object" ||
        content === null ||
        Array.isArray(content)
      )
        throw new Error("STATIC_GITHUB_RESPONSE_INVALID");
      const sha = (content as Record<string, unknown>).sha;
      if (typeof sha !== "string")
        throw new Error("STATIC_GITHUB_RESPONSE_INVALID");
      return sha;
    },
  };
}
