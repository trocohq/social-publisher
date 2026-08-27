import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function canonicalBrandRoot(): URL {
  const configured = process.env.BRAND_ROOT;
  if (configured) return pathToFileURL(`${resolve(configured)}/`);
  return new URL("../../../frontend/public/", import.meta.url);
}
