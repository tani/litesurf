// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { registerDOM } from "../src/dom.mjs";
import { DIST } from "./lib/project.mjs";

// Compare distributions in separate processes, without reusing an initialized Wasm module.
const dist = resolve(process.argv[2] ?? DIST);
const worker = resolve(dist, "worker");
const wasm = readdirSync(worker).filter((name) => name.endsWith("kitesurf_core_bg.wasm"));
assert.equal(wasm.length, 1);
const bytes = readFileSync(resolve(worker, wasm[0]));
const artifact = {
  sha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.length,
};
const start = performance.now();
const initial = await registerDOM({ dist });
const startupMs = performance.now() - start;
initial.close();

const html = `<style>.item { display:block; width:120px; height:18px; color:red } .wide { width:180px }</style>${Array.from({ length: 200 }, (_, i) => `<div class="item" id="item-${i}"><span>Item ${i}</span></div>`).join("")}`;
const workloads = {
  parse: () => {
    for (let i = 0; i < 20; i++) document.body.innerHTML = html;
  },
  selectors: () => {
    for (let i = 0; i < 500; i++)
      assert.equal(document.querySelectorAll("div.item > span").length, 200);
  },
  layout: () => {
    const element = document.querySelector("#item-100");
    for (let i = 0; i < 100; i++) {
      element.className = i % 2 ? "item" : "item wide";
      assert.equal(element.getBoundingClientRect().width, i % 2 ? 120 : 180);
      assert.equal(getComputedStyle(element).color, "rgb(255, 0, 0)");
    }
  },
};
const warmups = 30;
const sampleCount = 9;
const results = {};
const registrations = [];
for (let i = 0; i < warmups + sampleCount; i++) {
  const before = performance.now();
  const environment = await registerDOM({ dist });
  environment.close();
  if (i >= warmups) registrations.push(performance.now() - before);
}
registrations.sort((a, b) => a - b);
results.registration = {
  medianMs: registrations[4],
  minMs: registrations[0],
  maxMs: registrations[8],
};
for (const [name, run] of Object.entries(workloads)) {
  const samples = [];
  for (let i = 0; i < warmups + sampleCount; i++) {
    // A new document per sample keeps detached-node accumulation out of later workloads.
    const environment = await registerDOM({ dist });
    try {
      document.body.innerHTML = html;
      assert.equal(document.querySelector("#item-100").getBoundingClientRect().width, 120);
      const before = performance.now();
      run();
      const elapsed = performance.now() - before;
      if (i >= warmups) samples.push(elapsed);
    } finally {
      environment.close();
    }
  }
  samples.sort((a, b) => a - b);
  results[name] = { medianMs: samples[4], minMs: samples[0], maxMs: samples[8] };
}
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      bun: process.versions.bun,
      platform: `${process.platform}/${process.arch}`,
      artifact,
      startupMs,
      warmups,
      samples: sampleCount,
      results,
    },
    null,
    2,
  ),
);
