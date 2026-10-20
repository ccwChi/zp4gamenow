import { expect, it } from "vitest";
import { WEAPON_ELEMENTS, hasWeaponElement, weaponElementsOf } from "./weaponElements";

const tobi = { weaponElement: "paralysis", weaponElements: ["poison", "paralysis", "white"], weaponEff: { "heavy-gun": "poison" } };

it("reads the whole series, or just one weapon type when given", () => {
  expect(weaponElementsOf(tobi)).toEqual(["poison", "paralysis", "white"]);
  expect(weaponElementsOf(tobi, "heavy-gun")).toEqual(["poison"]);
  expect(weaponElementsOf(tobi, "bow")).toEqual(["paralysis"]);
  expect(weaponElementsOf({})).toEqual([]);
});

it("counts both thunder codes as thunder", () => {
  expect(weaponElementsOf({ weaponElements: ["thunder", "thunder2"] })).toEqual(["thunder"]);
  expect(hasWeaponElement({ weaponElement: "thunder2" }, "thunder")).toBe(true);
  expect(hasWeaponElement({ weaponElement: "thunder2" }, "thunder", "bow")).toBe(true);
});

it("matches a monster only for the elements its weapons actually have", () => {
  expect(hasWeaponElement(tobi, "poison")).toBe(true);
  expect(hasWeaponElement(tobi, "poison", "bow")).toBe(false);
  expect(hasWeaponElement(tobi, "fire")).toBe(false);
});

it("uses the element codes that appear in the series data", async () => {
  const { readFile } = await import("node:fs/promises");
  const index = JSON.parse(await readFile("public/mhnow/series-index.json", "utf8")) as { series: { weaponElements?: string[] }[] };
  const inData = new Set(index.series.flatMap((item) => item.weaponElements ?? []));
  for (const element of WEAPON_ELEMENTS) expect(inData.has(element) || element === "thunder", element).toBe(true);
  // 資料裡除了分類用的屬性，只會多出第二種雷。
  expect([...inData].filter((element) => !WEAPON_ELEMENTS.includes(element as never)).sort()).toEqual(["thunder2"]);
});
