// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";

export async function verifyDOM() {
  document.body.innerHTML =
    '<style>#box { color: red; width: 123px; height: 45px; display: block }</style><div id="box"><button>Click</button></div>';
  const box = document.querySelector("#box");
  const button = document.querySelector("button");
  assert.ok(box instanceof HTMLElement);
  assert.ok(document instanceof Document);
  assert.equal(window.document, document);
  assert.equal(document.defaultView, window);
  assert.equal(getComputedStyle(box).color, "rgb(255, 0, 0)");
  assert.equal(box.getBoundingClientRect().width, 123);
  assert.equal(box.getBoundingClientRect().height, 45);
  let clicked = 0;
  button.addEventListener("click", () => clicked++);
  button.click();
  assert.equal(clicked, 1);
  let mutations = 0;
  const observer = new MutationObserver((records) => (mutations += records.length));
  observer.observe(button, { childList: true });
  button.textContent = "Updated";
  await Promise.resolve();
  assert.ok(mutations > 0);
  observer.disconnect();
  localStorage.setItem("contract", "local");
  sessionStorage.setItem("contract", "session");
  assert.equal(window.localStorage.getItem("contract"), "local");
  assert.equal(window.sessionStorage.getItem("contract"), "session");
  history.pushState({ page: 2 }, "", "/next");
  assert.equal(location.pathname, "/next");
  localStorage.clear();
  sessionStorage.clear();
}
