import { expect, it } from "vitest";
import { setArmorSkillTargets, calculateRange } from "./MhnowApp";
import { exportFile, parseImport, defaultStats, initialBuildState, pieceOf, setPiece } from "./buildStore";

const seriesBy = {
  goss: {
    key: "goss", name: "雪鬼獸", unlock: 4, weaponTypes: ["long-sword"], hasArmor: true, traits: {},
    skills: {
      mail: [{ skill: "冰屬性攻擊強化", levels: [{ grade: 4, level: 1 }, { grade: 6, level: 1 }, { grade: 8, level: 2 }] }],
      gloves: [{ skill: "冰屬性攻擊強化", levels: [{ grade: 4, level: 1 }] }, { skill: "精靈加護", levels: [{ grade: 6, level: 1 }] }],
    },
    slots: { mail: [5], gloves: [5, 8] },
  },
};
const base = () => ({ ...initialBuildState().builds[0], gear: { mail: "goss", gloves: "goss", weapon: "goss::long-sword" } });

it("sets every equipped armor's last skill increase, includes production for unset grades and leaves weapons alone", () => {
  const original = setPiece(setPiece(base(), "mail", { item: "goss::armor", current: "4-2", target: "" }),
    "weapon", { item: "goss::long-sword", current: "5-1", target: "10-5" });
  const next = setArmorSkillTargets(original, seriesBy);
  expect(next.pieces.mail).toEqual({ item: "goss::armor", current: "4-2", target: "8-1" });
  expect(next.pieces.gloves).toEqual({ item: "goss::armor", current: "unforged", target: "6-1" });
  expect(next.pieces.weapon).toEqual(original.pieces.weapon);
  expect(next.pieces.helm).toBeUndefined();
  expect(next.showMissing).toBe(true);
  expect(original.pieces.gloves).toBeUndefined();
  const cost = calculateRange([
    { grade: "4-1", zenny: 100, materials: [{ name: "生產素材", quantity: 2 }] },
    { grade: "6-1", zenny: 200, materials: [{ name: "升級素材", quantity: 3 }] },
  ], next.pieces.gloves.current, next.pieces.gloves.target);
  expect(cost.zenny).toBe(300);
  expect(cost.materials.map((item) => item.name)).toContain("生產素材");
});

it("does not downgrade reached armor or reuse an old piece's grades after changing equipment", () => {
  const build = setPiece(setPiece(base(), "mail", { item: "goss::armor", current: "9-1", target: "10-5" }),
    "gloves", { item: "kulu::armor", current: "10-5", target: "" });
  const next = setArmorSkillTargets(build, seriesBy);
  expect(next.pieces.mail).toEqual({ item: "goss::armor", current: "9-1", target: "" });
  expect(next.pieces.gloves).toEqual({ item: "goss::armor", current: "unforged", target: "6-1" });
  expect(setArmorSkillTargets(next, seriesBy)).toEqual(next);
  const empty = initialBuildState().builds[0];
  expect(setArmorSkillTargets(empty, seriesBy)).toBe(empty);
});

it("includes automatically assigned armor targets in backups", () => {
  const build = setArmorSkillTargets(base(), seriesBy);
  const result = parseImport(exportFile({ active: build.id, builds: [build] }, defaultStats()));
  expect("state" in result).toBe(true);
  if (!("state" in result)) return;
  expect(pieceOf(result.state.builds[0], "mail", "goss::armor").target).toBe("8-1");
  expect(pieceOf(result.state.builds[0], "gloves", "goss::armor").current).toBe("unforged");
  expect(pieceOf(result.state.builds[0], "gloves", "goss::armor").target).toBe("6-1");
});
