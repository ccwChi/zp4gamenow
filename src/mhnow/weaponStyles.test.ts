import { expect, it } from "vitest";
import { WEAPON_STYLES, styleFits, styleName, stylesFor } from "./weaponStyles";

it("gives every weapon type its own two styles", () => {
  const types = Object.keys(WEAPON_STYLES);
  expect(types).toHaveLength(14);
  for (const type of types) expect(stylesFor(type), type).toHaveLength(2);
  const codes = Object.values(WEAPON_STYLES).flat();
  // 防禦裝填是銃槍與重弩共用的風格，其他代號都只屬於一種武器。
  expect(codes.filter((code) => codes.indexOf(code) !== codes.lastIndexOf(code))).toEqual(["guard_reload", "guard_reload"]);
});

it("names every style in Chinese, and falls back to a readable name for anything unknown", () => {
  for (const code of Object.values(WEAPON_STYLES).flat()) expect(styleName(code), code).toMatch(/[一-鿿]/);
  expect(styleName("crouching_shot")).toBe("蹲伏射擊");
  expect(styleName("not_a_style")).toBe("Not A Style");
  expect(stylesFor("unknown-weapon")).toEqual([]);
});

it("knows which styles belong to a weapon type", () => {
  expect(styleFits("heavy-gun", "crouching_shot")).toBe(true);
  expect(styleFits("light-gun", "crouching_shot")).toBe(false);
  expect(styleFits("", "crouching_shot")).toBe(false);
});

it("covers every style the community data uses", async () => {
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile("public/mhnow/community-builds.json", "utf8")) as { builds: { type: string; style?: string }[] };
  for (const build of data.builds) if (build.style) expect(styleFits(build.type, build.style), `${build.type} ${build.style}`).toBe(true);
});
