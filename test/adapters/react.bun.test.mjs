// SPDX-License-Identifier: Apache-2.0

import { afterEach, test, expect } from "bun:test";
import { createElement, useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
function Counter() {
  const [count, setCount] = useState(0);
  return createElement("button", { onClick: () => setCount(count + 1) }, "Count " + count);
}
test("runs React Testing Library in Bun against the Wasm DOM", () => {
  render(createElement(Counter));
  const button = screen.getByRole("button", { name: "Count 0" });
  fireEvent.click(button);
  expect(screen.getByRole("button", { name: "Count 1" })).toBe(button);
});
