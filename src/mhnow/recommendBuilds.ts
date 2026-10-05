import type { Build, DriftPick } from "./buildStore";
import { activeSkills, compileDamage, effectTable, HARMFUL_SKILLS, MIXED_SKILLS, type WeaponSetup } from "./damage";
import { skillsAtGrade, type SeriesSkill } from "./skills";

export const RECOMMEND_SLOTS = ["helm", "mail", "gloves", "belt", "greaves"] as const;
type Slot = typeof RECOMMEND_SLOTS[number];
export type RecommendSeries = {
  key: string; name: string; hasArmor: boolean; weaponTypes: string[]; unlock?: number;
  skills: Record<string, SeriesSkill[]>; weaponSkills?: Record<string, SeriesSkill[]>;
  slots?: Partial<Record<Slot, number[]>>;
  /** 武器數值：weaponStats[屬性] 是每階 -5 的攻擊／屬性／會心率；weaponEff 是屬性跟 weaponElement 不同的武器種類。 */
  weaponElement?: string; weaponEff?: Record<string, string>;
  weaponStats?: Record<string, { atk: number[]; ele?: number[]; crit?: number[] }>;
};
export type RecommendDrifts = {
  colors: { key: string; skills: { name: string; rare?: boolean }[] }[];
  common: string[]; events: { skills: string[] }[];
};
/**
 * stoneCount：要鍊成的漂流石數；rareStones：其中稀有（或只出現在神秘漂流石）的數量。
 * freeSlots：補完技能後還空著的洞；bonus：加分技能達到的等級總和；overflow：要求技能超過上限而浪費的等級。
 * damage：最大傷害模式的傷害指數（其他模式為 0）。alternatives：各部位可直接替換、不影響以上數值的其他系列。
 */
export type Recommendation = {
  build: Build; skills: Record<string, number>; stoneCount: number; rareStones: number;
  freeSlots: number; bonus: number; overflow: number; damage: number; alternatives: Partial<Record<Slot, string[]>>;
};
export type RecommendationResult = { recommendations: Recommendation[]; visited: number };
export type RecommendOptions = {
  weapon: string; required: Record<string, number>; grade: number; includeDrifts: boolean;
  driftOnly?: string[];
  /** 非必備、只用來排序的技能。 */
  bonus?: string[];
  /** 各技能的等級上限；沒給就視為沒有上限。 */
  maxLevels?: Record<string, number>;
  /** 有給就是最大傷害模式：空洞自動鍊成最能提高傷害的技能，排序改成傷害高 → 鍊成少。conditions 是勾選會發動的條件技能。 */
  damage?: { skillLevels: Record<string, string[]>; conditions: string[] };
  limit?: number; signal?: AbortSignal;
};

/** 武器在指定階級（取 -5）的攻擊、屬性、會心率。 */
export function weaponSetup(item: RecommendSeries, weaponType: string, grade: number): WeaponSetup | undefined {
  const element = item.weaponEff?.[weaponType] ?? item.weaponElement ?? "white";
  const stats = item.weaponStats?.[element];
  if (!stats) return undefined;
  return { element, atk: stats.atk[grade - 1] ?? 0, ele: stats.ele?.[grade - 1] ?? 0, crit: stats.crit?.[grade - 1] ?? 0 };
}

/** 某系列某部位在指定階級的技能（不含樣式專屬技能）。 */
export function pieceSkills(item: RecommendSeries | undefined, slot: Slot, grade: number) {
  return skillsAt(item?.skills[slot] ?? [], grade);
}

function skillsAt(entries: SeriesSkill[], grade: number) {
  // Style-specific skills require a style selection, which this search does not yet offer.
  return skillsAtGrade(entries.filter((entry) => entry.style === undefined), grade);
}

/**
 * 把方案某部位換成它的替代品。替代品的要求技能、加分技能與洞數都跟原本相同，
 * 所以漂流石與排序數值不變，只重算技能總和與浪費等級。
 */
