// SPDX-License-Identifier: Apache-2.0

import { registerDOM } from "./dom.mjs";

/** @satisfies {import("vitest/runtime").Environment} */
const environment = {
  name: "litesurf",
  viteEnvironment: "client",
  async setup(
    /** @type {typeof globalThis} */ global,
    /** @type {{litesurf?: import("./dom.mjs").DOMOptions}} */ options,
  ) {
    const dom = await registerDOM(options.litesurf, global);
    return { teardown: () => dom.close() };
  },
};

export default environment;
