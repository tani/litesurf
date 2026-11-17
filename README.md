# litesurf

Run the experimental [Kitesurf](https://github.com/cloudflare/kitesurf) browser
engine locally from Node.js. litesurf starts Miniflare/workerd and exposes the
engine's Chrome DevTools Protocol endpoint for clients such as Puppeteer.
It is an independent adapter, not an official Cloudflare package.

## Use the package

After publication, install `litesurf` and a CDP client in your application:

```sh
npm install litesurf puppeteer-core
```

```js
import { startLitesurf } from "litesurf";
import puppeteer from "puppeteer-core";

await using engine = await startLitesurf();
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
const engine = await startLitesurf();
try {
  // Use the engine here.
} finally {
  await engine.close();
}
```

Installing a built npm tarball does not require Rust, Bazel, a Kitesurf checkout, or a Cloudflare account. Miniflare installs a
platform-specific workerd executable as a dependency.

`startLitesurf({ port, inspectorPort, dist, assets, bindings })` supports an
optional loopback port (`0`, the default, chooses an available port), inspector
port, prebuilt Worker directory, public asset directory, and Worker variable
overrides. It returns `url`, `browserWSEndpoint`, `fetch(url, init)` for direct
Miniflare requests, and an idempotent async `close()` method shared with
`[Symbol.asyncDispose]()`. Explicit and automatic cleanup can be combined.
The old adapter name `startKitesurf` remains an alias. Importing the package does not start it.

TypeScript declarations are generated from the API's JSDoc and included in the
package. The options and engine types can also be imported explicitly:

```ts
import { startLitesurf } from "litesurf";
import type { Litesurf, StartLitesurfOptions } from "litesurf";

const options: StartLitesurfOptions = { port: 0 };
await using engine: Litesurf = await startLitesurf(options);
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
