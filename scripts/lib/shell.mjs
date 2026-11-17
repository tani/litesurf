// SPDX-License-Identifier: Apache-2.0

import { $ as zx } from "zx";
import { ROOT, UPSTREAM } from "./project.mjs";

export const $ = zx({ cwd: ROOT });
export const upstream = $({ cwd: UPSTREAM });

export const run = $({ stdio: "inherit" });

// zx's .json() reads combined output, so keep diagnostics outside its capture.
export const json = $({ stdio: ["ignore", "pipe", "inherit"] });
