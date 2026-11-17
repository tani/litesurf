// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0
// Modified by the litesurf contributors: adapted runtime tests for the Node.js package, modules, and asynchronous disposal.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { temporaryDirectory } from "./helpers.mjs";
import { launch } from "litesurf";

test("Node runtime loads modules, assets, bindings and dynamic workers, then releases its port", async (t) => {
  const root = temporaryDirectory(t);
  const dist = join(root, "worker");
  const assets = join(root, "public");
  mkdirSync(dist);
  mkdirSync(assets);
  writeFileSync(join(assets, "asset.txt"), "asset contents");
  writeFileSync(join(dist, "glue.glue.js"), "wasm glue");
  writeFileSync(join(dist, "style.css"), "body {}");
  writeFileSync(join(dist, "data.bin"), new Uint8Array([1, 2, 3]));
  writeFileSync(join(dist, "empty.wasm"), new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  writeFileSync(
    join(dist, "engine-mf.json"),
    JSON.stringify({
      compatibilityDate: "2026-09-11",
      bindings: { VALUE: "default", UNCHANGED: "kept" },
      workerLoaders: { LOADER: {} },
      assets: {
        directory: "../public",
        binding: "FONT_ASSETS",
        run_worker_first: true,
        routerConfig: { has_user_worker: true },
      },
    }),
  );
  writeFileSync(
    join(dist, "index.js"),
    `
    import glue from "./glue.glue.js";
    import css from "./style.css";
    import bytes from "./data.bin";
    import wasm from "./empty.wasm";
    export default {
      async fetch(request, env) {
        if (new URL(request.url).pathname === "/asset") {
          return env.FONT_ASSETS.fetch("https://assets.invalid/asset.txt");
        }
        const worker = env.LOADER.load({
          compatibilityDate: "2026-09-11", mainModule: "worker.js",
          modules: { "worker.js": 'export default { fetch() { return new Response("dynamic"); } }' },
        });
        const response = await worker.getEntrypoint().fetch("https://page.invalid/");
        return Response.json({ value: env.VALUE, kept: env.UNCHANGED, glue, css,
          bytes: Array.from(new Uint8Array(bytes)), wasm: new WebAssembly.Instance(wasm).exports,
          dynamic: await response.text() });
      },
    };
  `,
  );
  const engine = await launch({ dist, bindings: { VALUE: "override" } });
  t.after(() => engine.close());
  assert.equal(new URL(engine.url).hostname, "127.0.0.1");
  assert.equal(engine.browserWSEndpoint, engine.url.replace("http:", "ws:") + "devtools/browser");
  const response = await engine.fetch(new URL("/runtime", engine.url));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    value: "override",
    kept: "kept",
    glue: "wasm glue",
    css: "body {}",
    bytes: [1, 2, 3],
    wasm: {},
    dynamic: "dynamic",
  });
  assert.equal(await (await fetch(new URL("/asset", engine.url))).text(), "asset contents");
  const closing = engine.close();
  assert.equal(engine.close(), closing);
  assert.equal(engine[Symbol.asyncDispose], engine.close);
  assert.equal(engine[Symbol.asyncDispose](), closing);
  await closing;
  const next = await launch({ dist, port: Number(new URL(engine.url).port) });
  await next.close();
});

test("await using releases the runtime on normal exit and exceptions", async (t) => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let run;
  try {
    run = new AsyncFunction(
      "start",
      "options",
      "body",
      `
      await using engine = await start(options);
      await body(engine);
    `,
    );
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    t.skip("Native await using syntax requires Node.js 24 or newer");
    return;
  }
  const root = temporaryDirectory(t);
  writeFileSync(join(root, "engine-mf.json"), JSON.stringify({ compatibilityDate: "2026-09-11" }));
  writeFileSync(
    join(root, "index.js"),
    'export default { fetch() { return new Response("OK"); } };',
  );
  for (const shouldThrow of [false, true]) {
    let disposed;
    const expectedError = new Error("scope failed");
    const running = run(launch, { dist: root }, async (engine) => {
      disposed = engine;
      assert.equal((await engine.fetch(new URL("/", engine.url))).status, 200);
      if (shouldThrow) throw expectedError;
    });
    if (shouldThrow) await assert.rejects(running, (error) => error === expectedError);
    else await running;
    const reopened = await launch({ dist: root, port: Number(new URL(disposed.url).port) });
    t.after(() => reopened.close());
    await reopened.close();
    assert.equal(disposed.close(), disposed[Symbol.asyncDispose]());
    await disposed.close();
  }
});

test("invalid ports and a missing build produce actionable errors", async (t) => {
  for (const port of [-1, 65536, 1.5, NaN]) {
    await assert.rejects(launch({ port }), RangeError);
  }
  const root = temporaryDirectory(t);
  await assert.rejects(launch({ dist: root }), /npm run build/);
});
