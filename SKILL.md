---
name: litesurf
description: Use litesurf for local CDP browser automation and Wasm-backed DOM testing in Node.js, Vitest, or Bun when the user requests litesurf or the project already uses it.
---

# Use litesurf

litesurf wraps the Kitesurf browser engine. Choose the execution mode based on
what the task needs:

| Need | Entry point |
| --- | --- |
| Navigate URLs, execute page scripts, fetch rendered text, or capture PNGs | `launch()` from `litesurf`, controlled through CDP |
| Synchronous `window`/`document`, CSS, layout, and events in Node tests | `registerDOM()` from `litesurf/dom` |
| Replace a Vitest jsdom/happy-dom environment | `litesurf/vitest` |
| Replace Bun's DOM preload | `litesurf/bun` |

DOM adapters require litesurf 0.0.2 or newer. Installing the published package
does not require Rust, Bazel, a source build, or a Cloudflare account. The full
browser mode starts Miniflare/workerd; the DOM adapters run Wasm in the test
process. Do not start the full browser for tests that only need DOM globals.

## Browser automation

Install `litesurf` and a CDP client such as `puppeteer-core` using the project's
package manager. The following ESM example uses Node 24 or newer:

```js
import { launch } from "litesurf";
import puppeteer from "puppeteer-core";

await using engine = await launch();
const browser = await puppeteer.connect({
  browserWSEndpoint: engine.browserWSEndpoint,
});
try {
  const page = await browser.newPage();
  await page.goto("https://example.com/");
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text);
  // When a screenshot is requested:
  // await page.screenshot({ path: "page.png", type: "png" });
} finally {
  await browser.disconnect();
}
```

Use `puppeteer.connect()` with litesurf's endpoint, not `puppeteer.launch()`.
No Chromium download is needed. `launch()` defaults to a dynamically assigned
loopback port; use the returned URL/endpoint rather than assuming port 8787.
Engine diagnostics can appear on stdout alongside application output. When
extracting page data, use the evaluated return value rather than treating the
entire process output as the page's text.

Disconnect the CDP client and dispose the engine even when navigation or page
code throws. Engine shutdown is asynchronous: use `await using`, not plain
`using`. Node 22 supports explicit `try/finally` cleanup instead:

```js
const engine = await launch();
try {
  // Connect and use the browser; disconnect the client in its own finally block.
} finally {
  await engine.close();
}
```

`launch()` accepts `port`, `inspectorPort`, `dist`, `assets`, and `bindings`.
It returns `url`, `browserWSEndpoint`, `fetch`, and idempotent async `close()`.
`engine.fetch()` dispatches requests to the local engine; it is not a substitute
for navigating a target website in `page.goto()`.

To expose an endpoint for another CDP client, use `npx litesurf --port 8787`.
This CLI has a different default port from the programmatic API. Stop it when
the task is finished. Use `launch` in new code; `startKitesurf` is a legacy alias.

## In-process DOM

Use this for synchronous DOM access without CDP or workerd. With Node 24:

```js
import { registerDOM } from "litesurf/dom";

using dom = await registerDOM({
  url: "http://localhost:3000/",
  width: 1280,
  height: 720,
});
document.body.innerHTML = '<div id="box" style="width:123px;height:45px"></div>';
const box = document.querySelector("#box");
console.log(box.getBoundingClientRect().width); // 123
```

`registerDOM()` is asynchronous setup; the resulting DOM operations are
synchronous. Its handle has synchronous `close()`/`Symbol.dispose`, so plain
`using` is appropriate after awaiting setup. On runtimes without this syntax,
call `dom.close()` in `finally`.

Options are `html`, `url`, `width`, `height`, and `dist`. Each registration creates
a fresh document, constructors, shim state, and storage while reusing initialized
Wasm for that distribution. Only one registration can own a JavaScript realm at
a time. Close it before registering another; closing restores previous globals.
Setup must run in the test's own global realm; separate VM globals are unsupported.

The `dist` override differs between APIs: `launch({ dist })` expects the Worker
directory, while `registerDOM({ dist })` expects the distribution root containing
`worker/` and `dom/`.

Initial HTML does not execute scripts or load external resources. Use the CDP
browser mode for navigation and page script execution. DOM APIs follow the pinned
Kitesurf shim; full jsdom API parity is not guaranteed.

## Vitest environment

Use ESM configuration and resolve the exported environment to its file path:

```js
// vitest.config.mjs
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: fileURLToPath(import.meta.resolve("litesurf/vitest")),
    environmentOptions: {
      litesurf: { url: "http://localhost:3000/", width: 1280, height: 720 },
    },
  },
});
```

Run tests normally with Vitest. The adapter installs globals during environment
setup and restores them at teardown; do not also call `registerDOM()` while the
environment owns them. Use the default process pool or threads; VM pools are
unsupported. Environment teardown is not per-test teardown: reset DOM/storage
between tests when they mutate shared state.

## Bun environment

Merge this into `bunfig.toml`, preserving unrelated preload entries:

```toml
[test]
environment = "node"
preload = ["litesurf/bun"]
```

Import `test` and `expect` from `bun:test` and run `bun test`. Use a preload,
not `environment = "litesurf"`: Bun does not accept custom environment names.
The preload owns one DOM for its process and frees it on exit; `--isolate` is
also supported. For custom options, replace the default preload with one that
calls `registerDOM(options)` and hooks `close()` into runner/process cleanup.
When replacing jsdom/happy-dom, remove their global registration from that
environment rather than loading both DOM implementations.

For TypeScript projects that restrict standard libraries, include `DOM` and
`DOM.Iterable`. Use ESM resolution such as `NodeNext` and `ESNext.Disposable` for
resource-management types. API types ship with litesurf as generated declarations.

For additional API details, see the [project documentation](https://github.com/tani/litesurf#readme).
