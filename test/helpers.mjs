// SPDX-License-Identifier: Apache-2.0

import { fs, tmpdir } from "zx";

/** @param {import("node:test").TestContext} t */
export function temporaryDirectory(t) {
  const directory = tmpdir();
  t.after(() => fs.removeSync(directory));
  return directory;
}
