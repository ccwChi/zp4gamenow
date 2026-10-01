"use client";

import { assetPath } from "./assetPath";
import { FloatingPicker } from "./FloatingPicker";
import { SERIES_SORT_KEY, SERIES_SORT_OPTIONS, parseSeriesSort, sortSeries, type SeriesSort } from "./seriesSort";
import { PLANNED_GEAR_KEY, parsePlannedGear, type PlannedGear } from "./plannedGear";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_BUILDS, addBuild, appendBuilds, defaultStats, exportFile, parseImport, initialBuildState, loadBuilds, loadStats, saveStats, pieceOf, removeBuild, saveBuilds, setPiece, updateBuild, type Build, type BuildState, type DriftPick, type StatsSettings } from "./buildStore";

/** 資料由 scripts/build-mhnow-data.mjs 產生，原生繁體中文，不需要任何翻譯層。 */
type SkillLevel = { level: number; grade: number };
type SeriesSkill = { skill: string; levels: SkillLevel[]; style?: number };
/** 武器種類專屬特性，轉檔時已翻成中文；後座力、裝填是文字（小／中／大…、快／普通…）。 */
type WeaponTraits = {
  ammo?: { name: string; num: number; recoil: string; reload: string }[];
  sp?: string;
  arrows?: { level: number; name: string }[];
  coating?: string;
  phial?: string;
  shelling?: string;
  songs?: { notes: string; name: string }[];
  kinsect?: { label: string; value: string }[];
};
/** weaponSkills：技能跟通用武器不同的武器種類（如碎龍的輕／重弩），有的話整份取代 skills.weapon。 */
type Series = { key: string; name: string; id?: number; weaponElements?: string[]; unlock: number; weaponTypes: string[]; hasArmor: boolean; skills: Record<string, SeriesSkill[]>; weaponSkills?: Record<string, SeriesSkill[]>; traits: Record<string, WeaponTraits>; slots?: Partial<Record<ArmorSlot, number[]>> };

/** 某系列某部位的技能；武器要看種類，有專屬技能就用專屬的。 */
export function seriesSkills(series: Series, slot: string, weaponType?: string): SeriesSkill[] {
  if (slot === "weapon" && weaponType && series.weaponSkills?.[weaponType]) return series.weaponSkills[weaponType];
  return series.skills[slot] ?? [];
}
type SeriesIndex = { weaponTypes: Record<string, string>; slots: Record<string, string>; skillLevels: Record<string, string[]>; series: Series[] };
/** 素材分類：沒寫就是魔物專屬。翼龍的皮／尖爪 wyvern、採集素材 gather、通用的 misc（精鍊素材、龍玉碎片…）。 */
type MaterialGroup = "wyvern" | "gather" | "misc";
/** monster：魔物專屬素材屬於哪個系列；sub：採集素材的細分（ore 礦石、bone 龍骨、plant 植物、bug 蟲、mushroom 菇、rare 稀有採集）。 */
type MaterialAmount = { name: string; quantity: number; rare?: number; group?: MaterialGroup; sub?: string; monster?: string; unknown?: boolean };
type GradeRow = { grade: string; zenny: number; materials: MaterialAmount[] };
type SeriesDetail = { key: string; name: string; armor?: GradeRow[]; weapons?: Record<string, GradeRow[]> };
type ArmorSlot = "helm" | "mail" | "gloves" | "belt" | "greaves";
/** 漂流石（scripts/build-mhnow-data.mjs 產出 driftstones.json）：6 種顏色各有來源魔物與技能池，另有共通與神秘。 */
type Driftstones = {
  colors: { key: string; label: string; sources: { key: string; name: string; parts?: string[] }[]; skills: { name: string; rare: boolean; chance: number }[]; commonChance: number }[];
  common: string[];
  events: { key: string; label: string; skills: string[] }[];
};

const ARMOR_SLOTS: ArmorSlot[] = ["helm", "mail", "gloves", "belt", "greaves"];
// 來源用的是簡稱（手、片手、鎚），這裡改用完整名稱比較好讀。
const SLOT_NAMES: Record<ArmorSlot, string> = { helm: "頭部", mail: "身體", gloves: "手部", belt: "腰部", greaves: "腳部" };
const WEAPON_NAMES: Record<string, string> = {
  "shield-sword": "單手劍", "great-sword": "大劍", "long-sword": "太刀", "dual-blades": "雙劍",
  "hammer": "大錘", "hunting-horn": "狩獵笛", "lance": "長槍", "gunlance": "銃槍",
  "switch-axe": "斬擊斧", "charge-blade": "充能斧", "insect-glaive": "操蟲棍",
  "light-gun": "輕弩槍", "heavy-gun": "重弩槍", "bow": "弓",
};
const WEAPON_ICON: Record<string, string> = {
  "shield-sword": "/mhnow/wapons_svg/weapon_shields_sword.svg", "great-sword": "/mhnow/wapons_svg/weapon_great_sword.svg",
  "long-sword": "/mhnow/wapons_svg/weapon_long_sword.svg", "dual-blades": "/mhnow/wapons_svg/weapon_dual_blades.svg",
  "hammer": "/mhnow/wapons_svg/weapon_hammer.svg", "hunting-horn": "/mhnow/wapons_svg/weapon_hunting_horn.svg",
  "lance": "/mhnow/wapons_svg/weapon_lance.svg", "gunlance": "/mhnow/wapons_svg/weapon_gunlance.svg",
  "switch-axe": "/mhnow/wapons_svg/weapon_switch_axe.svg", "charge-blade": "/mhnow/wapons_svg/weapon_charge_blade.svg",
  "insect-glaive": "/mhnow/wapons_svg/weapon_insect_glaive.svg", "light-gun": "/mhnow/wapons_svg/weapon_light_bowgun.svg",
  "heavy-gun": "/mhnow/wapons_svg/weapon_heavy_bowgun.svg", "bow": "/mhnow/wapons_svg/weapon_bow.svg",
};
const ARMOR_ICON: Record<ArmorSlot, string> = {
  helm: "/mhnow/armor_svg/armor_head.svg", mail: "/mhnow/armor_svg/armor_chest.svg", gloves: "/mhnow/armor_svg/armor_arms.svg",
  belt: "/mhnow/armor_svg/armor_waist.svg", greaves: "/mhnow/armor_svg/armor_legs.svg",
};
const ALL_WEAPON_TYPES = Object.keys(WEAPON_NAMES);
const MAX_GRADE = 10;
// 每個洞的漂流石提供的技能等級。來源資料只寫了「有哪些技能」，沒寫給幾級，這裡先假設 1，要改只動這個數字。
const DRIFT_LEVEL = 1;
const DRIFT_DOT: Record<string, string> = { fire: "#e0564a", water: "#3b82c4", thunder: "#e0b400", ice: "#4bb8c9", black: "#3a3a3a", white: "#cfcfc7", common: "#9aa39b", event: "#8b5fc7" };
const SEARCH_LIMIT = 60;
// 查不到技能上限時（例如 varies）進度條的預設格數。
const BAR_SEGMENTS = 5;

/** 組合 className，略過 false／空值（條件樣式用）。 */
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
/** 背景圖示（魔物紋章、部位／武器 svg）共用的背景設定。 */
const BG_ICON = "bg-contain bg-center bg-no-repeat";
const NOTE = "text-[12px] text-[#858d86] leading-[1.7]";
/** 裝備列名稱下的小字行（技能、漂流石、武器特性），顏色各自加。 */
const GEAR_SMALL = "flex flex-wrap gap-x-2.5 gap-y-0.5 text-[12px]";
/** 不滿版：整頁收成一欄固定寬度置中（仿 mhnow.me）；內容寬 360px（一組裝備的寬度），左右各留 16px。 */
const PAGE = "max-w-[392px] mx-auto my-4 px-4 pt-0 pb-8 max-[620px]:pb-7";

/** 各頁標題：英文眉標＋標題。說明文字在 360px 寬放不下，保留在 DOM 但不顯示。 */
function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <div className="flex justify-between items-center mb-2.5"><div>
    <span className="text-[10px] tracking-[1.5px] text-[#89918a]">{eyebrow}</span>
    <h1 className="text-[19px] mt-0.5 mb-0">{title}</h1>
    {description ? <p className="hidden">{description}</p> : null}
  </div></div>;
}

/** 一件防具鑲的漂流石提供的技能；超過洞數的（換了洞比較少的裝備）與空洞不算。 */
export function driftContribution(picks: (DriftPick | null)[] | undefined, slotCount: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const pick of (picks ?? []).slice(0, slotCount)) if (pick) result[pick.skill] = (result[pick.skill] ?? 0) + DRIFT_LEVEL;
  return result;
}

/** 漂流石的顏色；舊存檔沒記顏色時，依資料推：先找六色的技能池，再找共通，都沒有就當神秘。 */
export function driftColor(pick: DriftPick, data: Driftstones | null): string {
  if (pick.color) return pick.color;
  return data?.colors.find((color) => color.skills.some((skill) => skill.name === pick.skill))?.key
    ?? (data?.common.includes(pick.skill) ? "common" : "event");
}

/** 小六角形（漂流石）；白色在米色底上看不清楚，所以都描一圈邊。 */
function DriftHex({ color, size }: { color: string; size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="inline-block flex-none align-[-1px]">
    <path d="M12 1.5 21.5 7v10L12 22.5 2.5 17V7z" fill={DRIFT_DOT[color] ?? DRIFT_DOT.common} stroke="rgba(0,0,0,.28)" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>;
}

/** 某個部位在指定階級時已取得的技能等級。 */
export function skillsAtGrade(entries: SeriesSkill[] = [], grade: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of entries) {
    const reached = entry.levels.filter((level) => level.grade <= grade);
    if (reached.length) result[entry.skill] = Math.max(...reached.map((level) => level.level));
  }
  return result;
}

function addSkills(target: Record<string, number>, source: Record<string, number>) {
  for (const [name, level] of Object.entries(source)) target[name] = (target[name] ?? 0) + level;
}

const GROUP_ORDER: Record<MaterialGroup | "monster", number> = { wyvern: 0, gather: 1, monster: 2, misc: 3 };
/** 採集素材內的順序：礦石 → 龍骨 → 植物 → 蟲 → 菇 → 稀有採集。 */
const GATHER_ORDER: Record<string, number> = { ore: 0, bone: 1, plant: 2, bug: 3, mushroom: 4, rare: 5 };

/**
 * 素材清單的順序：翼龍的皮／尖爪 → 採集素材 → 魔物專屬 → 其他；魔物專屬的同一隻魔物排在一起
 * （monsterName 給了就依魔物名稱排，否則依代號）、採集素材依種類；每組內稀有度由低到高，同稀有度數量多的在前。
 */
export function compareMaterials(a: MaterialAmount, b: MaterialAmount, monsterName: (key: string) => string = (key) => key) {
  return GROUP_ORDER[a.group ?? "monster"] - GROUP_ORDER[b.group ?? "monster"]
    || (GATHER_ORDER[a.sub ?? ""] ?? 9) - (GATHER_ORDER[b.sub ?? ""] ?? 9)
    || monsterName(a.monster ?? "").localeCompare(monsterName(b.monster ?? ""), "zh-Hant")
    || (a.rare ?? 0) - (b.rare ?? 0)
    || b.quantity - a.quantity
    || a.name.localeCompare(b.name, "zh-Hant");
}

/** 「目前階級的下一階」到「目標階級」之間要做的每一階（尚未生產從第一階＝生產開始）。 */
export function rowsInRange(rows: GradeRow[], currentGrade: string, targetGrade: string) {
  const start = currentGrade === "unforged" ? 0 : rows.findIndex((row) => row.grade === currentGrade) + 1;
  const end = rows.findIndex((row) => row.grade === targetGrade);
  if (start < 0 || end < start) return [];
  return rows.slice(start, end + 1);
}

/** 累計「目前階級的下一階」到「目標階級」之間所有升級的素材與 Zenny。 */
export function calculateRange(rows: GradeRow[], currentGrade: string, targetGrade: string) {
  const totals = new Map<string, MaterialAmount>();
  let zenny = 0;
  for (const row of rowsInRange(rows, currentGrade, targetGrade)) {
    zenny += row.zenny;
    for (const item of row.materials) {
      const existing = totals.get(item.name);
      if (existing) existing.quantity += item.quantity;
      else totals.set(item.name, { ...item });
    }
  }
  return { zenny, materials: [...totals.values()].sort(compareMaterials) };
}

/**
 * 選裝備視窗的搜尋：比對魔物代號與名稱；有指定部位（slot）時也比對該部位的技能（升滿後的等級）。
 * 有技能命中時依那個技能的等級由高到低排（同等級維持原順序），只有名稱命中的排在後面。
 */
export function searchSeries(series: Series[], query: string, slot?: string): { item: Series; skill?: { name: string; level: number } }[] {
  const key = query.trim().toLowerCase();
  if (!key) return series.map((item) => ({ item }));
  const hits: { item: Series; skill?: { name: string; level: number } }[] = [];
  for (const item of series) {
    const byName = `${item.key} ${item.name}`.toLowerCase().includes(key);
    // 武器還沒選種類，所以每種武器的技能都算（取等級最高的那個）。
    const entries = !slot ? [] : slot === "weapon" ? [item.skills.weapon ?? [], ...Object.values(item.weaponSkills ?? {})].flat() : item.skills[slot] ?? [];
    const [best] = Object.entries(skillsAtGrade(entries, MAX_GRADE)).filter(([name]) => name.toLowerCase().includes(key)).sort((a, b) => b[1] - a[1]);
    if (byName || best) hits.push({ item, skill: best ? { name: best[0], level: best[1] } : undefined });
  }
  return hits.sort((a, b) => (b.skill?.level ?? 0) - (a.skill?.level ?? 0));
}

