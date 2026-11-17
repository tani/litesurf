// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { $ } from "../scripts/lib/shell.mjs";

test("CLI help works without starting an engine", async () => {
  const result = await $`${process.execPath} bin/litesurf.mjs --help`.quiet().timeout(5000);
  assert.match(result.stdout, /^Usage: litesurf/);
  assert.equal(result.stderr, "");
});

test("CLI reports invalid arguments without a stack trace", async () => {
  for (const args of [["--port", "invalid"], ["--unknown"]]) {
    const result = await $`${process.execPath} bin/litesurf.mjs ${args}`
      .quiet()
      .nothrow()
      .timeout(5000);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /port must be|Unknown option/);
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  }
});
