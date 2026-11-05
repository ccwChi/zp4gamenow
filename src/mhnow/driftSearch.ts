/** 漂流石查詢頁的技能搜尋：輸入技能的一部分（字可以不連續），列出哪些石頭練得出來。 */
export type DriftSearchData = {
  colors: { key: string; label: string; skills: { name: string; rare: boolean; chance: number }[]; commonChance: number }[];
  common: string[];
  events: { key: string; label: string; skills: string[]; rare?: string[] }[];
};
/** tab：這顆石頭在查詢頁的分頁；chance 是粗估機率，神秘沒有機率資料。 */
export type DriftStone = { key: string; tab: string; label: string; rare: boolean; chance?: number };
export type DriftSkillHit = { name: string; stones: DriftStone[] };

const normalize = (text: string) => text.toLowerCase().replace(/・/g, "．").replace(/[\s【】\[\]（）()]/g, "");

/** 0＝完全相同、1＝連續包含、2＝字依序出現但不連續；對不上是 undefined。 */
function matchRank(name: string, query: string) {
  if (name === query) return 0;
  if (name.includes(query)) return 1;
  let from = 0;
  for (const char of query) {
    const found = name.indexOf(char, from);
    if (found < 0) return undefined;
    from = found + char.length;
  }
  return 2;
}

/**
 * 選技能時可填入的顏色（DriftPick.color）：共通技能算一個「共通」，神秘不分組算一個「神秘」，六色各自一個。
 * 稀有的標記留給畫面顯示。
 */
export function driftPickOptions(data: DriftSearchData, hit: DriftSkillHit) {
  const options: { color: string; label: string; rare: boolean }[] = [];
  if (data.common.includes(hit.name)) options.push({ color: "common", label: "共通", rare: false });
  for (const stone of hit.stones) {
    if (stone.tab === "event") {
      if (!options.some((option) => option.color === "event")) options.push({ color: "event", label: "神秘", rare: stone.rare });
    } else if (data.colors.find((color) => color.key === stone.key)?.skills.some((skill) => skill.name === hit.name)) {
      options.push({ color: stone.key, label: stone.label, rare: stone.rare });
    }
  }
  return options;
}

export function searchDriftSkills(data: DriftSearchData, input: string): DriftSkillHit[] {
  const terms = input.split(/[\s,，、]+/).map(normalize).filter(Boolean);
  if (!terms.length) return [];
  const stones = new Map<string, DriftStone[]>();
  const add = (name: string, stone: DriftStone) => stones.set(name, [...(stones.get(name) ?? []), stone]);
  for (const color of data.colors) {
    for (const skill of color.skills) add(skill.name, { key: color.key, tab: color.key, label: color.label, rare: skill.rare, chance: skill.chance });
    // 共通技能每種顏色都能出，機率依顏色不同，所以逐色列出。
    for (const name of data.common) add(name, { key: color.key, tab: color.key, label: color.label, rare: false, chance: color.commonChance });
  }
  for (const group of data.events) {
    for (const name of group.skills) add(name, { key: group.key, tab: "event", label: group.label, rare: !!group.rare && group.rare.length < group.skills.length && group.rare.includes(name) });
  }
  return [...stones].flatMap(([name, list]) => {
    const target = normalize(name);
    const ranks = terms.map((term) => matchRank(target, term));
    if (ranks.includes(undefined)) return [];
    return [{ name, stones: list, rank: Math.max(...(ranks as number[])) }];
  }).sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name, "zh-Hant"))
    .map(({ name, stones: list }) => ({ name, stones: list }));
}
