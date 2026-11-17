// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0

import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileModuleRules, testRegExps } from "miniflare";

const DEFAULT_DIST = fileURLToPath(new URL("../dist/worker/", import.meta.url));
const ENGINE_RULES = compileModuleRules([
  { type: "CompiledWasm", include: ["**/*.wasm"] },
  { type: "Text", include: ["**/*.glue.js", "*.css", "**/*.css", "**/*.dat"] },
  { type: "Data", include: ["**/*.woff2", "**/*.bin"] },
]);

/**
 * Collect modules accepted by the pinned Miniflare v4 compatibility adapter.
 * @param {string} root Absolute Worker distribution directory.
 * @returns {import("miniflare").V4ModuleDefinition[]}
 */
function distModules(root) {
  /** @type {import("miniflare").V4ModuleDefinition[]} */
  const modules = [{ type: "ESModule", path: resolve(root, "index.js") }];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = resolve(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
        continue;
      }
      const name = relative(root, full).replaceAll("\\", "/");
      if (name === "index.js") continue;
      const rule = ENGINE_RULES.find((candidate) => testRegExps(candidate.include, name));
      if (rule) modules.push({ type: rule.type, path: full });
    }
  };
  walk(root);
  return modules;
}

/**
 * Resolve the packaged Worker configuration and apply caller overrides.
 * @param {import("./index.mjs").LaunchOptions} options
 * @returns {import("miniflare").V4WorkerOptions}
 */
export function workerOptions(options) {
  const dist = resolve(options.dist ?? DEFAULT_DIST);
  /** @type {import("miniflare").V4WorkerOptions} */
  let workerOptions;
  try {
    workerOptions = JSON.parse(readFileSync(resolve(dist, "engine-mf.json"), "utf8"));
  } catch (cause) {
    throw new Error(`Cannot read the litesurf build at ${dist}. Run npm run build first.`, {
      cause,
    });
  }
  return {
    ...workerOptions,
    name: "litesurf-engine",
    modulesRoot: dist,
    modules: distModules(dist),
    bindings: { ...workerOptions.bindings, ...options.bindings },
    assets: workerOptions.assets && {
      ...workerOptions.assets,
      directory: options.assets
        ? resolve(options.assets)
        : resolve(dist, workerOptions.assets.directory),
    },
  };
}
