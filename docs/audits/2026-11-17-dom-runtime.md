# DOM environment runtime optimization

The DOM loader now reuses each distribution's initialized Wasm core. It keeps
creating a new native document, DOM shim, constructors, globals, and storage
for every registration. Upstream Rust, generated glue, and Wasm are unchanged.

## Finding and change

Previously, every `registerDOM()` enumerated the worker directory and read the
27,131,810-byte core Wasm before calling `initSync()`. The generated glue's
`initSync()` immediately returns its existing instance after initialization,
but JavaScript has already evaluated `readFileSync()` by that point. Repeated
registrations therefore allocated and read about 27 MB unnecessarily each time.

Cache the initialization promise by resolved distribution path. Successful
loads reuse the existing core; failed loads are evicted and may be retried.
Keep this cache independent of document and shim state. Existing isolation tests
check new documents and storage plus restoration of browser globals. A new
regression test repairs a previously missing distribution and retries its load.

## Measurement

Linux ARM64, Node v24.16.0, Bun 1.4.4, default runtime flags, same Wasm SHA-256:
`d597fd2385fbda7e517911efa8d48300de8f232c63bb6ff76699680b131d25e9`.

Each fresh process first registers and closes one environment to initialize
Wasm, then runs 15 warmups and 30 timed empty-document registrations. A sample
includes `registerDOM()`, an empty-body assertion, and `close()`. Before and
after run in separate processes with the same distribution. No build runs
concurrently. Node medians across three processes:

| Implementation | Median registration + close, ms |
| --- | --- |
| Before | 15.562 / 15.608 / 15.413 |
| Cached core | 9.860 / 9.836 / 9.813 |

Median of process medians: 15.562 → 9.836 ms, about **37% less elapsed time**.
This is repeated registration throughput on one host, not first initialization,
whole-suite throughput, browser navigation, or DOM operation throughput.
The first Wasm load still takes roughly 100–125 ms and remains necessary.

The benchmark procedure is equivalent to:

```js
const { registerDOM } = await import(adapterPath);
(await registerDOM({ dist })).close();
const samples = [];
for (let i = 0; i < 45; i++) {
  const start = performance.now();
  const environment = await registerDOM({ dist });
  if (environment.document.body.innerHTML !== '') throw Error('unexpected contents');
  environment.close();
  if (i >= 15) samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
console.log(samples[15]);
```

`npm run bench:dom` now also reports a `registration` result, using its standard
30 warmups and nine samples. Its timed registration sample includes creation and
close, without document setup. Preserve adapter revisions separately when
comparing loader changes; Wasm hashes alone do not identify JavaScript adapters.

## Other findings

A Node CPU profile after the change places most remaining registration work in
the shim factory's Web IDL/prototype initialization and garbage collection.
Sharing one factory result between tests would share mutable constructor and
prototype state; this change retains a fresh factory per registration.

The Rust layout implementation already checks its dirty flag before resolving
layout and skips clean non-animating documents. A JavaScript computed-style
cache would need to preserve invalidation for all DOM mutations, CSSOM changes,
animations, and pseudo elements. No such cache is introduced without evidence
that its correctness and additional complexity are justified.

The earlier [Rust build review](2026-11-17-rust-runtime.md) still applies:
O3, SIMD, and a single codegen unit remain the default. This improvement removes
adapter overhead rather than altering compiler flags or upstream sources.
