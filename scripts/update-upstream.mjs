#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { join } from "node:path";
import { fs } from "zx";
import { ROOT, isMain } from "./lib/project.mjs";
import { $ } from "./lib/shell.mjs";
import { verifyUpstream } from "./upstream.mjs";

/** Update only a clean checkout, following upstream's advertised default branch. */
export async function updateUpstream({ root = ROOT } = {}) {
  const git = $({ cwd: root, quiet: true });
  const upstream = join(root, "upstream/kitesurf");
  const engine = $({ cwd: upstream, quiet: true });
  const previous = verifyUpstream({ root, upstream });
  if ((await git`git status --porcelain --untracked-files=normal`).stdout.trim()) {
    throw new Error("Upstream updates require a clean working tree and index");
  }
  const manifest = await fs.readJson(join(root, "package.json"));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("Monthly releases require a stable package version");
  }
  const advertised = (await engine`git ls-remote --symref origin HEAD`).stdout;
  const branch = /^ref: (refs\/heads\/[^\s]+)\s+HEAD$/m.exec(advertised)?.[1];
  if (!branch) throw new Error("Cannot resolve upstream's default branch");
  await engine`git fetch --no-tags origin ${branch}`;
  const revision = (await engine`git rev-parse FETCH_HEAD`).stdout.trim();
  if (revision === previous) return { changed: false, revision, version: manifest.version };
  // Refuse history rewrites or downgrades instead of silently replacing the pin.
  await engine`git merge-base --is-ancestor ${previous} ${revision}`;
  const patch = Number(manifest.version.split(".")[2]) + 1;
  if (!Number.isSafeInteger(patch)) throw new Error("Unsafe patch version");
  const version = manifest.version.replace(/\d+$/, String(patch));
  await engine`git checkout --detach ${revision}`;
  await engine`git submodule update --init --recursive`;
  await git`npm version ${version} --no-git-tag-version --ignore-scripts`;
  await git`git add -- upstream/kitesurf package.json package-lock.json`;
  verifyUpstream({ root, upstream });
  return { changed: true, previous, revision, version, tag: `v${version}` };
}

if (isMain(import.meta.url)) {
  const result = await updateUpstream();
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT,
      Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(""));
  }
}
