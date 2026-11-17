// SPDX-License-Identifier: Apache-2.0

import { existsSync, lstatSync, statSync } from "node:fs";
import { join } from "node:path";
import { DIST, UPSTREAM, isMain, packageManifest } from "./lib/project.mjs";
import { readJson, walk } from "./lib/files.mjs";
import { verifyUpstream } from "./upstream.mjs";

const REQUIRED_FILES = [
  "types/index.d.mts",
  "worker/index.js",
  "worker/engine-mf.json",
  "public/fonts/OFL.txt",
  "public/rbi/scene_host.wasm",
  "licenses/Kitesurf-LICENSE",
  "licenses/Kitesurf-NOTICE",
];

export function verifyDist() {
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(DIST, file)) || !statSync(join(DIST, file)).isFile()) {
      throw new Error(`Missing distribution file: ${file}`);
    }
  }
  for (const file of walk(DIST)) {
    if (lstatSync(file).isSymbolicLink()) {
      throw new Error(`Distribution contains a nonportable symlink: ${file}`);
    }
  }
  const provenance = readJson(join(DIST, "upstream.json"));
  if (!/^[a-f0-9]{40}$/.test(provenance.revision)) throw new Error("Invalid upstream revision");
  if (provenance.miniflare !== packageManifest().dependencies.miniflare) {
    throw new Error("Rebuild dist after changing the Miniflare dependency");
  }
  if (existsSync(join(UPSTREAM, ".git")) && provenance.revision !== verifyUpstream()) {
    throw new Error("Rebuild dist after changing the upstream pin");
  }
  return provenance;
}

if (isMain(import.meta.url)) {
  console.log(`Portable litesurf distribution, upstream ${verifyDist().revision}`);
}
