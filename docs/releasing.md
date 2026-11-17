# Releases

`.github/workflows/release.yml` prepares and verifies the runtime and its
corresponding dependency sources. A manual workflow run with empty `publish_tag` and `release_tag`
uploads CI artifacts for review. Pushing a tag matching `package.json`, such as
`v0.0.1`, also creates a GitHub Release through `gh_release`. All attachments are uploaded to a draft
before it is published. The separate `npm_release` job depends on `gh_release`
and submits the runtime to npm staging for maintainer approval.

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

The `prepack` hook requires a complete prepared release, checks its notices and
source archive, and compares every npm package file against the verified runtime
tarball. Changes after preparation require `npm run release:prepare` again.
The `prepublishOnly` hook additionally requires the matching sources to be
publicly downloadable. Local preparation and verification remain possible
before a GitHub Release exists.

Publishing a prebuilt tarball with `--ignore-scripts` bypasses npm hooks. Always
run `node scripts/verify-publish.mjs <asset-directory>` first, as shown below.
The workflow performs this check after publishing the GitHub Release and again
immediately before npm publication; no GitHub token is used for the download.
Retain published source archives for as long as the corresponding npm versions
are distributed.

The workflow checks adapter behavior and installs the actual release runtime
tarball in a separate temporary project before publication. License inventories
are conservative build-input inventories, not a replacement for legal review.

## npm: staged publishing and OIDC

The npm job submits the verified runtime to staging with `npm stage publish`.
A successful workflow means **staged for review**, not publicly published.
A maintainer reviews the staged package and approves it with 2FA in npm's
Staged Packages tab or through `npm stage approve <stage-id>`.

Staged publishing requires Node >=22.14.0 and npm >=11.15.0. The workflow uses
Node 24 and pins npm 11.19.1. For a first publication, or a manual staging run,
download the GitHub Release assets and verify them before staging the exact
runtime archive:

```sh
npm install --global npm@11.19.1
node scripts/verify-publish.mjs release-assets
npm login
version="$(node -p 'require("./package.json").version')"
npm stage publish "./release-assets/litesurf-v$version.tgz" --ignore-scripts --access public --registry https://registry.npmjs.org
```

The verification anonymously downloads the source archive from its published
URL and checks the actual bytes and SHA-256; a 404, private asset, or mismatched
archive blocks staging. Staging is not approval. For a new package, npm may show
a public `0.0.0-stage` placeholder until the first staged version is approved.

Configure the npm Settings → Trusted publishing GitHub Actions publisher:

| Field                | Value                                                 |
| -------------------- | ----------------------------------------------------- |
| Organization or user | `tani`                                                |
| Repository           | `litesurf`                                            |
| Workflow filename    | `release.yml`                                         |
| Environment name     | Leave empty                                           |
| Allowed actions      | Allow `npm stage publish`; disable direct `npm publish` |

Then set the GitHub repository Actions variable `NPM_PUBLISH_ENABLED=true`.
This variable enables **submission to staging**, not automatic approval.
Update the repository URL and publisher values if using another repository.
npm requires a new trusted-publisher configuration's first successful publish
within two days; configure it shortly before the next release.

