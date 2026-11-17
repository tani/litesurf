// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { basename, relative, sep } from "node:path";
import { fs, glob } from "zx";

export const readJson = fs.readJsonSync;
export const posixRelative = (root, file) => relative(root, file).split(sep).join("/");
export const writeJson = (file, data) => fs.outputJsonSync(file, data, { spaces: 2 });

/** @param {string} file @returns {Promise<string>} */
export async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Sorted paths, including dotfiles and links without following linked directories. */
export function walk(directory) {
  return glob
    .sync("**/*", {
      cwd: directory,
      absolute: true,
      dot: true,
      onlyFiles: false,
      followSymbolicLinks: false,
    })
    .sort();
}

/** Materialize dependency/runfile links and normalize distribution permissions. */
export function copyTree(source, destination, { filter = () => true, mode } = {}) {
  fs.copySync(source, destination, {
    dereference: true,
    filter: (file) => !["node_modules", ".git"].includes(basename(file)) && filter(file),
  });
  if (!fs.existsSync(destination)) return;
  for (const file of [
    destination,
    ...(fs.statSync(destination).isDirectory() ? walk(destination) : []),
  ]) {
    const info = fs.statSync(file);
    if (info.isDirectory()) fs.chmodSync(file, 0o755);
    if (info.isFile()) fs.chmodSync(file, mode ?? (info.mode & 0o111 ? 0o755 : 0o644));
  }
}