export function swapPiece(recommendation: Recommendation, slot: Slot, key: string, series: RecommendSeries[], options: Pick<RecommendOptions, "grade" | "required" | "maxLevels">): Recommendation {
  const current = recommendation.build.gear[slot];
  const others = recommendation.alternatives[slot] ?? [];
  if (key === current || !others.includes(key)) return recommendation;
  const skills = { ...recommendation.skills };
  for (const [skill, level] of Object.entries(pieceSkills(series.find((item) => item.key === current), slot, options.grade))) {
    skills[skill] -= level;
    if (!skills[skill]) delete skills[skill];
  }
  for (const [skill, level] of Object.entries(pieceSkills(series.find((item) => item.key === key), slot, options.grade))) skills[skill] = (skills[skill] ?? 0) + level;
  // skills 已含漂流石，超過上限的部分就是浪費。
  const overflow = Object.keys(options.required).reduce((sum, skill) => sum + Math.max(0, (skills[skill] ?? 0) - (options.maxLevels?.[skill] ?? Infinity)), 0);
  return {
    ...recommendation, skills, overflow,
    alternatives: { ...recommendation.alternatives, [slot]: [current, ...others.filter((other) => other !== key)].sort((a, b) => a.localeCompare(b)) },
    build: { ...recommendation.build, gear: { ...recommendation.build.gear, [slot]: key } },
  };
}

/** vector：要越多越好的數值；trade：可以用洞鍊成取代的傷害技能等級（每級最多抵一個洞）。 */
type Choice = { key: string; skills: Record<string, number>; slots: number; vector: number[]; trade: number[]; alternatives: string[] };
type Score = Pick<Recommendation, "stoneCount" | "rareStones" | "bonus" | "freeSlots" | "overflow" | "damage">;
/** 傷害指數差這麼少就當作一樣，免得浮點誤差影響排序。 */
const EPSILON = 1e-6;
/** 最大傷害模式每一層最多留幾個狀態。 */
const BEAM = 2000;

/** 越前面越好：（最大傷害模式先比傷害高）→ 漂流石少 → 稀有石少 → 加分技能高 → 空洞多 → 浪費少。 */
function compare(a: Score, b: Score) {
  const damage = b.damage - a.damage;
  return (Math.abs(damage) > EPSILON ? damage : 0) || a.stoneCount - b.stoneCount || a.rareStones - b.rareStones || b.bonus - a.bonus || b.freeSlots - a.freeSlots || a.overflow - b.overflow;
}

/**
 * 每個部位先依「要求技能（只算到要求等級）、加分技能（只算到上限）、可用洞數」分組：
 * 數值完全相同的系列合併成一個選項（其餘列為替代品），被其他選項全面勝過的直接排除。
 * 剪完通常每部位只剩個位數選項，再以分支界限法完整搜尋，結果是依排序條件的前幾名，而不是先找到的幾組。
 */
