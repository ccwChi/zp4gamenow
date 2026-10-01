import { expect, it } from "vitest";
import { parseMaterialDiscount, waiveGatherMaterials } from "./materialDiscount";

it("removes gathered materials and claws but keeps monster parts, misc and zenny", () => {
  const rows = [{ grade: "1-1", zenny: 100, materials: [
    { name: "鐵礦石", quantity: 3, group: "gather" },
    { name: "尖爪", quantity: 2, group: "wyvern" },
    { name: "火龍的鱗", quantity: 1 },
    { name: "武器精鍊素材", quantity: 1, group: "misc" },
  ] }];
  expect(waiveGatherMaterials(rows)).toEqual([{ grade: "1-1", zenny: 100, materials: [
    { name: "火龍的鱗", quantity: 1 },
    { name: "武器精鍊素材", quantity: 1, group: "misc" },
  ] }]);
  expect(rows[0].materials).toHaveLength(4);
});

it("restores the saved monster list and drops invalid entries", () => {
  expect(parseMaterialDiscount(JSON.stringify(["ratha", "ratha", "", 3, "rathi"]))).toEqual(["ratha", "rathi"]);
  expect(parseMaterialDiscount("{}")).toEqual([]);
  expect(parseMaterialDiscount("broken")).toEqual([]);
  expect(parseMaterialDiscount(null)).toEqual([]);
});
