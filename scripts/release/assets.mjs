// SPDX-License-Identifier: Apache-2.0

import { copyFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../lib/project.mjs";
import { json, upstream } from "../lib/shell.mjs";
import { verifyDist } from "../verify-dist.mjs";
import { posixRelative, sha256, walk, writeJson } from "../lib/files.mjs";
import { deterministicTar } from "../lib/archive.mjs";

export async function writeAssets({ version, tag, repository, revision, sources, licenses, work }) {
  const sourceName = `litesurf-${tag}-sources.tar.gz`;
  const download = `https://github.com/${repository}/releases/download/${tag}/${sourceName}`;
  const sourceNotice =
    `Source availability for litesurf ${version}\n\n` +
    "MPL-2.0-covered sources, including Kitesurf's modifications, are provided under MPL-2.0 in the accompanying source archive.\n" +
    `Archive: ${sourceName}\nRelease location: ${download}\n` +
    "Extract crates/ for the exact dependency source files, including the patched stylo and selectors trees.\n" +
    "upstream/kitesurf/ contains the original Kitesurf source, patches, manifests and build instructions.\n" +
    "rust/std-src.tar contains the pinned standard-library sources and vendored dependencies.\n" +
    "Other files retain their own original licenses; including them here does not relicense them under MPL.\n" +
    `Upstream revision: ${revision}\n`;
  writeFileSync(join(sources, "SOURCE_AVAILABILITY.txt"), sourceNotice);
  const sourceFiles = {};
  for (const file of walk(sources)) {
    if (statSync(file).isFile()) sourceFiles[posixRelative(sources, file)] = await sha256(file);
  }
  writeJson(join(sources, "SOURCE_MANIFEST.json"), sourceFiles);
  const output = join(ROOT, "release", tag);
  mkdirSync(output, { recursive: true });
  const epoch = Number(
    (await upstream`git show -s --format=%ct ${revision}`.quiet()).stdout.trim(),
  );
  await deterministicTar(sources, join(output, sourceName), epoch);
  writeFileSync(
    join(licenses, "SOURCE_AVAILABILITY.txt"),
    sourceNotice + `Source archive SHA-256: ${await sha256(join(output, sourceName))}\n`,
  );
  verifyDist();
  const [pack] = await json`npm pack --json --ignore-scripts --pack-destination ${work}`
    .quiet()
    .json();
  const runtimeName = `litesurf-${tag}.tgz`;
  copyFileSync(join(work, pack.filename), join(output, runtimeName));
  const assets = {};
  for (const name of [runtimeName, sourceName])
    assets[name] = {
      sha256: await sha256(join(output, name)),
      bytes: statSync(join(output, name)).size,
    };
  const wasm = {};
  for (const file of walk(join(ROOT, "dist")).filter((file) => file.endsWith(".wasm"))) {
    wasm[posixRelative(join(ROOT, "dist"), file)] = await sha256(file);
  }
  const manifest = {
    version,
    tag,
    repository,
    upstream_revision: revision,
    assets,
    source_archive: sourceName,
    wasm,
  };
  writeJson(join(output, "release.json"), manifest);
  writeFileSync(
    join(output, "SHA256SUMS"),
    Object.entries(assets)
      .sort()
      .map(([name, entry]) => `${entry.sha256}  ${name}\n`)
      .join(""),
  );
  writeFileSync(
    join(output, "RELEASE_NOTES.txt"),
    `litesurf ${tag}\n\nInstall: npm install ./${runtimeName}\n` +
      "Requires Node.js 22 or newer; native await using requires Node.js 24 or newer.\n" +
      `The matching source archive is ${sourceName}. Download both archives and SHA256SUMS for source/license verification.\n` +
      "The runtime includes THIRD_PARTY_NOTICES.txt, DEPENDENCIES.json and SOURCE_AVAILABILITY.txt under dist/licenses/.\n" +
      `Kitesurf source revision: ${revision}\n` +
      "Miniflare/workerd are installed as npm dependencies; platform executables are not bundled in this runtime tarball.\n",
  );
  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}
