#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ROOT, BAZEL, isMain, packageManifest } from "./lib/project.mjs";
import { run, upstream } from "./lib/shell.mjs";
import { verifyDist } from "./verify-dist.mjs";
import { writeJson } from "./lib/files.mjs";
import { collectCrates, collectNpm } from "./release/dependencies.mjs";
import { collectLicenses } from "./release/licenses.mjs";
import { collectStandardLibrary, snapshotSources } from "./release/sources.mjs";
import { writeAssets } from "./release/assets.mjs";
import { verify } from "./verify-release.mjs";

/** Prepare runtime archives paired with exact dependency sources and retained notices. */
export async function prepare({ repository = "tani/litesurf", skipBuild = false } = {}) {
  const { version } = packageManifest();
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(version))
    throw new Error("Unsafe package version");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error("repository must be owner/name");
  const tag = `v${version}`;
  await run`npm run ${skipBuild ? "build:types" : "build"}`;
  const revision = verifyDist().revision;

  const bin = (await upstream`${BAZEL} info bazel-bin`.quiet()).stdout.trim();
  const { crates, artifactIds } = await collectCrates(BAZEL);
  const npmPackages = collectNpm(join(bin, "packages/engine"));
  const work = join(ROOT, ".release-work", tag);
  const sources = join(work, `litesurf-${tag}-sources`);
  const licenses = join(ROOT, "dist/licenses");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(sources, { recursive: true });
  const { inventory, notices } = await collectLicenses({
    crates,
    npmPackages,
    artifactIds,
    sources,
    revision,
  });
  notices.push(...(await collectStandardLibrary(sources, licenses)));
  await snapshotSources({ work, sources, revision });
  for (const directory of [licenses, sources]) {
    writeFileSync(join(directory, "THIRD_PARTY_NOTICES.txt"), notices.join("\n\n") + "\n");
    writeJson(join(directory, "DEPENDENCIES.json"), inventory);
  }
  const manifest = await writeAssets({
    version,
    tag,
    repository,
    revision,
    sources,
    licenses,
    work,
  });
  await verify(join(ROOT, "release", tag));
  return manifest;
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      repository: { type: "string", default: "tani/litesurf" },
      "skip-build": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help)
    console.log("Usage: node scripts/release.mjs [--repository owner/name] [--skip-build]");
  else await prepare({ repository: values.repository, skipBuild: values["skip-build"] });
}
