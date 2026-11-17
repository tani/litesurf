// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { fs, tmpdir } from "zx";
import puppeteer from "puppeteer-core";
import { $ } from "./lib/shell.mjs";
import { walk } from "./lib/files.mjs";

const { values, positionals } = parseArgs({
  options: {
    worker: { type: "string" },
    pairs: { type: "string", default: "5" },
    output: { type: "string" },
  },
  allowPositionals: true,
});
const html = `<title>Benchmark</title><style>.item { display:block; width:120px; height:18px; color:red } .wide { width:180px }</style>${Array.from({ length: 200 }, (_, i) => `<div class="item" id="item-${i}"><span>Item ${i}</span></div>`).join("")}`;
const documentUrl = `data:text/html,${encodeURIComponent(html)}`;
const median = (numbers) => [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)];

async function sample(root) {
  const imported = performance.now();
  const { launch } = await import(pathToFileURL(join(root, "src/index.mjs")).href);
  const importMs = performance.now() - imported;
  const started = performance.now();
  const engine = await launch();
  const launchMs = performance.now() - started;
  let browser;
  try {
    const firstPage = performance.now();
    browser = await puppeteer.connect({ browserWSEndpoint: engine.browserWSEndpoint });
    const page = await browser.newPage();
    await page.goto(documentUrl);
    assert.equal(await page.title(), "Benchmark");
    const firstPageMs = performance.now() - firstPage;
    const results = {};
    for (const mode of ["parse", "selectors", "layout", "screenshot"]) {
      const times = [];
      for (let i = 0; i < 7; i++) {
        // Navigation resets the native document so detached nodes from parsing
        // cannot inflate a later workload. Setup is outside the timed region.
        await page.goto(documentUrl);
        assert.equal(
          await page.evaluate(
            () => document.querySelector("#item-100").getBoundingClientRect().width,
          ),
          120,
        );
        const before = performance.now();
        if (mode === "screenshot") {
          const png = await page.screenshot({ type: "png" });
          assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        } else {
          const result = await page.evaluate(
            (mode, markup) => {
              if (mode === "parse") {
                for (let i = 0; i < 20; i++) document.body.innerHTML = markup;
                return document.querySelectorAll(".item").length;
              }
              if (mode === "selectors") {
                let count = 0;
                for (let i = 0; i < 500; i++)
                  count += document.querySelectorAll("div.item > span").length;
                return count;
              }
              const element = document.querySelector("#item-100");
              let total = 0;
              for (let i = 0; i < 100; i++) {
                element.className = i % 2 ? "item" : "item wide";
                const width = element.getBoundingClientRect().width;
                if (
                  width !== (i % 2 ? 120 : 180) ||
                  getComputedStyle(element).color !== "rgb(255, 0, 0)"
                )
                  throw Error("CSS/layout mismatch");
                total += width;
              }
              return total;
            },
            mode,
            html,
          );
          assert.equal(result, { parse: 200, selectors: 100000, layout: 15000 }[mode]);
        }
        if (i >= 2) times.push(performance.now() - before);
      }
      results[`${mode}Ms`] = { median: median(times), samples: times };
    }
    return { importMs, launchMs, firstPageMs, ...results };
  } finally {
    try {
      await browser?.disconnect();
    } finally {
      await engine.close();
    }
  }
}

if (values.worker) {
  const result = await sample(resolve(values.worker));
  console.log(`LITESURF_BENCHMARK=${JSON.stringify(result)}`);
} else {
  const versions = positionals.length ? positionals : ["0.0.1", "0.0.2"];
  const pairs = Number(values.pairs);
  if (
    versions.length !== 2 ||
    versions.some((v) => !/^\d+\.\d+\.\d+$/.test(v)) ||
    !Number.isInteger(pairs) ||
    pairs < 3 ||
    pairs > 20
  )
    throw Error(
      "Usage: node scripts/benchmark-versions.mjs [version1 version2] [--pairs 3..20] [--output file]",
    );
  const directory = tmpdir("litesurf-versions-");
  fs.writeJsonSync(join(directory, "package.json"), {
    name: "litesurf-version-benchmark",
    private: true,
  });
  try {
    const aliases = versions.map((version, i) => `litesurf-v${i}@npm:litesurf@${version}`);
    await $({
      cwd: directory,
      stdio: "inherit",
    })`npm install --ignore-scripts --no-audit --no-fund --registry https://registry.npmjs.org ${aliases}`;
    const packages = versions.map((version, i) => {
      const root = join(directory, "node_modules", `litesurf-v${i}`);
      const manifest = fs.readJsonSync(join(root, "package.json"));
      assert.equal(manifest.version, version);
      const wasm = {};
      for (const file of walk(join(root, "dist")).filter((file) => file.endsWith(".wasm"))) {
        wasm[file.slice(root.length + 1)] = createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex");
      }
      return {
        version,
        root,
        provenance: fs.readJsonSync(join(root, "dist/upstream.json")),
        wasm,
        samples: [],
      };
    });
    for (let i = 0; i < pairs; i++) {
      for (const pkg of i % 2 ? [...packages].reverse() : packages) {
        console.error(`Round ${i + 1}/${pairs}: litesurf@${pkg.version}`);
        const result =
          await $`${process.execPath} ${fileURLToPath(import.meta.url)} --worker ${pkg.root}`.quiet();
        const record = result.stdout
          .split("\n")
          .find((line) => line.startsWith("LITESURF_BENCHMARK="));
        if (!record) throw Error(`Missing benchmark result: ${result.stdout}`);
        pkg.samples.push(JSON.parse(record.slice("LITESURF_BENCHMARK=".length)));
      }
    }
    const report = {
      measuredAt: new Date().toISOString(),
      runtime: process.version,
      platform: `${process.platform}/${process.arch}`,
      pairs,
      workload: {
        items: 200,
        parses: 20,
        selectors: 500,
        layoutChanges: 100,
        warmups: 2,
        samplesPerProcess: 5,
      },
      timing:
        "Node wall time; browser operation timings include CDP transport; fresh Node process per version per round",
      packages: packages.map(({ root: _root, ...pkg }) => ({
        ...pkg,
        medians: Object.fromEntries(
          Object.keys(pkg.samples[0]).map((key) => [
            key,
            median(pkg.samples.map((s) => (typeof s[key] === "number" ? s[key] : s[key].median))),
          ]),
        ),
      })),
    };
    if (values.output) fs.outputJsonSync(resolve(values.output), report, { spaces: 2 });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.removeSync(directory);
  }
}
