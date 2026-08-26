import type { SanitizedError } from "../state/schema.js";

const INCIDENT_LABEL = "social-publisher-incident";
const INCIDENT_TITLE = "Social publisher incident";

export type IncidentMode = "failure" | "recovery";
export type GithubIssue = Readonly<{
  number: number;
  state: "open" | "closed";
  labels: readonly ({ name?: string } | string)[];
  body?: string | null;
  pull_request?: unknown;
}>;

export type IncidentMutation =
  | Readonly<{ kind: "create" }>
  | Readonly<{ kind: "update"; issueNumber: number }>
  | Readonly<{ kind: "close"; issueNumber: number }>
  | Readonly<{ kind: "none" }>;

function hasIncidentLabel(issue: GithubIssue): boolean {
  return issue.labels.some((label) =>
    typeof label === "string"
      ? label === INCIDENT_LABEL
      : label.name === INCIDENT_LABEL,
  );
}

export function incidentMutation(
  mode: IncidentMode,
  input: GithubIssue | readonly GithubIssue[] | undefined,
): IncidentMutation {
  const issues = !input ? [] : Array.isArray(input) ? input : [input];
  const active = (issues as readonly GithubIssue[]).filter(
    (issue) =>
      issue.state === "open" && hasIncidentLabel(issue) && !issue.pull_request,
  );
  if (active.length > 1) {
    throw new Error(
      "Multiple open social publisher incidents require operator review",
    );
  }
  const issue = active[0];
  if (mode === "failure") {
    return issue
      ? { kind: "update", issueNumber: issue.number }
      : { kind: "create" };
  }
  return issue
    ? { kind: "close", issueNumber: issue.number }
    : { kind: "none" };
}

export type IncidentContext = Readonly<{
  campaignId: string;
  channel: string;
  stage: string;
  error: SanitizedError;
  firstObservedAt: string;
  lastObservedAt: string;
  attempts: number;
  actionsRunUrl: string;
}>;

function safeMarkdown(value: string): string {
  return value
    .replace(/[<>`]/g, "")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

function occurrence(context: IncidentContext): string {
  const run = new URL(context.actionsRunUrl);
  if (run.protocol !== "https:" || run.hostname !== "github.com") {
    throw new Error("Incident Actions run URL must use github.com HTTPS");
  }
  return [
    `## Occurrence · ${safeMarkdown(context.lastObservedAt)}`,
    "",
    `- Campaign: \`${safeMarkdown(context.campaignId)}\``,
    `- Channel/stage: \`${safeMarkdown(context.channel)}\` / \`${safeMarkdown(context.stage)}\``,
    `- Category: \`${safeMarkdown(context.error.category)}\``,
    `- Message: ${safeMarkdown(context.error.message)}`,
    `- First observed: ${safeMarkdown(context.firstObservedAt)}`,
    `- Last observed: ${safeMarkdown(context.lastObservedAt)}`,
    `- Attempts: ${context.attempts}`,
    `- Actions run: ${run.toString()}`,
  ].join("\n");
}

async function githubRequest<T>({
  repository,
  token,
  path,
  method = "GET",
  body,
  fetchImplementation,
}: Readonly<{
  repository: string;
  token: string;
  path: string;
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  fetchImplementation: typeof fetch;
}>): Promise<T> {
  const url = new URL(`/repos/${repository}${path}`, "https://api.github.com");
  const response = await fetchImplementation(url, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(
      `GitHub incident request failed with HTTP ${response.status}`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function syncGithubIncident({
  mode,
  repository,
  token,
  context,
  fetchImplementation = fetch,
}: Readonly<{
  mode: IncidentMode;
  repository: string;
  token: string;
  context?: IncidentContext;
  fetchImplementation?: typeof fetch;
}>): Promise<IncidentMutation> {
  const issues = await githubRequest<GithubIssue[]>({
    repository,
    token,
    path: `/issues?state=open&labels=${encodeURIComponent(INCIDENT_LABEL)}&per_page=10`,
    fetchImplementation,
  });
  const mutation = incidentMutation(mode, issues);
  if (mutation.kind === "none") return mutation;

  if (mutation.kind === "create") {
    if (!context)
      throw new Error("Failure incident requires sanitized context");
    await githubRequest({
      repository,
      token,
      path: "/issues",
      method: "POST",
      body: {
        title: INCIDENT_TITLE,
        labels: [INCIDENT_LABEL],
        body: occurrence(context),
      },
      fetchImplementation,
    });
    return mutation;
  }

  const active = issues.find((issue) => issue.number === mutation.issueNumber)!;
  if (mutation.kind === "update") {
    if (!context)
      throw new Error("Failure incident requires sanitized context");
    const body = `${active.body ?? ""}\n\n---\n\n${occurrence(context)}`.slice(
      -60_000,
    );
    await githubRequest({
      repository,
      token,
      path: `/issues/${mutation.issueNumber}`,
      method: "PATCH",
      body: { body },
      fetchImplementation,
    });
    return mutation;
  }

  await githubRequest({
    repository,
    token,
    path: `/issues/${mutation.issueNumber}/comments`,
    method: "POST",
    body: { body: `Recovered at ${new Date().toISOString()}.` },
    fetchImplementation,
  });
  await githubRequest({
    repository,
    token,
    path: `/issues/${mutation.issueNumber}`,
    method: "PATCH",
    body: { state: "closed" },
    fetchImplementation,
  });
  return mutation;
}
