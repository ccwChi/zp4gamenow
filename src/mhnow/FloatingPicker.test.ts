import { expect, it } from "vitest";
import { fitBounds } from "./FloatingPicker";

it("brings a saved desktop window back into a phone viewport", () => {
  expect(fitBounds({ x: 1400, y: 800, width: 760, height: 700 }, 390, 600))
    .toEqual({ x: 8, y: 8, width: 374, height: 584 });
});

it("keeps usable minimum dimensions and prevents dragging off the top-left", () => {
  expect(fitBounds({ x: -50, y: -100, width: 10, height: 10 }, 1200, 800))
    .toEqual({ x: 8, y: 8, width: 300, height: 240 });
});

it("preserves an in-bounds window", () => {
  const bounds = { x: 100, y: 80, width: 600, height: 500 };
  expect(fitBounds(bounds, 1200, 800)).toEqual(bounds);
});