/** slot：配裝時正在選的部位，給技能搜尋用；計算器不分部位就不傳，只搜名稱。 */
function MonsterPicker({ series, value, onPick, icons, display, onDisplay, query, onQuery, slot }: {
  series: Series[]; value: string; onPick: (key: string) => void; icons: Record<string, string>;
  display: "image" | "name"; onDisplay: (next: "image" | "name") => void; query: string; onQuery: (next: string) => void; slot?: string;
}) {
  const ranks = new Map(series.map((item, position) => [item.key, position]));
  const visible = searchSeries(series, query, slot).sort((a, b) => ranks.get(a.item.key)! - ranks.get(b.item.key)!);
  const modeButton = (mode: "image" | "name", label: string) => <button
    className={cx("border-0 py-[5px] px-3 rounded-[5px]", display === mode ? "bg-white text-[#253229] shadow-[0_1px_4px_#ccd1ca]" : "bg-transparent text-[#687168]")}
    onClick={() => onDisplay(mode)}>{label}</button>;
  return <div>
    <div className="flex items-center justify-between mb-[9px] text-[12px] text-[#687168] max-[620px]:flex-wrap max-[620px]:gap-2">
      <span>① 選擇魔物（{visible.length}）</span>
      <input aria-label="搜尋" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={slot ? "搜尋魔物、裝備或技能" : "搜尋魔物或裝備"}
        className="flex-1 min-w-0 mx-3 my-0 py-2 px-[11px] border border-[#dfe2dc] rounded-[7px] bg-[#f8f8f5] text-[13px] outline-none max-[620px]:order-3 max-[620px]:basis-full max-[620px]:m-0" />
      <div className="flex bg-[#eef0ed] rounded-md p-0.5">{modeButton("image", "圖片")}{modeButton("name", "名稱")}</div>
    </div>
    {visible.length ? <div className={cx("grid gap-1 h-[290px] max-h-[290px] overflow-auto content-start max-[760px]:h-[250px] max-[760px]:max-h-[250px]",
      display === "image" ? "grid-cols-[repeat(auto-fill,minmax(82px,1fr))] max-[760px]:grid-cols-[repeat(auto-fill,minmax(72px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(96px,1fr))]")}>
      {visible.map(({ item, skill }) => <button key={item.key} title={skill ? `${item.name}（${skill.name} ${skill.level}）` : item.name} onClick={() => onPick(item.key)}
        className={cx("min-w-0 p-[5px] border rounded-[7px] flex flex-col items-center justify-center text-[#2e3731] cursor-pointer",
          display === "name" ? "min-h-[42px]" : "min-h-[50px]",
          value === item.key ? "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900]" : "border-[#e3e6e1] bg-[#f1f2ef]")}>
        {display === "image" && icons[item.key] ? <span className={cx("w-[52px] h-[52px]", BG_ICON)} style={{ backgroundImage: `url(${assetPath(icons[item.key])})` }} />
          : <span className="font-bold text-[12px] leading-[1.3] text-center break-keep">{item.name}</span>}
        {display === "name" ? <small className="block max-w-full truncate text-[8px] text-[#777]">{`G${item.unlock} 起`}</small> : null}
        {skill ? <small className="block max-w-full truncate text-[10px] font-bold text-[#e08a00]">{skill.name} {skill.level}</small> : null}
      </button>)}
    </div> : <p className={NOTE}>找不到符合的魔物。</p>}
  </div>;
}

