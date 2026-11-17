// SPDX-License-Identifier: Apache-2.0

export function sourceUrl({ repository, tag, source_archive }) {
  return `https://github.com/${repository}/releases/download/${tag}/${source_archive}`;
}

export const ADAPTED_RUNTIME_FILES = ["src/index.mjs", "src/worker.mjs", "bin/litesurf.mjs"];
export const MODIFICATION_NOTICE = "Modified by the litesurf contributors:";
