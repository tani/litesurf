// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fs } from "zx";
import { deterministicTar } from "../scripts/lib/archive.mjs";
import { sha256 } from "../scripts/lib/files.mjs";
import { sourceUrl } from "../scripts/release/metadata.mjs";
import { verifyPackContents } from "../scripts/verify-package.mjs";
import { verifyPublishedSource } from "../scripts/verify-publish.mjs";
import { temporaryDirectory } from "./helpers.mjs";

test("prepack rejects changed, missing, and added package files after preparation", async (t) => {
  const root = temporaryDirectory(t);
  const packageRoot = join(root, "package");
  fs.outputFileSync(join(packageRoot, "src/index.mjs"), "export const launch = () => {};\n");
  fs.outputFileSync(join(packageRoot, "NOTICE"), "Original attribution\n");
  const archive = join(root, "runtime.tgz");
  await deterministicTar(packageRoot, archive, 1);
  const files = [{ path: "src/index.mjs" }, { path: "NOTICE" }];
  await verifyPackContents(packageRoot, archive, files);
  fs.writeFileSync(join(packageRoot, "NOTICE"), "Removed attribution\n");
  await assert.rejects(verifyPackContents(packageRoot, archive, files), /Package differs/);
  fs.writeFileSync(join(packageRoot, "NOTICE"), "Original attribution\n");
  await assert.rejects(
    verifyPackContents(packageRoot, archive, files.slice(0, 1)),
    /missing prepared release files/,
  );
  fs.outputFileSync(join(packageRoot, "new-file"), "unreviewed addition");
  await assert.rejects(
    verifyPackContents(packageRoot, archive, [...files, { path: "new-file" }]),
    /Package differs/,
  );
});

test("publication requires anonymous access to the exact source archive bytes", async (t) => {
  const root = temporaryDirectory(t);
  const contents = Buffer.from("the exact corresponding source archive");
  const file = join(root, "sources.tar.gz");
  fs.writeFileSync(file, contents);
  const manifest = {
    repository: "tani/litesurf",
    tag: "v0.0.1",
    source_archive: "litesurf-v0.0.1-sources.tar.gz",
    assets: {
      "litesurf-v0.0.1-sources.tar.gz": { sha256: await sha256(file), bytes: contents.length },
    },
  };
  await verifyPublishedSource(manifest, {
    fetchSource: async (url, options) => {
      assert.equal(url, sourceUrl(manifest));
      assert.equal(options.headers, undefined);
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(contents);
    },
  });
  for (const response of [
    new Response("Not Found", { status: 404 }),
    new Response("Authentication required", { status: 403 }),
    new Response(null),
  ]) {
    await assert.rejects(
      verifyPublishedSource(manifest, { fetchSource: async () => response }),
      /must be public/,
    );
  }
  for (const content of [
    Buffer.alloc(contents.length),
    contents.subarray(1),
    Buffer.concat([contents, Buffer.from("extra")]),
  ]) {
    await assert.rejects(
      verifyPublishedSource(manifest, { fetchSource: async () => new Response(content) }),
      /mismatch/,
    );
  }
});
