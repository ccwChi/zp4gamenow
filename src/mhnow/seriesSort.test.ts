import { expect, it } from "vitest";
import { elementGroup, parseSeriesSort, sortSeries } from "./seriesSort";

it("groups all four statuses together and handles mixed weapons and armor-only series", () => {
  expect(elementGroup(["blast", "paralysis", "poison", "sleep"])).toBe("status");
  expect(elementGroup(["thunder", "thunder2"])).toBe("thunder");
  expect(elementGroup(["poison", "dragon"])).toBe("multiple");
  expect(elementGroup([])).toBe("none");
});
it("switches ordering without changing the original order, sorting equal elements by ID", () => {
  const source = [
    { id: 3, name: "三", weaponElements: ["poison"] },
    { id: 2, name: "二", weaponElements: ["blast"] },
    { id: 1, name: "一", weaponElements: ["fire"] },
  ];
  expect(sortSeries(source, "id").map((item) => item.id)).toEqual([1, 2, 3]);
  expect(sortSeries(source, "element").map((item) => item.id)).toEqual([1, 2, 3]);
  expect(sortSeries(source, "name").map((item) => item.name)).toEqual(["一", "二", "三"]);
  expect(sortSeries(source, "source").map((item) => item.id)).toEqual([3, 2, 1]);
  expect(parseSeriesSort("element")).toBe("element");
  expect(parseSeriesSort("invalid")).toBe("name");
  expect(parseSeriesSort("toString")).toBe("name");
});
