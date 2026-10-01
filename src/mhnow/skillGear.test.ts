import { expect, it } from "vitest";
import { gearForSkill } from "./MhnowApp";

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
