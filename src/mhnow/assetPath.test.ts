import { expect, it } from "vitest";
import { dataPath } from "./assetPath";

it("tags data files with the build version so a new deploy never reads stale cached data", () => {
  expect(dataPath("/mhnow/series-index.json", "abc")).toBe("/mhnow/series-index.json?v=abc");
  expect(dataPath("/mhnow/series-index.json", "")).toBe("/mhnow/series-index.json");
});
