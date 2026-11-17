// SPDX-License-Identifier: Apache-2.0

import { startKitesurf, startLitesurf } from "litesurf";
import type { Litesurf, StartLitesurfOptions } from "litesurf";

const options: StartLitesurfOptions = {
  port: 0,
  inspectorPort: 9230,
  dist: "./worker",
  assets: "./public",
  bindings: { NAME: "value" },
};
const alias: typeof startLitesurf = startKitesurf;
const pending: Promise<Litesurf> = alias(options);
const engine = await pending;
const disposable: AsyncDisposable = engine;
const url: string = engine.url;
const _endpoint: string = engine.browserWSEndpoint;
const response = await engine.fetch(new URL("/health", url), { method: "GET" });
const _body: string = await response.text();
const _status: number = response.status;
const _shutdown: Promise<void> = engine.close();
await disposable[Symbol.asyncDispose]();
await using scoped = await startLitesurf();
const _scopedEndpoint: string = scoped.browserWSEndpoint;

// @ts-expect-error Ports must be numeric.
startLitesurf({ port: "8787" });
// @ts-expect-error Bindings accept strings.
startLitesurf({ bindings: { COUNT: 1 } });
// @ts-expect-error Unknown options must be rejected.
startLitesurf({ unknownOption: true });
// @ts-expect-error Fetch input must be a request, URL, or string.
engine.fetch(42);
// @ts-expect-error Request methods must be strings.
engine.fetch(url, { method: 42 });
// @ts-expect-error close is asynchronous.
const _closed: void = engine.close();
