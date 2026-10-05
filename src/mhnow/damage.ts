/**
 * 建議配裝的「傷害指數」：只算各配裝之間會不同的部分（動作值、肉質大家一樣，不列入）。
 *   物理 = (武器攻擊 + 鍊成的攻擊技能) × (1 + 攻擊%類) + 增攻類
 *   屬性 = (武器屬性 × 屬會 + 屬強) × (1 + 屬性%類)，只算火水雷冰龍；會心時才乘屬會
 *   傷害 = 期望值[(物理 + 屬性) × 會心倍率] × (1 + 傷害類)
 * 會心用期望值：會心率 = 武器會心率 + 會心率類技能；會心倍率預設 1.25（超會心提高）；負會心時傷害 × 0.75。
 * 同一類的百分比彼此相加。
 */

export type EffectKind = "flatAtk" | "atkPct" | "eleFlat" | "elePct" | "critEle" | "affinity" | "critMult" | "dmgPct";
type Effect = { kind: EffectKind; pattern: RegExp; sign?: -1 };
/**
 * condition：發動要看狀況（連擊、受傷…），使用者勾選才算；defaultOn 是預設勾選。
 * requires：要另一個技能 Lv5 以上才有效（境界類）；condition 跟著那個技能的勾選。
 * element：只對該屬性的武器有效。
 */
export type SkillEffect = { effects: Effect[]; condition?: string; defaultOn?: boolean; requires?: string; element?: string };

const ELEMENTS: Record<string, string> = { fire: "火", water: "水", thunder: "雷", ice: "冰", dragon: "龍" };
const DAMAGE = /傷害\s*(?:增加|\+)\s*(\d+)%/;
const dmg = (condition: string): SkillEffect => ({ effects: [{ kind: "dmgPct", pattern: DAMAGE }], condition });

