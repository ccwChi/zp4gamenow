import { expect, it } from "vitest";
import { parsePlannedGear, plannedGearId, plannedMaterialKey } from "./plannedGear";
import { totalMissing } from "./MhnowApp";
import { waiveGatherMaterials } from "./materialDiscount";

it("preserves per-equipment inclusion and includes legacy plans by default", () => {
  const plan = { series: "a", slot: "helm", current: "6-1", target: "8-1" };
  const restored = parsePlannedGear(JSON.stringify([plan, { ...plan, slot: "mail", included: false }, { ...plan, slot: "belt", included: true }]));
  expect(restored.map((item) => item.included !== false)).toEqual([true, false, true]);
  expect(parsePlannedGear(JSON.stringify(restored))).toEqual(restored);
  expect(parsePlannedGear(JSON.stringify([{ ...plan, included: "false" }]))).toEqual([]);
});

it("restores independent upgrade ranges for multiple parts and monsters", () => {
  const plans = [
    { series: "a", slot: "helm", current: "6-2", target: "8-5" },
    { series: "a", slot: "mail", current: "unforged", target: "6-1" },
    { series: "b", slot: "helm", current: "5-1", target: "" },
  ];
  expect(parsePlannedGear(JSON.stringify(plans))).toEqual(plans);
});

it("ignores duplicate equipment and invalid saved entries without losing valid plans", () => {
  const plan = { series: "a", slot: "helm", current: "unforged", target: "" };
  expect(parsePlannedGear(JSON.stringify([plan, plan, null, { ...plan, slot: "weapon" }, { ...plan, current: "bad" }]))).toEqual([plan]);
  expect(parsePlannedGear("broken json")).toEqual([]);
  expect(parsePlannedGear(null)).toEqual([]);
});

it("restores multiple weapon types alongside old armor plans and rejects invalid weapons", () => {
  const plans = [
    { series: "a", slot: "weapon" as const, weaponType: "bow", current: "5-1", target: "10-5" },
    { series: "a", slot: "weapon" as const, weaponType: "hammer", current: "unforged", target: "10-5" },
    { series: "a", slot: "helm" as const, current: "6-1", target: "8-1" },
  ];
  expect(parsePlannedGear(JSON.stringify([...plans, plans[0], { ...plans[0], weaponType: "invalid" }]))).toEqual(plans);
  expect(new Set(plans.map(plannedGearId)).size).toBe(3);
  expect(plannedMaterialKey(plans[0])).toBe("weapon|a::bow");
  expect(plannedMaterialKey(plans[2])).toBe("helm|a::armor");
});

it("uses shared equipment keys to deduplicate loadouts and applies weapon discounts", () => {
  const weapon = { series: "a", slot: "weapon" as const, weaponType: "bow", current: "unforged", target: "5-1" };
  const rows = [{ grade: "5-1", zenny: 100, materials: [
    { name: "鐵礦石", quantity: 3, group: "gather" as const },
    { name: "魔物鱗", quantity: 2, monster: "a" },
  ] }];
  const discountedRows = waiveGatherMaterials(rows);
  const total = totalMissing([
    { key: "weapon|a::bow", rows: discountedRows, range: weapon },
    { key: plannedMaterialKey(weapon), rows: discountedRows, range: weapon },
  ]);
  expect(total.pieces).toBe(1);
  expect(total.zenny).toBe(100);
  expect(total.materials.map((item) => item.name)).toEqual(["魔物鱗"]);
  expect(totalMissing([{ key: "helm|a::armor", rows, range: weapon }]).materials).toHaveLength(2);
});
