import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export type DryRunArguments = Readonly<{
  localDate: string;
  output: string;
  brandRoot: URL;
  ffmpegPath?: string;
  ffprobePath?: string;
}>;

const accepted = new Set([
  "--date",
  "--output",
  "--brand-root",
  "--ffmpeg",
  "--ffprobe",
]);

function directoryUrl(path: string): URL {
  return pathToFileURL(path.endsWith(sep) ? path : `${path}${sep}`);
}

export function parseArguments(
  args: readonly string[],
  workingRoot: string,
): DryRunArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !accepted.has(flag)) {
      throw new Error(`Unknown argument: ${flag ?? "<missing>"}`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    values.set(flag, value);
  }

  const localDate = values.get("--date");
  const outputValue = values.get("--output");
  const brandValue = values.get("--brand-root");
  if (!localDate || !outputValue || !brandValue) {
    throw new Error("Required arguments: --date, --output, and --brand-root");
  }
  const parsedDate = new Date(`${localDate}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(localDate) ||
    Number.isNaN(parsedDate.valueOf()) ||
    parsedDate.toISOString().slice(0, 10) !== localDate
  ) {
    throw new Error("Invalid --date; expected YYYY-MM-DD");
  }

  const canonicalWorkingRoot = resolve(workingRoot);
  const output = resolve(canonicalWorkingRoot, outputValue);
  const outputRelative = relative(canonicalWorkingRoot, output);
  if (outputRelative === ".." || outputRelative.startsWith(`..${sep}`)) {
    throw new Error("Output must remain inside the working root");
  }

  const ffmpegValue = values.get("--ffmpeg");
  const ffprobeValue = values.get("--ffprobe");
  return Object.freeze({
    localDate,
    output,
    brandRoot: directoryUrl(resolve(canonicalWorkingRoot, brandValue)),
    ...(ffmpegValue
      ? { ffmpegPath: resolve(canonicalWorkingRoot, ffmpegValue) }
      : {}),
    ...(ffprobeValue
      ? { ffprobePath: resolve(canonicalWorkingRoot, ffprobeValue) }
      : {}),
  });
}