export const SKILL_EFFECTS: Record<string, SkillEffect> = {
  "攻擊": { effects: [{ kind: "flatAtk", pattern: /攻擊力 \+(\d+)/ }] },
  "攻擊．境界": { effects: [{ kind: "flatAtk", pattern: /攻擊力\+(\d+)/ }], requires: "攻擊" },
  "蠻力": { effects: [{ kind: "flatAtk", pattern: /攻擊力\+(\d+)/ }, { kind: "affinity", pattern: /會心率-(\d+)%/, sign: -1 }] },
  "無傷": { effects: [{ kind: "flatAtk", pattern: /攻擊力 \+(\d+)/ }], condition: "體力全滿" },
  "勇猛": { effects: [{ kind: "flatAtk", pattern: /攻擊力\+(\d+)/ }], condition: "魔物咆哮時" },
  "攻擊活化": { effects: [{ kind: "atkPct", pattern: /攻擊力增加(\d+)%/ }] },
  "連擊": { effects: [{ kind: "atkPct", pattern: /攻擊力 \+(\d+)%/ }], condition: "連續攻擊 10 次後", defaultOn: true },
  "連擊．境界": { effects: [{ kind: "atkPct", pattern: /攻擊力增加(\d+)%/ }], requires: "連擊" },
  "攻擊守勢": { effects: [{ kind: "atkPct", pattern: /攻擊力 \+(\d+)%/ }], condition: "防禦成功後" },
  "火場怪力": { effects: [{ kind: "atkPct", pattern: /攻擊力 \+(\d+)%/ }], condition: "體力 29% 以下" },
  "不屈": { effects: [{ kind: "atkPct", pattern: /攻擊力 \+(\d+)%/ }], condition: "倒地復活後" },
  "怨恨": { effects: [{ kind: "atkPct", pattern: /上升(\d+)%/ }], condition: "受到傷害後" },
  "完美蓄力解放": { effects: [{ kind: "atkPct", pattern: /攻擊力\+(\d+)%/ }], condition: "時機正確的蓄力攻擊" },
  ...Object.fromEntries(Object.entries(ELEMENTS).flatMap(([element, name]) => [
    [`${name}屬性攻擊強化`, { effects: [{ kind: "eleFlat", pattern: /屬性 \+(\d+)/ }], element }],
    [`${name}屬性攻擊強化．境界`, { effects: [{ kind: "eleFlat", pattern: /攻擊力\+(\d+)/ }], element, requires: `${name}屬性攻擊強化` }],
  ])),
  "鋼龍的凍風": { effects: [{ kind: "elePct", pattern: /屬性攻擊力(\d+)%/ }], element: "ice" },
  "冰呪龍的冰纏": { effects: [{ kind: "elePct", pattern: /屬性攻擊力增加(\d+)%/ }], element: "ice" },
  "幻獸疾雷": { effects: [{ kind: "elePct", pattern: /屬性攻擊力增加(\d+)%/ }], element: "thunder" },
  "溟波龍的雷浪": { effects: [{ kind: "elePct", pattern: /增加(\d+)%水屬性/ }], element: "water" },
  "爵銀龍的紅血": { effects: [{ kind: "elePct", pattern: /增加(\d+)%龍屬性/ }], element: "dragon" },
  "屬性攻擊強化【SP】": { effects: [{ kind: "elePct", pattern: /增加(\d+)%/ }], condition: "SP 技能後 20 秒" },
  "會心擊【屬性】": { effects: [{ kind: "critEle", pattern: /增加(\d+)%/ }] },
  "看破": { effects: [{ kind: "affinity", pattern: /會心率 \+(\d+)%/ }] },
  "弱點特效": { effects: [{ kind: "affinity", pattern: /會心率 \+(\d+)%/ }], condition: "攻擊弱點", defaultOn: true },
  "力量解放": { effects: [{ kind: "affinity", pattern: /會心率\+(\d+)%/ }], condition: "戰鬥 48 秒後" },
  "凶會心": { effects: [{ kind: "affinity", pattern: /減少(\d+)%/, sign: -1 }] },
  "超會心": { effects: [{ kind: "critMult", pattern: /提升至(\d+)%/ }] },
  "滅盡龍的渴望": { effects: [{ kind: "dmgPct", pattern: DAMAGE }] },
  "果敢": { effects: [{ kind: "dmgPct", pattern: DAMAGE }] },
  "完美巧擊": dmg("完美迴避後"),
  "完美巧擊【持續】": { effects: [{ kind: "dmgPct", pattern: /傷害\+(\d+)%/ }], condition: "完美迴避後 15 秒" },
  "屹立不倒": dmg("10 秒未迴避"),
  "勇往直前": dmg("向前迴避後"),
  "鬥氣活性": dmg("SP 計量表全滿"),
  "心無雜念": dmg("SP 計量表未滿"),
  "真本領": dmg("施展 20 次動作後"),
  "奇襲": dmg("攻擊背後"),
  "追擊": { effects: [{ kind: "dmgPct", pattern: /傷害\+(\d+)%/ }], condition: "首次破壞部位後" },
  "轉禍為福": { effects: [{ kind: "dmgPct", pattern: /傷害\+(\d+)%/ }], condition: "解除異常後" },
  "死裡逃生": dmg("自身異常狀態時"),
  "累積狀態異常時威力UP": { effects: [{ kind: "dmgPct", pattern: /傷害\+(\d+)%/ }], condition: "魔物累積異常時" },
  "變形強化": dmg("變形／鬼人化後"),
};

/** 只降低傷害的技能：搜尋時越少越好。 */
export const HARMFUL_SKILLS = new Set(["凶會心"]);
/** 有加有減的技能（蠻力：攻擊力加、會心率減）：不能當成「越多越好」。 */
export const MIXED_SKILLS = new Set(["蠻力"]);

/** 每個技能每一級的數值，從技能說明讀出來（說明是 index 的 skillLevels）。讀不到的技能不列入。 */
export type EffectTable = Record<string, { kind: EffectKind; values: number[] }[]>;
export function effectTable(skillLevels: Record<string, string[]>): EffectTable {
  const table: EffectTable = {};
  for (const [skill, setup] of Object.entries(SKILL_EFFECTS)) {
    const descriptions = skillLevels[skill];
    if (!descriptions?.length) continue;
    const effects = setup.effects.map((effect) => ({
      kind: effect.kind,
      values: descriptions.map((text) => Number(effect.pattern.exec(text)?.[1]) * (effect.sign ?? 1)),
    }));
    if (effects.every((effect) => effect.values.every(Number.isFinite))) table[skill] = effects;
  }
  return table;
}

