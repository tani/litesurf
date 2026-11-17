// SPDX-License-Identifier: Apache-2.0

import { registerDOM } from "litesurf/dom";
import type { DOMOptions, DOMEnvironment } from "litesurf/dom";

const options: DOMOptions = {
  url: "https://example.com/",
  html: "<p>hello</p>",
  width: 640,
  height: 480,
};
using environment: DOMEnvironment = await registerDOM(options);
const _document: Document = environment.document;
const _window: Window = environment.window;
const _element: HTMLElement = environment.document.createElement("button");
const _result: void = environment.close();
// @ts-expect-error Viewport dimensions must be numeric.
registerDOM({ width: "640" });
// @ts-expect-error The HTML input must be a string.
registerDOM({ html: 123 });
