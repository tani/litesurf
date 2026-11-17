# litesurf

Run the experimental [Kitesurf](https://github.com/cloudflare/kitesurf) browser
engine locally from Node.js. litesurf starts Miniflare/workerd and exposes the
engine's Chrome DevTools Protocol endpoint for clients such as Puppeteer.
It is an independent adapter, not an official Cloudflare package.

## Use the package

Install `litesurf` and a CDP client in your application:

```sh
npm install litesurf puppeteer-core
```

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
  console.log(await page.evaluate(() => document.body.innerText));
  await page.screenshot({ path: "page.png" });
} finally {
  await browser.disconnect();
}
```

The engine implements `Symbol.asyncDispose`: `await using` waits for shutdown
when its scope exits, including when code throws. This syntax requires
[Node.js 24 or newer](https://nodejs.org/en/blog/release/v24.0.0).
Shutdown is asynchronous, so use `await using` for the engine.

Node.js 22 remains supported with explicit cleanup:

```js
const engine = await launch();
try {
  // Use the engine here.
} finally {
  await engine.close();
}
```

Installing a built npm tarball does not require Rust, Bazel, a Kitesurf checkout, or a Cloudflare account. Miniflare installs a
platform-specific workerd executable as a dependency.

`launch({ port, inspectorPort, dist, assets, bindings })` supports an
optional loopback port (`0`, the default, chooses an available port), inspector
port, prebuilt Worker directory, public asset directory, and Worker variable
overrides. It returns `url`, `browserWSEndpoint`, `fetch(url, init)` for direct
Miniflare requests, and an idempotent async `close()` method shared with
`[Symbol.asyncDispose]()`. Explicit and automatic cleanup can be combined.
The old adapter name `startKitesurf` remains an alias. Importing the package does not start it.

TypeScript declarations are generated from the API's JSDoc and included in the
package. The options and engine types can also be imported explicitly:

```ts
import { launch } from "litesurf";
import type { Litesurf, LaunchOptions } from "litesurf";

const options: LaunchOptions = { port: 0 };
await using engine: Litesurf = await launch(options);
```

Use ESM with TypeScript's `NodeNext` resolution (or `Bundler` in a compatible
build setup), Node.js types, and the `ESNext.Disposable` library for `await using`.

The CLI starts a server on port 8787 by default:

```sh
npx litesurf --port 8787
```

`LITESURF_PORT` also sets the CLI port. Miniflare handles SIGINT/SIGTERM and
terminates its workerd child. The engine's CDP identifiers, bindings, and browser
version still use the upstream Kitesurf names.

## DOM test environments

The test adapters register synchronous browser globals backed by Kitesurf's Wasm
DOM, CSS, and layout engine. Existing tests can use `document`, `window`, DOM
events, and React Testing Library directly.

These adapters are new and are not included in npm version 0.0.1. Build this
checkout with `npm ci` and `npm run build` until the next release.

For Vitest, replace the `jsdom` or `happy-dom` environment with the exported
custom environment:

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

For Bun, use its preload configuration. Bun's built-in `environment` setting
supports `node`, `happy-dom`, and `jsdom`; custom names are not supported
([Bun documentation](https://bun.sh/docs/test/dom)).

```toml
# bunfig.toml
[test]
environment = "node"
preload = ["litesurf/bun"]
```

The test body stays the same:

```js
import { test, expect } from "vitest"; // or "bun:test"

test("DOM manipulation", () => {
  document.body.innerHTML = '<button id="save">Save</button>';
  const button = document.querySelector("#save");
  button.addEventListener("click", () => {
    button.textContent = "Saved";
  });
  button.click();
  expect(button.textContent).toBe("Saved");
});
```

Vitest restores the previous globals when its environment is torn down. Bun's
preload keeps a DOM for the process and releases it on exit; `bun test --isolate`
also works. To configure a custom preload, use `await registerDOM(options)` from
`litesurf/dom` and register `environment.close()` with your process or runner's
cleanup hook. Options are `html`, `url`, `width`, `height`, and `dist`.
For TypeScript, include `DOM` and `DOM.Iterable` in `compilerOptions.lib` when
your project restricts the default libraries.

This provides the in-process DOM layer, without starting workerd. It does not
execute scripts from the initial HTML or load external resources. The supported
DOM APIs follow the pinned Kitesurf shim; complete jsdom API parity is not claimed.
Use `launch()` and CDP when a test needs full browser navigation.

## Licenses

The litesurf adapter is licensed under Apache-2.0. Bundled engine code, Wasm,
fonts, and other assets retain their own licenses, including MPL-2.0. The npm
package includes third-party notices and license texts under `dist/licenses/`.
`dist/licenses/SOURCE_AVAILABILITY.txt` identifies the matching source archive,
including patched MPL-covered dependencies, and its SHA-256 checksum.

## Development and releases

```sh
nix run .#build   # Build from the pinned upstream source
nix develop      # Enter the development environment
```

- [Development](docs/development.md): repository layout, builds, checks, and upstream updates.
- [Releases](docs/releasing.md): GitHub Actions, release archives, and license/source packaging.
- [License audit](docs/audits/README.md): the initial Wasm dependency investigation.

The npm package includes `src/`, `bin/`, generated `dist/`, and the documentation
needed at runtime. `dist/upstream.json` records the engine revision;
`dist/licenses/` contains distribution notices. Development-only code and the
upstream checkout are excluded from the npm package.
