import { expect, it } from "vitest";
import { autoFactor, baseScale, effectiveScale, parseAppScale } from "./appScale";

it("keeps the tuned size on a 125% desktop and grows on wider screens", () => {
  // 1920 螢幕開 125%：視窗 1536 CSS px，維持原本調好的大小。
  expect(autoFactor(1536)).toBe(1);
  expect(autoFactor(1366)).toBe(1);
  // 同一個螢幕開 100%：1920 CSS px，字會變小，所以放大回去。
  expect(autoFactor(1920)).toBe(1.25);
  expect(autoFactor(2560)).toBe(1.4);
  expect(autoFactor(0)).toBe(1);
  expect(autoFactor(Number.NaN)).toBe(1);
});

it("reads saved choices and ignores anything that is not an offered step", () => {
  expect(parseAppScale("auto")).toBe("auto");
  expect(parseAppScale("1.25")).toBe(1.25);
  expect(parseAppScale("0.5")).toBe("auto");
  expect(parseAppScale(null)).toBe("auto");
  expect(parseAppScale("toString")).toBe("auto");
});

it("multiplies the phone or desktop base by the chosen factor", () => {
  expect(baseScale(true)).toBe(0.72);
  expect(baseScale(false)).toBe(0.9);
  expect(effectiveScale("auto", 1536, true)).toBeCloseTo(0.72);
  expect(effectiveScale("auto", 1920, true)).toBeCloseTo(0.9);
  expect(effectiveScale(1.1, 1920, true)).toBeCloseTo(0.792);
  // 手機不跟著視窗寬度放大（本來就只有一欄）。
  expect(effectiveScale("auto", 400, false)).toBeCloseTo(0.9);
});
