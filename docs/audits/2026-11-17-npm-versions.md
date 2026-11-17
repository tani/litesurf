# Published npm versions: 0.0.1 versus 0.0.2

The published 0.0.2 package reached `launch()` readiness about 13% sooner in this
measurement. Browser DOM/CSS/layout and PNG timings were close, with differences
of 0.5–2.5%. This does not establish a universal speedup across other machines
or workloads. No changes were made to the packages under comparison.

## Method

- Node v24.16.0 on Linux ARM64, default runtime flags, shared host without CPU
  affinity or operating-system file-cache resets.
- Install actual registry packages as npm aliases in one temporary project,
  using `npm install --ignore-scripts` and the public npm registry. Both packages
  declare the same exact Miniflare version, `5.20260911.1-alpha`.
- Five rounds. Alternate package order each round. Every version/round runs in
  a fresh Node process and starts its own workerd through `launch()`.
- Use the same Puppeteer client from this checkout for both packages.
- Browser fixture: 200 div/span items, inline CSS, data URL, no external site.
- Each browser workload has two warmups and five measured samples per process.
  Navigate to a fresh document and resolve initial layout outside each timing
  interval, keeping detached-node accumulation out of later workloads.
- Timings use Node wall time and include CDP transport for browser operations.
  Assertions validate node counts, CSS colors, widths, and PNG signatures.

The table reports the median of five process results. For browser workloads,
each process result is itself the median of five measured samples. Startup
metrics have one sample per fresh process. Positive percentages mean more time.

| Operation | 0.0.1, ms | 0.0.2, ms | Change |
| --- | ---: | ---: | ---: |
| Import package | 131.25 | 131.90 | +0.5% |
| `launch()` until ready | 395.77 | 344.30 | −13.0% |
| Connect, create page, first navigation and title check | 270.15 | 273.58 | +1.3% |
| Parse 200 items, 20 times | 40.08 | 41.06 | +2.5% |
| Select 200 spans, 500 times | 28.30 | 28.43 | +0.5% |
| Change class, resolve layout and computed style, 100 times | 21.68 | 21.82 | +0.6% |
| PNG screenshot | 19.06 | 19.28 | +1.2% |

`launch()` times by process:

- 0.0.1: 393.43 / 418.52 / 374.05 / 402.40 / 395.77 ms
- 0.0.2: 344.59 / 322.42 / 313.75 / 344.30 / 359.99 ms

All five 0.0.2 launch samples were below all five 0.0.1 samples on this host.
However, `launch()` readiness is not readiness of a rendered page. Summing
launch and first-page time within each process gives medians of 667.02 ms and
607.53 ms (about 8.9% less time), excluding module import. Do not add individual
metric medians to estimate an end-to-end median.

## Package identity and interpretation

Both distributions identify upstream commit
`235111c6fe10f2d63f3476bf5e3d19b4c7089415`. The renderer and scene-host Wasm hashes
match, but core Wasm differs in these actual published artifacts:

- 0.0.1 core SHA-256: `b37cb2886090f0e46ad6f4cac00193d24d7f83a6eb6e3a9661f7fcf243df8b89`
- 0.0.2 core SHA-256: `6c13fba66edd4cabd5fb439a347f11baccc8bef9b62519127ab1572a93db11d2`

The measurement does not isolate the cause of the launch difference. It is a
comparison of complete published distributions, not a controlled test of a
single source-code change or compiler option.

Version 0.0.1 has no `litesurf/dom` export. The earlier approximately 37% reduction
in repeated in-process DOM environment creation was a comparison of the DOM
adapter before and after a loader optimization, not a measurement of these two
npm versions. This report compares only their common `launch()` browser API.

## Reproduce

```sh
npm run bench:versions -- --pairs 5 --output /tmp/litesurf-versions.json
# Or choose two published stable versions explicitly:
node scripts/benchmark-versions.mjs 0.0.1 0.0.2 --pairs 5 --output /tmp/litesurf-versions.json
```

The script installs packages temporarily, runs them sequentially, writes raw
samples and Wasm provenance, then removes the temporary installation. It does
not use this checkout's runtime distribution. Network access is needed to
install npm packages, not for fixture navigation. Rerun on the target machine
before extrapolating the results to production workloads.

Raw samples and the full Wasm inventories are in
[2026-11-17-npm-versions.json](2026-11-17-npm-versions.json).
