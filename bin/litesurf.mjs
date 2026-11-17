#!/usr/bin/env node
// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0
// Modified by the litesurf contributors: adapted the startup CLI for the litesurf package and launch API.

import { parseArgs } from "node:util";
import { launch } from "../src/index.mjs";

try {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: process.env.LITESURF_PORT ?? "8787" },
      dist: { type: "string" },
      assets: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log("Usage: litesurf [--port <n>] [--dist <dir>] [--assets <dir>]");
  } else {
    const engine = await launch({
      port: Number(values.port),
      dist: values.dist,
      assets: values.assets,
    });
    console.log(`litesurf listening on ${engine.url}`);
    console.log(`CDP: ${engine.browserWSEndpoint}`);
    // Miniflare handles process signals and terminates its workerd child on exit.
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
