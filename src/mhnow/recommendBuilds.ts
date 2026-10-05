import type { Build, DriftPick } from "./buildStore";

export const RECOMMEND_SLOTS = ["helm", "mail", "gloves", "belt", "greaves"] as const;
type Slot = typeof RECOMMEND_SLOTS[number];
type Entry = { skill: string; levels: { grade: number; level: number }[]; style?: number };
export type RecommendSeries = {
  key: string; name: string; hasArmor: boolean; weaponTypes: string[]; unlock?: number;
  skills: Record<string, Entry[]>; weaponSkills?: Record<string, Entry[]>;
  slots?: Partial<Record<Slot, number[]>>;
};
export type RecommendDrifts = {
  colors: { key: string; skills: { name: string }[] }[];
  common: string[]; events: { skills: string[] }[];
};
export type Recommendation = { build: Build; skills: Record<string, number>; stoneCount: number };
export type RecommendationResult = { recommendations: Recommendation[]; truncated: boolean; visited: number };
export type RecommendOptions = {
  weapon: string; required: Record<string, number>; grade: number; includeDrifts: boolean;
  limit?: number; nodeLimit?: number; signal?: AbortSignal;
};

function skillsAt(entries: Entry[], grade: number) {
  const skills: Record<string, number> = {};
  // Style-specific skills require a style selection, which this search does not yet offer.
  for (const entry of entries.filter((entry) => entry.style === undefined)) {
    const level = Math.max(0, ...entry.levels.filter((level) => level.grade <= grade).map((level) => level.level));
    if (level) skills[entry.skill] = Math.max(skills[entry.skill] ?? 0, level);
  }
  return skills;
}

/** Constraint search with optimistic bounds. Yield periodically so cancellation and UI remain responsive.
 * Iterative stone budgets find no-stone solutions first; a shared node budget bounds broad searches.
 * Results are feasible alternatives, not a damage ranking or an exhaustive list.
 */
export async function recommendBuilds(series: RecommendSeries[], stones: RecommendDrifts, options: RecommendOptions): Promise<RecommendationResult> {
  const { weapon, grade, includeDrifts, signal } = options;
  const [weaponKey, weaponType] = weapon.split("::");
  const selected = series.find((item) => item.key === weaponKey && item.weaponTypes.includes(weaponType));
  if (!selected) throw new Error("請先選擇有效的武器。");
  if (!Number.isInteger(grade) || grade < 1 || grade > 10) throw new Error("裝備階級必須介於 1 至 10。");
  if ((selected.unlock ?? 1) > grade) throw new Error("所選階級低於武器的生產階級。");
  const targets = Object.entries(options.required);
  if (!targets.length || targets.some(([, level]) => !Number.isInteger(level) || level < 1)) throw new Error("請至少設定一個技能與有效等級。");
  const limit = Math.max(1, Math.min(10, options.limit ?? 10));
  const nodeLimit = Math.max(1, options.nodeLimit ?? 200000);
  const driftPool = new Map<string, DriftPick>();
  if (includeDrifts) {
    for (const color of stones.colors) for (const skill of color.skills) driftPool.set(skill.name, { skill: skill.name, color: color.key });
    for (const skill of stones.common) if (!driftPool.has(skill)) driftPool.set(skill, { skill, color: "common" });
    for (const event of stones.events) for (const skill of event.skills) if (!driftPool.has(skill)) driftPool.set(skill, { skill, color: "event" });
  }
  const base = skillsAt(selected.weaponSkills?.[weaponType] ?? selected.skills.weapon ?? [], grade);
  const pools = RECOMMEND_SLOTS.map((slot) => ({ slot, items: series.filter((item) => item.hasArmor && (item.unlock ?? 1) <= grade && (item.skills[slot] !== undefined || item.slots?.[slot] !== undefined)).map((item) => {
    const skills = skillsAt(item.skills[slot] ?? [], grade);
    const slots = includeDrifts ? (item.slots?.[slot] ?? []).filter((unlock) => unlock <= grade).length : 0;
    const relevance = targets.reduce((sum, [skill, level]) => sum + Math.min(level, skills[skill] ?? 0), 0);
    return { key: item.key, skills, slots, relevance };
  }).sort((a, b) => b.relevance - a.relevance || b.slots - a.slots || a.key.localeCompare(b.key)) }));
  // Most constrained parts first improves pruning without discarding any candidates.
  pools.sort((a, b) => a.items.length - b.items.length);
  const remaining = Array.from({ length: 6 }, () => targets.map(() => 0));
  const remainingSlots = Array(6).fill(0) as number[];
  for (let depth = 4; depth >= 0; depth--) {
    remainingSlots[depth] = remainingSlots[depth + 1] + Math.max(0, ...pools[depth].items.map((item) => item.slots));
    targets.forEach(([skill], index) => {
      remaining[depth][index] = remaining[depth + 1][index] + Math.max(0, ...pools[depth].items.map((item) => item.skills[skill] ?? 0));
    });
  }
  const recommendations: Recommendation[] = [];
  const seen = new Set<string>();
  let visited = 0;
  let truncated = false;
  const gear: Record<string, string> = { weapon };
  const capacities: Partial<Record<Slot, number>> = {};
  async function search(depth: number, skills: Record<string, number>, slots: number, budget: number): Promise<void> {
    if (signal?.aborted) throw new DOMException("搜尋已取消", "AbortError");
    if (recommendations.length >= limit || truncated) return;
    if (visited >= nodeLimit) { truncated = true; return; }
    visited++;
    if (visited % 1000 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    let needed = 0;
    for (let index = 0; index < targets.length; index++) {
      const [skill, level] = targets[index];
      const deficit = Math.max(0, level - (skills[skill] ?? 0) - remaining[depth][index]);
      if (deficit && !driftPool.has(skill)) return;
      needed += deficit;
    }
    if (needed > Math.min(budget, slots + remainingSlots[depth])) return;
    if (depth === 5) {
      const signature = RECOMMEND_SLOTS.map((slot) => gear[slot]).join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      const picks = targets.flatMap(([skill, level]) => Array.from({ length: Math.max(0, level - (skills[skill] ?? 0)) }, () => driftPool.get(skill)!));
      const drifts: Build["drifts"] = {};
      let position = 0;
      for (const slot of RECOMMEND_SLOTS) {
        drifts[slot] = picks.slice(position, position + (capacities[slot] ?? 0));
        position += drifts[slot].length;
      }
      const total = { ...skills };
      for (const pick of picks) total[pick.skill] = (total[pick.skill] ?? 0) + 1;
      recommendations.push({ build: { id: `recommend-${recommendations.length}`, name: `建議配裝 ${recommendations.length + 1}`, gear: { ...gear }, drifts, pieces: {}, showMissing: false }, skills: total, stoneCount: picks.length });
      return;
    }
    const pool = pools[depth];
    for (const item of pool.items) {
      gear[pool.slot] = item.key;
      capacities[pool.slot] = item.slots;
      const total = { ...skills };
      for (const [skill, level] of Object.entries(item.skills)) total[skill] = (total[skill] ?? 0) + level;
      await search(depth + 1, total, slots + item.slots, budget);
      if (recommendations.length >= limit || truncated) break;
    }
  }
  for (let budget = 0; budget <= remainingSlots[0]; budget++) {
    await search(0, base, 0, budget);
    if (recommendations.length >= limit || truncated) break;
  }
  return { recommendations, truncated, visited };
}
