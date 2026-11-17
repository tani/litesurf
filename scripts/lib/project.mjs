// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readJson } from "./files.mjs";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const UPSTREAM = fileURLToPath(new URL("../../upstream/kitesurf/", import.meta.url));
export const DIST = fileURLToPath(new URL("../../dist/", import.meta.url));
export const BAZEL = process.env.BAZEL ?? "bazel";
export const UPSTREAM_REPOSITORY = "https://github.com/cloudflare/kitesurf";
export const packageManifest = () => readJson(new URL("../../package.json", import.meta.url));

/** @param {string} url */
export function isMain(url) {
  return Boolean(process.argv[1]) && url === pathToFileURL(resolve(process.argv[1])).href;
}
