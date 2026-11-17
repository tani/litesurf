#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { join } from "node:path";
import { json } from "./lib/shell.mjs";
import { ROOT, isMain, packageManifest } from "./lib/project.mjs";
import { scanTar } from "./lib/archive.mjs";
import { sha256 } from "./lib/files.mjs";
import { verifyDist } from "./verify-dist.mjs";
import { verify } from "./verify-release.mjs";

/** Reject missing, added, or changed package files after release preparation. */
export async function verifyPackContents(root, archive, files) {
  const runtime = await scanTar(archive);
  const expected = new Set([...runtime.keys()]);
  for (const { path } of files) {
    const name = `package/${path}`;
    if (runtime.get(name)?.sha256 !== (await sha256(join(root, path)))) {
      throw new Error(
        `Package differs from the prepared release: ${path}. Run npm run release:prepare.`,
      );
    }
    expected.delete(name);
  }
  if (expected.size)
    throw new Error(`Package is missing prepared release files: ${[...expected].join(", ")}`);
}

export async function verifyPackage() {
  const { version } = packageManifest();
  const directory = join(ROOT, "release", `v${version}`);
  const provenance = verifyDist();
  let manifest;
  try {
    manifest = await verify(directory);
  } catch (cause) {
    throw new Error("A complete license/source release is required. Run npm run release:prepare.", {
      cause,
    });
  }
  if (manifest.version !== version || manifest.upstream_revision !== provenance.revision) {
    throw new Error(
      "Prepared release version/upstream does not match the package. Run npm run release:prepare.",
    );
  }
  // ignore-scripts avoids invoking this prepack hook recursively.
  const [pack] = await json`npm pack --dry-run --json --ignore-scripts`.quiet().json();
  await verifyPackContents(ROOT, join(directory, `litesurf-${manifest.tag}.tgz`), pack.files);
  console.log("Package matches the verified runtime and corresponding license/source release.");
}

if (isMain(import.meta.url)) await verifyPackage();
