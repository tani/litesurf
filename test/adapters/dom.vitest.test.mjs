// SPDX-License-Identifier: Apache-2.0

import { test, expect } from "vitest";
import { verifyDOM } from "../fixtures/dom-contract.mjs";

test("registers document before test modules and uses environment options", async () => {
  expect(document.URL).toBe("https://vitest.invalid/");
  expect(innerWidth).toBe(640);
  await verifyDOM();
});