/** narrow：技能說明、漂流石這類內容少的視窗用窄版。 */
function Modal({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: ReactNode; narrow?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="fixed inset-0 bg-[rgba(20,26,20,.45)] flex items-center justify-center p-5 z-50" onClick={onClose}>
    <div className={cx("bg-white rounded-xl w-full max-h-[86vh] flex flex-col overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,.25)]", narrow ? "max-w-[360px]" : "max-w-[760px]")} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between py-3.5 px-[18px] border-b border-[#e5e7e2] flex-none">
        <strong className="text-[15px]">{title}</strong>
        <button aria-label="關閉" onClick={onClose} className="border-0 bg-[#f0f1ed] rounded-full w-7 h-7 text-[14px] leading-none cursor-pointer text-[#4b5d50]">✕</button>
      </div>
      <div className="overflow-auto py-3.5 px-[18px]">{children}</div>
    </div>
  </div>;
}

/** iconOnly：只出圖示，名稱收進 title 提示（武器種類用，跟魔物選單一樣的呈現）。 */
function ChoiceGrid({ label, items, value, onPick, iconOnly }: {
  label: string; items: { id: string; title: string; subtitle?: string; badge?: string; icon?: string; disabled?: boolean }[];
  value: string; onPick: (id: string) => void; iconOnly?: boolean;
}) {
  return <div className="mb-4">
    <span className="block text-[12px] text-[#687168] mb-[9px]">{label}（{items.length}）</span>
    <div className={cx("grid", iconOnly ? "grid-cols-[repeat(auto-fill,minmax(62px,1fr))] gap-1.5" : "grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2 max-[620px]:grid-cols-[1fr]")}>
      {items.map((item) => {
        const active = value === item.id;
        return <button key={item.id} title={item.title} aria-label={item.title} disabled={item.disabled} onClick={() => onPick(item.id)}
          className={cx("relative min-w-0 flex items-center gap-2.5 border rounded-[9px] text-[#2e3731] cursor-pointer disabled:opacity-[.28] disabled:cursor-not-allowed",
            iconOnly ? "min-h-[62px] py-2 px-1 flex-col justify-center text-center" : "text-left py-2.5 pl-3.5 pr-10",
            item.disabled ? cx("bg-[#f4f5f2]", active ? "border-[#099aa5] shadow-[inset_0_0_0_1px_#099aa5] hover:border-[#e0e3de]" : "border-[#e0e3de]")
              : active ? "border-[#099aa5] bg-[#f1fbfb] shadow-[inset_0_0_0_1px_#099aa5]"
                : "border-[#e0e3de] bg-[#fbfbf9] hover:border-[#c5cdc6] hover:bg-[#f4f6f2]")}>
          {item.icon ? <span className={cx(BG_ICON, iconOnly ? "w-[34px] h-[34px] flex-[0_0_34px]" : "w-[22px] h-[22px] flex-[0_0_22px]")} style={{ backgroundImage: `url(${assetPath(item.icon)})` }} /> : null}
          <span className={iconOnly ? "hidden" : "min-w-0 flex-1"}>
            <strong className="block text-[14px] truncate">{item.title}</strong>
            {item.subtitle ? <small className="block mt-[3px] text-[11px] text-[#8b928c] truncate">{item.subtitle}</small> : null}
          </span>
          {item.badge ? <b className={cx("absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[11px] py-0.5 px-2 text-[11px]", active ? "bg-[#099aa5] text-white" : "bg-[#eaefe9] text-[#4b5d50]")}>{item.badge}</b> : null}
        </button>;
      })}
    </div>
  </div>;
}

/**
 * 一件裝備每個解鎖階級「新增或提升了什麼」。
 * 列累積值會讓每一行越來越長（長技能名還會被拆行），改成只列差異：
 *   5-1  破壞王 1
 *   6-1  攻擊守勢 0→1
 *   8-1  攻擊守勢 1→2
 */
export function skillTiers(entries: SeriesSkill[] = [], slotGrades: number[] = []) {
  const skillGrades = [...new Set(entries.flatMap((entry) => entry.levels.map((level) => level.grade)))].sort((a, b) => a - b);
  const grades = [...new Set([...skillGrades, ...slotGrades])].sort((a, b) => a - b);
  return grades.map((grade) => {
    const now = skillsAtGrade(entries, grade);
    const before = skillGrades.filter((earlier) => earlier < grade).pop();
    const previous = before === undefined ? {} : skillsAtGrade(entries, before);
    return {
      grade,
      first: before === undefined,
      slots: slotGrades.filter((slotGrade) => slotGrade === grade).length,
      changes: Object.entries(now)
        .filter(([name, level]) => level !== (previous[name] ?? 0))
        .map(([name, level]) => ({ name, from: previous[name] ?? 0, to: level })),
    };
  });
}

function SkillTiers({ entries, slotGrades }: { entries: SeriesSkill[]; slotGrades?: number[] }) {
  const tiers = skillTiers(entries, slotGrades);
  if (!tiers.length) return <p className={NOTE}>這件裝備沒有技能。</p>;
  return <div>
    {tiers.map((tier) => <p key={tier.grade} className="flex items-baseline gap-[7px] m-0 p-0 text-[12px] leading-[1.6]">
      <b className="flex-[0_0_26px] text-[11px] text-[#8b948c] font-semibold">{tier.grade}-1</b>
      <span className="text-[12px] text-[#39423a]">
        {tier.changes.map((change) => <em key={change.name} className="block not-italic">
          {change.name}<span className="ml-1.5 text-[12px] text-[#3e8e51] font-semibold">{tier.first ? change.to : `${change.from}→${change.to}`}</span>
        </em>)}
        {tier.slots ? <em className="block not-italic text-[#39423a]">{"⬡".repeat(tier.slots)} <span className="text-[12px] text-[#5b635c] font-normal">鑲嵌槽 +{tier.slots}</span></em> : null}
      </span>
    </p>)}
  </div>;
}

/** 選漂流石技能：顏色分頁＋技能清單；稀有技能標 ★，神秘依組別列出。 */
/** 漂流石顏色分頁（選技能視窗與查詢頁共用）；big 是查詢頁的大尺寸。 */
function DriftTabs({ tabs, value, onChange, big }: { tabs: { key: string; label: string }[]; value: string; onChange: (key: string) => void; big?: boolean }) {
  return <div className="flex flex-wrap gap-1.5 mb-2.5">
    {tabs.map((item) => <button key={item.key} onClick={() => onChange(item.key)}
      className={cx("inline-flex items-center gap-[5px] border rounded-full cursor-pointer", big ? "py-[7px] px-3 text-[14px]" : "py-[5px] px-2.5 text-[13px]",
        value === item.key ? "border-[#39423a] bg-[#39423a] text-white" : "border-[#e3dac6] bg-[#fffaf0] text-[#39423a]")}>
      <i className="w-2.5 h-2.5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)]" style={{ background: DRIFT_DOT[item.key] }} />{item.label}
    </button>)}
  </div>;
}

/** 選漂流石技能；記下的顏色就是挑技能時所在的分頁（六色、共通或神秘）。 */
function DriftstonePicker({ data, current, onPick }: { data: Driftstones; current: DriftPick | null; onPick: (pick: DriftPick | null) => void }) {
  const [tab, setTab] = useState(current ? driftColor(current, data) : "fire");
  const color = data.colors.find((item) => item.key === tab);
  const skillButton = (name: string, rare = false) => <button key={name} onClick={() => onPick({ skill: name, color: tab })}
    className={cx("inline-flex items-center gap-1 py-1.5 px-2.5 border rounded-lg text-[#2b332c] text-[13px] cursor-pointer",
      current?.skill === name && driftColor(current, data) === tab ? "border-[#e08a00] bg-[#fff3dc]" : "border-[#e3dac6] bg-[#fffaf0] hover:border-[#c9bd9f]")}>
    {name}{rare ? <em className="not-italic text-[#e08a00] text-[12px]">★</em> : null}
  </button>;
  return <div>
    <DriftTabs tabs={[...data.colors.map((item) => ({ key: item.key, label: item.label })), { key: "common", label: "共通" }, { key: "event", label: "神秘" }]} value={tab} onChange={setTab} />
    <div className="flex flex-wrap gap-1.5">
      {color ? color.skills.map((skill) => skillButton(skill.name, skill.rare)) : null}
      {tab === "common" ? data.common.map((name) => skillButton(name)) : null}
      {tab === "event" ? data.events.map((group) => <div key={group.key} className="flex-[0_0_100%] flex flex-wrap gap-1.5 items-center">
        <small className="flex-[0_0_100%] mt-1.5 text-[#8b938c] text-[11px]">{group.label}</small>{group.skills.map((name) => skillButton(name))}
      </div>) : null}
    </div>
    {current ? <button className="mt-3 py-1.5 px-3 border border-[#e3b8b4] rounded-lg bg-white text-[#b23a30] text-[13px] cursor-pointer" onClick={() => onPick(null)}>清除這個洞</button> : null}
  </div>;
}

/** 漂流石查詢頁：選顏色看來源魔物、技能池與機率；共通、神秘各自列出。 */
function DriftstoneView({ data, icons, onSkill }: { data: Driftstones | null; icons: Record<string, string>; onSkill: (skill: string) => void }) {
  const [tab, setTab] = useState("fire");
  if (!data) return <p className={NOTE}>資料載入中……</p>;
  const color = data.colors.find((item) => item.key === tab);
  const chips = [...data.colors.map((item) => ({ key: item.key, label: item.label })), { key: "common", label: "共通" }, { key: "event", label: "神秘" }];
  const skillName = (name: string) => <button onClick={() => onSkill(name)}
    className="border-0 bg-transparent p-0 text-inherit cursor-pointer underline decoration-dotted decoration-[#b9b2a0] underline-offset-[3px]">{name}</button>;
  const panel = "mt-0 mx-0 mb-3 bg-white border border-[#dfe2dc] rounded-[9px] pt-1.5 px-3.5 pb-3";
  const panelTitle = "text-[14px] mt-2 mx-0 mb-1.5";
  const chipList = <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[#39423a]">{data.common.map((name) => <span key={name}>{skillName(name)}</span>)}</div>;
  const row = "flex justify-between items-center m-0 text-[14px]";
  return <div>
    <DriftTabs big tabs={chips} value={tab} onChange={setTab} />
    {color ? <>
      <section className={panel}>
        <h3 className={panelTitle}>來源魔物（{color.sources.length}）</h3>
        <div>
          {color.sources.map((source) => <p key={source.key} className="flex items-center gap-2 m-0 py-[5px] border-b border-[#f1efe8] last:border-b-0">
            <span className={cx("flex-[0_0_32px] h-8", BG_ICON)} style={icons[source.key] ? { backgroundImage: `url(${assetPath(icons[source.key])})` } : undefined} />
            <strong className="text-[14px]">{source.name}</strong>
            <small className="ml-auto text-[#8b938c] text-[12px]">{source.parts ? source.parts.join("、") : "掉落部位未收錄"}</small>
          </p>)}
        </div>
      </section>
      <section className={panel}>
        <h3 className={panelTitle}>技能池</h3>
        {color.skills.map((skill) => <p key={skill.name} className={cx(row, "py-1.5 border-b border-[#f1efe8]")}>
          <span>{skillName(skill.name)}{skill.rare ? <em className="ml-2 py-px px-1.5 rounded bg-[#fff3dc] text-[#e08a00] not-italic text-[11px] font-bold">稀有</em> : null}</span>
          <b className={cx("tabular-nums", skill.rare ? "text-[#e08a00]" : "text-[#39423a]")}>{skill.chance.toFixed(1)}%</b>
        </p>)}
        <p className={cx(row, "pt-2.5 pb-1.5 text-[#6d756e]")}><span>共通技能（{data.common.length} 個）</span><b className="tabular-nums text-[#39423a]">各 {color.commonChance.toFixed(1)}%</b></p>
        {chipList}
      </section>
      <p className={NOTE}>機率照 mhn.quest 畫面上的算法：稀有技能平分 10%，其餘（共通＋這個顏色的非稀有）平分 90%。</p>
    </> : null}
    {tab === "common" ? <section className={panel}><h3 className={panelTitle}>共通技能（{data.common.length}）</h3>{chipList}<p className={NOTE}>每種顏色的漂流石都可能出現共通技能，機率看顏色，請到各顏色頁查看。</p></section> : null}
    {tab === "event" ? <section className={panel}><h3 className={panelTitle}>神秘漂流石（{data.events.length} 組）</h3>{data.events.map((group) => <p key={group.key} className="flex gap-2.5 m-0 py-1.5 border-b border-[#f1efe8] text-[13px] leading-[1.6]">
      <small className="flex-[0_0_52px] text-[#8b5fc7] font-bold text-[12px]">{group.label}</small>
      <span className="flex flex-wrap gap-x-3 gap-y-0">{group.skills.map((name) => <span key={name}>{skillName(name)}</span>)}</span>
    </p>)}<p className={NOTE}>來源資料沒有神秘漂流石的取得方式與機率。</p></section> : null}
  </div>;
}

/** 「LV1 通常彈」→「通常彈」：裝備列空間小，等級前綴留給展開區。 */
const shortAmmo = (name: string) => name.replace(/^LV\d+\s*/, "");

/** 裝備列名稱下的一行摘要，仿遊戲內「貫通彈 4 斬裂彈 2」的寫法。 */
function TraitSummary({ traits }: { traits: WeaponTraits }) {
  const items = [
    ...(traits.ammo ?? []).map((ammo) => [shortAmmo(ammo.name), String(ammo.num)]),
    ...(traits.arrows ?? []).map((arrow) => [arrow.name.replace(/箭$/, ""), String(arrow.level)]),
    ...(traits.coating ? [[traits.coating]] : []),
    ...(traits.phial ? [[traits.phial]] : []),
    ...(traits.shelling ? [[`${traits.shelling}砲擊`]] : []),
    ...(traits.songs ?? []).map((song) => [song.name]),
    ...(traits.kinsect ? [[traits.kinsect.map((stat) => stat.value).join("・")]] : []),
  ];
  if (!items.length) return null;
  return <small className={GEAR_SMALL + " text-[#6d756e]"}>{items.map(([name, value], position) => <span key={position}>{name}{value ? <> <b className="text-[#3b7fb8] font-bold">{value}</b></> : null}</span>)}</small>;
}

/** 狩獵笛的音符：b 藍、r 橘（mhn.quest 的 note-b / note-r 圖示）。 */
const NOTE_COLOR: Record<string, string> = { b: "text-[#1ea7e8]", r: "text-[#f08a1c]" };
function Notes({ notes }: { notes: string }) {
  return <span className="inline-flex flex-[0_0_64px]">{[...notes].map((note, position) => <i key={position} className={cx("not-italic text-[14px] font-bold leading-none", NOTE_COLOR[note])}>♪</i>)}</span>;
}

/** 展開區的完整武器特性：每一行「標籤＋值」。 */
function TraitLine({ label, children }: { label: string; children: ReactNode }) {
  return <p className="flex flex-wrap gap-x-2.5 gap-y-1 m-0 leading-[1.6]"><span className="flex-[0_0_58px] text-[#8b938c]">{label}</span>{children}</p>;
}

function TraitDetail({ traits }: { traits: WeaponTraits }) {
  const th = "text-left font-semibold text-[#8b938c] py-0.5 px-1 border-b border-[#e8dfcb]";
  const td = "py-[3px] px-1 border-b border-[#f1ebdc]";
  return <div className="flex flex-col gap-1 text-[12px] text-[#39423a]">
    {traits.ammo?.length ? <table className="w-full border-collapse text-[12px]">
      <thead><tr><th className={th}>彈種</th><th className={th}>彈數</th><th className={th}>後座力</th><th className={th}>裝填</th></tr></thead>
      {/* 同一種彈可能佔兩格（冰狼龍輕弩的貫通冰結彈 3 發、4 發），名稱不唯一，key 用順序。 */}
      <tbody>{traits.ammo.map((ammo, position) => <tr key={position}><td className={td}>{ammo.name}</td><td className={cx(td, "text-[#3b7fb8] font-bold")}>{ammo.num}</td><td className={td}>{ammo.recoil}</td><td className={td}>{ammo.reload}</td></tr>)}</tbody>
    </table> : null}
    {traits.sp ? <TraitLine label="SP 技能">{traits.sp.replace("【SP】", "")}</TraitLine> : null}
    {traits.arrows?.length ? <TraitLine label="蓄力箭種">{traits.arrows.map((arrow, position) => <em key={position} className="not-italic">Lv{arrow.level} {arrow.name}</em>)}</TraitLine> : null}
    {traits.coating ? <TraitLine label="瓶">{traits.coating}</TraitLine> : null}
    {traits.phial ? <TraitLine label="瓶種">{traits.phial}</TraitLine> : null}
    {traits.shelling ? <TraitLine label="砲擊類型">{traits.shelling}</TraitLine> : null}
    {traits.songs?.length ? <div>{traits.songs.map((song) => <p key={song.notes} className="flex items-center gap-2.5 m-0 leading-[1.7]"><Notes notes={song.notes} /><span>{song.name}</span></p>)}</div> : null}
    {traits.kinsect?.length ? traits.kinsect.map((stat) => <TraitLine key={stat.label} label={stat.label}>{stat.value}</TraitLine>) : null}
  </div>;
}

type GradeRange = { current: string; target: string };

/**
 * 選「目前階級 → 目標階級」並列出中間所需的 Zenny 與素材。
 * 素材計算器與配裝每件裝備的展開區共用；compact 是給配裝列裡的窄版。
 * 目標若不在目前之後（或還沒選），自動取下一階；目前改到目標之後時也會把目標往後推。
 * allowNone（配裝用）：目標可以是「不升級」，這時什麼都不算——已經做完、不打算再升的裝備就維持這樣；
 * 目前階級也能選到最高階（計算器則要留一階當目標）。
 */
/**
 * 實際採用的目標階級：選在目前階級之後就照選的；否則（沒選、或已經升過頭）
 * allowNone 時回傳 ""（不升級），不然取目前的下一階。
 */
export function resolveTarget(rows: GradeRow[], value: GradeRange, allowNone = false) {
  const currentIndex = value.current === "unforged" ? -1 : rows.findIndex((row) => row.grade === value.current);
  const requestedIndex = rows.findIndex((row) => row.grade === value.target);
  if (requestedIndex > currentIndex) return value.target;
  return allowNone ? "" : rows[currentIndex + 1]?.grade ?? rows[rows.length - 1]?.grade ?? "";
}

/** 素材統計的分類：魔物專屬依稀有度分 R1～R6（沒標稀有度的算 r0），採集素材再依種類細分，其他照 group。 */
export function materialCategory(item: MaterialAmount) {
  if (item.group === "gather") return `gather-${item.sub ?? "other"}`;
  return item.group ?? `r${item.rare ?? 0}`;
}
const CATEGORY_ORDER = ["r1", "r2", "r3", "r4", "r5", "r6", "r0", "wyvern",
  "gather-ore", "gather-bone", "gather-plant", "gather-bug", "gather-mushroom", "gather-rare", "gather-other", "misc"];
const CATEGORY_LABEL: Record<string, string> = {
  r0: "魔物（未分級）", wyvern: "翼龍素材", misc: "其他",
  "gather-ore": "採集・礦石", "gather-bone": "採集・龍骨", "gather-plant": "採集・植物", "gather-bug": "採集・蟲",
  "gather-mushroom": "採集・菇", "gather-rare": "採集・稀有", "gather-other": "採集・其他",
};
const categoryLabel = (key: string) => CATEGORY_LABEL[key] ?? `魔物 R${key.slice(1)}`;

/** 一件要升級的裝備；key 是「部位|系列::種類」，同一件出現在好幾組配裝時 key 相同。 */
export type MissingPiece = { key: string; rows: GradeRow[]; range: GradeRange };

/**
 * 好幾組配裝加起來還缺的素材與 Zenny。
 * 同一件裝備不管出現在幾組都只做一次：階級取最大範圍（最低的目前階級 → 最高的目標階級）。
 * 沒設目標（不升級）的不算。
 */
export function totalMissing(pieces: MissingPiece[]) {
  const spans = new Map<string, { rows: GradeRow[]; start: number; end: number }>();
  for (const piece of pieces) {
    const target = resolveTarget(piece.rows, piece.range, true);
    if (!target) continue;
    const start = piece.range.current === "unforged" ? -1 : piece.rows.findIndex((row) => row.grade === piece.range.current);
    const end = piece.rows.findIndex((row) => row.grade === target);
    const span = spans.get(piece.key);
    spans.set(piece.key, span ? { rows: span.rows, start: Math.min(span.start, start), end: Math.max(span.end, end) } : { rows: piece.rows, start, end });
  }
  const totals = new Map<string, MaterialAmount>();
  let zenny = 0;
  for (const { rows, start, end } of spans.values()) {
    const range = calculateRange(rows, start < 0 ? "unforged" : rows[start].grade, rows[end].grade);
    zenny += range.zenny;
    for (const item of range.materials) {
      const existing = totals.get(item.name);
      if (existing) existing.quantity += item.quantity;
      else totals.set(item.name, { ...item });
    }
  }
  return { zenny, pieces: spans.size, materials: [...totals.values()].sort(compareMaterials) };
}

/**
 * 採集素材的下拉勾選：種類多（礦石、龍骨、植物…），收成一個按鈕，點開用 checkbox 挑。
 * 按鈕顯示勾了幾種；全勾深色、部分勾半深色、全不勾白色。點外面或按 Esc 關閉。
 */
function GatherDropdown({ keys, counts, hidden, onChange }: {
  keys: string[]; counts: Record<string, number>; hidden: string[]; onChange: (hidden: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, [open]);
  const shown = keys.filter((key) => !hidden.includes(key));
  const others = hidden.filter((key) => !keys.includes(key));
  const tone = shown.length === keys.length ? "bg-[#17231d] text-white border-[#17231d]"
    : shown.length ? "bg-[#5b635c] text-white border-[#5b635c]" : "bg-white text-[#8b938c] border-[#d9d9d9] hover:border-[#b5bbb5]";
  const link = "border-0 bg-transparent p-0 text-[12px] text-[#099aa5] cursor-pointer hover:underline";
  return <div ref={box} className="relative">
    <button aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}
      className={cx("inline-flex items-center gap-1 py-1 px-2.5 border rounded-full text-[12px] cursor-pointer", tone)}>
      採集素材<small className="opacity-70">{shown.length}/{keys.length}</small><span className="text-[10px]">▾</span>
    </button>
    {open ? <div role="menu" className="absolute left-0 top-full mt-1 z-20 min-w-[170px] p-2 rounded-lg bg-white border border-[#dfe2dc] shadow-[0_6px_20px_rgba(0,0,0,.15)]">
      <div className="flex justify-between gap-3 px-1 pb-1.5 mb-1 border-b border-[#eff0ed]">
        <button className={link} onClick={() => onChange(others)}>全選</button>
        <button className={link} onClick={() => onChange([...others, ...keys])}>全不選</button>
      </div>
      {keys.map((key) => <label key={key} className="flex items-center gap-2 py-1 px-1 rounded text-[13px] text-[#2b332c] cursor-pointer hover:bg-[#f3eee2]">
        <input type="checkbox" className="m-0 accent-[#099aa5]" checked={!hidden.includes(key)}
          onChange={() => onChange(hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key])} />
        <span className="flex-1">{categoryLabel(key).replace("採集・", "")}</span>
        <small className="text-[11px] text-[#8b938c]">{counts[key]}</small>
      </label>)}
    </div> : null}
  </div>;
}

/** 配裝頁上方的缺少素材統計：勾要算哪幾組配裝、要看哪些素材類別。 */
function MissingSummary({ builds, settings, onChange, total, loading, monsterName }: {
  builds: Build[]; settings: StatsSettings; onChange: (update: (settings: StatsSettings) => StatsSettings) => void;
  total: ReturnType<typeof totalMissing>; loading: number; monsterName: (key: string) => string;
}) {
  const counts: Record<string, number> = {};
  for (const item of total.materials) counts[materialCategory(item)] = (counts[materialCategory(item)] ?? 0) + 1;
  const present = CATEGORY_ORDER.filter((key) => counts[key]);
  const gatherKeys = present.filter((key) => key.startsWith("gather-"));
  // 同一隻魔物的素材排在一起（依魔物名稱），魔物內再照稀有度、數量。
  const visible = total.materials.filter((item) => !settings.hiddenCategories.includes(materialCategory(item)))
    .sort((a, b) => compareMaterials(a, b, monsterName));
  const chip = (active: boolean) => cx("inline-flex items-center gap-1 py-1 px-2.5 border rounded-full text-[12px] cursor-pointer max-w-[160px]",
    active ? "bg-[#17231d] text-white border-[#17231d]" : "bg-white text-[#8b938c] border-[#d9d9d9] hover:border-[#b5bbb5]");
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const label = "flex-none w-9 text-[12px] text-[#8b938c]";
  return <section className="col-span-full flex flex-col gap-2 p-3 rounded-xl bg-[#fffaf0] border border-[#e3dac6]">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <strong className="text-[15px] text-[#2b332c]">缺少素材統計</strong>
      <span className="text-[12px] text-[#6d756e]">{total.pieces} 件裝備　Zenny <b className="text-[14px] text-[#e08a00] tabular-nums">{total.zenny.toLocaleString()}</b></span>
    </div>
    <div className="flex flex-wrap items-center gap-1.5"><span className={label}>配裝</span>
      {builds.map((build) => { const on = !settings.excludedBuilds.includes(build.id); return <button key={build.id} aria-pressed={on} title={build.name}
        onClick={() => onChange((next) => ({ ...next, excludedBuilds: toggle(next.excludedBuilds, build.id) }))} className={chip(on)}>
        <span className="truncate">{build.name || "（未命名）"}</span></button>; })}
    </div>
    {present.length ? <div className="flex flex-wrap items-center gap-1.5"><span className={label}>素材</span>
      {present.map((key, position) => {
        if (key.startsWith("gather-")) {
          // 第一個採集類的位置放下拉，其他採集類不再各自出按鈕。
          if (present.findIndex((item) => item.startsWith("gather-")) !== position) return null;
          return <GatherDropdown key="gather" keys={gatherKeys} counts={counts} hidden={settings.hiddenCategories}
            onChange={(hidden) => onChange((next) => ({ ...next, hiddenCategories: hidden }))} />;
        }
        const on = !settings.hiddenCategories.includes(key);
        return <button key={key} aria-pressed={on} onClick={() => onChange((next) => ({ ...next, hiddenCategories: toggle(next.hiddenCategories, key) }))} className={chip(on)}>
          {categoryLabel(key)}<small className="opacity-70">{counts[key]}</small></button>;
      })}
    </div> : null}
    {loading ? <p className={cx(NOTE, "m-0")}>還有 {loading} 件裝備的升級資料載入中……</p> : null}
    {!total.pieces && !loading ? <p className={cx(NOTE, "m-0")}>勾選的配裝裡還沒有設定目標階級的裝備。展開裝備、選好目標階級就會算進來。</p>
      : present.length && !visible.length ? <p className={cx(NOTE, "m-0")}>勾選的素材類別目前都不缺；點上面的類別可以顯示其他素材。</p>
        // 由上往下排再換欄（不是左右排），同一隻魔物的素材才會連成一塊。
        : <div className="columns-[210px] gap-x-5">{visible.map((item) => <p key={item.name}
          className="flex justify-between items-center gap-2 m-0 py-1 border-b border-[#f1ebdc] text-[13px] text-[#2b332c] break-inside-avoid">
          <span className="flex items-center min-w-0">{item.rare ? <Rare rare={item.rare} /> : null}<span className="truncate">{item.name}</span></span>
          <b className="tabular-nums whitespace-nowrap">{item.quantity.toLocaleString()} 個</b>
        </p>)}</div>}
  </section>;
}

function GradeRangeCost({ rows, value, onChange, compact, allowNone }: { rows: GradeRow[]; value: GradeRange; onChange: (next: GradeRange) => void; compact?: boolean; allowNone?: boolean }) {
  const currentIndex = value.current === "unforged" ? -1 : rows.findIndex((row) => row.grade === value.current);
  const target = resolveTarget(rows, value, allowNone);
  const total = calculateRange(rows, value.current, target);
  const steps = rowsInRange(rows, value.current, target);
  const hasUnknown = total.materials.some((item) => item.unknown);
  function changeCurrent(next: string) {
    const nextIndex = next === "unforged" ? -1 : rows.findIndex((row) => row.grade === next);
    // 目前階級升到目標（含）之後：配裝回到「不升級」，計算器則把目標推到下一階。
    const passed = rows.findIndex((row) => row.grade === target) <= nextIndex;
    onChange({ current: next, target: !passed ? target : allowNone ? "" : rows[nextIndex + 1]?.grade ?? "" });
  }
  const label = cx("grid flex-1 text-[#657068]", compact ? "gap-[3px] text-[11px]" : "gap-1.5 text-[15px]");
  const select = cx("w-full border border-[#ccd3ce] bg-white text-[#17231d]", compact ? "py-[5px] px-1.5 text-[14px] rounded-md" : "p-2.5 text-[17px] rounded-lg");
  const stepLine = "flex justify-between items-center gap-2 m-0 py-0.5 text-[13px] leading-[1.5]";
  const quantity = "font-bold tabular-nums whitespace-nowrap";
  return <div>
    <div className={cx("flex items-end mt-0 mx-0", compact ? "gap-2 mb-2 p-2 rounded-lg bg-[#f3eee2]" : "gap-3.5 mb-[18px] p-4 rounded-xl bg-[#f5f7f5]")}>
      <label className={label}>目前階級<select className={select} value={value.current} onChange={(event) => changeCurrent(event.target.value)}><option value="unforged">尚未生產</option>{(allowNone ? rows : rows.slice(0, -1)).map((row) => <option key={row.grade}>{row.grade}</option>)}</select></label>
      <span className={compact ? "pb-1.5" : "pb-2.5"}>→</span>
      <label className={label}>目標階級<select className={select} value={target} onChange={(event) => onChange({ ...value, target: event.target.value })}>{allowNone ? <option value="">不升級</option> : null}{rows.filter((row, position) => position > currentIndex).map((row) => <option key={row.grade}>{row.grade}</option>)}</select></label>
    </div>
    {compact ? null : <section className="mt-0 mx-0 mb-4 bg-white border border-[#dfe2dc] rounded-[9px] overflow-hidden">
      <h3 className="text-[14px] m-0 py-3 px-3.5 border-b border-[#e5e7e2]">逐階明細（{steps.length} 階）</h3>
      {steps.map((row, position) => <div key={row.grade} className="grid grid-cols-[48px_1fr] gap-2 py-[9px] px-3.5 border-b border-[#eff0ed] last:border-b-0">
        <b className="text-[14px] text-[#2b332c] leading-[1.7]">{row.grade}{value.current === "unforged" && position === 0 ? <em className="block not-italic text-[10px] font-semibold text-[#e08a00] leading-[1.2]">生產</em> : null}</b>
        <div>
          <p className={cx(stepLine, "text-[#8b938c] [border-bottom:1px_dashed_#eee6d4] mb-0.5 pb-[3px]")}><span className="flex items-center flex-wrap">Zenny</span><strong className={cx(quantity, "text-[#2b332c]")}>{row.zenny.toLocaleString()}</strong></p>
          {[...row.materials].sort(compareMaterials).map((item, order) => <p key={`${item.name}-${order}`} className={stepLine}><span className="flex items-center flex-wrap">{item.rare ? <Rare rare={item.rare} /> : null}{item.name}</span><strong className={quantity}>× {item.quantity}</strong></p>)}
        </div>
      </div>)}
    </section>}
    {!target ? <p className={cx(NOTE, "m-0")}>不升級：不計算素材。要規劃升級時再選目標階級。</p> : <>
    <div className={cx("flex items-baseline", compact ? "mt-0 mx-0 mb-2 py-2 px-3 gap-2 rounded-[7px] bg-[#f3eee2] text-[#2b332c]" : "my-5 mx-0 py-[17px] px-5 gap-3 rounded-lg bg-[#28352e] text-white")}>
      <span className={compact ? "text-[11px]" : "text-[13px]"}>所需 Zenny</span>
      <strong className={cx("ml-auto font-bold tabular-nums", compact ? "text-[20px] text-[#e08a00]" : "text-[31px]")}>{total.zenny.toLocaleString()}</strong>
      <small className={compact ? "text-[11px] text-[#8b938c]" : "text-[12px] text-[#bac3bc]"}>{total.materials.length} 種素材</small>
    </div>
    {hasUnknown ? <p className={compact ? "mt-0 mx-0 mb-2 text-[11px] text-[#858d86] leading-[1.7]" : NOTE}>部分階級有素材尚未辨識，暫時顯示原始代碼（如「ib」），詳見 docs/mhnow-待確認事項.md。</p> : null}
    <section className={cx("bg-white border border-[#dfe2dc] overflow-hidden", compact ? "m-0 rounded-[7px]" : "mb-4 rounded-[9px]")}>
      <h3 className={compact ? "hidden" : "text-[14px] m-0 py-[15px] px-[18px] border-b border-[#e5e7e2]"}>素材總計</h3>
      <div className={cx("grid", compact ? "grid-cols-[1fr] py-0.5 px-2.5" : "grid-cols-[1fr_1fr] py-1.5 px-[18px] max-[720px]:grid-cols-[1fr]")}>{total.materials.map((item) => <p key={item.name}
        className={cx("flex justify-between m-0 border-b border-[#eff0ed]", compact ? "py-1.5 text-[12px]" : "py-[11px] text-[13px] odd:mr-[22px] max-[720px]:odd:mr-0")}>
        <span className="flex items-center flex-wrap">{item.rare ? <Rare rare={item.rare} /> : null}{item.name}{item.unknown ? <small className="block text-[#8a8a8a] text-[14px] font-normal mt-0.5">尚未辨識</small> : null}</span>
        <strong className={cx("font-bold tabular-nums", compact ? "text-[13px]" : "text-[15px]")}>× {item.quantity}</strong>
      </p>)}</div>
    </section>
    </>}
  </div>;
}

/** 素材稀有度標籤：R1～R6，顏色隨稀有度加深，放在素材名稱前。 */
const RARE_COLOR: Record<number, string> = {
  2: "bg-[#e3ecdb] text-[#4d7a3a]", 3: "bg-[#d9e9f3] text-[#2f6d99]", 4: "bg-[#e6dcf1] text-[#6c4a99]",
  5: "bg-[#f6e2c4] text-[#a86300]", 6: "bg-[#f4d3d0] text-[#b23a30]",
};
function Rare({ rare }: { rare: number }) {
  return <i className={cx("inline-block min-w-6 mr-[7px] py-px px-1 rounded not-italic text-[11px] font-bold leading-[1.4] text-center", RARE_COLOR[rare] ?? "bg-[#ece8dc] text-[#6d756e]")}>R{rare}</i>;
}

type SlotId = "weapon" | ArmorSlot;
/** 一組配裝直式清單的一列（武器在前）；沒裝備時 item 為 undefined。itemKey 是升級目標綁定的「哪件裝備」。 */
type GearRow = { id: SlotId; kind: string; title: string; icon: string; item?: Series; itemKey: string; entries: SeriesSkill[]; slotGrades: number[]; traits?: WeaponTraits };

function gearRowsOf(build: Build, seriesBy: Record<string, Series>, weaponTypeName: (type: string) => string, slotName: (slot: ArmorSlot) => string): GearRow[] {
  const [weaponKey, weaponType] = (build.gear.weapon ?? "").split("::");
  const weapon = weaponKey && weaponType ? seriesBy[weaponKey] : undefined;
  return [
    {
      id: "weapon",
      kind: weaponType ?? "",
      title: weapon ? `${weapon.name}${weaponTypeName(weaponType)}` : "武器",
      icon: weaponType && WEAPON_ICON[weaponType] ? WEAPON_ICON[weaponType] : WEAPON_ICON["long-sword"],
      item: weapon,
      itemKey: weapon ? `${weapon.key}::${weaponType}` : "",
      entries: weapon ? seriesSkills(weapon, "weapon", weaponType) : [],
      slotGrades: [],
      traits: weapon ? weapon.traits?.[weaponType] : undefined,
    },
    ...ARMOR_SLOTS.map((slot) => {
      const item = build.gear[slot] ? seriesBy[build.gear[slot]] : undefined;
      return { id: slot, kind: "armor", title: item ? `${item.name}${slotName(slot)}` : slotName(slot), icon: ARMOR_ICON[slot], item, itemKey: item ? `${item.key}::armor` : "", entries: item?.skills[slot] ?? [], slotGrades: item?.slots?.[slot] ?? [] };
    }),
  ];
}

/** 全套（武器＋五件防具＋漂流石）升到頂之後的技能總和。 */
function maxSkillsOf(build: Build, rows: GearRow[]) {
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (!row.item) continue;
    addSkills(result, skillsAtGrade(row.entries, MAX_GRADE));
    if (row.id !== "weapon") addSkills(result, driftContribution(build.drifts[row.id], row.slotGrades.length));
  }
  return result;
}

/** 收合時列在裝備下方：從目前階級升到目標階級還要的 Zenny 與素材。 */
function MissingMaterials({ rows, range }: { rows: GradeRow[] | undefined; range: GradeRange }) {
  const frame = "flex-[0_0_100%] pt-1.5 px-2.5 pb-2 [border-top:1px_dashed_#e8dfcb] bg-[#fffdf7] text-[12px] text-[#39423a]";
  // 沒選目標就不列（也不會去抓升級資料），要先判斷，不然會一直停在「載入中」。
  if (!range.target) return null;
  if (!rows) return <div className={cx(frame, "text-[#858d86]")}>升級資料載入中……</div>;
  if (!rows.length) return null;
  const target = resolveTarget(rows, range, true);
  if (!target) return null;
  const total = calculateRange(rows, range.current, target);
  return <div className={frame}>
    <p className="flex justify-between items-baseline m-0 mb-0.5 text-[11px] text-[#6d756e]">
      <span>缺少素材　{range.current === "unforged" ? "尚未生產" : range.current} → {target}</span>
      <span>Zenny <b className="text-[12px] text-[#e08a00] tabular-nums">{total.zenny.toLocaleString()}</b></span>
    </p>
    {total.materials.map((item) => <p key={item.name} className="flex justify-between items-center m-0 py-px leading-[1.5]">
      <span className="flex items-center flex-wrap">{item.rare ? <Rare rare={item.rare} /> : null}{item.name}</span>
      <b className="tabular-nums whitespace-nowrap">× {item.quantity}</b>
    </p>)}
  </div>;
}

/** BuildCard 需要的共用資料（每張卡都一樣）。 */
type CardContext = { icons: Record<string, string>; skillLevels: Record<string, string[]>; driftstones: Driftstones | null; gradeRowsFor: (key: string, kind: string) => GradeRow[] | undefined };

/** 技能總覽用：每個技能由哪些顏色的漂流石提供、各幾顆（只算實際有洞的）。 */
function driftStonesBySkill(build: Build, rows: GearRow[], data: Driftstones | null) {
  const result: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (!row.item || row.id === "weapon") continue;
    for (const pick of (build.drifts[row.id] ?? []).slice(0, row.slotGrades.length)) {
      if (!pick) continue;
      const color = driftColor(pick, data);
      const byColor = (result[pick.skill] ??= {});
      byColor[color] = (byColor[color] ?? 0) + 1;
    }
  }
  return result;
}

