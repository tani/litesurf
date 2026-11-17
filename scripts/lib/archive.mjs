// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { dirname } from "node:path";
import { create, list } from "tar";
import { posixRelative, walk } from "./files.mjs";

/** Normalize archive metadata and order; never archive source symbolic links. */
export async function deterministicTar(source, destination, epoch) {
  const files = [source, ...walk(source)];
  for (const file of files) {
    if (lstatSync(file).isSymbolicLink()) {
      throw new Error(`Release source contains a symlink: ${file}`);
    }
  }
  await create(
    {
      file: destination,
      cwd: dirname(source),
      portable: true,
      mtime: new Date(epoch * 1000),
      gzip: true,
      noDirRecurse: true,
    },
    files.map((file) => posixRelative(dirname(source), file)),
  );
}

/** Reject traversal, links, device nodes, duplicate files, and ambiguous paths. */
export function validateMember(name, type) {
  const parts = name.replace(/\/$/, "").split("/");
  if (
    !name ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.includes("\\") ||
    parts.some((part) => part === ".." || part === "." || part === "") ||
    (type !== "File" && type !== "Directory")
  ) {
    throw new Error(`Nonportable archive member: ${name} (${type})`);
  }
}

/**
 * Stream every file through SHA-256; retain bytes only for explicitly selected files.
 * @param {string} file
 * @param {(name: string) => boolean} [capture]
 */
export async function scanTar(file, capture = () => false) {
  const entries = new Map();
  const names = new Set();
  let failure;
  await list({
    file,
    strict: true,
    onReadEntry(entry) {
      try {
        validateMember(entry.path, entry.type);
        const name = entry.path.replace(/\/$/, "");
        if (names.has(name)) throw new Error(`Duplicate archive member: ${name}`);
        names.add(name);
        if (entry.type !== "File") {
          entry.resume();
          return;
        }
        const hash = createHash("sha256");
        const chunks = capture(entry.path) ? [] : undefined;
        entry.on("data", (chunk) => {
          hash.update(chunk);
          chunks?.push(chunk);
        });
        entry.on("end", () =>
          entries.set(entry.path, {
            sha256: hash.digest("hex"),
            data: chunks && Buffer.concat(chunks),
          }),
        );
      } catch (error) {
        failure ??= error;
        entry.resume();
      }
    },
  });
  if (failure) throw failure;
  return entries;
}
