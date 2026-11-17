// SPDX-License-Identifier: Apache-2.0

import { join } from "node:path";
import { ROOT } from "./lib/project.mjs";
import { walk } from "./lib/files.mjs";
import { run } from "./lib/shell.mjs";
import { verifyUpstream } from "./upstream.mjs";

console.log(`Upstream is clean: ${verifyUpstream()}`);
for (const directory of ["src", "bin", "scripts", "test"]) {
  for (const file of walk(join(ROOT, directory)).filter((file) => file.endsWith(".mjs"))) {
    await run`${process.execPath} --check ${file}`;
  }
}
await run`${process.execPath} --test test/runtime.test.mjs test/upstream.test.mjs test/update-upstream.test.mjs test/cli.test.mjs test/dom.test.mjs`;
