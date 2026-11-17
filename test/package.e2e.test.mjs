// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { basename, join, resolve } from "node:path";
import { test } from "node:test";
import { fs } from "zx";
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
    const dependencies = ["puppeteer-core", "@types/node"].map(
      (name) => `${name}@${devDependencies[name]}`,
    );
    await consumer({
      stdio: "inherit",
      timeout: 120_000,
    })`npm install --no-audit --no-fund ${join(project, pack.filename)} ${dependencies}`;
    for (const file of [
      "test/types.mts",
      "test/tsconfig.json",
      "test/fixtures/browser.mjs",
      "test/fixtures/consumer.mjs",
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
    console.log(`Tarball: ${pack.size} bytes compressed, ${pack.unpackedSize} bytes unpacked`);
  },
);
