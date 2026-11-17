// SPDX-License-Identifier: Apache-2.0

import { afterEach, test, expect } from "vitest";
import { createElement, useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
function Counter() {
  const [count, setCount] = useState(0);
  return createElement("button", { onClick: () => setCount(count + 1) }, "Count " + count);
}
test("runs existing React Testing Library tests against the Wasm DOM", () => {
  expect(document.body.innerHTML).toBe("");
  render(createElement(Counter));
  const button = screen.getByRole("button", { name: "Count 0" });
  fireEvent.click(button);
  expect(screen.getByRole("button", { name: "Count 1" })).toBe(button);
});
