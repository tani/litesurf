# Audit snapshots

The [Rust runtime review](2026-11-17-rust-runtime.md) records the effective Bazel
compiler settings, tested alternatives, measurements, and reproduction steps.
The [DOM runtime review](2026-11-17-dom-runtime.md) records the Wasm loader cache,
repeated environment creation measurements, and remaining startup costs.

## License audits

The 2026-11-17 JSON and CSV files record the initial investigation of the three
Wasm artifacts built from Kitesurf commit
`235111c6fe10f2d63f3476bf5e3d19b4c7089415`.

The JSON and CSV snapshots are retained in source control and source archives;
they are excluded from the npm runtime package.

These are historical research snapshots. In particular, their findings about
missing notices describe the distribution before the release-packaging work.
They are not the current release's inventory or a legal approval.

For a prepared release, use `dist/licenses/DEPENDENCIES.json`,
`THIRD_PARTY_NOTICES.txt`, and `SOURCE_AVAILABILITY.txt`, together with the
matching source archive. See [release instructions](../releasing.md).