/**
 * 一組配裝的卡片：頂端名稱／顯示缺少素材／刪除，接著六列裝備與技能進度條。
 * 多組並排顯示（仿 mhnow.me），所以尺寸比單組時緊湊。
 */
function BuildCard({ build, rows, ctx, editingSlot, open, canDelete, onEdit, onToggle, onDrift, onSkill, onSkillGear, onChange, onDelete }: {
  build: Build; rows: GearRow[]; ctx: CardContext; editingSlot: SlotId | null; open: (slot: SlotId) => boolean; canDelete: boolean;
  onEdit: (slot: SlotId) => void; onToggle: (slot: SlotId) => void; onDrift: (slot: ArmorSlot, index: number) => void; onSkill: (name: string, level: number) => void;
  onChange: (update: (build: Build) => Build) => void; onDelete: () => void; onSkillGear: () => void;
}) {
  const skills = maxSkillsOf(build, rows);
  const stones = driftStonesBySkill(build, rows, ctx.driftstones);
  const anyStone = Object.keys(stones).length > 0;
  const h4 = (first?: boolean) => cx("mb-1.5 mx-0 text-[12px] text-[#6d756e] font-bold", first ? "mt-1 pt-0" : "mt-3 pt-2.5 [border-top:1px_dashed_#e8dfcb]");
  const toolButton = "flex-none py-1 px-2 border rounded-md text-[12px] cursor-pointer";
  return <article id={`build-${build.id}`} className="min-w-0 flex flex-col gap-1.5 p-2 rounded-xl bg-[#ece8dc] border border-[#d8d0bd]">
    <div className="flex items-center gap-1.5">
      <input aria-label="配裝名稱" value={build.name} maxLength={20} placeholder="配裝名稱" onChange={(event) => { const name = event.target.value; onChange((next) => ({ ...next, name })); }}
        className="flex-1 min-w-0 py-1 px-2 border border-[#d8d0bd] rounded-md bg-white text-[13px] font-bold text-[#2b332c] outline-none focus:border-[#099aa5]" />
      <button aria-pressed={build.showMissing} title="有設定目標階級的裝備，都在下方列出還缺的素材" onClick={() => onChange((next) => ({ ...next, showMissing: !next.showMissing }))}
        className={cx(toolButton, build.showMissing ? "bg-[#099aa5] border-[#099aa5] text-white" : "bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]")}>{build.showMissing ? "✓ " : ""}顯示缺少素材</button>
      <button disabled={!canDelete} title={canDelete ? "刪除這組配裝" : "至少要留一組"} onClick={onDelete}
        className={cx(toolButton, "border-[#e3b8b4] bg-white text-[#b23a30]")}>刪除</button>
    </div>

    <button onClick={onSkillGear} className="py-2 px-3 rounded-lg border border-[#099aa5] bg-white text-[#087b84] text-[13px] cursor-pointer">依技能選全身裝備</button>
    {rows.map((row) => {
      const isOpen = open(row.id);
      const piece = pieceOf(build, row.id, row.itemKey);
      const gradeRows = row.item ? ctx.gradeRowsFor(row.item.key, row.kind) : undefined;
      const drifts = build.drifts[row.id] ?? [];
      return <div key={row.id}
        className={cx("relative flex flex-wrap items-stretch bg-[#fffaf0] border rounded-[10px] overflow-hidden",
          editingSlot === row.id ? "border-[#099aa5] shadow-[0_0_0_2px_rgba(9,154,165,.25)]" : "border-[#e3dac6] hover:border-[#c9bd9f]")}>
        <button className="flex-1 min-w-0 flex items-center gap-2 py-1.5 px-2 border-0 bg-transparent text-left cursor-pointer text-[#2b332c]" title={row.title} onClick={() => onEdit(row.id)}>
          <span className="flex-[0_0_40px] h-10 rounded-lg bg-[#ebe6d9] grid place-items-center">
            <span className={cx("w-[26px] h-[26px] flex-[0_0_26px]", BG_ICON, !row.item && "opacity-[.45]")} style={{ backgroundImage: `url(${assetPath(row.icon)})` }} />
          </span>
          {row.item ? <>
            {ctx.icons[row.item.key] ? <span className={cx("flex-[0_0_38px] h-[38px]", BG_ICON)} style={{ backgroundImage: `url(${assetPath(ctx.icons[row.item.key])})` }} /> : null}
            <span className="min-w-0 flex flex-col gap-0.5">
              <strong className="text-[14px] font-bold truncate">{row.title}</strong>
              <small className={cx(GEAR_SMALL, "text-[#5b635c]")}>{Object.entries(skillsAtGrade(row.entries, MAX_GRADE)).map(([name, level]) => <span key={name}>{name} <b className="text-[#e08a00] font-bold">{level}</b></span>)}</small>
              {drifts.slice(0, row.slotGrades.length).some(Boolean) ? <small className={cx(GEAR_SMALL, "text-[#5b635c]")}>{drifts.slice(0, row.slotGrades.length).map((pick, position) => pick
                ? <span key={position} className="inline-flex items-center gap-[3px]"><DriftHex color={driftColor(pick, ctx.driftstones)} size={11} />{pick.skill}</span> : null)}</small> : null}
              {row.traits ? <TraitSummary traits={row.traits} /> : null}
            </span>
          </> : <span className="min-w-0 flex flex-col gap-0.5"><strong className="text-[14px] font-semibold truncate text-[#8b938c]">{row.title}</strong><small className={cx(GEAR_SMALL, "text-[#a4aaa4]")}>點擊選擇</small></span>}
        </button>
        {row.item && row.slotGrades.length ? <span className="flex-none flex items-center gap-0.5 px-0.5">
          {row.slotGrades.map((grade, position) => { const pick = drifts[position]; return <button key={position}
            className={cx("border-0 bg-transparent py-1 px-[3px] rounded-md text-[18px] leading-none cursor-pointer hover:bg-[#f3ecdb]", pick ? "" : "text-[#8a939c] hover:text-[#39423a]")}
            title={pick ? `${pick.skill}（${grade}-1 解鎖）點擊更換` : `鑲嵌槽（${grade}-1 解鎖）點擊選漂流石技能`}
            onClick={() => onDrift(row.id as ArmorSlot, position)}>{pick ? <DriftHex color={driftColor(pick, ctx.driftstones)} size={17} /> : "⬡"}</button>; })}
        </span> : null}
        {row.item ? <button aria-label="升級明細" title="升級明細" onClick={() => onToggle(row.id)}
          className={cx("flex-[0_0_32px] border-0 border-l border-[#eee6d4] bg-transparent cursor-pointer text-[14px] hover:bg-[#f6efdf]", isOpen ? "text-[#099aa5]" : "text-[#8b938c]")}>
          <span className={cx("inline-block [transition:transform_.15s]", isOpen && "[transform:rotate(180deg)]")}>▾</span>
        </button> : null}
        {row.item && isOpen ? <div className="flex-[0_0_100%] pt-2 px-3 pb-3 [border-top:1px_dashed_#e8dfcb] bg-[#fffdf7]">
          {row.traits ? <><h4 className={h4(true)}>武器特性</h4><TraitDetail traits={row.traits} /></> : null}
          {row.entries.length || row.slotGrades.length ? <>{row.traits ? <h4 className={h4()}>技能解鎖</h4> : null}<SkillTiers entries={row.entries} slotGrades={row.slotGrades} /></> : null}
          <h4 className={h4()}>升級素材（單件）</h4>
          {!gradeRows ? <p className={NOTE}>升級資料載入中……</p>
            : !gradeRows.length ? <p className={NOTE}>這件裝備沒有升級資料。</p>
              : <GradeRangeCost compact allowNone rows={gradeRows} value={piece}
                onChange={(range) => onChange((next) => setPiece(next, row.id, { ...pieceOf(next, row.id, row.itemKey), ...range }))} />}
        </div> : null}
        {row.item && !isOpen && build.showMissing ? <MissingMaterials rows={gradeRows} range={piece} /> : null}
      </div>;
    })}

    {Object.keys(skills).length ? <section className="bg-[#fffaf0] border border-[#e3dac6] rounded-[10px] py-2.5 px-3">
      <div className="grid grid-cols-2 gap-x-5 gap-y-2">{Object.entries(skills).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant")).map(([name, level]) => {
        const cap = ctx.skillLevels[name]?.length; const segments = cap ?? Math.max(BAR_SEGMENTS, level);
        return <button key={name} className="block w-full border-0 bg-transparent py-1 px-1.5 -my-1 -mx-1.5 box-content text-left cursor-pointer rounded-md hover:bg-[#f3ecdb]" onClick={() => onSkill(name, level)}>
          <p className="flex justify-between items-baseline gap-1 mt-0 mx-0 mb-1 text-[13px] text-[#2b332c]"><span className="min-w-0">{name}</span><b className={cx("text-[14px]", cap !== undefined && level > cap ? "text-[#d23c3c]" : "text-[#e08a00]")}>{level}</b></p>
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0 flex gap-[3px]">{Array.from({ length: segments }, (_, position) => <i key={position}
              className={cx("flex-[0_0_calc((100%_-_4*3px)/5)] h-2 [transform:skewX(-20deg)] rounded-[1px]", position < level ? "bg-[#f59a00]" : "bg-[#dcd6c8]")} />)}</div>
            {anyStone ? <span className="flex-none min-w-[22px] h-2 flex items-center justify-end gap-1 overflow-visible">
              {Object.entries(stones[name] ?? {}).map(([color, count]) => <span key={color} title={`漂流石 ${count} 顆`} className="inline-flex items-center gap-px text-[10px] font-bold leading-none text-[#5b635c]">
                <DriftHex color={color} size={11} />{count > 1 ? count : null}
              </span>)}
            </span> : null}
          </div>
        </button>;
      })}</div>
    </section> : <p className={cx(NOTE, "m-0 px-1")}>點上面的格子開始配裝：武器要選魔物與武器種類，防具選魔物即可。</p>}
  </article>;
}

