/**
 * 技能分類：所有選技能的地方都依這個分類與順序顯示（攻擊 → 屬性 → 動作 → 防禦/耐性 → 其他）。
 * 分類內照下面列的順序；資料裡有、但這裡沒列到的新技能放進「其他」，依名稱排在最後。
 */
export const SKILL_CATEGORIES: { key: string; label: string; skills: string[] }[] = [
  { key: "attack", label: "攻擊", skills: [
    "攻擊", "攻擊．境界", "無傷", "鬼火纏身", "愈戰愈勇", "連擊", "連擊．境界", "火場怪力", "攻擊守勢", "不屈",
    "怨恨", "完美蓄力解放", "勇猛", "團體狩獵強化【攻擊】", "蠻力", "攻擊活化", "攻擊增強【會心】", "果敢", "奇襲", "輕巧",
    "追擊", "劫血纏身", "死裡逃生", "轉禍為福", "完美巧擊", "完美巧擊【持續】", "鬥氣活性", "心無雜念", "真本領", "SP技能威力提升",
    "SP技能威力UP．境界", "覺醒一擊", "追擊【毒】", "追擊【麻痺】", "追擊【爆破】", "累積狀態異常時威力UP", "滅盡龍的渴望", "砲術", "砲術．境界", "變形強化",
    "變形攻擊強化", "最後一擊", "通常彈．屬性通常彈強化", "斬裂彈．屬性斬裂彈強化", "蓄攻、響音強化", "屹立不倒", "勇往直前", "適中距離威力UP", "反彈", "以牙還牙",
    "看破", "弱點特效", "堅忍不拔", "超會心", "凶會心", "力量解放", "破壞王", "破壞王【SP技能】", "破壞王【尾巴】", "KO術",
    "雙重打擊",
  ] },
  { key: "element", label: "屬性", skills: [
    "火屬性攻擊強化", "水屬性攻擊強化", "雷屬性攻擊強化", "冰屬性攻擊強化", "龍屬性攻擊強化",
    "水屬性攻擊強化．境界", "雷屬性攻擊強化．境界", "冰屬性攻擊強化．境界", "龍屬性攻擊強化．境界",
    "高能強化【火】", "高能強化【水】", "高速蓄力【雷】", "高能強化【冰】", "高能強化【龍】",
    "蓄力大師", "會心擊【屬性】", "鋼龍的凍風", "幻獸疾雷", "溟波龍的雷浪", "爵銀龍的紅血", "冰呪龍的冰纏",
    "毒屬性強化", "麻痺屬性強化", "睡眠攻擊強化", "爆破屬性強化", "奇襲【狀態異常】", "完美巧擊【狀態異常】",
    "炎王龍的爆塵", "霞龍的毒霧", "屬性攻擊強化【SP】",
  ] },
  { key: "action", label: "動作", skills: [
    "集中", "行雲流水", "裝填速度", "後座力減輕", "軀幹強化", "迴避距離UP", "完美迴避強化", "絕對迴避【SP】", "泡沫之舞", "強化持續",
    "裝填防禦", "迴避裝填", "彈道強化", "彈藥節約", "SP計量表加速", "SP計量表加速【完美迴避】", "SP計量表加速【防禦】", "SP計量表加速【借力使力】", "鎖定", "跳躍鐵人",
    "蓄力儲備",
  ] },
  { key: "defense", label: "防禦/耐性", skills: [
    "防禦", "背水防禦", "團體狩獵強化【防禦】", "體力增強", "精靈加護", "防禦準備", "毅力", "防禦性能", "防禦強化", "SP計量表保險",
    "耳塞", "耐震", "風壓耐性", "火耐性", "水耐性", "雷耐性", "冰耐性", "龍耐性", "毒耐性", "麻痺耐性", "睡眠耐性",
    "裂傷耐性", "爆破異常耐性",
  ] },
  { key: "other", label: "其他", skills: ["獵人集結", "團結力", "團結力【歲末狩獵年冬日祭】"] },
];

/** 資料裡「境界」前的點是全形句點「．」，也有人打成「・」，比對時當成同一個。 */
const normalize = (name: string) => name.replace(/・/g, "．");
const ORDER = new Map(SKILL_CATEGORIES.flatMap((category, group) => category.skills.map((skill, position) => [normalize(skill), { group, position }] as const)));
const OTHER = SKILL_CATEGORIES.length - 1;
const placeOf = (name: string) => ORDER.get(normalize(name));

/** 把一串技能名稱依分類分組（只回傳有技能的分類），分類內依上面的順序；沒列到的放「其他」最後。 */
export function groupSkills(names: Iterable<string>): { key: string; label: string; skills: string[] }[] {
  const groups = SKILL_CATEGORIES.map((category) => ({ key: category.key, label: category.label, skills: [] as string[] }));
  for (const name of new Set(names)) groups[placeOf(name)?.group ?? OTHER].skills.push(name);
  for (const group of groups) group.skills.sort((a, b) => (placeOf(a)?.position ?? Infinity) - (placeOf(b)?.position ?? Infinity) || a.localeCompare(b, "zh-Hant"));
  return groups.filter((group) => group.skills.length);
}
