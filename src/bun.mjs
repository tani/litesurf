// SPDX-License-Identifier: Apache-2.0

import { registerDOM } from "./dom.mjs";

/** Bun preload entry: register DOM globals before test modules are imported. */
export const environment = await registerDOM();
process.once("exit", () => environment.close());
