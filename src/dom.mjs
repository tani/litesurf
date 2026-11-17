// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Options for the synchronous, in-process Wasm DOM used by test environments.
 * @typedef {object} DOMOptions
 * @property {string} [html] Initial HTML; defaults to an empty HTML document.
 * @property {string} [url="http://localhost:3000/"] Document URL.
 * @property {number} [width=1280] Viewport width in CSS pixels.
 * @property {number} [height=720] Viewport height in CSS pixels.
 * @property {string} [dist] Override the packaged distribution directory.
 */

/**
 * Registered browser globals. close() restores previous properties and releases the DOM.
 * @typedef {{window: Window & typeof globalThis, document: Document, close: () => void} & Disposable} DOMEnvironment
 */

const DEFAULT_DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const registrations = new WeakSet();

class Storage {
  /** @type {Map<string, string>} */
  #values = new Map();
  get length() {
    return this.#values.size;
  }
  /** @param {number} index */
  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }
  /** @param {string} key */
  getItem(key) {
    return this.#values.get(String(key)) ?? null;
  }
  /** @param {string} key @param {string} value */
  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }
  /** @param {string} key */
  removeItem(key) {
    this.#values.delete(String(key));
  }
  clear() {
    this.#values.clear();
  }
}

/** @param {string} dist */
async function loadCore(dist) {
  const worker = resolve(dist, "worker");
  const names = readdirSync(worker);
  const find = (/** @type {string} */ suffix) => {
    const matches = names.filter((name) => name.endsWith(suffix));
    if (matches.length !== 1)
      throw new Error(`Expected one ${suffix} in ${worker}. Run npm run build.`);
    return resolve(worker, matches[0]);
  };
  const core = /** @type {typeof import("../dist/dom/core.js")} */ (
    await import(pathToFileURL(find("kitesurf_core.glue.js")).href)
  );
  core.initSync({ module: readFileSync(find("kitesurf_core_bg.wasm")) });
  return core;
}

/**
 * Install Kitesurf's DOM shim over its native Wasm DOM, in the test's own process.
 * No workerd process, CDP connection, jsdom, or happy-dom dependency is used.
 * Only one registration may own a JavaScript realm at a time.
 * @param {DOMOptions} [options]
 * @param {typeof globalThis} [target] Global object supplied by the test runner.
 * @returns {Promise<DOMEnvironment>}
 */
