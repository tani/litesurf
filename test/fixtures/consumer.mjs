// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { launch } from "litesurf";
import { verifyBrowser } from "./browser.mjs";

const engine = await launch();
try {
  assert.equal(engine[Symbol.asyncDispose], engine.close);
  await verifyBrowser(engine);
} finally {
  await engine[Symbol.asyncDispose]();
}
console.log("PACKAGED_BROWSER_OK");
