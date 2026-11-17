// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  BAZEL,
  DIST,
  ROOT,
  UPSTREAM,
  UPSTREAM_REPOSITORY,
  isMain,
  packageManifest,
} from "./lib/project.mjs";
import { upstream } from "./lib/shell.mjs";
import { copyTree, readJson, writeJson } from "./lib/files.mjs";
import { verifyUpstream } from "./upstream.mjs";
import { buildDOM } from "./build-dom.mjs";

const UPSTREAM_NOTICES = [
  ["LICENSE", "Kitesurf-LICENSE"],
  ["NOTICE", "Kitesurf-NOTICE"],
  ["Cargo.lock", "Kitesurf-Cargo.lock"],
  ["packages/kitesurf-cli/Cargo.lock", "Kitesurf-CLI-Cargo.lock"],
  ["vendor/wasm-memprof/LICENSE", "wasm-memprof-LICENSE"],
];

/** Materialize Bazel runfiles with portable modes and without source maps. */
function stageDistribution(engine, staged, revision) {
  const copy = (source, destination) =>
    copyTree(source, destination, {
      filter: (file) => !file.endsWith(".map"),
      mode: 0o644,
    });
  copy(join(engine, "dist"), join(staged, "worker"));
  copy(join(engine, "public"), join(staged, "public"));
  const configFile = join(staged, "worker/engine-mf.json");
  const config = readJson(configFile);
  if (config.assets) config.assets.directory = "../public";
  writeJson(configFile, config);
  const licenses = join(staged, "licenses");
  copy(join(UPSTREAM, "licenses"), licenses);
  for (const [source, destination] of UPSTREAM_NOTICES) {
    copy(join(UPSTREAM, source), join(licenses, destination));
  }
  writeJson(join(staged, "upstream.json"), {
    repository: UPSTREAM_REPOSITORY,
    revision,
    miniflare: packageManifest().dependencies.miniflare,
  });
}

export async function build() {
  const revision = verifyUpstream();
  await upstream({ stdio: "inherit" })`${BAZEL} build //packages/engine:dist`;
  const bin = (await upstream`${BAZEL} info bazel-bin`.quiet()).stdout.trim();
  const staged = mkdtempSync(join(ROOT, ".dist-build-"));
  try {
    stageDistribution(join(bin, "packages/engine"), staged, revision);
    await buildDOM(bin, join(staged, "dom"));
    if (verifyUpstream() !== revision) throw new Error("Kitesurf changed during the build");
    if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
    renameSync(staged, DIST);
    console.log(`Built litesurf with unmodified Kitesurf ${revision}`);
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) await build();
