// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/adapters/*.vitest.test.mjs"],
    environment: fileURLToPath(import.meta.resolve("litesurf/vitest")),
    environmentOptions: { litesurf: { url: "https://vitest.invalid/", width: 640, height: 480 } },
    testTimeout: 10_000,
  },
});
