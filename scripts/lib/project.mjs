// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readJson } from "./files.mjs";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const UPSTREAM = fileURLToPath(new URL("../../upstream/kitesurf/", import.meta.url));
export const DIST = fileURLToPath(new URL("../../dist/", import.meta.url));
export const BAZEL = process.env.BAZEL ?? "bazel";
export const RUST_PROFILE = process.env.LITESURF_RUST_PROFILE ?? "upstream";
if (!["core-o2", "upstream"].includes(RUST_PROFILE)) {
  throw new Error("LITESURF_RUST_PROFILE must be upstream or core-o2");
}
// Experimental comparison profile; benchmarks did not justify changing the default.
// Other crates and the pinned standard library retain upstream's configuration.
export const BAZEL_BUILD_FLAGS =
  RUST_PROFILE === "core-o2"
    ? [
        "--@rules_rust//rust/settings:per_crate_rustc_flag=//packages/core:kitesurf_core@-Copt-level=2",
      ]
    : [];
export const UPSTREAM_REPOSITORY = "https://github.com/cloudflare/kitesurf";
export const packageManifest = () => readJson(new URL("../../package.json", import.meta.url));

/** @param {string} url */
export function isMain(url) {
  return Boolean(process.argv[1]) && url === pathToFileURL(resolve(process.argv[1])).href;
}
