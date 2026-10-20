import type { Build } from "./buildStore";
import { skillsAtGrade, type SeriesSkill } from "./skills";
import { styleFits } from "./weaponStyles";

type SkillSource = {
  key: string; skills: Record<string, SeriesSkill[]>; weaponSkills?: Record<string, SeriesSkill[]>;
  slots?: Partial<Record<"helm" | "mail" | "gloves" | "belt" | "greaves", number[]>>;
};
const ARMOR_SLOTS = ["helm", "mail", "gloves", "belt", "greaves"] as const;

export function equipmentDriftSlots(build: Build, series: SkillSource[]): number {
  return ARMOR_SLOTS.reduce((sum, slot) => sum + (series.find((item) => item.key === build.gear[slot])?.slots?.[slot]?.length ?? 0), 0);
}

/** Maximum native equipment skills; stones are managed separately from this comparison. */
export function equipmentSkillTotals(build: Build, series: SkillSource[]): Record<string, number> {
  const byKey = new Map(series.map((item) => [item.key, item]));
  const total: Record<string, number> = {};
  const add = (skills: Record<string, number>) => {
    for (const [name, level] of Object.entries(skills)) total[name] = (total[name] ?? 0) + level;
  };
  const [weaponKey, weaponType] = (build.gear.weapon ?? "").split("::");
  const weapon = weaponType ? byKey.get(weaponKey) : undefined;
  if (weapon) add(skillsAtGrade(weapon.weaponSkills?.[weaponType] ?? weapon.skills.weapon, 10));
  for (const slot of ARMOR_SLOTS) {
    const item = byKey.get(build.gear[slot]);
    if (!item) continue;
    add(skillsAtGrade(item.skills[slot], 10));
  }
  return total;
}

/** Preview and selection use the same replacement rule; clicking equipped gear never removes it. */
export function replaceComparisonGear(build: Build, slot: string, key: string): Build {
  if (build.gear[slot] === key) return build;
  const next = { ...build, gear: { ...build.gear, [slot]: key } };
  // 換成別種武器時，原本的風格就不屬於這把武器了。
  if (slot === "weapon" && next.style && !styleFits(key.split("::")[1] ?? "", next.style)) delete next.style;
  return next;
}

export function compareSkillTotals(before: Record<string, number>, after: Record<string, number>, selected: string[] = []) {
  return [...new Set([...Object.keys(before), ...Object.keys(after), ...selected])].map((name) => ({
    name, before: before[name] ?? 0, after: after[name] ?? 0, delta: (after[name] ?? 0) - (before[name] ?? 0),
  })).sort((a, b) => Number(selected.includes(b.name)) - Number(selected.includes(a.name))
    || Math.abs(b.delta) - Math.abs(a.delta) || b.after - a.after || a.name.localeCompare(b.name, "zh-Hant"));
}
