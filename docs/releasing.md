# Releases

`.github/workflows/release.yml` prepares and verifies the runtime and its
corresponding dependency sources. A manual workflow run uploads CI artifacts
for review. Pushing a tag matching `package.json`, such as `v0.0.1`, also creates
a GitHub Release through `gh_release`. All attachments are uploaded to a draft
before it is published. The separate `npm_release` job depends on `gh_release`.

The attachments are:

- `litesurf-v0.0.1.tgz`: an npm-installable runtime with Wasm, fonts, notices,
  dependency inventory, and source-availability information.
- `litesurf-v0.0.1-sources.tar.gz`: the adapter, pinned upstream source, actual
  patched dependency sources, bundled JavaScript dependencies, and Rust library
  sources and notices. Its `SOURCE_MANIFEST.json` records individual file hashes.
- `SHA256SUMS` and `release.json`: archive checksums, sizes, provenance, and Wasm hashes.

The source archive includes the patched Stylo and selectors files under their
original MPL-2.0 terms. Other files retain their original licenses. The notices
preserve compound license expressions, the IJG acknowledgement, Unicode and
WHATWG terms, and Rust standard-library notices. Some crate archives omit their
license files; `licenses/cache/` retains checksum-pinned originals from their
source commits. `licenses/spdx/` supplements them with pinned standard texts.

To exercise the same preparation locally in `nix develop`:

```sh
npm run release:prepare -- --repository tani/litesurf
node scripts/verify-release.mjs release/v0.0.1
```

`scripts/release.mjs` orchestrates the stages under `scripts/release/`: dependency
discovery, license notices, source snapshots, and final archives. Shared file and
archive utilities live under `scripts/lib/`.

Run `npm ci` before using the release tools. Preparation uses Node.js and zx,
with pinned tar and TOML parsers as development dependencies. It uses
Bazel's configured dependency graphs and fails on unresolved licenses or
modified license-cache files. Stage source/configuration additions before
preparing locally: the adapter source snapshot uses Git's tracked file list.
Generated release archives and staging directories stay out of Git.

The workflow checks adapter behavior and installs the actual release runtime
tarball in a separate temporary project before publication. License inventories
are conservative build-input inventories, not a replacement for legal review.

## npm: first publication and OIDC

The first npm publication is manual. Download the assets from the first GitHub
Release and verify them before publishing the exact runtime archive:

```sh
node scripts/verify-release.mjs release-assets
npm login
npm publish ./release-assets/litesurf-v0.0.1.tgz --ignore-scripts --access public --registry https://registry.npmjs.org
```

After the package exists, open its npm Settings → Trusted publishing and add a
GitHub Actions publisher with these exact values:

| Field                | Value                                       |
| -------------------- | ------------------------------------------- |
| Organization or user | `tani`                                      |
| Repository           | `litesurf`                                  |
| Workflow filename    | `release.yml`                               |
| Environment name     | Leave empty                                 |
| Allowed actions      | Enable direct publishing with `npm publish` |

Then create the GitHub repository Actions variable `NPM_PUBLISH_ENABLED` with the
value `true`. Keep it unset for the first release. Update the repository URL in
`package.json` and the trusted-publisher values if publishing from another repository.
A new trusted-publisher configuration must complete its first successful publish
within two days; create it shortly before the next version release.

For subsequent versions, update `package.json` and `package-lock.json`, then push
the matching `v<version>` tag. After the GitHub Release and its source archive are
public, `npm_release` verifies and publishes the same runtime tarball using OIDC.
The job uses a GitHub-hosted runner, Node 24, npm >=11.5.1, `id-token: write`, and
provenance. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is needed. Manual workflow
runs still only prepare artifacts. A failed npm job can be rerun after fixing the
publisher configuration; it does not require rebuilding or recreating the release.
Already published npm versions cannot be overwritten.

See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for the required account-side setup.
