#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { isDeepStrictEqual, parseArgs } from "node:util";
import { statSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readJson, sha256 } from "./lib/files.mjs";
import { scanTar } from "./lib/archive.mjs";
import { isMain } from "./lib/project.mjs";
import { ADAPTED_RUNTIME_FILES, MODIFICATION_NOTICE, sourceUrl } from "./release/metadata.mjs";

/** Check release hashes, source completeness, and accompanying license notices. */
async function verifyAssets(directory, manifest) {
  for (const [name, record] of Object.entries(manifest.assets)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === "." || name === "..") {
      throw new Error(`Unsafe asset name: ${name}`);
    }
    const file = join(directory, name);
    if ((await sha256(file)) !== record.sha256 || statSync(file).size !== record.bytes) {
      throw new Error(`Asset checksum/size mismatch: ${name}`);
    }
  }
  const sums = readFileSync(join(directory, "SHA256SUMS"), "utf8").trim().split("\n");
  const expectedSums = Object.entries(manifest.assets)
    .sort()
    .map(([name, record]) => `${record.sha256}  ${name}`);
  if (!isDeepStrictEqual(sums.sort(), expectedSums.sort())) {
    throw new Error("SHA256SUMS differs from release.json");
  }
}

async function verifyRuntime(directory, manifest) {
  const runtimeName = `litesurf-${manifest.tag}.tgz`;
  const sourceName = manifest.source_archive;
  if (!Object.hasOwn(manifest.assets, runtimeName) || !Object.hasOwn(manifest.assets, sourceName)) {
    throw new Error("Runtime and source archives must both be listed in release.json");
  }
  const captured = new Set(
    [
      ...ADAPTED_RUNTIME_FILES,
      "dist/licenses/THIRD_PARTY_NOTICES.txt",
      "dist/licenses/SOURCE_AVAILABILITY.txt",
      "dist/licenses/DEPENDENCIES.json",
    ].map((name) => `package/${name}`),
  );
  const runtime = await scanTar(join(directory, runtimeName), (name) => captured.has(name));
  for (const name of [
    "LICENSE",
    "NOTICE",
    "dist/licenses/Kitesurf-LICENSE",
    "dist/licenses/Kitesurf-NOTICE",
    "dist/licenses/Rust-COPYRIGHT-library.html",
    "dist/public/fonts/OFL.txt",
  ]) {
    if (!runtime.has(`package/${name}`)) throw new Error(`Missing runtime license/notice: ${name}`);
  }
  const read = (name) => {
    const data = runtime.get(`package/${name}`)?.data;
    if (!data) throw new Error(`Missing runtime file: ${name}`);
    return data.toString("utf8");
  };
  const notices = read("dist/licenses/THIRD_PARTY_NOTICES.txt");
  for (const name of ADAPTED_RUNTIME_FILES) {
    if (!read(name).includes(MODIFICATION_NOTICE)) {
      throw new Error(`Missing modification notice: ${name}`);
    }
  }
  for (const expected of [
    "WHATWG",
    "UNICODE LICENSE V3",
    "Hayaki Saito",
    "Independent JPEG Group",
    "Mozilla Public License",
  ]) {
    if (!notices.includes(expected)) throw new Error(`Missing third-party notice: ${expected}`);
  }
  const availability = read("dist/licenses/SOURCE_AVAILABILITY.txt");
  if (
    !availability.split("\n").includes(`Archive: ${sourceName}`) ||
    !availability.split("\n").includes(`Release location: ${sourceUrl(manifest)}`) ||
    !availability
      .split("\n")
      .includes(`Source archive SHA-256: ${manifest.assets[sourceName].sha256}`)
  ) {
    throw new Error("Source availability notice does not match the accompanying source archive");
  }
  const dependencies = JSON.parse(read("dist/licenses/DEPENDENCIES.json"));
  if (dependencies.upstream_revision !== manifest.upstream_revision) {
    throw new Error("Dependency inventory uses a different upstream revision");
  }
  for (const [file, expected] of Object.entries(manifest.wasm)) {
    if (runtime.get(`package/dist/${file}`)?.sha256 !== expected) {
      throw new Error(`Wasm hash mismatch: ${file}`);
    }
  }
  return dependencies;
}

async function verifySources(directory, manifest, dependencies) {
  const sourceName = manifest.source_archive;
  const prefix = `litesurf-${manifest.tag}-sources/`;
  const sources = await scanTar(
    join(directory, sourceName),
    (name) => name === `${prefix}SOURCE_MANIFEST.json`,
  );
  const actualSources = {};
  let expectedSources;
  for (const [name, entry] of sources) {
    if (!name.startsWith(prefix)) throw new Error("Unexpected source archive root");
    const relative = name.slice(prefix.length);
    if (relative === "SOURCE_MANIFEST.json")
      expectedSources = JSON.parse(entry.data.toString("utf8"));
    else actualSources[relative] = entry.sha256;
  }
  if (!expectedSources || !isDeepStrictEqual(actualSources, expectedSources)) {
    throw new Error("Source archive content differs from SOURCE_MANIFEST.json");
  }
  for (const crate of dependencies.rust) {
    if (actualSources[`${crate.source_directory}/Cargo.toml`] !== crate.manifest_sha256) {
      throw new Error(`Missing or changed dependency source: ${crate.id}`);
    }
    for (const patch of crate.upstream_patches) {
      if (actualSources[`upstream/kitesurf/${patch.path}`] !== patch.sha256) {
        throw new Error(`Missing or changed source patch: ${patch.path}`);
      }
    }
  }
  for (const name of [
    "rust/std-src.tar",
    "rust/COPYRIGHT-library.html",
    "THIRD_PARTY_NOTICES.txt",
  ]) {
    if (!Object.hasOwn(actualSources, name))
      throw new Error(`Missing source/runtime notices: ${name}`);
  }
  return Object.keys(actualSources).length;
}

/** Check assets before trusting either archive, then verify their shared source inventory. */
export async function verify(directory) {
  const manifest = readJson(join(directory, "release.json"));
  await verifyAssets(directory, manifest);
  const dependencies = await verifyRuntime(directory, manifest);
  const count = await verifySources(directory, manifest, dependencies);
  console.log(`Verified ${manifest.tag}: runtime, notices, Wasm hashes, and ${count} source files`);
  return manifest;
}

if (isMain(import.meta.url)) {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length !== 1)
    throw new Error("Usage: node scripts/verify-release.mjs <release-directory>");
  await verify(resolve(positionals[0]));
}
