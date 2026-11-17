// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0
// Modified by the litesurf contributors: extracted and changed the Node.js launch API, package loading, and asynchronous disposal.

import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { workerOptions } from "./worker.mjs";

/**
 * Options for starting a local browser engine.
 * @typedef {object} LaunchOptions
 * @property {number} [port=0] HTTP port on 127.0.0.1; 0 chooses an available port.
 * @property {number} [inspectorPort] Optional Miniflare Worker inspector port.
 * @property {string} [dist] Prebuilt Worker directory; defaults to the packaged dist/worker.
 * @property {string} [assets] Override the configured public asset directory.
 * @property {Record<string, string>} [bindings] Override Worker string bindings.
 */

/**
 * A running engine. Shutdown is shared by close() and Symbol.asyncDispose.
 * @typedef {object} LitesurfRuntime
 * @property {string} url Local HTTP base URL, including the assigned port.
 * @property {string} browserWSEndpoint CDP WebSocket URL for clients such as Puppeteer.
 * @property {import("miniflare").DispatchFetch} fetch Dispatch a request directly to Miniflare.
 * @property {() => Promise<void>} close Stop the engine; repeated calls return the same promise.
 */

/**
 * Supports automatic asynchronous shutdown with `await using`.
 * @typedef {LitesurfRuntime & AsyncDisposable} Litesurf
 */

/**
 * Start the packaged Kitesurf engine on the loopback interface.
 * Importing this module does not start any processes.
 * @param {LaunchOptions} [options] Port, distribution, assets, and binding overrides.
 * @returns {Promise<Litesurf>} The ready engine and its shutdown methods.
 * @throws {RangeError} If the HTTP port is not an integer between 0 and 65535.
 * @example
 * await using engine = await launch({ port: 0 });
 * console.log(engine.browserWSEndpoint);
 */
export async function launch(options = {}) {
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError("port must be an integer between 0 and 65535");
  }
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      host: "127.0.0.1",
      port,
      inspectorPort: options.inspectorPort,
      cf: false,
      workers: [workerOptions(options)],
    }),
  );
  let url;
  try {
    url = await miniflare.ready;
  } catch (error) {
    await miniflare.dispose().catch(() => {});
    throw error;
  }
  const endpoint = new URL("/devtools/browser", url);
  endpoint.protocol = "ws:";
  /** @type {Promise<void> | undefined} */
  let closing;
  const close = () => (closing ??= miniflare.dispose());
  return {
    url: url.href,
    browserWSEndpoint: endpoint.href,
    fetch: miniflare.dispatchFetch.bind(miniflare),
    close,
    [Symbol.asyncDispose]: close,
  };
}

/** Backward-compatible alias of launch with the same options and return type. */
export { launch as startKitesurf };
