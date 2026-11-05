import { expect, it } from "vitest";
import { gearIcon, weaponTitle } from "./weaponOverrides";

it("names only the overridden weapon of a series", () => {
  expect(weaponTitle("winter-25", "dual-blades", "冬祭25", "雙劍")).toBe("花環雙劍");
  expect(weaponTitle("winter-25", "bow", "冬祭25", "弓")).toBe("冬祭25弓");
});

it("uses the weapon's icon, falling back to the series icon", () => {
  const icons = { kulu: "/kulu.webp" };
  expect(gearIcon(icons, "winter-25::dual-blades")).toBe("/mhnow/monsters/twin_wreathes.webp");
  expect(gearIcon(icons, "winter-25::bow")).toBeUndefined();
  expect(gearIcon(icons, "kulu::bow")).toBe("/kulu.webp");
  expect(gearIcon(icons, "kulu::armor")).toBe("/kulu.webp");
});
