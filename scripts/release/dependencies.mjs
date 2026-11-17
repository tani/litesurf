// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { glob } from "zx";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { UPSTREAM, BAZEL_BUILD_FLAGS } from "../lib/project.mjs";
import { json } from "../lib/shell.mjs";
import { readJson } from "../lib/files.mjs";

const TARGETS = {
  core: "//packages/core:kitesurf_core",
  renderer: "//packages/renderer-core:renderer_core",
  scene: "//packages/scene-host-wasm:scene_host_wasm",
};

export async function collectCrates(bazel) {
  const crates = new Map();
  const artifactIds = {};
  for (const [artifact, target] of Object.entries(TARGETS)) {
    const graph = await json({
      cwd: UPSTREAM,
    })`${bazel} cquery ${`kind("rust_.*", deps(${target}))`} ${BAZEL_BUILD_FLAGS} --output=jsonproto`
      .quiet()
      .json();
    const wasmConfigs = new Set(
      graph.configurations
        .filter((config) =>
          config.fragmentOptions.some((fragment) =>
            (fragment.options ?? []).some(
              (option) => option.name === "platforms" && option.value.includes("wasm32_"),
            ),
          ),
        )
        .map((config) => config.id),
    );
    const ids = new Set();
    for (const node of graph.results) {
      const rule = node.target.rule;
      if (!["rust_library", "rust_cdylib_library", "rust_proc_macro"].includes(rule.ruleClass))
        continue;
      const manifest = join(rule.location.split("/BUILD")[0], "Cargo.toml");
      if (!existsSync(manifest)) continue;
      const metadata = parseToml(readFileSync(manifest, "utf8")).package;
      if (["kitesurf-core", "renderer-core", "scene-host-wasm"].includes(metadata.name)) continue;
      const key = `${metadata.name}@${metadata.version}`;
      const runtime = wasmConfigs.has(node.configurationId) && rule.ruleClass !== "rust_proc_macro";
      if (runtime) ids.add(key);
      if (!crates.has(key))
        crates.set(key, {
          metadata,
          source: dirname(manifest),
          artifacts: new Set(),
          hostDependency: false,
        });
      const crate = crates.get(key);
      if (runtime) crate.artifacts.add(artifact);
      else crate.hostDependency = true;
    }
    artifactIds[artifact] = [...ids].sort();
  }
  return { crates, artifactIds };
}

function findNpmPackage(base, name) {
  for (let parent = resolve(base); ; parent = dirname(parent)) {
    const candidate = join(parent, "node_modules", name, "package.json");
    if (existsSync(candidate)) return dirname(realpathSync(candidate));
    if (parent === dirname(parent)) break;
  }
  throw new Error(`Cannot locate bundled npm dependency ${name} from ${base}`);
}

export function collectNpm(engineBin) {
  const pending = [];
  for (const manifest of glob
    .sync("packages/*/package.json", { cwd: UPSTREAM, absolute: true })
    .sort()) {
    const name = basename(dirname(manifest));
    for (const [dependency, version] of Object.entries(readJson(manifest).dependencies ?? {})) {
      if (!version.startsWith("workspace:"))
        pending.push(findNpmPackage(join(dirname(engineBin), name), dependency));
    }
  }
  const packages = new Map();
  while (pending.length) {
    const directory = pending.pop();
    const metadata = readJson(join(directory, "package.json"));
    const key = `${metadata.name}@${metadata.version}`;
    if (packages.has(key)) continue;
    packages.set(key, { metadata, source: directory });
    for (const name of Object.keys(metadata.dependencies ?? {}))
      pending.push(findNpmPackage(directory, name));
  }
  return packages;
}
