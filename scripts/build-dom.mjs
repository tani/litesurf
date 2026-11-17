// SPDX-License-Identifier: Apache-2.0

import { join } from "node:path";
import { fs } from "zx";
import { build } from "esbuild";
import { copyTree } from "./lib/files.mjs";

/** Bundle existing upstream outputs into a factory with private state per environment. */
export async function buildDOM(bin, destination) {
  const result = await build({
    stdin: {
      contents:
        `export * from ${JSON.stringify(join(bin, "packages/dom-shim/dist/dom-shim.js"))};\n` +
        `export {getInternalState} from ${JSON.stringify(join(bin, "packages/page-script/dist/internal-state.js"))};`,
      resolveDir: bin,
      sourcefile: "litesurf-dom.js",
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "litesurfDOM",
    platform: "neutral",
    target: "es2023",
    minify: true,
    keepNames: true,
    plugins: [
      {
        name: "shared-dom-state",
        setup(build) {
          build.onResolve({ filter: /^\.\/internal-state\.js$/ }, () => ({
            path: join(bin, "packages/page-script/dist/internal-state.js"),
          }));
        },
      },
    ],
  });
  fs.outputFileSync(
    join(destination, "shim.mjs"),
    "// Copyright (c) 2026 Cloudflare, Inc. Licensed under Apache-2.0.\n" +
      "// Modified by the litesurf contributors: bundled the DOM shim and state into an isolated factory.\n" +
      "export function createDOMShim() {\n" +
      result.outputFiles[0].text +
      "\nreturn litesurfDOM;\n}\n",
  );
  copyTree(join(bin, "packages/core/pkg/kitesurf_core.d.ts"), join(destination, "core.d.ts"));
}
