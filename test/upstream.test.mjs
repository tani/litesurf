// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { $ } from "zx";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { temporaryDirectory } from "./helpers.mjs";
import { verifyUpstream } from "../scripts/upstream.mjs";

test("source isolation rejects edits and an unpinned upstream revision", (t) => {
  const root = temporaryDirectory(t);
  const upstream = join(root, "upstream/kitesurf");
  mkdirSync(upstream, { recursive: true });
  const git = (cwd, ...args) => $({ cwd, quiet: true, sync: true })`git ${args}`.stdout.trim();
  git(root, "init", "-q");
  git(upstream, "init", "-q");
  const commit = () =>
    git(
      upstream,
      "-c",
      "user.name=litesurf test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    );
  writeFileSync(join(upstream, "engine.js"), "original\n");
  git(upstream, "add", "engine.js");
  commit();
  const revision = git(upstream, "rev-parse", "HEAD");
  git(root, "update-index", "--add", "--cacheinfo", `160000,${revision},upstream/kitesurf`);
  assert.equal(verifyUpstream({ root, upstream }), revision);
  writeFileSync(join(upstream, "engine.js"), "local change\n");
  assert.throws(() => verifyUpstream({ root, upstream }), /local changes/);
  git(upstream, "restore", "engine.js");
  writeFileSync(join(upstream, "extra.js"), "new local file\n");
  assert.throws(() => verifyUpstream({ root, upstream }), /local changes/);
  git(upstream, "add", "extra.js");
  commit();
  assert.throws(() => verifyUpstream({ root, upstream }), /differs from the submodule pin/);
  const next = git(upstream, "rev-parse", "HEAD");
  git(root, "update-index", "--cacheinfo", `160000,${next},upstream/kitesurf`);
  assert.equal(verifyUpstream({ root, upstream }), next);
});
