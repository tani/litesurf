// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fs } from "zx";
import { $ } from "../scripts/lib/shell.mjs";
import { updateUpstream } from "../scripts/update-upstream.mjs";
import { verifyUpstream } from "../scripts/upstream.mjs";
import { temporaryDirectory } from "./helpers.mjs";

async function fixture(t) {
  const directory = temporaryDirectory(t);
  const root = join(directory, "adapter");
  const origin = join(directory, "origin");
  const upstream = join(root, "upstream/kitesurf");
  await fs.ensureDir(root);
  await fs.ensureDir(origin);
  const git = (cwd, ...args) => $({ cwd, quiet: true })`git ${args}`;
  const commit = (cwd) => git(cwd, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "-am", "fixture");
  await git(root, "init", "-b", "main");
  await git(origin, "init", "-b", "engine-default");
  await fs.writeFile(join(origin, "engine.txt"), "initial\n");
  await git(origin, "add", ".");
  await commit(origin);
  await git(root, "-c", "protocol.file.allow=always", "submodule", "add", origin, "upstream/kitesurf");
  const manifest = { name: "update-fixture", version: "1.2.3" };
  await fs.writeJson(join(root, "package.json"), manifest);
  await fs.writeJson(join(root, "package-lock.json"), {
    ...manifest, lockfileVersion: 3, packages: { "": manifest },
  });
  await git(root, "add", ".");
  await commit(root);
  const advance = async () => {
    await fs.appendFile(join(origin, "engine.txt"), "next\n");
    await commit(origin);
    return (await git(origin, "rev-parse", "HEAD")).stdout.trim();
  };
  return { root, origin, upstream, git, advance };
}

test("unchanged upstream leaves versions, gitlink and working tree untouched", async (t) => {
  const { root, upstream, git } = await fixture(t);
  const revision = verifyUpstream({ root, upstream });
  assert.deepEqual(await updateUpstream({ root }), { changed: false, revision, version: "1.2.3" });
  assert.equal((await git(root, "status", "--porcelain")).stdout.trim(), "");
});

test("updates default-branch gitlink and both versions without changing upstream files", async (t) => {
  const { root, upstream, git, advance } = await fixture(t);
  const previous = verifyUpstream({ root, upstream });
  const revision = await advance();
  assert.deepEqual(await updateUpstream({ root }), {
    changed: true, previous, revision, version: "1.2.4", tag: "v1.2.4",
  });
  assert.equal(verifyUpstream({ root, upstream }), revision);
  for (const file of ["package.json", "package-lock.json"]) {
    assert.equal((await fs.readJson(join(root, file))).version, "1.2.4");
  }
  assert.equal((await fs.readJson(join(root, "package-lock.json"))).packages[""].version, "1.2.4");
  assert.deepEqual((await git(root, "diff", "--cached", "--name-only")).stdout.trim().split("\n"),
    ["package-lock.json", "package.json", "upstream/kitesurf"]);
  assert.equal((await git(upstream, "status", "--porcelain")).stdout.trim(), "");
});

test("dirty adapter or upstream blocks automatic updates", async (t) => {
  const { root, upstream, advance } = await fixture(t);
  await advance();
  await fs.writeFile(join(root, "untracked.txt"), "local\n");
  await assert.rejects(updateUpstream({ root }), /clean working tree/);
  await fs.remove(join(root, "untracked.txt"));
  await fs.appendFile(join(upstream, "engine.txt"), "local\n");
  await assert.rejects(updateUpstream({ root }), /local changes/);
});

test("upstream rollback is rejected before changing the pin or version", async (t) => {
  const { root, origin, upstream, git, advance } = await fixture(t);
  const initial = verifyUpstream({ root, upstream });
  await advance();
  await updateUpstream({ root });
  await git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "-m", "update");
  const pin = verifyUpstream({ root, upstream });
  await git(origin, "reset", "--hard", initial);
  await assert.rejects(updateUpstream({ root }));
  assert.equal(verifyUpstream({ root, upstream }), pin);
  assert.equal((await fs.readJson(join(root, "package.json"))).version, "1.2.4");
});
