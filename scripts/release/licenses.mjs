// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { glob } from "zx";
import { ROOT, UPSTREAM } from "../lib/project.mjs";
import { copyTree, posixRelative, readJson, sha256, walk } from "../lib/files.mjs";

export function noticeFiles(directory) {
  return walk(directory).filter(
    (file) =>
      statSync(file).isFile() && /license|licence|copying|copyright|notice/i.test(basename(file)),
  );
}

export async function checkedText(entry, root = ROOT) {
  const file = resolve(root, entry.path);
  if ((await sha256(file)) !== entry.sha256) {
    throw new Error(`License cache checksum mismatch: ${file}`);
  }
  return readFileSync(file, "utf8");
}

export function cachedLicenses(cache, key, directory) {
  if (key in cache) return cache[key].files ?? [];
  const vcs = join(directory, ".cargo_vcs_info.json");
  if (existsSync(vcs)) {
    const revision = readJson(vcs).git?.sha1;
    for (const entry of Object.values(cache)) {
      if (revision && entry.revision === revision) return entry.files ?? [];
    }
  }
  return [];
}
function sourceCopyrights(directory) {
  const statements = new Set();
  for (const file of walk(directory)) {
    if (!statSync(file).isFile() || ![".rs", ".c", ".h", ".cpp", ".py"].includes(extname(file)))
      continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (/copyright\s*(?:\(c\)|©|[0-9])/i.test(line)) {
        statements.add(
          line
            .trim()
            .replace(/^[/*# ]+/, "")
            .replace(/[*/ ]+$/, ""),
        );
      }
    }
  }
  return [...statements].sort();
}

async function appendOriginalTexts(notices, directory, texts, extras) {
  for (const file of texts)
    notices.push(`--- ${posixRelative(directory, file)} ---`, readFileSync(file, "utf8"));
  for (const entry of extras)
    notices.push(`--- Original upstream text: ${entry.url} ---`, await checkedText(entry));
}

async function rustLicense(key, crate, { sources, cache, spdx, notices }) {
  const metadata = crate.metadata;
  const directory = crate.source;
  let declared = metadata.license;
  if (metadata.name === "icy_sixel") {
    if (
      (await sha256(join(directory, "LICENSE"))) !==
      "f719f01f57fec5dea2103ce3b2443b0d457bac44dcb8989f08885116bae12d18"
    ) {
      throw new Error("icy_sixel license clarification no longer matches");
    }
    declared = "MIT";
  }
  if (typeof declared !== "string") throw new Error(`Unresolved Rust license for ${key}`);
  const unknown = [...new Set(declared.match(/[A-Za-z0-9][A-Za-z0-9.-]*/g))].filter(
    (token) =>
      !["AND", "OR", "WITH", "LLVM-exception"].includes(token) && !Object.hasOwn(spdx, token),
  );
  if (unknown.length)
    throw new Error(`Unreviewed license identifiers for ${key}: ${unknown.sort().join(", ")}`);
  copyTree(directory, join(sources, "crates", key));
  notices.push(
    "=".repeat(72),
    key,
    `Declared license: ${declared}`,
    `Package authors: ${JSON.stringify(metadata.authors ?? [])}`,
    `Runtime artifacts: ${[...crate.artifacts].sort().join(", ") || "host support only"}`,
  );
  const texts = noticeFiles(directory);
  const extras = cachedLicenses(cache, key, directory);
  await appendOriginalTexts(notices, directory, texts, extras);
  if (!texts.length && !extras.length && declared !== "MPL-2.0" && key !== "void@1.0.2") {
    throw new Error(`Missing original license files or pinned clarification for ${key}`);
  }
  if (key === "void@1.0.2")
    notices.push(
      "The published crate and its 1.0.2 source tag omit a standalone license file; Cargo.toml declares MIT. Standard MIT terms and original sources/authorship metadata accompany this release.",
    );
  notices.push(...sourceCopyrights(directory));
  const patchDir = join(UPSTREAM, "scripts/patches", `${metadata.name}-${metadata.version}`);
  const patches = [];
  for (const file of glob.sync("*.patch", { cwd: patchDir, absolute: true }).sort()) {
    patches.push({ path: posixRelative(UPSTREAM, file), sha256: await sha256(file) });
  }
  return {
    id: key,
    declared_license: declared,
    artifacts: [...crate.artifacts].sort(),
    host_dependency: crate.hostDependency,
    upstream_patches: patches,
    manifest_sha256: await sha256(join(directory, "Cargo.toml")),
    source_directory: `crates/${key}`,
    license_cache: extras,
  };
}

async function npmLicense(key, item, { sources, cache, notices }) {
  const directory = item.source;
  const declared = item.metadata.license;
  const texts = noticeFiles(directory);
  const extras = cache[`npm:${key}`]?.files ?? [];
  if (!declared || (!texts.length && !extras.length))
    throw new Error(`Missing bundled npm license/text for ${key}`);
  copyTree(directory, join(sources, "npm", key.replaceAll("/", "--")));
  notices.push(
    "=".repeat(72),
    `Bundled JavaScript dependency: ${key}`,
    `Declared license: ${declared}`,
  );
  await appendOriginalTexts(notices, directory, texts, extras);
  return { id: key, license: declared };
}

export async function collectLicenses({ crates, npmPackages, artifactIds, sources, revision }) {
  const cache = readJson(join(ROOT, "licenses/cache/index.json"));
  const spdx = readJson(join(ROOT, "licenses/spdx/index.json"));
  const notices = [
    "litesurf third-party notices",
    "",
    "Declared OR alternatives remain alternatives; AND terms and exceptions are retained.",
    "The Rust list conservatively includes target dependencies and host build/proc-macro support.",
    "Source-only notices may cover components removed by link-time optimization.",
    "",
  ];
  const inventory = { upstream_revision: revision, artifacts: artifactIds, rust: [], npm: [] };
  const context = { sources, cache, spdx, notices };
  const sorted = (entries) => [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [key, crate] of sorted(crates))
    inventory.rust.push(await rustLicense(key, crate, context));
  for (const [key, item] of sorted(npmPackages))
    inventory.npm.push(await npmLicense(key, item, context));
  notices.push(
    "=".repeat(72),
    "Standard license texts supplement the original notices above; they do not replace copyright statements.",
  );
  for (const [name, entry] of Object.entries(spdx).sort()) {
    notices.push(`--- SPDX standard text: ${name} ---`, await checkedText(entry));
  }
  return { inventory, notices };
}
