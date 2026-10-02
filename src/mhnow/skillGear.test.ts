import { expect, it } from "vitest";
import { gearForSkill } from "./MhnowApp";

it("searches typed weapon traits per weapon type without turning traits into skills", () => {
  const series = [{
    key: "test", name: "測試", unlock: 1, hasArmor: true, weaponTypes: ["insect-glaive", "bow", "hammer"],
    skills: { weapon: [{ skill: "攻擊", levels: [{ grade: 2, level: 1 }] }] },
    traits: {
      "insect-glaive": { kinsect: [{ label: "獵蟲", value: "粉塵" }, { label: "加成", value: "強化時最大耐力UP" }] },
      bow: { arrows: [{ level: 1, name: "貫通" }], coating: "毒瓶" },
    },
  }];
  expect(gearForSkill(series, " 粉塵 ", true).map((gear) => gear.key)).toEqual(["test::insect-glaive"]);
  expect(gearForSkill(series, "耐力up", true).map((gear) => gear.key)).toEqual(["test::insect-glaive"]);
  expect(gearForSkill(series, "貫通", true).map((gear) => gear.key)).toEqual(["test::bow"]);
  expect(gearForSkill(series, "毒瓶", true).map((gear) => gear.key)).toEqual(["test::bow"]);
  expect(gearForSkill(series, "攻", true)).toHaveLength(3);
  expect(gearForSkill(series, "粉塵")).toEqual([]);
  expect(gearForSkill(series, "不存在", true)).toEqual([]);
  expect(gearForSkill(series, " ", true)).toEqual([]);
});

it("finds multiple armor slots and respects weapon-specific skill overrides", () => {
  const matches = gearForSkill([{
    key: "test", name: "測試", unlock: 1, hasArmor: true, weaponTypes: ["bow", "hammer"], traits: {},
    skills: {
      helm: [{ skill: "攻擊", levels: [{ grade: 2, level: 1 }] }],
      mail: [{ skill: "攻擊", levels: [{ grade: 6, level: 2 }] }],
      gloves: [{ skill: "攻擊強化", levels: [{ grade: 2, level: 1 }] }],
      weapon: [{ skill: "攻擊", levels: [{ grade: 2, level: 1 }] }],
    },
    weaponSkills: { bow: [{ skill: "集中", levels: [{ grade: 2, level: 1 }] }] },
  }], "攻擊");
  expect(matches).toHaveLength(3);
  expect(matches[0].slot).toBe("mail");
  expect(matches.map(({ slot, key, level }) => ({ slot, key, level }))).toEqual(expect.arrayContaining([
    { slot: "mail", key: "test", level: 2 },
      { slot: "helm", key: "test", level: 1 },
      { slot: "weapon", key: "test::hammer", level: 1 },
  ]));
});
