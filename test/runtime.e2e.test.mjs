// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0
// Modified by the litesurf contributors: adapted browser tests for the standalone Node.js package.

import { test } from "node:test";
import { launch } from "litesurf";
import { verifyBrowser } from "./fixtures/browser.mjs";

test(
  "Node starts the real engine and Puppeteer evaluates and renders a page",
  { timeout: 120_000 },
  async () => {
    const engine = await launch();
    try {
      await verifyBrowser(engine);
    } finally {
      await engine[Symbol.asyncDispose]();
    }
  },
);
