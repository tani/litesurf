// SPDX-License-Identifier: Apache-2.0

import { test, expect } from "bun:test";
import { verifyDOM } from "../fixtures/dom-contract.mjs";

test("registers synchronous DOM globals from the Bun preload", async () => {
  expect(document.URL).toBe("http://localhost:3000/");
  await verifyDOM();
});
