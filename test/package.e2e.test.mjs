// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { basename, join, resolve } from "node:path";
import { test } from "node:test";
import { fs, which } from "zx";
import { $, json, run } from "../scripts/lib/shell.mjs";
import { ROOT, packageManifest } from "../scripts/lib/project.mjs";
import { verifyDist } from "../scripts/verify-dist.mjs";
import { temporaryDirectory } from "./helpers.mjs";

function verifyPackageFiles(files) {
  for (const { path } of files) {
    assert.ok(!/^(?:upstream|scripts|test)\//.test(path), path);
    assert.ok(!path.endsWith(".map"), path);
  }
  assert.ok(files.some(({ path }) => path === "dist/upstream.json"));
  assert.ok(files.some(({ path }) => path === "dist/types/index.d.mts"));
  assert.ok(files.some(({ path }) => path === "dist/dom/shim.mjs"));
  assert.ok(files.some(({ path }) => path === "dist/types/dom.d.mts"));
  assert.ok(files.some(({ path }) => path.endsWith("core_bg.wasm")));
}

test(
  "an installed npm tarball type-checks and browses without the upstream checkout",
  { timeout: 180_000 },
  async (t) => {
    const project = temporaryDirectory(t);
    const consumer = $({ cwd: project });
    const tarball = process.env.LITESURF_TEST_TARBALL
      ? [resolve(process.env.LITESURF_TEST_TARBALL)]
      : [];
    if (!tarball.length) await run`npm run build:types`;
    verifyDist();
    const [pack] =
      await json`npm pack ${tarball} --json --ignore-scripts --pack-destination ${project}`
        .quiet()
        .json();
    verifyPackageFiles(pack.files);
    fs.writeJsonSync(join(project, "package.json"), { private: true, type: "module" });
    const { devDependencies } = packageManifest();
    const dependencies = [
      "puppeteer-core",
      "@types/node",
      "vitest",
      "react",
      "react-dom",
      "@testing-library/react",
    ].map(
      (name) =>
        `${name}@${name === "vitest" ? (process.env.LITESURF_TEST_VITEST_VERSION ?? devDependencies[name]) : devDependencies[name]}`,
    );
    await consumer({
      stdio: "inherit",
      timeout: 120_000,
    })`npm install --no-audit --no-fund ${join(project, pack.filename)} ${dependencies}`;
    for (const file of [
      "test/types.mts",
      "test/dom-types.mts",
      "test/tsconfig.json",
      "test/fixtures/browser.mjs",
      "test/fixtures/consumer.mjs",
      "test/fixtures/dom-contract.mjs",
    ]) {
      fs.copySync(join(ROOT, file), join(project, basename(file)));
    }
    await consumer({
      stdio: "inherit",
    })`${process.execPath} ${join(ROOT, "node_modules/typescript/bin/tsc")} -p tsconfig.json`;
    const result = await consumer`${process.execPath} consumer.mjs`.quiet().timeout(60_000);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /sentryErrorContext|Uncaught|failed: script/,
    );
    assert.match(result.stdout, /PACKAGED_BROWSER_OK/);
    assert.match(result.stdout, /PACKAGED_DOM_OK/);
    // Run the actual environment adapters from the installed package, not this checkout.
    for (const file of [
      "test/fixtures/dom-contract.mjs",
      "test/adapters/vitest.config.mjs",
      "test/adapters/dom.vitest.test.mjs",
      "test/adapters/react.vitest.test.mjs",
      "test/adapters/dom.bun.test.mjs",
      "test/adapters/react.bun.test.mjs",
    ])
      fs.copySync(join(ROOT, file), join(project, file));
    await consumer({
      stdio: "inherit",
    })`${process.execPath} node_modules/vitest/vitest.mjs run --config test/adapters/vitest.config.mjs`;
    const bun = await which("bun", { nothrow: true });
    if (bun)
      await consumer({
        stdio: "inherit",
      })`${bun} test --preload litesurf/bun ./test/adapters/dom.bun.test.mjs ./test/adapters/react.bun.test.mjs`;
    console.log(`Tarball: ${pack.size} bytes compressed, ${pack.unpackedSize} bytes unpacked`);
  },
);
