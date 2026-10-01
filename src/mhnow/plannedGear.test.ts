import { expect, it } from "vitest";
import { parsePlannedGear } from "./plannedGear";

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
