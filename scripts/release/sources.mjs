// SPDX-License-Identifier: Apache-2.0

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { extract } from "tar";
import { UPSTREAM, ROOT } from "../lib/project.mjs";
import { $, upstream } from "../lib/shell.mjs";
import { copyTree, walk } from "../lib/files.mjs";
import { scanTar } from "../lib/archive.mjs";

export async function collectStandardLibrary(sources, licenses) {
  const notices = [];
  const external = join(UPSTREAM, "bazel-kitesurf/external");
  const stdSource = join(external, "+wasm_std_repo+wasm32_unwind_std/std-src.tar");
  if (!existsSync(stdSource))
    throw new Error("Missing the pinned Rust standard-library source archive");
  copyTree(stdSource, join(sources, "rust/std-src.tar"));
  const stdFiles = await scanTar(stdSource, (name) =>
    /license|copying|copyright/i.test(basename(name)),
  );
  for (const [name, entry] of [...stdFiles].sort()) {
    if (entry.data)
      notices.push(`--- Rust standard-library sources: ${name} ---`, entry.data.toString("utf8"));
  }
  const stdNotices = readdirSync(external)
    .sort()
    .filter((name) => /^rules_rust\+\+rust\+.*_nightly_tools$/.test(name))
    .map((name) => join(external, name, "share/doc/rust/COPYRIGHT-library.html"))
    .find((file) => existsSync(file));
  if (!stdNotices)
    throw new Error("Missing Rust standard-library third-party copyright documentation");
  copyTree(stdNotices, join(licenses, "Rust-COPYRIGHT-library.html"));
  copyTree(stdNotices, join(sources, "rust/COPYRIGHT-library.html"));
  notices.push(
    "Rust standard-library components: see Rust-COPYRIGHT-library.html for the toolchain's complete library notices (including other target platforms).",
    "The compiler itself and its host tools are not part of the runtime archive.",
  );
  return notices;
}

export async function snapshotSources({ work, sources, revision }) {
  const upstreamTar = join(work, "upstream.tar");
  await upstream`git archive --format=tar --output=${upstreamTar} ${revision}`;
  const upstreamOut = join(sources, "upstream/kitesurf");
  mkdirSync(upstreamOut, { recursive: true });
  // tar's safe extraction rejects traversal; materialize only internal Git symlinks.
  await extract({ file: upstreamTar, cwd: upstreamOut, strict: true });
  for (const file of walk(upstreamOut)) {
    if (!lstatSync(file).isSymbolicLink()) continue;
    const target = realpathSync(file);
    const inside = relative(upstreamOut, target);
    if (
      inside === ".." ||
      inside.startsWith(`..${sep}`) ||
      resolve(upstreamOut, inside) !== target
    ) {
      throw new Error(`Upstream source link escapes its tree: ${file}`);
    }
    unlinkSync(file);
    copyTree(target, file);
  }
  const files = (await $`git ls-files --cached -z`.quiet()).stdout.split("\0").filter(Boolean);
  for (const name of files) {
    if (
      name === "upstream/kitesurf" ||
      name.startsWith("release/") ||
      name.startsWith(".release-work/")
    )
      continue;
    const file = join(ROOT, name);
    if (existsSync(file) && statSync(file).isFile())
      copyTree(file, join(sources, "litesurf", name));
  }
}
