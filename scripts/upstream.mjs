// SPDX-License-Identifier: Apache-2.0

import { $ } from "zx";
import { resolve } from "node:path";
import { ROOT, UPSTREAM } from "./lib/project.mjs";

export function verifyUpstream({ root = ROOT, upstream = UPSTREAM } = {}) {
  const git = (cwd, args) => $({ cwd, quiet: true, sync: true })`git ${args}`.stdout.trim();
  let revision;
  try {
    const top = git(upstream, ["rev-parse", "--show-toplevel"]);
    if (resolve(top) !== resolve(upstream)) throw new Error("Submodule is not initialized");
    revision = git(upstream, ["rev-parse", "HEAD"]);
  } catch (cause) {
    throw new Error("Initialize Kitesurf with git submodule update --init --recursive", { cause });
  }
  const entry = git(root, ["ls-files", "--stage", "--", "upstream/kitesurf"]);
  const pin = /^160000 ([a-f0-9]{40}) 0\tupstream\/kitesurf$/.exec(entry)?.[1];
  if (!pin || pin !== revision) {
    throw new Error(
      "Kitesurf HEAD differs from the submodule pin. Review and git add upstream/kitesurf.",
    );
  }
  if (git(upstream, ["status", "--porcelain", "--untracked-files=normal"])) {
    throw new Error("Kitesurf has local changes. Keep modifications outside upstream/kitesurf.");
  }
  return revision;
}
