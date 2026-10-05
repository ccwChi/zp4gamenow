export type SkillLevel = { level: number; grade: number };
export type SeriesSkill = { skill: string; levels: SkillLevel[]; style?: number };

/** 某個部位在指定階級時已取得的技能等級。 */
export function skillsAtGrade(entries: SeriesSkill[] = [], grade: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of entries) {
    const reached = entry.levels.filter((level) => level.grade <= grade);
    if (reached.length) result[entry.skill] = Math.max(...reached.map((level) => level.level));
  }
  return result;
}