For subsequent versions, update `package.json` and `package-lock.json`, then push
the matching `v<version>` tag. After the GitHub Release and source archive are
public, `npm_release` verifies and stages the same runtime tarball through OIDC
with provenance. It uses a GitHub-hosted runner and `id-token: write`; no
`NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is needed. The workflow never approves
staged packages. Its job summary explains the remaining review step.

To recover staging after a workflow fix without moving an existing release tag,
run `Release` from `main` with `publish_tag` set to the existing tag, for example
`v0.0.2`. This skips preparation and GitHub Release creation, checks out the
tag's verification tools, downloads its existing public assets, verifies them,
and stages the exact runtime through OIDC. No rebuild, version bump, or tag
replacement is required. Leave `publish_tag` empty for an artifacts-only run.
Rerunning an old tag's workflow run uses that tag's old workflow definition;
use the manual run from `main` to pick up workflow fixes.

Before retrying a successful staging submission, review the existing stage:
a staged version already reserves that package version. Approve it rather than
trying to stage or directly publish the same version again. To replace a staged
package, explicitly reject it first. Published versions cannot be overwritten.

Review and approve using your own npm session (not the workflow's OIDC token):

```sh
npm stage list litesurf
npm stage view <stage-id>
npm stage download <stage-id> # optional inspection of the staged tarball
npm stage approve <stage-id>  # requires 2FA; makes the version publicly available
```

Before approval, compare the stage's package, version, dist-tag, and tarball
integrity with the intended GitHub Release. Staging uses npm's default `latest`
dist-tag for these stable releases; approval applies that tag. CLI download and
review commands do not approve the package.

See npm's [staged publishing](https://docs.npmjs.com/staged-publishing/) and
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) documentation
for account-side setup and approval requirements.

## Monthly upstream updates

`.github/workflows/update-upstream.yml` runs on the first of each month at
01:23 UTC (10:23 Japan time), or manually with **Monthly Kitesurf update**.
GitHub schedules may be delayed. It always checks out the repository's default
branch. Like npm staging, it is enabled by `NPM_PUBLISH_ENABLED=true`; setting
that variable to `false` pauses monthly updates and npm submissions.

Configure the `release.yml` npm trusted publisher above before enabling it.
The repository must also allow its Actions `GITHUB_TOKEN` to push to the default
branch and create version tags. Branch or tag protection that blocks the bot
causes the update to fail; the workflow does not bypass protection or force-push.
The monthly job uses `contents: write` for the update and `actions: write` to
dispatch the release. It needs no personal access token or npm token.

The monthly workflow:

1. Resolves Kitesurf's remote default branch and fetches its current commit.
   With no changes, it exits without a version bump or release. A dirty checkout
   or a revision that does not descend from the current pin blocks the update.
2. Checks out the new upstream commit without modifying its tracked files,
   stages the gitlink, and increments the stable patch version in `package.json`
   and `package-lock.json`. Prerelease versions are rejected.
3. Runs upstream's `pnpm run check` and the navigation-fidelity and evaluation
   across navigation e2e subset using upstream's existing Bazel targets. Then
   prepares matching runtime/source archives and runs the adapter checks, e2e,
   Vitest, Bun, release-integrity, and installed-tarball tests. Missing targets,
   dependency incompatibilities, or missing license notices fail the update
   instead of being patched automatically.
4. Commits only the pin and package versions after verification, creates
   `v<version>`, and atomically pushes the default branch and tag. A concurrent
   branch update or an existing tag rejects the push without replacing history.
5. Dispatches `release.yml` at that tag with `release_tag=v<version>`. A
   `GITHUB_TOKEN` tag push does not trigger another push workflow, so this
   explicit dispatch is required. The Release run builds and verifies the
   committed checkout again, publishes its runtime and matching sources to
   GitHub, checks anonymous source downloads, and stages the runtime on npm
   through the existing OIDC publisher. The monthly preflight archives are not
   published; the Release run's verified archives are used throughout publication.

The final npm review and 2FA approval remain manual. Review both workflow runs:
a successful monthly run means the Release workflow was dispatched, not that
staging has finished. Checks failing before the push leave the remote pin and
version unchanged. After a push, failures retain the new commit and tag for
recovery rather than moving them or reusing a reserved version.

If dispatch fails after the push, manually run **Release** at the existing tag
with `release_tag` set to the same tag. This performs full preparation and
publication. Leave `publish_tag` empty. If the GitHub Release already exists,
use the recovery paths below or `publish_tag` for staging only; do not recreate
an existing release. If the default branch has not changed upstream since that
push, rerunning the monthly job is a no-op, not a retry of publication.

## Recover a verified build

If preparation succeeded but GitHub Release publication failed, manually run
`Publish prepared release` (`recover-release.yml`) with the original workflow
run ID and its release tag. It checks that the run and tag refer to the same
commit, downloads the existing artifact, verifies all archives, and publishes
them together. Both flat and versioned artifact directories are supported.
This avoids rebuilding or moving an existing version tag.
