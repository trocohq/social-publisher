import path from "node:path";

type PrivateInputConfig = Readonly<{
  repository: string;
  repositoryId: number;
  ref: string;
  paths: readonly string[];
  maxTotalBytes: number;
}>;
type PrivateInputTransport = Readonly<{
  repository(repository: string): Promise<
    Readonly<{
      private: boolean;
      id: number;
      fullName: string;
      authenticated: boolean;
    }>
  >;
  readFile(repository: string, ref: string, path: string): Promise<Uint8Array>;
}>;

const PINNED_REF = /^[0-9a-f]{40}$/u;
const ALLOWED_PATH =
  /^(?:batches\/[^/]+\.md|approvals\/[^/]+\.json|media\/[a-zA-Z0-9._/-]+\.(?:jpe?g|png))$/u;

export async function loadPrivateStaticInput(
  input: Readonly<{
    config: PrivateInputConfig;
    transport: PrivateInputTransport;
  }>,
): Promise<
  Readonly<{
    files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
    totalBytes: number;
  }>
> {
  validateConfig(input.config);
  const repository = await input.transport.repository(input.config.repository);
  if (!repository.authenticated)
    throw new Error("STATIC_PRIVATE_AUTH_REQUIRED");
  if (!repository.private)
    throw new Error("STATIC_PRIVATE_REPOSITORY_REQUIRED");
  if (
    repository.id !== input.config.repositoryId ||
    repository.fullName !== input.config.repository
  )
    throw new Error("STATIC_PRIVATE_REPOSITORY_MISMATCH");

  const files: Array<Readonly<{ path: string; bytes: Uint8Array }>> = [];
  let totalBytes = 0;
  for (const filePath of input.config.paths) {
    const bytes = await input.transport.readFile(
      input.config.repository,
      input.config.ref,
      filePath,
    );
    totalBytes += bytes.byteLength;
    if (totalBytes > input.config.maxTotalBytes)
      throw new Error("STATIC_PRIVATE_INPUT_TOO_LARGE");
    files.push({ path: filePath, bytes: new Uint8Array(bytes) });
  }
  return { files, totalBytes };
}

function validateConfig(config: PrivateInputConfig): void {
  if (!PINNED_REF.test(config.ref))
    throw new Error("STATIC_PRIVATE_REF_NOT_PINNED");
  if (
    !Number.isSafeInteger(config.repositoryId) ||
    config.repositoryId < 1 ||
    !Number.isSafeInteger(config.maxTotalBytes) ||
    config.maxTotalBytes < 1
  )
    throw new Error("STATIC_PRIVATE_CONFIG_INVALID");
  if (
    config.paths.length === 0 ||
    new Set(config.paths).size !== config.paths.length
  )
    throw new Error("STATIC_PRIVATE_PATH_INVALID");
  for (const filePath of config.paths) {
    if (
      path.posix.normalize(filePath) !== filePath ||
      path.posix.isAbsolute(filePath) ||
      !ALLOWED_PATH.test(filePath)
    )
      throw new Error("STATIC_PRIVATE_PATH_INVALID");
  }
}
