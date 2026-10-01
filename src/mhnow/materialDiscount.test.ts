import { expect, it } from "vitest";
import { DEFAULT_MATERIAL_DISCOUNT, parseMaterialDiscount, serializeMaterialDiscount, waiveGatherMaterials } from "./materialDiscount";

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

const defaults = { event: "e2", monsters: ["ratha", "zino"] };

it("starts from the event defaults until the user saves picks for that event", () => {
  expect(parseMaterialDiscount(null, defaults)).toEqual(["ratha", "zino"]);
  expect(parseMaterialDiscount("broken", defaults)).toEqual(["ratha", "zino"]);
  expect(parseMaterialDiscount(JSON.stringify(["mizu"]), defaults)).toEqual(["ratha", "zino"]);
});

it("keeps the user's own picks within the same event, including an empty list", () => {
  expect(parseMaterialDiscount(serializeMaterialDiscount(["mizu", "mizu", "", "akno"], defaults), defaults)).toEqual(["mizu", "akno"]);
  expect(parseMaterialDiscount(serializeMaterialDiscount([], defaults), defaults)).toEqual([]);
});

it("resets to the new defaults when the event changes", () => {
  const saved = serializeMaterialDiscount(["mizu"], { event: "e1", monsters: [] });
  expect(parseMaterialDiscount(saved, defaults)).toEqual(["ratha", "zino"]);
});

it("defaults only to monsters that exist in the series data", async () => {
  const { readFile } = await import("node:fs/promises");
  const index = JSON.parse(await readFile("public/mhnow/series-index.json", "utf8")) as { series: { key: string; weaponTypes: string[] }[] };
  for (const key of DEFAULT_MATERIAL_DISCOUNT.monsters) expect(index.series.find((item) => item.key === key)?.weaponTypes.length, key).toBeGreaterThan(0);
});