export type WeaponSetup = { atk: number; ele: number; element: string; crit: number };
/** 條件技能預設勾選的那些。 */
export const DEFAULT_CONDITIONS = Object.entries(SKILL_EFFECTS).filter(([, setup]) => setup.defaultOn).map(([skill]) => skill);

/** 這把武器下、目前勾選的條件下，真的會影響傷害的技能。 */
export function activeSkills(table: EffectTable, element: string, conditions: string[]) {
  const on = new Set(conditions);
  return Object.keys(table).filter((skill) => {
    const setup = SKILL_EFFECTS[skill];
    if (setup.element && setup.element !== element) return false;
    const gate = setup.requires && SKILL_EFFECTS[setup.requires]?.condition ? setup.requires : skill;
    return !SKILL_EFFECTS[gate].condition || on.has(gate);
  });
}

/**
 * 傷害指數。native：裝備（武器＋防具）提供的等級；drift：漂流鍊成提供的等級。
 * 鍊成的「攻擊」算在乘攻擊%之前（公式的漂流石攻擊），裝備的攻擊技能算增攻類。
 */
export function damageIndex(native: Record<string, number>, drift: Record<string, number>, weapon: WeaponSetup, table: EffectTable, active: Set<string>, caps: Record<string, number>) {
  const skills = [...active];
  return compileDamage(skills, weapon, table, caps)(skills.map((skill) => native[skill] ?? 0), skills.map((skill) => drift[skill] ?? 0));
}

const KINDS: EffectKind[] = ["flatAtk", "atkPct", "eleFlat", "elePct", "critEle", "affinity", "critMult", "dmgPct"];
/**
 * damageIndex 的快速版：技能順序先固定（skills），之後 native／drift 都用同順序的陣列傳入。
 * 搜尋時要算幾十萬次，所以先把技能的效果、等級上限、境界條件都轉成陣列。
 */
export function compileDamage(skills: string[], weapon: WeaponSetup, table: EffectTable, caps: Record<string, number>) {
  const effects = skills.map((skill) => table[skill].map((effect) => ({ kind: KINDS.indexOf(effect.kind), values: [0, ...effect.values] })));
  const limits = skills.map((skill) => Math.min(caps[skill] ?? Infinity, table[skill][0].values.length));
  const requires = skills.map((skill) => SKILL_EFFECTS[skill].requires ? skills.indexOf(SKILL_EFFECTS[skill].requires!) : -1);
  const attack = skills.indexOf("攻擊");
  const elemental = !!ELEMENTS[weapon.element] && weapon.ele > 0;
  const sums = new Float64Array(KINDS.length);
  return (native: ArrayLike<number>, drift: ArrayLike<number>) => {
    sums.fill(0);
    let driftAtk = 0;
    for (let index = 0; index < skills.length; index++) {
      const at = Math.min(limits[index], native[index] + drift[index]);
      if (!at) continue;
      const gate = requires[index];
      if (gate >= 0 && Math.min(limits[gate], native[gate] + drift[gate]) < 5) continue;
      for (const { kind, values } of effects[index]) {
        if (index === attack) {
          const fromGear = values[Math.min(at, native[index])];
          sums[0] += fromGear;
          driftAtk += values[at] - fromGear;
        } else if (kind === 6) sums[6] = Math.max(sums[6], values[at]);
        else sums[kind] += values[at];
      }
    }
    const raw = (weapon.atk + driftAtk) * (1 + sums[1] / 100) + sums[0];
    const elePct = 1 + sums[3] / 100;
    const normal = raw + (elemental ? (weapon.ele + sums[2]) * elePct : 0);
    const critical = (raw + (elemental ? (weapon.ele * (1 + sums[4] / 100) + sums[2]) * elePct : 0)) * (sums[6] ? sums[6] / 100 : 1.25);
    const affinity = Math.max(-1, Math.min(1, (weapon.crit + sums[5]) / 100));
    const expected = affinity >= 0 ? affinity * critical + (1 - affinity) * normal : normal * (1 + affinity * 0.25);
    return expected * (1 + sums[7] / 100);
  };
}
