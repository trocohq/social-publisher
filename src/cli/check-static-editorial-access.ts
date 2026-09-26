import { fileURLToPath } from "node:url";

import { createGitHubPrivateInputTransport } from "../static-editorial/github-runtime.js";

type Environment = Readonly<Record<string, string | undefined>>;

export type StaticAccessPlan = Readonly<{
  repository: string;
  repositoryId: number;
  ref: string;
  token: string;
}>;

export function planStaticAccessCheck(env: Environment): StaticAccessPlan {
  const repository = env.STATIC_EDITORIAL_REPOSITORY ?? "";
  const repositoryId = Number(env.STATIC_EDITORIAL_REPOSITORY_ID);
  const ref = env.STATIC_EDITORIAL_REF ?? "";
  const token = env.PRIVATE_EDITORIAL_TOKEN ?? "";
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) ||
    !Number.isSafeInteger(repositoryId) ||
    repositoryId < 1 ||
    !/^[0-9a-f]{40}$/u.test(ref) ||
    !token.trim()
  )
    throw new Error("STATIC_ACCESS_CONFIG_INVALID");
  return { repository, repositoryId, ref, token };
}

export async function checkStaticEditorialAccess(
  plan: StaticAccessPlan,
  fetchImplementation: (request: Request) => Promise<Response> = fetch,
) {
  const transport = createGitHubPrivateInputTransport(
    plan.token,
    fetchImplementation,
  );
  const identity = await transport.repository(plan.repository);
  if (
    identity.private !== true ||
    identity.id !== plan.repositoryId ||
    identity.fullName !== plan.repository ||
    identity.authenticated !== true
  )
    throw new Error("STATIC_PRIVATE_REPOSITORY_MISMATCH");
  await transport.readFile(plan.repository, plan.ref, "batches/.gitkeep");
  return Object.freeze({
    status: "verified" as const,
    repositoryId: plan.repositoryId,
    ref: plan.ref,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await checkStaticEditorialAccess(
    planStaticAccessCheck(process.env),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
