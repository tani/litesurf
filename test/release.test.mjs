// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkedText } from "../scripts/release/licenses.mjs";
import { copyTree, sha256, writeJson } from "../scripts/lib/files.mjs";
import { deterministicTar, scanTar, validateMember } from "../scripts/lib/archive.mjs";
import { verify } from "../scripts/verify-release.mjs";

import { temporaryDirectory } from "./helpers.mjs";

test("source archives are reproducible despite source mtimes", async (t) => {
  const root = temporaryDirectory(t);
  const source = join(root, "source");
  mkdirSync(source);
  writeFileSync(join(source, "LICENSE"), "Copyright © contributors\n");
  const first = join(root, "first.tar.gz");
  const second = join(root, "second.tar.gz");
  await deterministicTar(source, first, 1);
  utimesSync(join(source, "LICENSE"), new Date(), new Date());
  await deterministicTar(source, second, 1);
  assert.equal(await sha256(first), await sha256(second));
  const entries = await scanTar(first, () => true);
  assert.equal(entries.get("source/LICENSE").data.toString(), "Copyright © contributors\n");
});

test("source copying retains target modules and original license bytes", (t) => {
  const root = temporaryDirectory(t);
  const source = join(root, "crate");
  mkdirSync(join(source, "src/target"), { recursive: true });
  writeFileSync(join(source, "src/target/lib.rs"), "// target-specific source\n");
  writeFileSync(join(source, "LICENSE"), "Original license\r\n");
  // Bazel dependency directories may be read-only; copies must remain removable.
  chmodSync(source, 0o555);
  try {
    copyTree(source, join(root, "copy"));
  } finally {
    chmodSync(source, 0o755);
  }
  assert.equal(
    readFileSync(join(root, "copy/src/target/lib.rs"), "utf8"),
    "// target-specific source\n",
  );
  assert.equal(readFileSync(join(root, "copy/LICENSE"), "utf8"), "Original license\r\n");
  rmSync(join(root, "copy"), { recursive: true });
});

test("changed license cache is rejected", async (t) => {
  const root = temporaryDirectory(t);
  const file = join(root, "LICENSE");
  writeFileSync(file, "Original permission\n");
  const entry = { path: "LICENSE", sha256: await sha256(file) };
  assert.equal(await checkedText(entry, root), "Original permission\n");
  writeFileSync(file, "Edited permission\n");
  await assert.rejects(checkedText(entry, root), /checksum mismatch/);
});

test("altered release assets are rejected before unpacking", async (t) => {
  const root = temporaryDirectory(t);
  const file = join(root, "runtime.tgz");
  writeFileSync(file, "original");
  writeJson(join(root, "release.json"), {
    assets: {
      "runtime.tgz": { sha256: await sha256(file), bytes: 8 },
    },
  });
  writeFileSync(file, "tampered");
  await assert.rejects(verify(root), /checksum\/size mismatch/);
});

test("archives reject links, traversal, and platform-dependent paths", async (t) => {
  for (const [name, type] of [
    ["../escape", "File"],
    ["/absolute", "File"],
    ["C:/file", "File"],
    ["source/../escape", "File"],
    ["source\\file", "File"],
    ["source/link", "SymbolicLink"],
    ["source/hardlink", "Link"],
    ["source/device", "CharacterDevice"],
  ])
    assert.throws(() => validateMember(name, type), /Nonportable/);
  const root = temporaryDirectory(t);
  const source = join(root, "source");
  mkdirSync(source);
  writeFileSync(join(source, "LICENSE"), "Original\n");
  symlinkSync("LICENSE", join(source, "link"));
  await assert.rejects(deterministicTar(source, join(root, "source.tar.gz"), 1), /symlink/);
});
