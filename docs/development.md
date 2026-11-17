# Development

## Repository structure

```text
litesurf/
  src/                 Node.js API, JSDoc types, and Miniflare lifecycle
  bin/                 litesurf CLI
  scripts/             build, provenance, cleanup, and release entry points
    lib/               shared paths, zx presets, files, and archives
    release/           dependency, notice, source, and asset stages
  docs/                maintainer guides and dated audit snapshots
  licenses/            checksum-pinned license texts
  .github/workflows/   release automation
  test/                adapter and installed-package tests
    fixtures/          shared browser checks and standalone npm consumer
  upstream/kitesurf/   unmodified upstream Git submodule
  dist/                generated types, Worker, Wasm, assets, and notices
  release/             generated release archives (ignored)
```

The Git submodule fixes the upstream source to an exact commit. No patches are
applied to it. Changes previously made to Kitesurf's package files, Bazel targets,
README, and test launcher have been removed; the adapter is owned entirely here.
The runtime loader was extracted from upstream's `scripts/wpt-engine.mjs`.
`src/index.mjs` owns the public API and shutdown lifecycle; `src/worker.mjs`
loads the Worker configuration and discovers its modules.

Only `src/`, `bin/`, `dist/`, and package documentation are included in the npm
tarball. Upstream source, tests, build scripts, and source maps are excluded.
`dist/upstream.json` identifies the upstream commit and Miniflare version used
for that build. `dist/licenses/` retains upstream notices and license texts.

## Build with Nix

Run the commands below from the repository root.

The flake pins the host tools through `flake.lock`, including Node.js 24,
Bazelisk, a C/C++ compiler, Python, and GNU tar. From the litesurf checkout:

```sh
nix run .#build
```

This initializes the pinned Kitesurf submodule, runs `npm ci`, builds the engine,
and verifies the generated `dist/`. `nix run` without an attribute does the same.
To work interactively with the pinned tools:

```sh
nix develop
git submodule update --init --recursive
npm ci
npm run build
npm run check
npm run test:e2e
```

`nix flake check` validates the flake and build launcher; `nix fmt` formats the
Nix source. The flake defines Linux x86-64, Linux ARM64, and macOS ARM64 outputs,
matching upstream's build platforms. The build was verified on Ubuntu ARM64.

The build command runs in your checkout with network access: npm and Bazel
download their pinned dependencies and toolchains. This is a development
environment and source-build command, not a sandboxed `nix build` derivation.
Upstream also uses FHS paths such as `/usr/bin/python3` and prebuilt Linux
executables; NixOS needs compatible FHS runtime support for those tools. Python remains in
the Nix toolchain for upstream Bazel scripts; litesurf management and release
scripts use JavaScript and zx. Shared command presets select the checkout or
upstream working directory. Use zx's `fs`, `glob`, `tmpdir`, and process output
helpers instead of adding equivalent wrappers.
The Nix Bazel wrapper overrides upstream's repository tool search path without
editing the submodule. Its Bazel version comes from upstream's `.bazelversion`.

## Build and verify without Nix

From a source checkout, initialize the submodule and install the adapter's
dependencies:

```sh
git submodule update --init --recursive
npm ci
npm run build
npm run check
npm run test:e2e
npm run test:package
```

Source builds require Bazelisk installed as `bazel`; `BAZEL` can select another
executable. Upstream pins and downloads its own Bazel, Rust, and npm build tools.
The adapter invokes the existing `//packages/engine:dist` target and copies its
output into `dist/` as regular files, including fonts behind Bazel runfile links.
It neither installs workspace dependencies into upstream nor edits its sources.

`npm run check` verifies the submodule pin, rejects local upstream changes,
checks adapter JavaScript syntax and JSDoc types, generates public declarations,
and runs focused runtime and CLI tests.
`test:e2e` runs Puppeteer against the built engine. `test:package` makes a local
tarball, installs it in a temporary project with registry access, and verifies
TypeScript imports (including `await using` and invalid arguments), page JavaScript,
and PNG rendering independently of the source checkout. Both browser tests use
the same `test/fixtures/browser.mjs` contract.

Use `npm start -- --port 8787` during development. `npm pack` requires a prepared
license/source release and checks that the package matches its verified runtime
tarball; it does not publish it. Run `npm run release:prepare` before packing.
`npm publish` also requires the exact source archive to be publicly downloadable. Run the build
after changing the upstream pin or Miniflare version. A build rejects a modified
or unpinned upstream checkout.

## Update upstream

```sh
git -C upstream/kitesurf fetch origin
git -C upstream/kitesurf checkout --detach <reviewed-commit>
git add upstream/kitesurf
npm run build
npm run check
npm run test:e2e
npm run test:package
```

Review the upstream diff and its pinned Miniflare API when choosing a revision.
Run upstream's `pnpm run check` and the smallest relevant upstream e2e subset
when updating the engine revision. Commit the submodule pointer together with
any adapter changes it requires. Generated artifacts stay out of Git and are
rebuilt for publication. Publishing to npm remains a separate, explicit action.

## Maintenance commands

| Command                | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `npm run check:types`  | Generate declarations from JSDoc and check TypeScript consumers |
| `npm run build:types`  | Generate `dist/types/index.d.mts` without rebuilding Wasm       |
| `npm run check`        | Source pin, JavaScript syntax, and runtime tests                |
| `npm run test:e2e`     | Browser behavior with the real engine                           |
| `npm run test:package` | Install and exercise the npm tarball                            |
| `npm run test:release` | Python release-integrity tests                                  |
| `npm run clean`        | Remove temporary staging directories                            |

Cleanup preserves `dist/`, `release/`, `node_modules/`, and the upstream checkout.
`release/archive/` may hold earlier local package experiments; current prepared
releases live under `release/v<version>/`. See [releases](releasing.md).
