type Skill = { skill: string; levels: { grade: number; level: number }[] };
export function validCurrentGrade(value: string): boolean {
  return /^(?:[2-9]|10)-[1-5]$/.test(value);
}
const gradeValue = (value: string) => value === "unforged" ? 0 : Number(value.split("-")[0]) * 5 + Number(value.split("-")[1]);

/** Only skill-level increases count; driftstone slots do not influence the target. */
export function automaticTarget(kind: string, entries: Skill[], current: string, minimumGrade = 2): string {
  let lastChange = minimumGrade;
  for (const entry of entries) {
    let previous = 0;
    for (const tier of [...entry.levels].sort((a, b) => a.grade - b.grade)) {
      if (tier.grade > 10) continue;
      if (tier.level > previous) lastChange = Math.max(lastChange, tier.grade);
      previous = Math.max(previous, tier.level);
    }
  }
  const target = kind === "weapon" ? "10-5" : `${lastChange}-1`;
  return gradeValue(current) >= gradeValue(target) ? "" : target;
}
