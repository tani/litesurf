# Rust/Wasm runtime optimization review

The default remains upstream's configuration. The tested alternatives did not
show a reliable runtime improvement sufficient to change it. This review is
specific to Kitesurf `235111c6fe10f2d63f3476bf5e3d19b4c7089415` and the pinned
Rust nightly `2026-05-14`.

## Effective configuration

Bazel, rather than Cargo, builds the shipped Wasm. `bazel aquery` confirms that
core receives `opt-level=3`, `debuginfo=0`, `strip=debuginfo`,
`codegen-units=1`, `panic=unwind`, and
`target-feature=+simd128,+bulk-memory,+nontrapping-fptoint,+sign-ext`.
Debug assertions are disabled by Rust's optimized-build default.
The renderer and scene host explicitly request `-Clto=fat`; core does not.
Upstream then runs wasm-bindgen and `wasm-opt -O3`.

Changing Bazel's compilation mode to `opt` alone does not increase Wasm's
optimization level: the pinned Wasm toolchains use level 3 in all three modes.
Cargo's `[profile.release]` is not the control point for these Bazel actions.

## Comparisons

- Adding `-Clto=fat` only to core fails with
  `lto can only be run for executables, cdylibs and static library outputs`.
  Its existing action requests both `--crate-type=cdylib` and
  `--crate-type=rlib`. Keep this upstream build contract intact.
- Adding `-Cllvm-args=-inline-threshold=500` only to core caused the pinned
  rustc/LLVM to terminate with SIGSEGV. This is an observation on this host,
  not a diagnosis of the compiler defect. Do not enable this option.
- Adding `-Copt-level=2` only to core builds successfully. Other crates and
  the custom standard library keep their upstream settings. The `core-o2`
  profile exists for further measurements; it is not the default.

## Measured runtime

Linux ARM64, Cortex-X925/Cortex-A725 host, Node v24.16.0, normal V8 flags.
Run each profile in a fresh process, alternating the order across three pairs.
Each workload has 30 warmups followed by nine samples, with a fresh DOM for
every iteration. Setup and teardown are outside the measured interval.
Layout is explicitly resolved before timing. Correctness assertions run for
both variants. Values below are medians of each process's nine samples, in ms.

| Workload | Upstream, runs 1 / 2 / 3 | Core O2, runs 1 / 2 / 3 |
| --- | --- | --- |
| Parse 200 items, 20 times | 22.438 / 22.833 / 22.831 | 22.533 / 22.382 / 22.502 |
| Select 200 spans, 500 times | 19.215 / 19.879 / 19.196 | 19.176 / 19.289 / 21.984 |
| Change class, resolve layout and computed style, 100 times | 8.418 / 8.763 / 8.649 | 8.387 / 8.657 / 8.427 |

Across the three process medians, O2 takes 1.4% less time parsing, 0.4% more
time selecting, and 2.6% less time in layout/style. Ranges overlap. These
small differences on one shared host do not establish a general speedup.
They do not measure page navigation, JavaScript execution in the browser,
rendering/PDF, memory usage, or Bun throughput. Startup is reported separately
as a single observation per process, not a statistically validated improvement.

Core Wasm identity after upstream's wasm-opt pass:

| Profile | Bytes | SHA-256 |
| --- | ---: | --- |
| upstream | 27,131,810 | `d597fd2385fbda7e517911efa8d48300de8f232c63bb6ff76699680b131d25e9` |
| core-o2 | 27,157,483 | `2c11d920684f21ae86375a1b0e57cc26a780c05c87c005978509952b325ab81a` |

## Reproduce

Build, preserve each distribution, then measure without another build running:

```sh
npm run build
cp -R dist /tmp/litesurf-upstream
LITESURF_RUST_PROFILE=core-o2 npm run build
cp -R dist /tmp/litesurf-core-o2
npm run bench:dom -- /tmp/litesurf-upstream
npm run bench:dom -- /tmp/litesurf-core-o2
# Repeat in alternating order; retain JSON outputs.
npm run build # restore the default distribution
```

Use new destination directories. Compare matching Wasm hashes, runtime versions,
workload counts, and upstream revisions. Avoid treating any single result as
proof. The benchmark uses the synchronous DOM adapter and actual Rust CSS/layout,
without workerd or CDP transport. Detached-node accumulation is isolated by a
fresh document per sample so parsing cannot increase a later layout workload.

The selected profile and Bazel flags are recorded in `dist/upstream.json`.
Build, `bazel info`, and release dependency queries use the same flags.
Release preparation rejects a skipped build with a different recorded profile's
flags, so license/source discovery cannot silently describe another configuration.

References: [Rust code generation options](https://doc.rust-lang.org/rustc/codegen-options/index.html),
[rules_rust per-crate flags](https://bazelbuild.github.io/rules_rust/rust_settings.html#per_crate_rustc_flag).