/** Each weapon type must use its own skills, including overrides. */
export function gearForSkill(series: Series[], skill: string) {
  return series.flatMap((item) => [
    ...(item.hasArmor ? ARMOR_SLOTS.map((slot) => ({ slot, key: item.key, title: `${item.name}${SLOT_NAMES[slot]}`, entries: seriesSkills(item, slot) })) : []),
    ...item.weaponTypes.map((type) => ({ slot: "weapon" as const, key: `${item.key}::${type}`, title: `${item.name}${WEAPON_NAMES[type] ?? type}`, entries: seriesSkills(item, "weapon", type) })),
  ]).map((gear) => ({ ...gear, level: skillsAtGrade(gear.entries, MAX_GRADE)[skill] ?? 0 }))
    .filter((gear) => gear.level > 0).sort((a, b) => b.level - a.level || a.title.localeCompare(b.title, "zh-Hant"));
}

function SkillGearPicker({ series, icons, build, onPick, onClose }: {
  series: Series[]; icons: Record<string, string>; build: Build; onPick: (slot: SlotId, key: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("");
  const [open, setOpen] = useState(true);
  const names = useMemo(() => [...new Set(series.flatMap((item) => [
    ...Object.values(item.skills).flat(), ...Object.values(item.weaponSkills ?? {}).flat(),
  ].map((entry) => entry.skill)))].sort((a, b) => a.localeCompare(b, "zh-Hant")), [series]);
  const matches = useMemo(() => gearForSkill(series, skill), [series, skill]);
  const weaponGroups = new Map<string, typeof matches>();
  for (const gear of matches.filter((gear) => gear.slot === "weapon")) {
    const key = gear.key.split("::")[0];
    const group = weaponGroups.get(key) ?? [];
    group.push(gear);
    weaponGroups.set(key, group);
  }
  const monsterIcon = (key: string) => <span title={series.find((item) => item.key === key)?.name}
    aria-hidden="true" className={cx("block shrink-0 w-9 h-9", BG_ICON)}
    style={icons[key] ? { backgroundImage: `url(${assetPath(icons[key])})` } : undefined}>{icons[key] ? null : "◇"}</span>;
  const gearCard = (gear: (typeof matches)[number]) => {
    const selected = build.gear[gear.slot] === gear.key;
    const icon = gear.slot === "weapon" ? WEAPON_ICON[gear.key.split("::")[1]] : ARMOR_ICON[gear.slot];
    const skills = Object.entries(skillsAtGrade(gear.entries, MAX_GRADE));
    return <button key={gear.key + gear.slot} aria-pressed={selected}
      aria-label={`${gear.title}：${skills.map(([name, level]) => `${name} ${level}`).join("、")}`}
      title={gear.title} onClick={() => onPick(gear.slot, gear.key)}
      className={cx("relative flex items-center gap-1.5 w-fit max-w-full min-h-11 px-2 py-1.5 text-left rounded-lg border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#099aa5]", selected ? "border-[#099aa5] bg-[#eaf7f4] ring-1 ring-inset ring-[#099aa5]" : "border-[#e3dac6] bg-[#fffaf0] hover:border-[#a89b7e]")}>
      {gear.slot !== "weapon" ? monsterIcon(gear.key) : null}
      <span aria-hidden="true" className={cx("shrink-0 w-6 h-6", BG_ICON)} style={{ backgroundImage: `url(${assetPath(icon)})` }} />
      <span className="min-w-0 text-[12px] leading-4 text-[#5b635c]">{skills.map(([name, level]) =>
        <span key={name} className={cx("block break-words", name === skill && "font-bold text-[#28352e]")}>{name} {level}</span>)}</span>
      {selected ? <span aria-hidden="true" className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#099aa5] text-white text-[10px]">✓</span> : null}
    </button>;
  };
  const filtered = names.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));
  return <FloatingPicker title={`依技能選裝備 · ${build.name || "未命名"}`} onClose={onClose}>
    <div className="h-full flex flex-col gap-2">
    <p className={cx(NOTE, "shrink-0 m-0")}>點選立即帶入，再點同一件即可取消，可連續選擇。相同部位會替換；技能等級以 G10 計算，不含漂流石。</p>
    <section className={cx("flex flex-col min-h-0 border border-[#e3dac6] rounded-lg", open && !skill ? "flex-1" : "shrink-0")}>
      <button aria-expanded={open} onClick={() => setOpen(!open)} className="shrink-0 flex items-center justify-between gap-2 w-full p-2 border-0 bg-[#fffaf0] rounded-lg text-[13px] font-bold text-left cursor-pointer">
        <span>技能{skill ? `：${skill}` : ""}</span>
        <span className={cx("inline-block [transition:transform_.15s]", open && "[transform:rotate(180deg)]")}>▾</span>
      </button>
      {open ? <div className="flex flex-col min-h-0 p-2 gap-2">
        <input aria-label="搜尋技能" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入技能名稱搜尋" className="block w-full box-border p-2 border border-[#d8d0bd] rounded-md shrink-0" />
        <div className={cx("flex flex-wrap content-start gap-1.5 overflow-auto min-h-0", skill && "max-h-[35cqh]")} aria-label="技能選擇">
          {filtered.map((name) => <button key={name} aria-pressed={skill === name} onClick={() => { setSkill(name); setOpen(false); }}
            className={cx("py-1 px-2 rounded-md border text-[12px] cursor-pointer", skill === name ? "bg-[#099aa5] text-white border-[#099aa5]" : "bg-white border-[#d8d0bd]")}>{name}</button>)}
          {!filtered.length ? <p className={NOTE}>找不到符合的技能。</p> : null}
        </div>
      </div> : null}
    </section>
    {skill ? <div className="flex-1 min-h-0 overflow-auto">
      <p className="text-[13px] font-bold mt-0">{skill} · {matches.length} 件裝備</p>
      <section className="my-2">
        <h3 className="text-[14px] mt-0 mb-2">武器</h3>
        <div className="flex flex-col gap-2">{[...weaponGroups].map(([key, gears]) =>
          <div key={key} className="flex items-start gap-2 border-b border-[#eee9df] pb-2 last:border-0">
            <div className="shrink-0 pt-1">{monsterIcon(key)}</div>
            <div className="min-w-0 flex-1 flex flex-wrap gap-1.5 p-1">{gears.map(gearCard)}</div>
          </div>)}</div>
        {!weaponGroups.size ? <p className={NOTE}>沒有這個技能的武器。</p> : null}
      </section>
      {ARMOR_SLOTS.map((slot) => <section key={slot} className="my-2">
        <h3 className="text-[14px] mt-0 mb-2">{SLOT_NAMES[slot]}</h3>
        <div className="flex flex-wrap gap-1.5 p-1">{matches.filter((gear) => gear.slot === slot).map(gearCard)}</div>
        {!matches.some((gear) => gear.slot === slot) ? <p className={NOTE}>此部位沒有這個技能的裝備。</p> : null}
      </section>)}
    </div> : !open ? <p className={NOTE}>選擇技能後，會列出武器與五個防具部位的裝備。</p> : null}
    <button onClick={onClose} className="shrink-0 w-full py-2 rounded-lg border-0 bg-[#28352e] text-white cursor-pointer">完成選擇</button>
    </div>
  </FloatingPicker>;
}

function PlannedGearView({ series, icons }: { series: Series[]; icons: Record<string, string> }) {
  const [plans, setPlans] = useState<PlannedGear[]>([]);
  const [restored, setRestored] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [mode, setMode] = useState<"monster" | "skill">("monster");
  const [monster, setMonster] = useState("");
  const [skill, setSkill] = useState("");
  const [query, setQuery] = useState("");
  const [display, setDisplay] = useState<"image" | "name">("image");
  const [details, setDetails] = useState<Record<string, GradeRow[]>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setPlans(parsePlannedGear(localStorage.getItem(PLANNED_GEAR_KEY))); }
    catch { setStorageError(true); }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try { localStorage.setItem(PLANNED_GEAR_KEY, JSON.stringify(plans)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [plans, restored]);
  const needed = [...new Set(plans.map((plan) => plan.series))].join(",");
  useEffect(() => {
    let cancelled = false;
    for (const key of needed ? needed.split(",") : []) {
      if (details[key] || failed[key]) continue;
      fetch(assetPath(`/mhnow/series/${key}.json`))
        .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
        .then((detail: SeriesDetail) => { if (!cancelled) setDetails((state) => ({ ...state, [key]: detail.armor ?? [] })); })
        .catch(() => { if (!cancelled) setFailed((state) => ({ ...state, [key]: true })); });
    }
    return () => { cancelled = true; };
  }, [needed, details, failed]);
  const armor = series.filter((item) => item.hasArmor);
  const names = [...new Set(armor.flatMap((item) => ARMOR_SLOTS.flatMap((slot) => seriesSkills(item, slot).map((entry) => entry.skill))))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const candidates = mode === "monster"
    ? armor.filter((item) => item.key === monster).flatMap((item) => ARMOR_SLOTS.map((slot) => ({ item, slot })))
    : ARMOR_SLOTS.flatMap((slot) => armor.filter((item) => (skillsAtGrade(seriesSkills(item, slot), MAX_GRADE)[skill] ?? 0) > 0).map((item) => ({ item, slot })));
  const identity = (item: Series, slot: ArmorSlot) => <div className="flex items-center gap-2 mb-2">
    {icons[item.key] ? <span aria-hidden="true" className={cx("block shrink-0 w-10 h-10", BG_ICON)} style={{ backgroundImage: `url(${assetPath(icons[item.key])})` }} /> : null}
    <span aria-hidden="true" className={cx("block shrink-0 w-6 h-6", BG_ICON)} style={{ backgroundImage: `url(${assetPath(ARMOR_ICON[slot])})` }} />
    <h3 className="m-0 text-[14px]">{item.name}・{SLOT_NAMES[slot]}</h3>
  </div>;
  return <section className="max-w-[1100px] mx-auto p-4 pb-8">
    <PageHeading eyebrow="CRAFTING PLAN" title="預計製作裝備" />
    <div className="p-3 rounded-xl border border-[#dfe2dc] bg-white">
      <div className="flex gap-2 mb-3">{(["monster", "skill"] as const).map((value) => <button key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setQuery(""); }} className={cx("rounded-lg border px-3 py-2 cursor-pointer", mode === value ? "bg-[#28352e] text-white border-[#28352e]" : "bg-white border-[#dfe2dc]")}>{value === "monster" ? "依魔物選擇" : "依技能選擇"}</button>)}</div>
      {!series.length ? <p className={NOTE}>資料載入中……</p> : mode === "monster"
        ? <MonsterPicker series={armor} value={monster} onPick={setMonster} icons={icons} display={display} onDisplay={setDisplay} query={query} onQuery={setQuery} />
        : <div className="grid gap-2">
          <input aria-label="搜尋防具技能" placeholder="輸入技能名稱搜尋" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full box-border p-2 rounded-md border border-[#d8d0bd]" />
          <label className="text-[13px]">技能<select value={skill} onChange={(event) => setSkill(event.target.value)} className="ml-2 max-w-full p-2 rounded-md border border-[#d8d0bd]">
            <option value="">請選擇技能</option>{names.filter((name) => name.includes(query.trim()) || name === skill).map((name) => <option key={name}>{name}</option>)}
          </select></label>
        </div>}
      {candidates.length ? <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-2 mt-3">{candidates.map(({ item, slot }) => {
        const selected = plans.some((plan) => plan.series === item.key && plan.slot === slot);
        return <article key={`${item.key}::${slot}`} className="p-3 rounded-lg border border-[#e3dac6] bg-[#fffaf0]">
          {identity(item, slot)}
          <SkillTiers entries={seriesSkills(item, slot)} slotGrades={item.slots?.[slot]} />
          <p className={cx(NOTE, "my-2")}>漂流石洞位：{item.slots?.[slot]?.length ?? 0}</p>
          <button disabled={selected || !restored} onClick={() => setPlans((state) => state.some((plan) => plan.series === item.key && plan.slot === slot) ? state : [...state, { series: item.key, slot, current: "unforged", target: "" }])} className="w-full py-2 rounded-md border border-[#099aa5] bg-white text-[#087b84] cursor-pointer disabled:opacity-50 disabled:cursor-default">{selected ? "✓ 已加入清單" : "＋ 加入製作清單"}</button>
        </article>;
      })}</div> : <p className={NOTE}>{mode === "monster" ? "選擇魔物後，會列出五個部位的防具。" : "選擇技能後，會列出具有該技能的防具（以 G10 計算）。"}</p>}
    </div>
    <h2 className="text-[17px] mt-5">製作清單 · {plans.length} 件</h2>
    {storageError ? <p role="alert" className="text-[13px] text-[#b23a30]">瀏覽器無法儲存製作清單，重新整理後可能遺失。</p> : null}
    {!plans.length ? <p className={NOTE}>從上方加入防具，再設定目前與目標階級。</p> : null}
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,310px),1fr))] items-start gap-3">{plans.map((plan) => {
      const item = series.find((entry) => entry.key === plan.series);
      const rows = details[plan.series];
      return <article key={`${plan.series}::${plan.slot}`} className="min-w-0 p-3 rounded-xl border border-[#dfe2dc] bg-white">
        <div className="flex items-start justify-between gap-2"><div>{item ? identity(item, plan.slot) : `${plan.series}・${SLOT_NAMES[plan.slot]}`}</div>
          <button aria-label={`移除${item?.name ?? plan.series}${SLOT_NAMES[plan.slot]}`} onClick={() => setPlans((state) => state.filter((entry) => entry.series !== plan.series || entry.slot !== plan.slot))} className="shrink-0 border-0 bg-transparent text-[#858d86] cursor-pointer p-1">✕</button></div>
        {item ? <div className="mb-3"><SkillTiers entries={seriesSkills(item, plan.slot)} slotGrades={item.slots?.[plan.slot]} /></div> : null}
        {failed[plan.series] ? <p className={NOTE}>升級資料載入失敗。<button onClick={() => setFailed((state) => ({ ...state, [plan.series]: false }))} className="underline cursor-pointer">重試</button></p>
          : !rows ? <p className={NOTE}>升級資料載入中……</p> : !rows.length ? <p className={NOTE}>這件防具沒有升級資料。</p>
          : <GradeRangeCost compact allowNone rows={rows} value={plan} onChange={(range) => setPlans((state) => state.map((entry) => entry.series === plan.series && entry.slot === plan.slot ? { ...entry, ...range } : entry))} />}
      </article>;
    })}</div>
  </section>;
}