export async function recommendBuilds(series: RecommendSeries[], stones: RecommendDrifts, options: RecommendOptions): Promise<RecommendationResult> {
  const { weapon, grade, includeDrifts, signal } = options;
  const [weaponKey, weaponType] = weapon.split("::");
  const selected = series.find((item) => item.key === weaponKey && item.weaponTypes.includes(weaponType));
  if (!selected) throw new Error("請先選擇有效的武器。");
  if (!Number.isInteger(grade) || grade < 1 || grade > 10) throw new Error("裝備階級必須介於 1 至 10。");
  if ((selected.unlock ?? 1) > grade) throw new Error("所選階級低於武器的生產階級。");
  const targets = Object.entries(options.required);
  if ((!targets.length && !options.damage) || targets.some(([, level]) => !Number.isInteger(level) || level < 1)) throw new Error("請至少設定一個技能與有效等級。");
  const driftOnly = new Set((options.driftOnly ?? []).filter((skill) => options.required[skill] !== undefined));
  const bonusSkills = [...new Set(options.bonus ?? [])].filter((skill) => options.required[skill] === undefined);
  const cap = (skill: string) => options.maxLevels?.[skill] ?? Infinity;
  const limit = Math.max(1, Math.min(10, options.limit ?? 10));
  // 後面的改良會把部分結果合併成同一套，所以先多留一些候選。
  // 最大傷害模式幾乎不會合併，留少一點候選，剪枝門檻才高。
  const pool = limit * 3;

  // 同一技能可能出現在好幾種顏色，優先用非稀有的來源。
  const driftPool = new Map<string, { pick: DriftPick; rare: boolean }>();
  if (includeDrifts) {
    const offer = (skill: string, color: string, rare: boolean) => {
      const known = driftPool.get(skill);
      if (!known || (known.rare && !rare)) driftPool.set(skill, { pick: { skill, color }, rare });
    };
    for (const color of stones.colors) for (const skill of color.skills) offer(skill.name, color.key, skill.rare ?? false);
    for (const skill of stones.common) offer(skill, "common", false);
    for (const event of stones.events) for (const skill of event.skills) offer(skill, "event", true);
  }
  for (const skill of driftOnly) {
    if (!includeDrifts) throw new Error("已指定技能全靠漂流鍊成，請開啟允許漂流石。");
    if (!driftPool.has(skill)) throw new Error(`目前漂流石資料沒有「${skill}」，無法指定全靠漂流鍊成。`);
  }

  const base = skillsAt(selected.weaponSkills?.[weaponType] ?? selected.skills.weapon ?? [], grade);

  // 最大傷害模式：會影響傷害的技能（依武器屬性與勾選的條件），以及其中可以鍊成的。
  const setup = options.damage ? weaponSetup(selected, weaponType, grade) : undefined;
  if (options.damage && !setup) throw new Error("這把武器沒有數值資料，無法計算傷害。");
  const table = options.damage ? effectTable(options.damage.skillLevels) : {};
  const damageSkills = setup ? activeSkills(table, setup.element, options.damage!.conditions) : [];
  const caps = Object.fromEntries(damageSkills.map((skill) => [skill, Math.min(cap(skill), table[skill][0].values.length)]));
  const driftable = damageSkills.filter((skill) => driftPool.has(skill) && !HARMFUL_SKILLS.has(skill));
  // 傷害計算一律用 damageSkills 順序的陣列（搜尋時要算幾十萬次）。
  const damageAt = setup ? compileDamage(damageSkills, setup, table, caps) : () => 0;
  const levelsOf = (skills: Record<string, number>) => damageSkills.map((skill) => skills[skill] ?? 0);
  const driftIndexes = driftable.map((skill) => damageSkills.indexOf(skill));
  const limits = damageSkills.map((skill) => caps[skill]);
  /**
   * 必備技能補完後（required：各傷害技能已經要鍊的顆數），剩下的洞拿去鍊成「平均每顆提高最多傷害」的技能；
   * 一次可以連鍊好幾級，才跨得過攻擊 Lv5、境界這類門檻。回傳各傷害技能鍊幾顆與傷害指數。
   */
  function fillDrifts(native: number[], required: number[], free: number) {
    const drift = [...required];
    let current = damageAt(native, drift);
    while (free > 0) {
      let best = -1, bestCount = 0, bestGain = EPSILON;
      for (const index of driftIndexes) {
        const room = Math.min(free, limits[index] - native[index] - drift[index]);
        const before = drift[index];
        for (let count = 1; count <= room; count++) {
          drift[index] = before + count;
          const gain = (damageAt(native, drift) - current) / count;
          if (gain > bestGain + EPSILON) { best = index; bestCount = count; bestGain = gain; }
        }
        drift[index] = before;
      }
      if (best < 0) break;
      drift[best] += bestCount;
      current += bestGain * bestCount;
      free -= bestCount;
    }
    return { drift, damage: current };
  }
  // 原生等級有意義的要求技能（全靠漂流的不算原生）。
  const native = targets.filter(([skill]) => !driftOnly.has(skill));
  // 可鍊成的傷害技能：裝備上的一級最多只值一個洞（洞也能鍊同一個技能；攻擊用鍊成的加成還更大）。
  const tradable = driftable.filter((skill) => !MIXED_SKILLS.has(skill));
  const strictDamage = damageSkills.filter((skill) => !tradable.includes(skill));
  const pools = RECOMMEND_SLOTS.map((slot) => {
    const groups = new Map<string, Choice[]>();
    for (const item of series) {
      if (!item.hasArmor || (item.unlock ?? 1) > grade || (item.skills[slot] === undefined && item.slots?.[slot] === undefined)) continue;
      const skills = skillsAt(item.skills[slot] ?? [], grade);
      const slots = includeDrifts ? (item.slots?.[slot] ?? []).filter((unlock) => unlock <= grade).length : 0;
      const vector = [
        ...native.map(([skill, level]) => Math.min(level, skills[skill] ?? 0)),
        ...bonusSkills.map((skill) => Math.min(cap(skill), skills[skill] ?? 0)),
        // 只會降低傷害的技能越少越好，所以取負值；有加有減的同時放正負值，等級要一樣才比得出勝負。
        ...strictDamage.flatMap((skill) => HARMFUL_SKILLS.has(skill) ? [-(skills[skill] ?? 0)] : MIXED_SKILLS.has(skill) ? [skills[skill] ?? 0, -(skills[skill] ?? 0)] : [Math.min(caps[skill], skills[skill] ?? 0)]),
      ];
      const trade = tradable.map((skill) => Math.min(caps[skill], skills[skill] ?? 0));
      const id = [...vector, ...trade, slots].join(",");
      groups.set(id, [...(groups.get(id) ?? []), { key: item.key, skills, slots, vector, trade, alternatives: [] }]);
    }
    // 同組裡要求技能原生等級最低的當代表（浪費最少），其餘當替代品。
    const overshoot = (choice: Choice) => native.reduce((sum, [skill]) => sum + (choice.skills[skill] ?? 0), 0);
    const choices = [...groups.values()].map((members) => {
      members.sort((a, b) => overshoot(a) - overshoot(b) || a.key.localeCompare(b.key));
      return { ...members[0], alternatives: members.slice(1).map((member) => member.key) };
    });
    // b 不比 a 差：每個數值都不少，而且多出來的洞補得回 a 多的可鍊成技能。兩個互相不比對方差時留 key 小的。
    const covers = (b: Choice, a: Choice) => b.vector.every((value, index) => value >= a.vector[index])
      && b.slots - a.slots >= a.trade.reduce((sum, value, index) => sum + Math.max(0, value - b.trade[index]), 0);
    const dominated = (a: Choice) => choices.some((b) => b !== a && covers(b, a) && (!covers(a, b) || b.key < a.key));
    const items = choices.filter((choice) => !dominated(choice));
    // 先試看起來最好的選項，分支界限才能早點剪掉差的。
    const relevance = (choice: Choice) => native.reduce((sum, _, index) => sum + choice.vector[index], 0);
    const zero = damageSkills.map(() => 0);
    const gain = new Map(items.map((choice) => [choice, damageAt(levelsOf(choice.skills), zero)]));
    items.sort((a, b) => relevance(b) - relevance(a) || gain.get(b)! - gain.get(a)! || b.slots - a.slots || a.key.localeCompare(b.key));
    return { slot, items, all: choices };
  });
  // Most constrained parts first improves pruning without discarding any candidates.
  pools.sort((a, b) => a.items.length - b.items.length);

  // remaining[depth][i]：第 depth 個部位以後，要求技能 i 最多還能加幾級；remainingSlots 同理。
  const remaining = Array.from({ length: 6 }, () => targets.map(() => 0));
  const remainingSlots = Array(6).fill(0) as number[];
  for (let depth = 4; depth >= 0; depth--) {
    remainingSlots[depth] = remainingSlots[depth + 1] + Math.max(0, ...pools[depth].items.map((item) => item.slots));
    targets.forEach(([skill], index) => {
      remaining[depth][index] = remaining[depth + 1][index] + Math.max(0, ...pools[depth].items.map((item) => item.skills[skill] ?? 0));
    });
  }

  const scoreOf = (skills: Record<string, number>, slots: number, stoneCount: number, rareStones: number, damage = 0): Score => ({
    stoneCount, rareStones, freeSlots: slots - stoneCount, damage,
    bonus: bonusSkills.reduce((sum, skill) => sum + Math.min(cap(skill), skills[skill] ?? 0), 0),
    overflow: targets.reduce((sum, [skill, level]) => sum + Math.max(0, (skills[skill] ?? 0) + (driftOnly.has(skill) ? level : 0) - cap(skill)), 0),
  });
  /** 要鍊成的技能（技能 → 顆數）：必備的缺額，再加上最大傷害模式自動鍊成的。 */
  function driftsFor(skills: Record<string, number>, required: Record<string, number>, free: number) {
    if (!setup) return { drift: required, damage: 0 };
    const filled = fillDrifts(levelsOf(skills), damageSkills.map((skill) => required[skill] ?? 0), free);
    const drift = { ...required };
    damageSkills.forEach((skill, index) => { if (filled.drift[index]) drift[skill] = filled.drift[index]; });
    return { drift, damage: filled.damage };
  }
  /** 一整套的分數與要鍊成的技能（技能 → 顆數）；不成立就回傳 null。 */
  function evaluateSkills(skills: Record<string, number>, slots: number): { score: Score; drift: Record<string, number> } | null {
    const required: Record<string, number> = {};
    let needed = 0;
    for (const [skill, level] of targets) {
      const deficit = driftOnly.has(skill) ? level : Math.max(0, level - (skills[skill] ?? 0));
      if (!deficit) continue;
      if (!driftPool.has(skill)) return null;
      required[skill] = deficit;
      needed += deficit;
    }
    if (needed > slots) return null;
    const { drift, damage } = driftsFor(skills, required, slots - needed);
    const counts = Object.entries(drift);
    const stoneCount = counts.reduce((sum, [, count]) => sum + count, 0);
    const rare = counts.reduce((sum, [skill, count]) => sum + (driftPool.get(skill)!.rare ? count : 0), 0);
    return { score: scoreOf(skills, slots, stoneCount, rare, damage), drift };
  }
  /** 一整套（依 pools 順序的五個選項）。 */
  function evaluate(picks: Choice[]) {
    const skills = { ...base };
    let slots = 0;
    for (const pick of picks) {
      slots += pick.slots;
      for (const [skill, level] of Object.entries(pick.skills)) skills[skill] = (skills[skill] ?? 0) + level;
    }
    return evaluateSkills(skills, slots);
  }
  /**
   * 最大傷害模式的估計值（beam search 排序用）：用目前的裝備技能，加上之後部位最多的洞，全部照實際規則鍊成。
   * 不算之後部位帶來的技能，所以是估計，不是上限。
   */
  function estimate(depth: number, skills: Record<string, number>, slots: number) {
    const required: Record<string, number> = {};
    let free = slots + remainingSlots[depth];
    for (const [index, [skill, level]] of targets.entries()) {
      const deficit = driftOnly.has(skill) ? level : Math.max(0, level - (skills[skill] ?? 0) - remaining[depth][index]);
      required[skill] = deficit;
      free -= deficit;
    }
    return fillDrifts(levelsOf(skills), damageSkills.map((skill) => required[skill] ?? 0), Math.max(0, free)).damage;
  }
  /** 剩下的部位與洞數還補得到所有必備技能嗎（樂觀估計）。 */
  function feasible(depth: number, skills: Record<string, number>, slots: number) {
    let needed = 0;
    for (let index = 0; index < targets.length; index++) {
      const [skill, level] = targets[index];
      const deficit = driftOnly.has(skill) ? level : Math.max(0, level - (skills[skill] ?? 0) - remaining[depth][index]);
      if (deficit && !driftPool.has(skill)) return false;
      needed += deficit;
    }
    return needed <= slots + remainingSlots[depth];
  }
  /** 排序只看這些：要求技能（到要求等級）、加分與傷害技能（到上限）、洞數。一樣的部分組合可以合併。 */
  const stateKey = (skills: Record<string, number>, slots: number) => [
    ...native.map(([skill, level]) => Math.min(level, skills[skill] ?? 0)),
    ...bonusSkills.map((skill) => Math.min(cap(skill), skills[skill] ?? 0)),
    ...damageSkills.map((skill) => Math.min(caps[skill], skills[skill] ?? 0)),
    slots,
  ].join(",");

  // 一個部位一個部位加上去；每一步把「排序相關數值一樣」的部分組合合併成一個狀態，
  // 狀態數只有幾千個，全部算完就是精確的前幾名。每個狀態最多留 limit 種裝備組合當結果用。
  type Combo = { item: Choice; prev?: Combo };
  type State = { skills: Record<string, number>; slots: number; combos: (Combo | undefined)[] };
  /**
   * 最大傷害模式：其他數值都一樣的狀態之間，若 b 多出來的洞補得回 a 多的可鍊成技能，a 往後怎麼配都不會贏 b，直接丟掉。
   * （之後加上同一件裝備，這個關係仍然成立。）
   */
  function pruneStates(states: Map<string, State>) {
    const groups = new Map<string, { key: string; state: State; trade: number[] }[]>();
    for (const [key, state] of states) {
      const strict = [
        ...native.map(([skill, level]) => Math.min(level, state.skills[skill] ?? 0)),
        ...bonusSkills.map((skill) => Math.min(cap(skill), state.skills[skill] ?? 0)),
        ...strictDamage.map((skill) => Math.min(caps[skill], state.skills[skill] ?? 0)),
      ].join(",");
      const trade = tradable.map((skill) => Math.min(caps[skill], state.skills[skill] ?? 0));
      groups.set(strict, [...(groups.get(strict) ?? []), { key, state, trade }]);
    }
    const kept = new Map<string, State>();
    for (const members of groups.values()) {
      // 洞多的先放，後面的只要跟已留下的比。
      members.sort((a, b) => b.state.slots - a.state.slots || a.key.localeCompare(b.key));
      const survivors: typeof members = [];
      for (const a of members) {
        const beaten = survivors.some((b) => b.state.slots - a.state.slots >= a.trade.reduce((sum, value, index) => sum + Math.max(0, value - b.trade[index]), 0));
        if (!beaten) survivors.push(a);
      }
      for (const { key, state } of survivors) kept.set(key, state);
    }
    return kept;
  }
  let layer = new Map<string, State>([["", { skills: { ...base }, slots: 0, combos: [undefined] }]]);
  let visited = 0;
  for (let depth = 0; depth < 5; depth++) {
    if (signal?.aborted) throw new DOMException("搜尋已取消", "AbortError");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const next = new Map<string, State>();
    for (const state of layer.values()) {
      for (const item of pools[depth].items) {
        const skills = { ...state.skills };
        for (const [skill, level] of Object.entries(item.skills)) skills[skill] = (skills[skill] ?? 0) + level;
        const slots = state.slots + item.slots;
        if (!feasible(depth + 1, skills, slots)) continue;
        const key = stateKey(skills, slots);
        let target = next.get(key);
        if (!target) next.set(key, target = { skills, slots, combos: [] });
        for (const prev of state.combos) {
          if (target.combos.length >= limit) break;
          target.combos.push({ item, prev });
        }
      }
    }
    layer = tradable.length ? pruneStates(next) : next;
    visited += next.size;
    // 最大傷害模式的狀態會多到幾十萬個；最後一層以外只留估計值最高的 BEAM 個。
    if (setup && depth < 4 && layer.size > BEAM) {
      const ranked = [...layer].map(([key, state]) => ({ key, state, value: estimate(depth + 1, state.skills, state.slots) }))
        .sort((a, b) => b.value - a.value).slice(0, BEAM);
      layer = new Map(ranked.map(({ key, state }) => [key, state]));
    }
  }
  if (signal?.aborted) throw new DOMException("搜尋已取消", "AbortError");
  const picksOf = (combo: Combo | undefined) => {
    const picks: Choice[] = [];
    for (let node = combo; node; node = node.prev) picks.unshift(node.item);
    return picks;
  };
  const scored: { score: Score; drift: Record<string, number>; combos: (Combo | undefined)[] }[] = [];
  for (const state of layer.values()) {
    const result = evaluateSkills(state.skills, state.slots);
    if (!result) continue;
    // 只留前 pool 名（插入到排序位置），不用每次整串重排。
    if (scored.length >= pool && compare(result.score, scored[pool - 1].score) >= 0) continue;
    const at = scored.findIndex((entry) => compare(result.score, entry.score) < 0);
    scored.splice(at < 0 ? scored.length : at, 0, { ...result, combos: state.combos });
    if (scored.length > pool) scored.pop();
  }
  scored.sort((a, b) => compare(a.score, b.score));
  const best: { score: Score; picks: Choice[]; drift: Record<string, number> }[] = [];
  for (const { score, drift, combos } of scored) {
    for (const combo of combos) if (best.length < pool) best.push({ score, drift, picks: picksOf(combo) });
    if (best.length >= pool) break;
  }

  // 剪枝對前四項排序條件是精確的，但只看「夠不夠」，可能疊出超過上限的等級（例如五件都帶攻擊）。
  // 逐部位改成前四項不變、浪費更少的選項（含被剪掉的），直到不能再少為止。
  const sameRank = (a: Score, b: Score) => Math.abs(a.damage - b.damage) <= EPSILON && a.stoneCount === b.stoneCount && a.rareStones === b.rareStones && a.bonus === b.bonus && a.freeSlots === b.freeSlots;
  for (const entry of best) {
    for (let improved = true; improved;) {
      improved = false;
      for (let depth = 0; depth < 5; depth++) {
        for (const choice of pools[depth].all) {
          if (choice === entry.picks[depth]) continue;
          const picks = entry.picks.map((pick, index) => index === depth ? choice : pick);
          const result = evaluate(picks);
          if (result && sameRank(result.score, entry.score) && result.score.overflow < entry.score.overflow) { Object.assign(entry, result, { picks }); improved = true; }
        }
      }
    }
  }
  const unique = new Map(best.map((entry) => [entry.picks.map((pick) => pick.key).join("|"), entry]));
  const ranked = [...unique.values()].sort((a, b) => compare(a.score, b.score)).slice(0, limit);

  const recommendations = ranked.map(({ score, picks, drift }, position): Recommendation => {
    const bySlot = Object.fromEntries(pools.map((pool, depth) => [pool.slot, picks[depth]])) as Record<Slot, Choice>;
    const skills = { ...base };
    for (const pick of picks) for (const [skill, level] of Object.entries(pick.skills)) skills[skill] = (skills[skill] ?? 0) + level;
    const stonesNeeded = Object.entries(drift).flatMap(([skill, count]) => Array.from({ length: count }, () => ({ ...driftPool.get(skill)!.pick })));
    const drifts: Build["drifts"] = {};
    let offset = 0;
    for (const slot of RECOMMEND_SLOTS) {
      drifts[slot] = stonesNeeded.slice(offset, offset + bySlot[slot].slots);
      offset += drifts[slot].length;
    }
    for (const pick of stonesNeeded) skills[pick.skill] = (skills[pick.skill] ?? 0) + 1;
    const gear: Record<string, string> = { weapon };
    const alternatives: Recommendation["alternatives"] = {};
    for (const slot of RECOMMEND_SLOTS) {
      gear[slot] = bySlot[slot].key;
      if (bySlot[slot].alternatives.length) alternatives[slot] = bySlot[slot].alternatives;
    }
    return {
      ...score, skills, alternatives,
      build: { id: `recommend-${position}`, name: `建議配裝 ${position + 1}`, gear, drifts, pieces: {}, showMissing: false },
    };
  });
  return { recommendations, visited };
}
