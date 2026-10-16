import { expect, it } from "vitest";
import { compareSkillTotals, equipmentDriftSlots, equipmentSkillTotals, replaceComparisonGear } from "./gearComparison";
import { initialBuildState, setOwnedGrade, updateBuild, gearId } from "./buildStore";

const series: Parameters<typeof equipmentSkillTotals>[1] = [
  { key: "a", skills: {
    helm: [{ skill: "攻擊", levels: [{ grade: 2, level: 1 }, { grade: 8, level: 2 }] }],
    mail: [{ skill: "看破", levels: [{ grade: 4, level: 2 }] }],
    weapon: [{ skill: "攻擊", levels: [{ grade: 2, level: 1 }] }],
  }, weaponSkills: { bow: [{ skill: "集中", levels: [{ grade: 4, level: 3 }] }] }, slots: { helm: [5, 8], mail: [5] } },
  { key: "b", skills: { helm: [{ skill: "看破", levels: [{ grade: 6, level: 3 }] }] }, slots: { helm: [5] } },
];
const equipped = () => ({ ...initialBuildState().builds[0], gear: { weapon: "a::bow", helm: "a", mail: "a" },
  drifts: { helm: [{ skill: "攻擊", color: "" }, { skill: "連擊", color: "" }], mail: [{ skill: "攻擊", color: "" }] },
});

it("totals native gear and weapon overrides without counting selected stones", () => {
  expect(equipmentSkillTotals(equipped(), series)).toEqual({ 集中: 3, 攻擊: 2, 看破: 2 });
  expect(equipmentSkillTotals(initialBuildState().builds[0], series)).toEqual({});
});

it("replaces native skills without changing the source or stored stones", () => {
  const build = equipped();
  const preview = replaceComparisonGear(build, "helm", "b");
  expect(preview.gear.helm).toBe("b");
  expect(build.gear.helm).toBe("a");
  expect(preview.gear.weapon).toBe(build.gear.weapon);
  expect(preview.drifts).toBe(build.drifts);
  expect(equipmentSkillTotals(preview, series)).toEqual({ 集中: 3, 看破: 5 });
  expect(replaceComparisonGear(build, "helm", "a")).toBe(build);
  const differences = compareSkillTotals(equipmentSkillTotals(build, series), equipmentSkillTotals(preview, series), ["看破", "心眼"]);
  expect(differences.slice(0, 2).map((item) => item.name)).toEqual(["看破", "心眼"]);
  expect(differences).toEqual(expect.arrayContaining([
    { name: "看破", before: 2, after: 5, delta: 3 },
    { name: "攻擊", before: 2, after: 0, delta: -2 },
    { name: "心眼", before: 0, after: 0, delta: 0 },
  ]));
});

it("uses the same totals after the real selection synchronizes owned grades", () => {
  const build = equipped();
  const state = setOwnedGrade({ active: build.id, builds: [build] }, gearId("helm", "b::armor"), "6-1");
  const preview = replaceComparisonGear(build, "helm", "b");
  const applied = updateBuild(state, build.id, (current) => replaceComparisonGear(current, "helm", "b"));
  expect(applied.builds[0].pieces.helm.current).toBe("6-1");
  expect(equipmentSkillTotals(applied.builds[0], series)).toEqual(equipmentSkillTotals(preview, series));
  expect(applied.builds[0].drifts).toEqual(build.drifts);
});

it("switches weapon types using their own skills and ignores stones on empty equipment", () => {
  const build = equipped();
  const switched = replaceComparisonGear(build, "weapon", "a::hammer");
  expect(equipmentSkillTotals(switched, series)).toEqual({ 攻擊: 3, 看破: 2 });
  const emptySlot = { ...build, gear: { weapon: "missing::bow", helm: "missing" } };
  expect(equipmentSkillTotals(emptySlot, series)).toEqual({});
});

it("counts available holes independently of equipped stones and updates after replacement", () => {
  expect(equipmentDriftSlots(equipped(), series)).toBe(3);
  expect(equipmentDriftSlots(replaceComparisonGear(equipped(), "helm", "b"), series)).toBe(2);
  expect(equipmentDriftSlots(initialBuildState().builds[0], series)).toBe(0);
});

