// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { registerDOM } from "litesurf/dom";
import { verifyDOM } from "./fixtures/dom-contract.mjs";

test("Wasm DOM provides synchronous browser globals, CSS, layout, and events", async () => {
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const environment = await registerDOM({
    url: "https://test.invalid/start",
    width: 640,
    height: 480,
  });
  try {
    assert.equal(innerWidth, 640);
    assert.equal(window.innerHeight, 480);
    assert.equal(location.href, "https://test.invalid/start");
    await verifyDOM();
    await assert.rejects(registerDOM(), /already registered/);
  } finally {
    environment.close();
  }
  environment.close();
  for (const name of [
    "window",
    "document",
    "HTMLElement",
    "Event",
    "navigator",
    "localStorage",
    "getComputedStyle",
    "requestAnimationFrame",
  ]) {
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, name), previous[name]);
  }
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(globalThis, Symbol.for("kitesurf.internals")),
    previous[Symbol.for("kitesurf.internals")],
  );
});

test("fresh registrations do not reuse a document, storage, or DOM shim state", async () => {
  const first = await registerDOM();
  const firstDocument = document;
  document.body.innerHTML = "<p>old</p>";
  localStorage.setItem("old", "value");
  first.close();
  const second = await registerDOM();
  try {
    assert.notEqual(document, firstDocument);
    assert.equal(document.body.innerHTML, "");
    assert.equal(localStorage.length, 0);
  } finally {
    second.close();
  }
});

test("failed setup releases registration and cleanup cancels animation frames", async () => {
  await assert.rejects(registerDOM({ width: 0 }), RangeError);
  await assert.rejects(registerDOM({ dist: "/missing/litesurf" }), /ENOENT/);
  const environment = await registerDOM();
  let called = false;
  requestAnimationFrame(() => {
    called = true;
  });
  environment[Symbol.dispose]();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(called, false);
});