export async function registerDOM(options = {}, target = globalThis) {
  if (target !== globalThis)
    throw new TypeError("Register the DOM in the test's own JavaScript realm.");
  if (registrations.has(target))
    throw new Error("Litesurf DOM is already registered on this global.");
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  if (![width, height].every((value) => Number.isInteger(value) && value > 0)) {
    throw new RangeError("DOM viewport width and height must be positive integers.");
  }
  let url = new URL(options.url ?? "http://localhost:3000/").href;
  const dist = resolve(options.dist ?? DEFAULT_DIST);
  registrations.add(target);
  /** @type {Map<PropertyKey, PropertyDescriptor | undefined>} */
  const originals = new Map();
  /** @type {Map<number, ReturnType<typeof setTimeout>>} */
  const frames = new Map();
  let nextFrame = 0;
  let closed = false;
  /** @type {import("../dist/dom/core.js").DomHandle | undefined} */
  let dom;
  const close = () => {
    if (closed) return;
    closed = true;
    for (const timer of frames.values()) clearTimeout(timer);
    frames.clear();
    for (const [name, descriptor] of [...originals].reverse()) {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else Reflect.deleteProperty(target, name);
    }
    dom?.free();
    registrations.delete(target);
  };
  /** @param {PropertyKey} name @param {unknown} value */
  const install = (name, value) => {
    if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(target, name));
    Object.defineProperty(target, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: typeof name === "string",
    });
  };
  try {
    const core = await loadCore(dist);
    const { createDOMShim } = await import(pathToFileURL(resolve(dist, "dom/shim.mjs")).href);
    // Upstream sets only the value of this slot. Predeclare it as configurable so
    // a test environment can restore it without changing upstream's source.
    install(Symbol.for("kitesurf.internals"), Object.create(null));
    const shim = createDOMShim();
    dom = new core.DomHandle(
      options.html ?? "<!doctype html><html><head></head><body></body></html>",
      url,
    );
    dom.setViewport(width, height);
    const native = dom;
    const state = shim.getInternalState();
    state.viewportW = width;
    state.viewportH = height;
    const bag = shim.buildDocument(native, {
      pageUrl: url,
      initialCookieString: "",
      getCurrentUrl: () => url,
      getDocumentUrl: () => url,
      setCurrentUrl: (/** @type {string} */ value) => {
        url = value;
      },
      canonicalizeInlineStyle: core.ks_parse_inline_style,
      parseTypedStyleValue: core.ks_parse_typed_style_value,
      parseTypedNumericValue: core.ks_parse_typed_numeric_value,
      parseCounterStyleRule: core.ks_counter_style_rule,
      serializeInlineStyle: core.ks_serialize_inline_style,
      getInlinePropertyValue: core.ks_get_property_value,
      canonicalizePageSelectors: core.ks_canonicalize_page_selectors,
      createRuleStyleDeclaration: (
        /** @type {string} */ context,
        /** @type {string} */ css,
        /** @type {string} */ base,
      ) => new core.RuleStyleDeclarationStore(context, css, base),
      getRectByAuthId: (/** @type {number} */ id) => {
        native.resolveLayout();
        return native.getBoundingClientRect(id);
      },
      getScrollInfoByAuthId: native.nodeScrollInfo.bind(native),
      getComputedStyleForAuthId: (
        /** @type {number} */ id,
        /** @type {string | undefined} */ pseudo,
      ) => {
        native.resolveLayout();
        return pseudo ? native.computedStylePseudo(id, pseudo) : native.computedStyle(id);
      },
      getComputedStyleValueForAuthId: (
        /** @type {number} */ id,
        /** @type {string} */ property,
      ) => {
        native.resolveLayout();
        return native.computedStyleValue(id, property);
      },
      characterSet: "UTF-8",
      encodingName: core.ks_encoding_name,
      percentEncodeAfterEncoding: core.ks_percent_encode_after_encoding,
      encodeHtml: core.ks_encode_html,
    });
    // The factory returns private PageScript hooks as well; expose only DOM globals.
    for (const [name, value] of Object.entries(bag)) {
      if (/^[A-Z]/.test(name) || ["window", "document", "getSelection"].includes(name))
        install(name, value);
    }
    const window = bag.window;
    for (const name of ["self", "top", "parent", "frames"]) install(name, window);
    for (const name of [
      "location",
      "history",
      "screen",
      "innerWidth",
      "innerHeight",
      "devicePixelRatio",
    ]) {
      install(name, window[name]);
    }
    for (const name of [
      "getComputedStyle",
      "addEventListener",
      "removeEventListener",
      "dispatchEvent",
    ]) {
      install(name, window[name].bind(window));
    }
    install("navigator", {
      userAgent: "litesurf",
      language: "en-US",
      languages: ["en-US"],
      platform: process.platform,
    });
    install("Storage", Storage);
    install("localStorage", new Storage());
    install("sessionStorage", new Storage());
    install("requestAnimationFrame", (/** @type {FrameRequestCallback} */ callback) => {
      const id = ++nextFrame;
      frames.set(
        id,
        setTimeout(() => {
          frames.delete(id);
          if (!closed) callback(performance.now());
        }, 16),
      );
      return id;
    });
    install("cancelAnimationFrame", (/** @type {number} */ id) => {
      clearTimeout(frames.get(id));
      frames.delete(id);
    });
    bag.setReadyState("complete");
    return { window, document: bag.document, close, [Symbol.dispose]: close };
  } catch (error) {
    close();
    throw error;
  }
}
