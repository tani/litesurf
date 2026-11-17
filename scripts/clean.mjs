// SPDX-License-Identifier: Apache-2.0

import { fs, glob } from "zx";
import { ROOT } from "./lib/project.mjs";

for (const path of glob.sync([".release-work", ".dist-build-*"], {
  cwd: ROOT,
  absolute: true,
  dot: true,
  onlyFiles: false,
  expandDirectories: false,
}))
  fs.removeSync(path);
console.log("Removed intermediate build files. dist/, release/, and dependencies are retained.");
