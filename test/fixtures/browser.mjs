// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

/** Exercise the same browser contract in the checkout and in an installed package. */
export async function verifyBrowser(engine) {
  const health = await engine.fetch(new URL("/health", engine.url));
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "kitesurf: OK\n");
  const discovery = await (await fetch(new URL("/json/version", engine.url))).json();
  assert.equal(discovery.webSocketDebuggerUrl, engine.browserWSEndpoint);
  const browser = await puppeteer.connect({ browserWSEndpoint: engine.browserWSEndpoint });
  try {
    const page = await browser.newPage();
    await page.goto("data:text/html,<title>Node Kitesurf</title><h1>Hello Node</h1>");
    assert.equal(await page.title(), "Node Kitesurf");
    assert.equal(await page.evaluate(() => document.querySelector("h1").textContent), "Hello Node");
    assert.equal(
      await page.evaluate(() => {
        document.querySelector("h1").textContent = "Updated";
        return document.querySelector("h1").textContent;
      }),
      "Updated",
    );
    const screenshot = await page.screenshot({ type: "png" });
    assert.deepEqual([...screenshot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    await browser.disconnect();
  }
}