export default function MhnowApp() {
  const [index, setIndex] = useState<SeriesIndex | null>(null);
  const [details, setDetails] = useState<Record<string, SeriesDetail>>({});
  const [failedDetails, setFailedDetails] = useState<Record<string, boolean>>({});
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [view, setView] = useState<"loadout" | "calculator" | "driftstone" | "planned">("loadout");
  const [driftstones, setDriftstones] = useState<Driftstones | null>(null);
  const [display, setDisplay] = useState<"image" | "name">("image");

  // 多組配裝（存 localStorage）。先用固定的預設畫出來，掛載後才讀存檔，免得伺服器與瀏覽器畫面不一致；
  // 讀完之前不寫回，不然會拿空白配裝蓋掉存檔。
  const [builds, setBuilds] = useState<BuildState>(initialBuildState);
  const [restored, setRestored] = useState(false);
  useEffect(() => { setBuilds(loadBuilds()); setRestored(true); }, []);
  useEffect(() => { if (restored) saveBuilds(builds); }, [builds, restored]);
  // 缺少素材統計的設定（另外存）；同樣等讀完存檔才寫回。
  const [stats, setStats] = useState<StatsSettings>(defaultStats);
  useEffect(() => { setStats(loadStats()); }, []);
  useEffect(() => { if (restored) saveStats(stats); }, [stats, restored]);
  const changeBuild = (id: string) => (update: (build: Build) => Build) => setBuilds((state) => updateBuild(state, id, update));

  // 正在選裝備／漂流石的是哪一組的哪一格；展開的裝備列 key 為「組 id:部位」。
  const [editing, setEditing] = useState<{ build: string; slot: SlotId } | null>(null);
  const [driftPick, setDriftPick] = useState<{ build: string; slot: ArmorSlot; index: number } | null>(null);
  const [pickSeries, setPickSeries] = useState(""); const [pickQuery, setPickQuery] = useState("");
  const [openTiers, setOpenTiers] = useState<Record<string, boolean>>({});
  const [skillTip, setSkillTip] = useState<{ name: string; level: number } | null>(null);
  const [skillGearBuild, setSkillGearBuild] = useState<string | null>(null);
  // 新增的那組要捲進畫面（組數多時會排到下面去）。
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(`build-${scrollTo}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setScrollTo(null);
  }, [scrollTo]);

  // 匯出／匯入：選了檔案先讀進 importing，再問要取代還是加在後面；結果（或錯誤）顯示在標題下一行。
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<{ state: BuildState; stats: StatsSettings | null } | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // 計算器
  const [calcSeries, setCalcSeries] = useState(""); const [calcKind, setCalcKind] = useState(""); const [calcQuery, setCalcQuery] = useState("");
  const [calcRange, setCalcRange] = useState<GradeRange>({ current: "unforged", target: "" });
  const [calcPickerOpen, setCalcPickerOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(assetPath("/mhnow/series-index.json")).then((response) => response.json()),
      fetch(assetPath("/mhnow/monster-icons.json")).then((response) => response.json()),
      fetch(assetPath("/mhnow/driftstones.json")).then((response) => response.json()),
    ]).then(([indexData, iconData, driftData]: [SeriesIndex, Record<string, string>, Driftstones]) => { setIndex(indexData); setIcons(iconData); setDriftstones(driftData); });
  }, []);

  const [seriesSort, setSeriesSort] = useState<SeriesSort>("name");
  const [sortRestored, setSortRestored] = useState(false);
  const [sortStorageError, setSortStorageError] = useState(false);
  useEffect(() => {
    try { setSeriesSort(parseSeriesSort(localStorage.getItem(SERIES_SORT_KEY))); } catch { setSortStorageError(true); }
    setSortRestored(true);
  }, []);
  useEffect(() => {
    if (!sortRestored) return;
    try { localStorage.setItem(SERIES_SORT_KEY, seriesSort); setSortStorageError(false); } catch { setSortStorageError(true); }
  }, [seriesSort, sortRestored]);
  const allSeries = useMemo(() => sortSeries(index?.series ?? [], seriesSort), [index, seriesSort]);
  const seriesBy = useMemo(() => Object.fromEntries(allSeries.map((item) => [item.key, item])), [allSeries]);
  const weaponTypeName = (type: string) => WEAPON_NAMES[type] ?? index?.weaponTypes[type] ?? type;
  const slotName = (slot: ArmorSlot) => SLOT_NAMES[slot] ?? index?.slots[slot] ?? slot;
  const loaded = index !== null;

  const weaponSeries = useMemo(() => allSeries.filter((item) => item.weaponTypes.length), [allSeries]);
  const armorSeries = useMemo(() => allSeries.filter((item) => item.hasArmor), [allSeries]);

  const rowsByBuild = Object.fromEntries(builds.builds.map((build) => [build.id, gearRowsOf(build, seriesBy, weaponTypeName, slotName)]));

  /** 統計區要算的裝備：勾選的配裝裡有設定目標階級的每一件。 */
  const statsPlan = stats.open ? builds.builds.filter((build) => !stats.excludedBuilds.includes(build.id)).flatMap((build) => rowsByBuild[build.id].flatMap((row) => {
    const piece = row.item ? pieceOf(build, row.id, row.itemKey) : undefined;
    return row.item && piece?.target ? [{ row, series: row.item.key, piece }] : [];
  })) : [];

  /** 升級素材只有計算器、展開的裝備列、要列缺少素材的裝備、統計區需要，用到哪個系列才抓哪個。 */
  const neededSeries = [...new Set(view === "calculator"
    ? (calcSeries ? [calcSeries] : [])
    : [...builds.builds.flatMap((build) => rowsByBuild[build.id].flatMap((row) => (row.item
      && (openTiers[`${build.id}:${row.id}`] || (build.showMissing && pieceOf(build, row.id, row.itemKey).target)) ? [row.item.key] : []))),
    ...statsPlan.map((entry) => entry.series)])].join(",");
  useEffect(() => {
    for (const key of neededSeries ? neededSeries.split(",") : []) {
      if (details[key] || failedDetails[key]) continue;
      fetch(assetPath(`/mhnow/series/${key}.json`))
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((detail: SeriesDetail) => setDetails((state) => ({ ...state, [detail.key]: detail })))
        .catch(() => setFailedDetails((state) => ({ ...state, [key]: true })));
    }
  }, [neededSeries, details, failedDetails]);
  /** 某系列某種類（armor 或武器種類）的升級表；undefined 表示還在載入。 */
  const gradeRowsFor = (key: string, kind: string): GradeRow[] | undefined => {
    if (failedDetails[key]) return [];
    const detail = details[key];
    if (!detail) return undefined;
    return (kind === "armor" ? detail.armor : detail.weapons?.[kind]) ?? [];
  };
  const cardContext: CardContext = { icons, skillLevels: index?.skillLevels ?? {}, driftstones, gradeRowsFor };
  const statsPieces = statsPlan.map(({ row, series, piece }) => ({ key: `${row.id}|${row.itemKey}`, rows: gradeRowsFor(series, row.kind), range: piece }));
  const statsTotal = totalMissing(statsPieces.flatMap((piece) => (piece.rows?.length ? [{ ...piece, rows: piece.rows }] : [])));
  const statsLoading = statsPieces.filter((piece) => !piece.rows).length;

  const editingBuild = editing ? builds.builds.find((build) => build.id === editing.build) : undefined;
  function editSlot(build: Build, slot: SlotId) {
    setEditing({ build: build.id, slot });
    setPickQuery("");
    setPickSeries(slot === "weapon" ? (build.gear.weapon ?? "").split("::")[0] : build.gear[slot] ?? "");
  }
  function pickGear(slot: SlotId, key: string) {
    if (!editing) return;
    changeBuild(editing.build)((build) => ({ ...build, gear: { ...build.gear, [slot]: key } }));
    setEditing(null);
  }
  function addNewBuild() {
    const next = addBuild(builds);
    if (next === builds) return;
    setBuilds(next);
    setScrollTo(next.active);
  }
  function exportBuilds() {
    const today = new Date();
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const url = URL.createObjectURL(new Blob([exportFile(builds, stats)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mhnow-配裝-${stamp}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function readImport(file: File) {
    const result = parseImport(await file.text());
    if ("error" in result) { setImportMessage(`匯入失敗：${result.error}`); return; }
    setImportMessage(null);
    setImporting(result);
  }
  function applyImport(mode: "replace" | "append") {
    if (!importing) return;
    if (mode === "replace") {
      setBuilds(importing.state);
      if (importing.stats) setStats(importing.stats);
      setOpenTiers({});
      setImportMessage(`已匯入 ${importing.state.builds.length} 組配裝，取代了原本的配裝。`);
    } else {
      const result = appendBuilds(builds, importing.state.builds);
      setBuilds(result.state);
      setImportMessage(`已加入 ${result.added} 組配裝${result.skipped ? `；超過 ${MAX_BUILDS} 組上限，另有 ${result.skipped} 組沒有匯入` : ""}。`);
    }
    setImporting(null);
  }
  function deleteBuild(build: Build) {
    if (window.confirm(`刪除「${build.name || "未命名"}」這組配裝？`)) setBuilds((state) => removeBuild(state, build.id));
  }

  // 計算器
  const calcRows = calcKind ? gradeRowsFor(calcSeries, calcKind) : undefined;

  const searchKey = calcQuery.trim().toLowerCase();
  const searchHits = searchKey
    ? allSeries.flatMap((item) => [
      ...(item.hasArmor ? [{ id: `${item.key}::armor`, title: `${item.name}防具`, subtitle: "五個部位共用素材表", icon: ARMOR_ICON.mail }] : []),
      ...item.weaponTypes.map((type) => ({ id: `${item.key}::${type}`, title: `${item.name}${weaponTypeName(type)}`, subtitle: "武器", icon: WEAPON_ICON[type] })),
    ]).filter((entry) => entry.title.toLowerCase().includes(searchKey)).slice(0, SEARCH_LIMIT)
    : [];

  function selectCalc(key: string, kind: string) { setCalcSeries(key); setCalcKind(kind); setCalcRange({ current: "unforged", target: "" }); }

  const picked = pickSeries ? seriesBy[pickSeries] : undefined;
  const full = builds.builds.length >= MAX_BUILDS;

  const navButton = (mode: typeof view, label: string) => <button onClick={() => setView(mode)}
    className={cx("border rounded-full py-2 px-6 cursor-pointer", view === mode ? "bg-[#17231d] text-white border-[#17231d]" : "bg-white border-[#d9d9d9]")}>{label}</button>;

  return <main className="min-h-screen bg-[#f4f3ee] text-[#222823]">
    <header className="h-[68px] px-[max(16px,calc((100vw_-_360px)/2))] grid grid-cols-[1fr_auto] items-center border-b border-[#d9ddd6] bg-[#fafaf7]">
      <span className="hidden" />
      <div className="text-left max-[720px]:hidden"><strong className="text-[17px]">MHNow 配裝工具</strong><span className="hidden">裝備與素材規劃</span></div>
      <a className="text-right text-[14px] text-[#687168]" href="" target="_blank" rel="noreferrer"> ↗</a>
    </header>
    <nav className="flex flex-wrap justify-center gap-2 p-3 border-b border-[#d9ddd6]">{navButton("loadout", "配裝")}{navButton("planned", "預計製作裝備")}{navButton("calculator", "素材計算器")}{navButton("driftstone", "漂流石")}</nav>

    <div className="flex flex-wrap justify-center items-center gap-2 px-4 py-2 text-[12px] text-[#687168]">
      <label className="flex items-center gap-2">魔物排序
        <select value={seriesSort} onChange={(event) => setSeriesSort(parseSeriesSort(event.target.value))} className="rounded-md border border-[#d8d0bd] bg-white p-2 text-[#28352e]">
          {Object.entries(SERIES_SORT_OPTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <span>套用至所有魔物選單</span>
      {seriesSort === "element" ? <span className="basis-full text-center">無屬性 → 火 → 水 → 雷 → 冰 → 龍 → 狀態異常 → 多屬性 → 無武器</span> : null}
      {sortStorageError ? <span role="status">無法儲存排序偏好。</span> : null}
    </div>
    {/* 所有配裝並排：每張卡固定 340px，放得下幾欄就幾欄；比 340px 窄（手機）就一欄滿版。
        標題列橫跨全部欄，左緣會跟第一張卡對齊。 */}
    {view === "loadout" ? <section className="my-4 px-4 pb-8 max-[620px]:pb-7 grid gap-3 items-start justify-center grid-cols-[repeat(auto-fill,minmax(min(100%,340px),340px))]">
      <div className="col-span-full flex items-center justify-between">
        <PageHeading eyebrow="LOADOUT" title="裝備配置" />
        <div className="flex items-center gap-2">
          <button title="把所有配裝存成 JSON 檔" onClick={exportBuilds}
            className="py-1 px-2.5 border rounded-md text-[12px] cursor-pointer bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]">匯出</button>
          <button title="從匯出的 JSON 檔讀回配裝" onClick={() => fileInput.current?.click()}
            className="py-1 px-2.5 border rounded-md text-[12px] cursor-pointer bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]">匯入</button>
          <input ref={fileInput} type="file" accept=".json,application/json" aria-label="選擇要匯入的配裝檔" className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readImport(file); }} />
          <button aria-pressed={stats.open} title="統計勾選的配裝還缺的素材" onClick={() => setStats((next) => ({ ...next, open: !next.open }))}
            className={cx("py-1 px-2.5 border rounded-md text-[12px] cursor-pointer", stats.open ? "bg-[#099aa5] border-[#099aa5] text-white" : "bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]")}>
            {stats.open ? "✓ " : ""}素材統計</button>
          <span className="text-[12px] text-[#8b938c] tabular-nums">{builds.builds.length} / {MAX_BUILDS} 組</span>
        </div>
      </div>
      {importMessage ? <p role="status" className={cx("col-span-full flex items-center justify-between gap-2 m-0 py-1.5 px-3 rounded-lg text-[13px]",
        importMessage.startsWith("匯入失敗") ? "bg-[#fff3ef] text-[#842e20] border border-[#e3b8b4]" : "bg-[#eef6ef] text-[#2f5e3a] border border-[#c9dccb]")}>
        <span>{importMessage}</span>
        <button aria-label="關閉訊息" onClick={() => setImportMessage(null)} className="border-0 bg-transparent p-0 text-[14px] text-inherit cursor-pointer opacity-70 hover:opacity-100">✕</button>
      </p> : null}
      {stats.open ? <MissingSummary builds={builds.builds} settings={stats} onChange={setStats} total={statsTotal} loading={statsLoading} monsterName={(key) => seriesBy[key]?.name ?? key} /> : null}

      {builds.builds.map((build) => <BuildCard key={build.id} build={build} rows={rowsByBuild[build.id]} ctx={cardContext}
        editingSlot={editing?.build === build.id ? editing.slot : null} open={(slot) => !!openTiers[`${build.id}:${slot}`]} canDelete={builds.builds.length > 1}
        onEdit={(slot) => editSlot(build, slot)} onToggle={(slot) => setOpenTiers((state) => ({ ...state, [`${build.id}:${slot}`]: !state[`${build.id}:${slot}`] }))}
        onDrift={(slot, position) => setDriftPick({ build: build.id, slot, index: position })} onSkill={(name, level) => setSkillTip({ name, level })}
        onSkillGear={() => setSkillGearBuild(build.id)} onChange={changeBuild(build.id)} onDelete={() => deleteBuild(build)} />)}

      <button aria-label="新增配裝" disabled={full} title={full ? `最多 ${MAX_BUILDS} 組` : "新增一組空白配裝"} onClick={addNewBuild}
        className="min-h-[120px] border border-dashed border-[#b5bbb5] rounded-xl bg-transparent text-[#5b635c] text-[14px] cursor-pointer hover:bg-[#ece8dc] disabled:cursor-default disabled:hover:bg-transparent">
        {full ? `已達上限 ${MAX_BUILDS} 組` : "＋ 新增配裝"}
      </button>

      {skillGearBuild ? builds.builds.filter((build) => build.id === skillGearBuild).map((build) => <SkillGearPicker key={build.id} series={allSeries} icons={icons} build={build}
        onClose={() => setSkillGearBuild(null)} onPick={(slot, key) => changeBuild(build.id)((next) => {
          const gear = { ...next.gear };
          if (gear[slot] === key) delete gear[slot];
          else gear[slot] = key;
          return { ...next, gear };
        })} />) : null}
      {editing && editingBuild ? <Modal title={editing.slot === "weapon" ? "選擇武器" : `選擇${slotName(editing.slot)}裝備`} onClose={() => setEditing(null)}>
        <MonsterPicker slot={editing.slot} series={editing.slot === "weapon" ? weaponSeries : armorSeries} value={pickSeries} icons={icons} display={display} onDisplay={setDisplay} query={pickQuery} onQuery={setPickQuery}
          onPick={(key) => { setPickSeries(key); if (editing.slot !== "weapon") pickGear(editing.slot, key); }} />
        {editing.slot === "weapon" ? <ChoiceGrid label="② 選擇武器" iconOnly value={editingBuild.gear.weapon ?? ""}
          onPick={(id) => pickGear("weapon", id)}
          items={ALL_WEAPON_TYPES.map((type) => ({
            id: picked ? `${picked.key}::${type}` : type,
            title: picked ? `${picked.name}${weaponTypeName(type)}` : weaponTypeName(type),
            icon: WEAPON_ICON[type],
            disabled: !picked || !picked.weaponTypes.includes(type),
          }))} /> : null}
      </Modal> : null}
    </section>

    : view === "planned" ? <PlannedGearView series={allSeries} icons={icons} />
    : view === "calculator" ? <section className={PAGE}>
      <PageHeading eyebrow="MATERIALS" title="素材計算器" description="選擇對象與階級區間，累計中間所有升級需要的素材與 Zenny。" />

      <section className="block mt-2.5 p-3.5 bg-white border border-[#dfe2dc] rounded-[10px]">
        {!loaded ? <p className={NOTE}>資料載入中……</p>
          : <button className="w-full flex-none flex justify-between items-center ml-0 py-3.5 px-4 text-left border border-[#28352e] bg-[#28352e] text-white rounded-lg text-[13px] cursor-pointer" onClick={() => { setCalcQuery(""); setCalcPickerOpen(true); }}>
              <span>{calcKind ? `${seriesBy[calcSeries]?.name}${calcKind === "armor" ? "防具" : weaponTypeName(calcKind)}` : "選擇魔物與防具／武器"}</span>
              <small className="font-normal opacity-75">{calcKind ? "點擊更換" : "點擊選擇"}</small>
            </button>}
      </section>

      {calcPickerOpen ? <Modal title="選擇對象" onClose={() => setCalcPickerOpen(false)}>
        <MonsterPicker series={allSeries} value={calcSeries} icons={icons} display={display} onDisplay={setDisplay} query={calcQuery} onQuery={setCalcQuery}
          onPick={(key) => { setCalcSeries(key); setCalcKind(""); setCalcQuery(""); setCalcRange({ current: "unforged", target: "" }); }} />
        {searchHits.length ? <ChoiceGrid label="搜尋結果" value={`${calcSeries}::${calcKind}`} items={searchHits}
          onPick={(id) => { const [key, kind] = id.split("::"); selectCalc(key, kind); setCalcQuery(""); setCalcPickerOpen(false); }} /> : null}
        {calcSeries && seriesBy[calcSeries] ? <ChoiceGrid label="② 選擇防具或武器種類" value={`${calcSeries}::${calcKind}`}
          onPick={(id) => { const [key, kind] = id.split("::"); selectCalc(key, kind); setCalcPickerOpen(false); }}
          items={[
            ...(seriesBy[calcSeries].hasArmor ? [{ id: `${calcSeries}::armor`, title: "防具", subtitle: "五個部位共用同一份素材表", icon: ARMOR_ICON.mail }] : []),
            ...seriesBy[calcSeries].weaponTypes.map((type) => ({ id: `${calcSeries}::${type}`, title: weaponTypeName(type), subtitle: "武器", icon: WEAPON_ICON[type] })),
          ]} /> : null}
        {!calcKind ? <p className={NOTE}>選一隻魔物，再選要算防具還是哪一種武器。</p> : null}
      </Modal> : null}

      {calcKind ? <section className="min-w-0">
        {!calcRows ? <p className={NOTE}>升級資料載入中……</p> : !calcRows.length ? <p className="m-8 p-5 border border-[#d78370] bg-[#fff3ef] text-[#842e20] rounded-[10px]">這個組合沒有升級資料。</p> : <>
          <div className="flex justify-between items-end pt-4 pb-6 px-0 border-b border-[#d9ddd6] max-[720px]:pt-[26px]"><div className="text-right">
            <span className="block text-[12px] tracking-[1.5px] text-[#8a928b]">{calcKind === "armor" ? "ARMOR" : "WEAPON"}</span>
            <h2 className="text-[34px] my-[7px] mx-0 max-[720px]:text-[28px]">{seriesBy[calcSeries]?.name}{calcKind === "armor" ? "防具" : weaponTypeName(calcKind)}</h2>
            <p className="text-[14px] text-[#747c75] m-0">{calcKind === "armor" ? "以下是單一部位所需素材，整套五件請再乘上件數。" : "以下是該武器由目前階級升到目標階級所需素材。"}</p>
          </div></div>
          <GradeRangeCost rows={calcRows} value={calcRange} onChange={setCalcRange} />
        </>}
      </section> : null}
    </section>

    : <section className={PAGE}>
      <PageHeading eyebrow="DRIFTSTONE" title="漂流石" description="選顏色看來源魔物、技能與出現機率。配裝頁點裝備列右邊的 ⬡ 可以替每個洞挑技能。" />
      <DriftstoneView data={driftstones} icons={icons} onSkill={(name) => setSkillTip({ name, level: 0 })} />
    </section>}

    {importing ? <Modal title="匯入配裝" narrow onClose={() => setImporting(null)}>
      <p className="mt-0 mb-2 text-[13px] text-[#2b332c]">檔案裡有 <b>{importing.state.builds.length}</b> 組配裝：</p>
      <p className="mt-0 mb-3 text-[12px] text-[#5b635c] leading-[1.6]">{importing.state.builds.slice(0, 8).map((build) => build.name || "（未命名）").join("、")}{importing.state.builds.length > 8 ? ` 等 ${importing.state.builds.length} 組` : ""}</p>
      <div className="flex flex-col gap-2">
        <button onClick={() => { if (window.confirm(`現在的 ${builds.builds.length} 組配裝會被清掉，確定要取代嗎？`)) applyImport("replace"); }}
          className="py-2 px-3 border border-[#e3b8b4] rounded-lg bg-white text-[#b23a30] text-[13px] text-left cursor-pointer hover:bg-[#fff3ef]">
          <b>取代全部</b><small className="block text-[11px] text-[#8b938c]">清掉現在的 {builds.builds.length} 組，換成檔案裡的</small></button>
        <button disabled={builds.builds.length >= MAX_BUILDS} onClick={() => applyImport("append")}
          className="py-2 px-3 border border-[#cfc7b4] rounded-lg bg-white text-[#2b332c] text-[13px] text-left cursor-pointer hover:border-[#9aa39b] disabled:cursor-default">
          <b>加在後面</b><small className="block text-[11px] text-[#8b938c]">{builds.builds.length >= MAX_BUILDS ? `已經有 ${MAX_BUILDS} 組，放不下了`
            : builds.builds.length + importing.state.builds.length > MAX_BUILDS ? `保留現在的，最多只能再加 ${MAX_BUILDS - builds.builds.length} 組` : "保留現在的配裝，檔案裡的接在後面"}</small></button>
      </div>
    </Modal> : null}

    {skillTip ? <Modal title={skillTip.name} narrow onClose={() => setSkillTip(null)}>
      {index?.skillLevels[skillTip.name]?.length ? <ol className="list-none m-0 p-0 flex flex-col gap-1">
        {index.skillLevels[skillTip.name].map((text, position) => { const current = position + 1 === Math.min(skillTip.level, index.skillLevels[skillTip.name].length); return <li key={position}
          className={cx("flex gap-2.5 py-[7px] px-2.5 rounded-md text-[13px] leading-[1.5]", current ? "bg-[#fff3dc] text-[#2b332c] shadow-[inset_3px_0_0_#f59a00]" : "text-[#5b635c]")}>
          <b className={cx("flex-[0_0_32px] font-bold", current ? "text-[#e08a00]" : "text-[#8b938c]")}>Lv{position + 1}</b><span>{text}</span>
        </li>; })}
      </ol> : <p className={NOTE}>這個技能沒有說明資料。</p>}
      {skillTip.level > (index?.skillLevels[skillTip.name]?.length ?? Infinity)
        ? <p className="mt-2.5 mx-0 mb-0 text-[12px] text-[#d23c3c]">目前合計 {skillTip.level} 級，超過上限 {index?.skillLevels[skillTip.name].length} 級，超出的等級不會生效。</p> : null}
    </Modal> : null}

    {driftPick && driftstones ? <Modal title={`選擇漂流石技能（${slotName(driftPick.slot)}　第 ${driftPick.index + 1} 洞）`} narrow onClose={() => setDriftPick(null)}>
      <DriftstonePicker data={driftstones} current={builds.builds.find((build) => build.id === driftPick.build)?.drifts[driftPick.slot]?.[driftPick.index] ?? null}
        onPick={(pick) => {
          changeBuild(driftPick.build)((build) => { const picks = [...(build.drifts[driftPick.slot] ?? [])]; picks[driftPick.index] = pick; return { ...build, drifts: { ...build.drifts, [driftPick.slot]: picks } }; });
          setDriftPick(null);
        }} />
      <p className={NOTE}>每個洞的漂流石提供 {DRIFT_LEVEL} 級（來源資料沒寫等級，先照此計算）。</p>
    </Modal> : null}
  </main>;
}
