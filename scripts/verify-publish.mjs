#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { retry } from "zx";
import { ROOT, isMain, packageManifest } from "./lib/project.mjs";
import { sourceUrl } from "./release/metadata.mjs";
import { verify } from "./verify-release.mjs";

/** Verify anonymous access to the exact source archive named in the npm notices. */
export async function verifyPublishedSource(manifest, { fetchSource = fetch } = {}) {
  const url = sourceUrl(manifest);
  const expected = manifest.assets[manifest.source_archive];
  const response = await fetchSource(url, { signal: AbortSignal.timeout(120_000) });
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new Error(
      `Source archive must be public before npm publication: HTTP ${response.status} ${url}`,
    );
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > expected.bytes) throw new Error(`Published source archive size mismatch: ${url}`);
    hash.update(chunk);
  }
  if (bytes !== expected.bytes || hash.digest("hex") !== expected.sha256) {
    throw new Error(`Published source archive checksum/size mismatch: ${url}`);
  }
  console.log(`Verified public source archive: ${url}`);
}

if (isMain(import.meta.url)) {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length > 1)
    throw new Error("Usage: node scripts/verify-publish.mjs [release-directory]");
  const directory = positionals[0]
    ? resolve(positionals[0])
    : join(ROOT, "release", `v${packageManifest().version}`);
  const manifest = await verify(directory);
  await retry(3, "5s", () => verifyPublishedSource(manifest));
}
