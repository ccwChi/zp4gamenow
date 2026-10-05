"use client";

import { assetPath, dataPath } from "./assetPath";
import { SKILL_CELL, SkillGroups } from "./SkillGroups";
import { CLEAR_ON_CLOSE_KEY, DEFAULT_CLEAR_ON_CLOSE, FloatingPicker, parseClearOnClose, type ClearOnClose } from "./FloatingPicker";
import { RecommendPicker } from "./RecommendPicker";
import { moveBuild } from "./buildStore";
import { skillsAtGrade, type SeriesSkill } from "./skills";
import { automaticTarget, validCurrentGrade } from "./upgradeTarget";
import { PLANNED_GEAR_KEY, PLANNED_STATS_ID, plannedGearId, plannedMaterialKey, parsePlannedGear, type PlannedGear } from "./plannedGear";
import { DEFAULT_MATERIAL_DISCOUNT, MATERIAL_DISCOUNT_KEY, parseMaterialDiscount, serializeMaterialDiscount, waiveGatherMaterials } from "./materialDiscount";

import qrcode from "qrcode-generator";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SHARE_PARAM, decodeBuildShare, encodeBuildShare, shareUrl } from "./buildShare";
import { MAX_BUILDS, addBuild, appendBuilds, defaultStats, exportFile, parseImport, initialBuildState, loadBuilds, loadStats, saveStats, pieceOf, removeBuild, saveBuilds, setPiece, updateBuild, type Build, type BuildState, type DriftPick, type StatsSettings } from "./buildStore";

/** 資料由 scripts/build-mhnow-data.mjs 產生，原生繁體中文，不需要任何翻譯層。 */
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

export { skillsAtGrade };

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
  events: { key: string; label: string; skills: string[]; rare?: string[] }[];
};
/** 神秘漂流石同組有稀有也有普通技能時（例如【U】），標出稀有的；整組都稀有就不標。 */
const mixedRare = (group: Driftstones["events"][number], name: string) => !!group.rare && group.rare.length < group.skills.length && group.rare.includes(name);

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
/** 不滿版：整頁收成一欄固定寬度置中（仿 mhnow.me）；內容寬 360px（一組裝備的寬度），左右各留 16px（手機 8px）。 */
const PAGE = "max-w-[392px] mx-auto my-4 px-4 pt-0 pb-8 max-[620px]:my-3 max-[620px]:px-2 max-[620px]:pb-7";

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

/** slot：配裝時正在選的部位，給技能搜尋用；計算器不分部位就不傳，只搜名稱。value 給陣列就是複選（素材減免用）。 */
/** compact：圖片模式改成跟武器種類一樣大的小方塊（40px、自動換行），給建議配裝用。 */
function MonsterPicker({ series, value, onPick, icons, display, onDisplay, query, onQuery, slot, placeholder, compact }: {
  series: Series[]; value: string | string[]; onPick: (key: string) => void; icons: Record<string, string>;
  display: "image" | "name"; onDisplay: (next: "image" | "name") => void; query: string; onQuery: (next: string) => void; slot?: string; placeholder?: string; compact?: boolean;
}) {
  const small = compact && display === "image";
  const ranks = new Map(series.map((item, position) => [item.key, position]));
  const visible = searchSeries(series, query, slot).sort((a, b) => ranks.get(a.item.key)! - ranks.get(b.item.key)!);
  const modeButton = (mode: "image" | "name", label: string) => <button
    className={cx("border-0 py-[5px] px-3 rounded-[5px]", display === mode ? "bg-white text-[#253229] shadow-[0_1px_4px_#ccd1ca]" : "bg-transparent text-[#687168]")}
    onClick={() => onDisplay(mode)}>{label}</button>;
  return <div>
    <div className="flex items-center justify-between mb-[9px] text-[12px] text-[#687168] max-[620px]:flex-wrap max-[620px]:gap-2">
      <span>① 選擇魔物（{visible.length}）</span>
      <input aria-label="搜尋" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder ?? (slot ? "搜尋魔物、裝備或技能" : "搜尋魔物或裝備")}
        className="flex-1 min-w-0 mx-3 my-0 py-2 px-[11px] border border-[#dfe2dc] rounded-[7px] bg-[#f8f8f5] text-[13px] outline-none max-[620px]:order-3 max-[620px]:basis-full max-[620px]:m-0" />
      <div className="flex bg-[#eef0ed] rounded-md p-0.5">{modeButton("image", "圖片")}{modeButton("name", "名稱")}</div>
    </div>
    {visible.length ? <div className={small ? "flex flex-wrap gap-1 max-h-[220px] overflow-auto content-start" : cx("grid gap-1 h-[290px] max-h-[290px] overflow-auto content-start max-[760px]:h-[250px] max-[760px]:max-h-[250px]",
      display === "image" ? "grid-cols-[repeat(auto-fill,minmax(82px,1fr))] max-[760px]:grid-cols-[repeat(auto-fill,minmax(72px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(96px,1fr))]")}>
      {visible.map(({ item, skill }) => { const active = Array.isArray(value) ? value.includes(item.key) : value === item.key; return <button key={item.key}
        title={skill ? `${item.name}（${skill.name} ${skill.level}）` : item.name} aria-pressed={Array.isArray(value) ? active : undefined} onClick={() => onPick(item.key)}
        className={cx("min-w-0 p-[5px] border rounded-[7px] flex flex-col items-center justify-center text-[#2e3731] cursor-pointer",
          small ? "w-10 h-10 p-0.5 overflow-hidden" : display === "name" ? "min-h-[42px]" : "min-h-[50px]",
          active ?"border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900]" : "border-[#e3e6e1] bg-[#f1f2ef]")}>
        {display === "image" && icons[item.key] ? <span className={cx(small ? "w-8 h-8" : "w-[52px] h-[52px]", BG_ICON)} style={{ backgroundImage: `url(${assetPath(icons[item.key])})` }} />
          : <span className={cx("font-bold text-center break-keep", small ? "text-[10px] leading-[1.1]" : "text-[12px] leading-[1.3]")}>{item.name}</span>}
        {display === "name" ? <small className="block max-w-full truncate text-[8px] text-[#777]">{`G${item.unlock} 起`}</small> : null}
        {skill ? <small className="block max-w-full truncate text-[10px] font-bold text-[#e08a00]">{skill.name} {skill.level}</small> : null}
      </button>; })}
    </div> : <p className={NOTE}>找不到符合的魔物。</p>}
  </div>;
}

/** QR Code（qrcode-generator 算模組，自己畫成 SVG 路徑）；只在螢幕上顯示、不會髒污，容錯用最低的 L，格子才大、好掃。 */
function QrCode({ text, size = 260 }: { text: string; size?: number }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, "L");
    qr.addData(text);
    qr.make();
    const modules = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    return { count: modules, path: d };
  }, [text]);
  // 四周留 2 格白邊，掃描才認得出邊界。
  return <svg role="img" aria-label="分享用 QR Code" width={size} height={size} viewBox={`-2 -2 ${count + 4} ${count + 4}`} shapeRendering="crispEdges" className="block max-w-full h-auto bg-white">
    <path d={path} fill="#17231d" />
  </svg>;
}

/** 複製到剪貼簿；不支援（非 https、權限被擋）時回傳 false，讓呼叫端提示手動複製。 */
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** narrow：技能說明、漂流石這類內容少的視窗用窄版。 */
function Modal({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: ReactNode; narrow?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="fixed inset-0 bg-[rgba(20,26,20,.45)] flex items-center justify-center p-5 max-[620px]:p-2 z-50" onClick={onClose}>
    <div className={cx("bg-white rounded-xl w-full max-h-[86vh] flex flex-col overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,.25)]", narrow ? "max-w-[360px]" : "max-w-[760px]")} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between py-3.5 px-[18px] max-[620px]:py-2.5 max-[620px]:px-3 border-b border-[#e5e7e2] flex-none">
        <strong className="text-[15px]">{title}</strong>
        <button aria-label="關閉" onClick={onClose} className="border-0 bg-[#f0f1ed] rounded-full w-7 h-7 text-[14px] leading-none cursor-pointer text-[#4b5d50]">✕</button>
      </div>
      <div className="overflow-auto py-3.5 px-[18px] max-[620px]:py-2.5 max-[620px]:px-3">{children}</div>
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

/** 建議配裝用的武器選擇：先點武器種類圖示，再點有這種武器的魔物圖示。換種類時，原本的魔物也有這種武器就直接沿用。 */
function WeaponChooser({ series, icons, value, onPick }: { series: Series[]; icons: Record<string, string>; value: string; onPick: (weapon: string) => void }) {
  const [currentKey, currentType] = value.split("::");
  const [type, setType] = useState(currentType ?? "");
  const [query, setQuery] = useState("");
  const [display, setDisplay] = useState<"image" | "name">("image");
  return <>
    <div role="group" aria-label="武器種類" className="flex flex-wrap gap-1 mb-2">
      {ALL_WEAPON_TYPES.map((option) => { const on = type === option; return <button key={option} aria-pressed={on} title={WEAPON_NAMES[option]} aria-label={WEAPON_NAMES[option]}
        onClick={() => {
          setType(option);
          if (currentKey && series.find((item) => item.key === currentKey)?.weaponTypes.includes(option)) onPick(`${currentKey}::${option}`);
        }}
        className={cx("w-10 h-10 rounded border flex items-center justify-center cursor-pointer", on ? "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900]" : "border-[#e3e6e1] bg-white")}>
        <span aria-hidden="true" className={cx("block w-7 h-7", BG_ICON)} style={{ backgroundImage: `url(${assetPath(WEAPON_ICON[option])})` }} />
      </button>; })}
    </div>
    {type ? <MonsterPicker series={series.filter((item) => item.weaponTypes.includes(type))} value={currentType === type ? currentKey : ""} icons={icons} compact
      display={display} onDisplay={setDisplay} query={query} onQuery={setQuery} onPick={(key) => onPick(`${key}::${type}`)} />
      : <p className={cx(NOTE, "m-0")}>先點上面的武器種類。</p>}
  </>;
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
  const skillButton = (name: string, rare = false, cell = false) => <button key={name} onClick={() => onPick({ skill: name, color: tab })}
    className={cx("inline-flex items-center gap-1 py-1.5 px-2.5 border rounded-lg text-[#2b332c] text-[13px] cursor-pointer", cell && SKILL_CELL,
      current?.skill === name && driftColor(current, data) === tab ? "border-[#e08a00] bg-[#fff3dc]" : "border-[#e3dac6] bg-[#fffaf0] hover:border-[#c9bd9f]")}>
    {name}{rare ? <em className="not-italic text-[#e08a00] text-[12px]">★</em> : null}
  </button>;
  return <div>
    <DriftTabs tabs={[...data.colors.map((item) => ({ key: item.key, label: item.label })), { key: "common", label: "共通" }, { key: "event", label: "神秘" }]} value={tab} onChange={setTab} />
    <div className="flex flex-wrap gap-1.5">
      {/* 六色與共通依技能分類列出；神秘漂流石本來就依活動分組，維持原樣。 */}
      {color ? <SkillGroups names={color.skills.map((skill) => skill.name)} renderSkill={(name) => skillButton(name, color.skills.find((skill) => skill.name === name)?.rare, true)} /> : null}
      {tab === "common" ? <SkillGroups names={data.common} renderSkill={(name) => skillButton(name, false, true)} /> : null}
      {tab === "event" ? data.events.map((group) => <div key={group.key} className="flex-[0_0_100%] flex flex-wrap gap-1.5 items-center">
        <small className="flex-[0_0_100%] mt-1.5 text-[#8b938c] text-[11px]">{group.label}</small>{group.skills.map((name) => skillButton(name, mixedRare(group, name)))}
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
      <span className="flex flex-wrap gap-x-3 gap-y-0">{group.skills.map((name) => <span key={name}>{skillName(name)}{mixedRare(group, name) ? <em className="not-italic text-[#e08a00] text-[12px]">★</em> : null}</span>)}</span>
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
  // 「配裝」「素材」是左欄，tag 在右欄換行，每一行的 tag 都從同一個位置開始。
  const label = "py-1 text-[12px] leading-[18px] text-[#8b938c]";
  const tags = "min-w-0 flex flex-wrap items-center gap-1.5";
  return <section className="col-span-full flex flex-col gap-2 p-3 max-[620px]:p-2 rounded-xl bg-[#fffaf0] border border-[#e3dac6]">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <strong className="text-[15px] text-[#2b332c]">缺少素材統計</strong>
      <span className="text-[12px] text-[#6d756e]">{total.pieces} 件裝備　Zenny <b className="text-[14px] text-[#e08a00] tabular-nums">{total.zenny.toLocaleString()}</b></span>
    </div>
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-2"><span className={label}>配裝</span><div className={tags}>
      {builds.map((build) => { const on = !settings.excludedBuilds.includes(build.id); return <button key={build.id} aria-pressed={on} title={build.name}
        onClick={() => onChange((next) => ({ ...next, excludedBuilds: toggle(next.excludedBuilds, build.id) }))} className={chip(on)}>
        <span className="truncate">{build.name || "（未命名）"}</span></button>; })}
    </div>
    {present.length ? <><span className={label}>素材</span><div className={tags}>
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
    </div></> : null}
    </div>
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

function GradeRangeCost({ rows, value, onChange, compact, allowNone, targetForCurrent }: { rows: GradeRow[]; value: GradeRange; onChange: (next: GradeRange) => void; compact?: boolean; allowNone?: boolean; targetForCurrent?: (current: string) => string }) {
  const currentIndex = value.current === "unforged" ? -1 : rows.findIndex((row) => row.grade === value.current);
  const target = resolveTarget(rows, value, allowNone);
  const total = calculateRange(rows, value.current, target);
  const steps = rowsInRange(rows, value.current, target);
  const hasUnknown = total.materials.some((item) => item.unknown);
  function changeCurrent(next: string) {
    const nextIndex = next === "unforged" ? -1 : rows.findIndex((row) => row.grade === next);
    // 目前階級升到目標（含）之後：配裝回到「不升級」，計算器則把目標推到下一階。
    const passed = rows.findIndex((row) => row.grade === target) <= nextIndex;
    onChange({ current: next, target: targetForCurrent ? targetForCurrent(next) : !passed ? target : allowNone ? "" : rows[nextIndex + 1]?.grade ?? "" });
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
function MissingMaterials({ rows, range, waived }: { rows: GradeRow[] | undefined; range: GradeRange; waived?: boolean }) {
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
      <span>缺少素材　{range.current === "unforged" ? "尚未生產" : range.current} → {target}{waived ? <b className="ml-1.5 font-normal text-[#087b84]">減免中</b> : null}</span>
      <span>Zenny <b className="text-[12px] text-[#e08a00] tabular-nums">{total.zenny.toLocaleString()}</b></span>
    </p>
    {total.materials.map((item) => <p key={item.name} className="flex justify-between items-center m-0 py-px leading-[1.5]">
      <span className="flex items-center flex-wrap">{item.rare ? <Rare rare={item.rare} /> : null}{item.name}</span>
      <b className="tabular-nums whitespace-nowrap">× {item.quantity}</b>
    </p>)}
  </div>;
}

/** BuildCard 需要的共用資料（每張卡都一樣）。gradeRowsFor 已套用素材減免；discounted 是減免中的魔物。 */
type CardContext = { icons: Record<string, string>; skillLevels: Record<string, string[]>; driftstones: Driftstones | null; gradeRowsFor: (key: string, kind: string) => GradeRow[] | undefined; discounted: string[] };

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
function SortableBuild({ id, name, children, onMove, onStep }: {
  id: string; name: string; children: ReactNode;
  onMove: (target: string, side: "before" | "after") => void; onStep: (direction: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [drop, setDrop] = useState<{ id: string; side: "before" | "after"; x: number; y: number; width: number; height: number } | null>(null);
  return <div data-sort-build={id} className={cx("min-w-0 rounded-xl", dragging && "opacity-70 ring-2 ring-[#099aa5]")}>
    <button aria-label={`移動${name}`} title="拖曳移動配裝；也可聚焦後按方向鍵前後移動"
      className="w-full border-0 bg-transparent text-[#687168] text-[12px] py-1 cursor-grab active:cursor-grabbing touch-none select-none focus-visible:outline-[#099aa5]"
      onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
          event.preventDefault(); onStep(event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
        }
      }}
      onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); setDrop(null); }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        if (event.clientY < 60) window.scrollBy(0, -20);
        else if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 20);
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sort-build]");
        if (!target || target.dataset.sortBuild === id) { setDrop(null); return; }
        const rect = target.getBoundingClientRect();
        const columns = getComputedStyle(target.parentElement!).gridTemplateColumns.split(" ").length;
        const before = columns > 1 ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
        setDrop({ id: target.dataset.sortBuild!, side: before ? "before" : "after", x: columns > 1 ? (before ? rect.left : rect.right) : rect.left, y: columns > 1 ? rect.top : (before ? rect.top : rect.bottom), width: columns > 1 ? 3 : rect.width, height: columns > 1 ? rect.height : 3 });
      }}
      onPointerUp={(event) => { if (drop) onMove(drop.id, drop.side); setDragging(false); setDrop(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { setDragging(false); setDrop(null); }}
      onLostPointerCapture={() => { setDragging(false); setDrop(null); }}
    >⠿ 拖曳排序</button>
    {children}
    {drop ? <span aria-hidden="true" className="fixed z-50 pointer-events-none bg-[#099aa5] rounded" style={{ left: drop.x, top: drop.y, width: drop.width, height: drop.height }} /> : null}
  </div>;
}

function CurrentGradeInput({ value, title, onCommit }: { value: string; title: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value === "unforged" ? "" : value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(value === "unforged" ? "" : value); setInvalid(false); }, [value]);
  function commit() {
    const next = draft.trim();
    if (next && !validCurrentGrade(next)) { setInvalid(true); return; }
    setInvalid(false);
    setDraft(next);
    onCommit(next || "unforged");
  }
  return <input aria-label={`${title}目前等級`} aria-invalid={invalid} value={draft} placeholder="未設定"
    title={invalid ? "請輸入 2-1 到 10-5，例如 6-1" : "目前等級：2-1 到 10-5；Enter 或離開欄位儲存，清空表示尚未生產"}
    onChange={(event) => { setDraft(event.target.value); setInvalid(false); }} onBlur={commit}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(value === "unforged" ? "" : value); setInvalid(false); } }}
    className={cx("w-12 box-border rounded border bg-white px-0.5 py-0.5 text-center text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-[#099aa5]", invalid ? "border-red-500 text-red-700" : "border-[#d8d0bd] text-[#28352e]")} />;
}

function BuildCard({ build, rows, ctx, editingSlot, open, canDelete, onEdit, onToggle, onDrift, onSkill, onSkillGear, onChange, onDelete, onShare }: {
  build: Build; rows: GearRow[]; ctx: CardContext; editingSlot: SlotId | null; open: (slot: SlotId) => boolean; canDelete: boolean;
  onEdit: (slot: SlotId) => void; onToggle: (slot: SlotId) => void; onDrift: (slot: ArmorSlot, index: number) => void; onSkill: (name: string, level: number) => void;
  onChange: (update: (build: Build) => Build) => void; onDelete: () => void; onSkillGear: () => void; onShare: () => void;
}) {
  const skills = maxSkillsOf(build, rows);
  const stones = driftStonesBySkill(build, rows, ctx.driftstones);
  const anyStone = Object.keys(stones).length > 0;
  const h4 = (first?: boolean) => cx("mb-1.5 mx-0 text-[12px] text-[#6d756e] font-bold", first ? "mt-1 pt-0" : "mt-3 pt-2.5 [border-top:1px_dashed_#e8dfcb]");
  const toolButton = "flex-none py-1 px-2 border rounded-md text-[12px] cursor-pointer";
  return <article id={`build-${build.id}`} className="min-w-0 flex flex-col gap-1.5 p-2 max-[620px]:p-1.5 rounded-xl bg-[#ece8dc] border border-[#d8d0bd]">
    <div className="flex items-center gap-1.5">
      <input aria-label="配裝名稱" value={build.name} maxLength={20} placeholder="配裝名稱" onChange={(event) => { const name = event.target.value; onChange((next) => ({ ...next, name })); }}
        className="flex-1 min-w-0 py-1 px-2 border border-[#d8d0bd] rounded-md bg-white text-[13px] font-bold text-[#2b332c] outline-none focus:border-[#099aa5]" />
      <button aria-pressed={build.showMissing} title="有設定目標階級的裝備，都在下方列出還缺的素材" onClick={() => onChange((next) => ({ ...next, showMissing: !next.showMissing }))}
        className={cx(toolButton, build.showMissing ? "bg-[#099aa5] border-[#099aa5] text-white" : "bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]")}>{build.showMissing ? "✓ " : ""}顯示缺少素材</button>
      <button title="產生分享碼與 QR Code，別人貼上就能加入這組配裝" onClick={onShare}
        className={cx(toolButton, "bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]")}>分享</button>
      <button disabled={!canDelete} title={canDelete ? "刪除這組配裝" : "至少要留一組"} onClick={onDelete}
        className={cx(toolButton, "border-[#e3b8b4] bg-white text-[#b23a30]")}>刪除</button>
    </div>

    <button onClick={onSkillGear} className="py-2 px-3 rounded-lg border border-[#099aa5] bg-white text-[#087b84] text-[13px] cursor-pointer">依技能選全身裝備</button>
    {rows.map((row) => {
      const isOpen = open(row.id);
      const piece = pieceOf(build, row.id, row.itemKey);
      const gradeRows = row.item ? ctx.gradeRowsFor(row.item.key, row.kind) : undefined;
      const waived = row.id === "weapon" && !!row.item && ctx.discounted.includes(row.item.key);
      const drifts = build.drifts[row.id] ?? [];
      return <div key={row.id}
        className={cx("relative flex flex-wrap items-stretch bg-[#fffaf0] border rounded-[10px] overflow-hidden",
          editingSlot === row.id ? "border-[#099aa5] shadow-[0_0_0_2px_rgba(9,154,165,.25)]" : "border-[#e3dac6] hover:border-[#c9bd9f]")}>
        <div className="shrink-0 flex flex-col items-center justify-center gap-1 pl-2 py-1.5">
          {row.item ? <CurrentGradeInput key={row.itemKey} value={piece.current} title={row.title} onCommit={(current) => {
            if (current === piece.current) return;
            onChange((next) => setPiece(next, row.id, { item: row.itemKey, current, target: automaticTarget(row.id, row.entries, current, row.item?.unlock) }));
          }} /> : null}
          <button aria-label={`選擇${row.title}`} onClick={() => onEdit(row.id)} className="w-10 h-10 border-0 rounded-lg bg-[#ebe6d9] grid place-items-center cursor-pointer">
            <span className={cx("w-[26px] h-[26px] flex-[0_0_26px]", BG_ICON, !row.item && "opacity-[.45]")} style={{ backgroundImage: `url(${assetPath(row.icon)})` }} />
          </button>
        </div>
        <button className="flex-1 min-w-0 flex items-center gap-2 py-1.5 px-2 border-0 bg-transparent text-left cursor-pointer text-[#2b332c]" title={row.title} onClick={() => onEdit(row.id)}>
          {row.item ? <>
            {ctx.icons[row.item.key] ? <span className={cx("flex-[0_0_38px] h-[38px]", BG_ICON)} style={{ backgroundImage: `url(${assetPath(ctx.icons[row.item.key])})` }} /> : null}
            <span className="min-w-0 flex flex-col gap-0.5">
              <strong className="text-[14px] font-bold truncate">{row.title}</strong>
              <small className={cx(GEAR_SMALL, "text-[#5b635c]")}>{Object.entries(skillsAtGrade(row.entries, MAX_GRADE)).map(([name, level]) => <span key={name}>{name} <b className="text-[#e08a00] font-bold">{level}</b></span>)}</small>
              {drifts.slice(0, row.slotGrades.length).some(Boolean) ? <small className={cx(GEAR_SMALL, "text-[#5b635c]")}>{drifts.slice(0, row.slotGrades.length).map((pick, position) => pick
                ? <span key={position} className="inline-flex items-center gap-[3px]"><DriftHex color={driftColor(pick, ctx.driftstones)} size={11} />{pick.skill}</span> : null)}</small> : null}
              {row.traits && !row.itemKey.endsWith("::insect-glaive") ? <TraitSummary traits={row.traits} /> : null}
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
          {waived ? <p className={cx(NOTE, "mt-0 mb-1.5 text-[#087b84]")}>素材減免中：不計採集素材與尖爪。</p> : null}
          {!gradeRows ? <p className={NOTE}>升級資料載入中……</p>
            : !gradeRows.length ? <p className={NOTE}>這件裝備沒有升級資料。</p>
              : <GradeRangeCost compact allowNone rows={gradeRows} value={piece} targetForCurrent={(current) => automaticTarget(row.id, row.entries, current, Number(gradeRows[0].grade.split("-")[0]))}
                onChange={(range) => onChange((next) => setPiece(next, row.id, { ...pieceOf(next, row.id, row.itemKey), ...range }))} />}
        </div> : null}
        {row.item && !isOpen && build.showMissing ? <MissingMaterials rows={gradeRows} range={piece} waived={waived} /> : null}
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
function traitSearchText(traits?: WeaponTraits): string {
  const strings = (value: unknown): string[] => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
  return strings(traits).join(" ").toLowerCase();
}

/**
 * 依技能找裝備。skill 給陣列就是複選：有其中任何一個技能就列出，level 是選中技能的等級加總（排序用）。
 * freeText：skill 當成輸入的文字，比對技能名稱、武器特色（與 includeNames 時的魔物名稱）。
 */
/** 搜尋文字拆成好幾個詞（空白、半形或全形逗號分隔），任一個詞符合就算（OR）。 */
export function searchTerms(text: string): string[] {
  return text.toLowerCase().split(/[\s,，]+/).filter(Boolean);
}

export function gearForSkill(series: Series[], skill: string | string[], freeText = false, includeNames = false) {
  const skills = Array.isArray(skill) ? skill : [skill];
  const terms = Array.isArray(skill) ? [] : searchTerms(skill);
  const hit = (text: string) => terms.some((term) => text.includes(term));
  const byName = (key: string) => includeNames && !!series.find((item) => item.key === key.split("::")[0] && hit(`${item.key} ${item.name}`.toLowerCase()));
  return series.flatMap((item) => [
    ...(item.hasArmor ? ARMOR_SLOTS.map((slot) => ({ slot, key: item.key, title: `${item.name}${SLOT_NAMES[slot]}`, entries: seriesSkills(item, slot), traits: undefined as WeaponTraits | undefined })) : []),
    ...item.weaponTypes.map((type) => ({ slot: "weapon" as const, key: `${item.key}::${type}`, title: `${item.name}${WEAPON_NAMES[type] ?? type}`, entries: seriesSkills(item, "weapon", type), traits: item.traits[type] })),
  ]).map((gear) => { const levels = skillsAtGrade(gear.entries, MAX_GRADE); return { ...gear, level: skills.reduce((sum, name) => sum + (levels[name] ?? 0), 0) }; })
    .filter((gear) => freeText ? Object.keys(skillsAtGrade(gear.entries, MAX_GRADE)).some((name) => hit(name.toLowerCase())) || hit(traitSearchText(gear.traits)) || byName(gear.key) : gear.level > 0)
    .sort((a, b) => b.level - a.level || a.title.localeCompare(b.title, "zh-Hant"));
}

function SkillGearPicker({ series, icons, build, onPick, onClose, visible, clearOnClose, onClearOnClose, onClear }: {
  series: Series[]; icons: Record<string, string>; build: Build; onPick: (slot: SlotId, key: string) => void; onClose: () => void;
  visible: boolean; clearOnClose: boolean; onClearOnClose: (next: boolean) => void; onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  // 技能、武器類型、防具部位都可以複選。
  const [chosen, setChosen] = useState<string[]>([]);
  const [open, setOpen] = useState(true);
  const [weaponsOpen, setWeaponsOpen] = useState(true);
  const names = useMemo(() => [...new Set(series.flatMap((item) => [
    ...Object.values(item.skills).flat(), ...Object.values(item.weaponSkills ?? {}).flat(),
  ].map((entry) => entry.skill)))].sort((a, b) => a.localeCompare(b, "zh-Hant")), [series]);
  // 有輸入文字就照文字搜（技能、武器特色、魔物名稱）；沒輸入就列出有任一個選中技能的裝備。
  const typed = query.trim();
  const search = typed || chosen.join("、");
  // 搜尋範圍：全部／只找武器／只找防具（預設只找防具）；weaponFilter 是再挑的武器種類，沒選就是全部種類。
  const [scope, setScope] = useState<"all" | "weapon" | "armor">("armor");
  const [weaponFilter, setWeaponFilter] = useState<string[]>([]);
  const matches = useMemo(() => gearForSkill(series, typed || chosen, !!typed, true).filter((gear) => gear.slot === "weapon"
    ? scope !== "armor" && (!weaponFilter.length || weaponFilter.includes(gear.key.split("::")[1]))
    : scope !== "weapon"), [series, typed, chosen, scope, weaponFilter]);
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
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
    const kinsect = gear.key.endsWith("::insect-glaive") ? gear.traits?.kinsect ?? [] : [];
    return <button key={gear.key + gear.slot} aria-pressed={selected}
      aria-label={`${gear.title}：${[...skills.map(([name, level]) => `${name} ${level}`), ...kinsect.map((stat) => `${stat.label}：${stat.value}`)].join("、")}`}
      title={gear.title} onClick={() => onPick(gear.slot, gear.key)}
      className={cx("relative flex items-center gap-1.5 w-fit max-w-full min-h-11 px-2 py-1.5 text-left rounded-lg border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#099aa5]", selected ? "border-[#099aa5] bg-[#eaf7f4] ring-1 ring-inset ring-[#099aa5]" : "border-[#e3dac6] bg-[#fffaf0] hover:border-[#a89b7e]")}>
      {gear.slot !== "weapon" ? monsterIcon(gear.key) : null}
      <span aria-hidden="true" className={cx("shrink-0 w-6 h-6", BG_ICON)} style={{ backgroundImage: `url(${assetPath(icon)})` }} />
      <span className="min-w-0 text-[12px] leading-4 text-[#5b635c]">{skills.map(([name, level]) =>
        <span key={name} className={cx("block break-words", chosen.includes(name) && "font-bold text-[#28352e]")}>{name} {level}</span>)}
        {gear.traits ? <span className="block mt-1 pt-1 border-t border-[#e3dac6]"><TraitDetail traits={gear.traits} /></span> : null}
      </span>
      {selected ? <span aria-hidden="true" className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#099aa5] text-white text-[10px]">✓</span> : null}
    </button>;
  };
  const terms = searchTerms(query);
  const filtered = terms.length ? names.filter((name) => terms.some((term) => name.toLowerCase().includes(term))) : names;
  return <FloatingPicker title={`依技能選裝備 · ${build.name || "未命名"}`} onClose={onClose} open={visible} clearOnClose={clearOnClose} onClearOnClose={onClearOnClose} onClear={onClear}>
    <div className="h-full flex flex-col gap-2">
    <section className={cx("flex flex-col min-h-0 border border-[#e3dac6] rounded-lg", open && !search ? "flex-1" : "shrink-0")}>
      <div className="shrink-0 flex items-center gap-2 bg-[#fffaf0] rounded-lg">
        <button aria-expanded={open} onClick={() => setOpen(!open)} className="flex-1 min-w-0 flex items-center justify-between gap-2 p-2 border-0 bg-transparent text-[13px] font-bold text-left cursor-pointer">
          <span className="truncate">技能{chosen.length ? `：${chosen.join("、")}` : ""}</span>
          <span className={cx("inline-block [transition:transform_.15s]", open && "[transform:rotate(180deg)]")}>▾</span>
        </button>
        {chosen.length ? <button onClick={() => setChosen([])} className="shrink-0 mr-2 border-0 bg-transparent p-0 text-[12px] text-[#099aa5] cursor-pointer hover:underline">清除</button> : null}
      </div>
      {open ? <div className="flex flex-col min-h-0 p-2 gap-2">
        <input aria-label="搜尋魔物、裝備、技能或武器特色" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋魔物、技能或武器特色；多個關鍵字用空白或逗號隔開，例如：粉塵 擴散" className="block w-full box-border p-2 border border-[#d8d0bd] rounded-md shrink-0" />
        {/* 同一列：「全」「找武器」「找防具」三選一，接著各武器種類（可複選，沒選就是全部種類）。
            在「找防具」時點武器種類，會自動切到「找武器」。 */}
        <div role="group" aria-label="搜尋範圍與武器種類" className="flex flex-wrap gap-1 shrink-0">
          {([["all", "全"], ["weapon", "找武器"], ["armor", "找防具"]] as const).map(([value, label]) => { const on = scope === value; return <button key={value} aria-pressed={on}
            onClick={() => { setScope(value); if (value !== "weapon") setWeaponFilter([]); }}
            className={cx("h-9 min-w-9 px-2 rounded border flex items-center justify-center text-[12px] font-bold cursor-pointer", on ? "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900] text-[#2b332c]" : "border-[#e3e6e1] bg-white text-[#5b635c]")}>{label}</button>; })}
          {Object.entries(WEAPON_NAMES).map(([type, name]) => { const on = weaponFilter.includes(type); return <button key={type} aria-pressed={on} aria-label={name} title={name}
            onClick={() => { setWeaponFilter(toggle(weaponFilter, type)); if (scope === "armor") setScope("weapon"); }}
            className={cx("rounded border w-9 h-9 flex items-center justify-center cursor-pointer", on ? "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900]" : "border-[#e3e6e1] bg-white")}>
            <span aria-hidden="true" className={cx("block w-6 h-6", BG_ICON)} style={{ backgroundImage: `url(${assetPath(WEAPON_ICON[type])})` }} /></button>; })}
        </div>
        <div className={cx("overflow-auto min-h-0", search && "max-h-[20cqh]")} role="group" aria-label="技能選擇（可複選）">
          <SkillGroups names={filtered} searching={terms.length > 0} renderSkill={(name) => { const on = chosen.includes(name); return <button key={name} aria-pressed={on} onClick={() => { setChosen(toggle(chosen, name)); setQuery(""); }}
            className={cx(SKILL_CELL, "py-1 px-2 rounded-md border text-[12px] cursor-pointer", on ? "bg-[#099aa5] text-white border-[#099aa5]" : "bg-white border-[#d8d0bd]")}>{name}</button>; }} />
        </div>
      </div> : null}
    </section>
    {search ? <div className="flex-1 min-h-0 overflow-auto">
      <p className="text-[13px] font-bold mt-0">{search} · {matches.length} 件裝備</p>
      {scope !== "armor" ? <section className="my-2">
        <button aria-expanded={weaponsOpen} onClick={() => setWeaponsOpen(!weaponsOpen)}
          className="flex items-center justify-between gap-2 w-full mb-2 py-1.5 px-2.5 rounded-lg border border-[#bfe1de] bg-[#eef8f7] text-[14px] font-bold text-left text-[#1f4f4c] cursor-pointer hover:bg-[#e2f3f1]">
          <span>武器 <small className="font-normal text-[12px] text-[#5b7a77]">{weaponGroups.size} 隻魔物・{matches.filter((gear) => gear.slot === "weapon").length} 件</small></span>
          <span className="flex items-center gap-1.5 shrink-0 font-normal text-[12px] text-[#087b84]">{weaponsOpen ? "點擊即可收合" : "點擊即可展開"}
            <span aria-hidden="true" className={cx("inline-block text-[14px] [transition:transform_.15s]", weaponsOpen && "[transform:rotate(180deg)]")}>▾</span></span>
        </button>
        {weaponsOpen ? <>
          <div className="flex flex-col gap-2">{[...weaponGroups].map(([key, gears]) =>
            <div key={key} className="flex items-start gap-2 border-b border-[#eee9df] pb-2 last:border-0">
              <div className="shrink-0 pt-1">{monsterIcon(key)}</div>
              <div className="min-w-0 flex-1 flex flex-wrap gap-1.5 p-1">{gears.map(gearCard)}</div>
            </div>)}</div>
          {!weaponGroups.size ? <p className={NOTE}>沒有符合的武器。</p> : null}
        </> : null}
      </section> : null}
      {scope !== "weapon" ? ARMOR_SLOTS.map((slot) => <section key={slot} className="my-2">
        <h3 className="text-[14px] mt-0 mb-2">{SLOT_NAMES[slot]}</h3>
        <div className="flex flex-wrap gap-1.5 p-1">{matches.filter((gear) => gear.slot === slot).map(gearCard)}</div>
        {!matches.some((gear) => gear.slot === slot) ? <p className={NOTE}>此部位沒有這個技能的裝備。</p> : null}
      </section>) : null}
    </div> : null}
    <button onClick={onClose} className="shrink-0 w-full py-2 rounded-lg border-0 bg-[#28352e] text-white cursor-pointer">完成選擇</button>
    </div>
  </FloatingPicker>;
}

function PlannedGradeInput({ label, caption, value, empty, rows, current, onCommit }: {
  label: string; caption: string; value: string; empty: string; rows?: GradeRow[]; current?: string; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value === empty ? "" : value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(value === empty ? "" : value); setInvalid(false); }, [value, empty]);
  const commit = () => {
    const next = draft.trim() || empty;
    const index = rows?.findIndex((row) => row.grade === next) ?? -1;
    const currentIndex = rows?.findIndex((row) => row.grade === current) ?? -1;
    if (next !== empty && (index < 0 || (current !== undefined && index <= currentIndex))) { setInvalid(true); return; }
    setInvalid(false);
    if (next !== value) onCommit(next);
  };
  return <label className="min-w-0 text-[9px] text-[#858d86]"><span className="sr-only">{caption}</span><input aria-label={label} aria-invalid={invalid} disabled={!rows?.length} value={draft} placeholder={empty ? "未製作" : "不升級"}
    title={invalid ? "請輸入有效階級，例如 6-1；目標須高於目前階級" : label}
    onChange={(event) => { setDraft(event.target.value); setInvalid(false); }} onBlur={commit}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(value === empty ? "" : value); setInvalid(false); } }}
    className={cx("block w-full min-w-0 h-[19px] box-border px-1 py-0 text-center text-[11px] tabular-nums rounded border bg-white/80 text-[#28352e] outline-none focus:outline-none focus:ring-0 focus:shadow-none transition-colors placeholder:text-[#93998f] disabled:opacity-50", invalid ? "border-red-500" : "border-[#e3dfd2] hover:border-[#b7c5bc] focus:border-[#829c8c] focus:bg-white")} /></label>;
}

function PlannedGearPanel({ series, plans, onChange, ctx, included, onIncluded, ready, storageError }: {
  series: Series[]; plans: PlannedGear[]; onChange: (plans: PlannedGear[]) => void; ctx: CardContext;
  included: boolean; onIncluded: (value: boolean) => void; ready: boolean; storageError: boolean;
}) {
  const [picker, setPicker] = useState(false);
  const [pickerKind, setPickerKind] = useState<"weapon" | "armor">("weapon");
  const [monster, setMonster] = useState("");
  const [weaponFilter, setWeaponFilter] = useState("");
  const [query, setQuery] = useState("");
  const [display, setDisplay] = useState<"image" | "name">("image");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [materialMonster, setMaterialMonster] = useState<string | null>(null);
  const entriesFor = (plan: PlannedGear) => {
    const item = series.find((entry) => entry.key === plan.series);
    return item ? seriesSkills(item, plan.slot, plan.weaponType) : [];
  };
  // 單一搜尋框：魔物名稱在上方圖示格篩選；技能與武器特色命中的裝備併入下方清單，跟選中魔物的裝備一起顯示。
  const monsterGear: PlannedGear[] = series.filter((item) => item.key === monster).flatMap((item) => [
    ...item.weaponTypes.map((weaponType): PlannedGear => ({ series: item.key, slot: "weapon", weaponType, current: "unforged", target: "10-5" })),
    ...(item.hasArmor ? ARMOR_SLOTS.map((slot): PlannedGear => ({ series: item.key, slot, current: "unforged", target: automaticTarget(slot, seriesSkills(item, slot), "unforged", item.unlock) })) : []),
  ]);
  const searchGear: PlannedGear[] = gearForSkill(series, query, true).map((gear) => {
    const [key, weaponType] = gear.key.split("::");
    return { series: key, slot: gear.slot, ...(weaponType ? { weaponType } : {}), current: "unforged", target: automaticTarget(gear.slot, gear.entries, "unforged", series.find((item) => item.key === key)?.unlock) };
  });
  const seen = new Set<string>();
  const candidates = [...monsterGear, ...searchGear].filter((plan) => { const id = plannedGearId(plan); if (seen.has(id)) return false; seen.add(id); return true; });
  const titleOf = (plan: PlannedGear) => `${series.find((item) => item.key === plan.series)?.name ?? plan.series}・${plan.slot === "weapon" ? WEAPON_NAMES[plan.weaponType ?? ""] ?? plan.weaponType : SLOT_NAMES[plan.slot]}`;
  const icon = (plan: PlannedGear) => <span aria-hidden="true" className={cx("block shrink-0 w-6 h-6", BG_ICON)} style={{ backgroundImage: `url(${assetPath(plan.slot === "weapon" ? WEAPON_ICON[plan.weaponType ?? ""] : ARMOR_ICON[plan.slot])})` }} />;
  const skills = (plan: PlannedGear) => <span className="block text-[11px] text-[#566154] leading-[1.5]">{Object.entries(skillsAtGrade(entriesFor(plan), MAX_GRADE)).map(([name, level]) => <span key={name} className="block">{name} <b className="font-semibold text-[#957039] tabular-nums">{level}</b></span>)}{!entriesFor(plan).length ? "無技能" : null}{plan.slot !== "weapon" ? <span className="block mt-0.5 text-[10px] text-[#929c8d]" title="漂流石洞位">◇ {series.find((item) => item.key === plan.series)?.slots?.[plan.slot]?.length ?? 0}</span> : null}</span>;
  const update = (plan: PlannedGear, range: GradeRange) => onChange(plans.map((entry) => plannedGearId(entry) === plannedGearId(plan) ? { ...entry, ...range } : entry));
  const renderRow = (plan: PlannedGear) => {
    const id = plannedGearId(plan);
    const rows = ctx.gradeRowsFor(plan.series, plan.slot === "weapon" ? plan.weaponType! : "armor");
    const waived = plan.slot === "weapon" && ctx.discounted.includes(plan.series);
    return <div key={id} className={cx("group relative flex box-border rounded-lg border p-2 transition-[background-color,border-color,box-shadow] duration-150", plan.slot === "weapon" ? "w-full min-w-0 items-center gap-2 pr-7" : "w-[132px] h-[var(--plan-card-height)] flex-col", expanded[id] ? "border-[#91b4a4] bg-[#eef5ef] shadow-[0_0_0_1px_#dbe8dc]" : plan.included === false ? "border-[#e2e5de] bg-[#f4f5f1] hover:border-[#b8c7bd]" : "border-[#e3dfd1] bg-[#fffdf7] shadow-[0_1px_2px_rgba(48,63,39,.04)] hover:border-[#afc1ae] hover:shadow-[0_2px_6px_rgba(48,63,39,.09)]")}>
      <button type="button" aria-label={`${titleOf(plan)}詳細內容`} aria-expanded={!!expanded[id]} aria-controls={`planned-detail-${id}`}
        onClick={() => setExpanded({ [id]: true })}
        className="absolute inset-0 w-full h-full border-0 rounded-lg bg-transparent cursor-pointer focus-visible:outline-2 focus-visible:outline-[#829c8c] focus-visible:outline-offset-1" />
      <div className={cx("relative pointer-events-none flex items-center gap-1.5", plan.slot === "weapon" ? "w-[88px] shrink-0" : "mb-1.5")} title={titleOf(plan)}>
        <div className="shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-md bg-[#eceee4] min-h-8">
          {plan.slot === "weapon" && ctx.icons[plan.series] ? <span className={cx("block w-5 h-5", BG_ICON)} style={{ backgroundImage: `url(${assetPath(ctx.icons[plan.series])})` }} /> : null}
          {icon(plan)}
        </div>
        <div className="relative pointer-events-auto min-w-0 flex-1 grid gap-0.5">
        <PlannedGradeInput label={`${titleOf(plan)}目前`} caption="目前" value={plan.current} empty="unforged" rows={rows}
          onCommit={(current) => update(plan, { current, target: automaticTarget(plan.slot, entriesFor(plan), current, Number(rows?.[0]?.grade.split("-")[0] ?? 2)) })} />
        <PlannedGradeInput label={`${titleOf(plan)}目標`} caption="目標" value={plan.target} empty="" rows={rows} current={plan.current}
          onCommit={(target) => update(plan, { current: plan.current, target })} />
        </div>
      </div>
      <div className={cx("relative pointer-events-none min-w-0 flex-1 break-words", plan.slot !== "weapon" && "mt-0.5 mb-1.5")}>{plan.slot === "weapon" ? <strong className="block text-[12px] font-semibold text-[#40543d] mb-0.5">{titleOf(plan)}</strong> : null}{skills(plan)}
        {waived ? <span className="inline-block mt-1 rounded px-1 bg-[#e4f1e9] text-[9px] text-[#4d7b62]">素材減免</span> : null}
      </div>
      <label className={cx("relative flex w-fit shrink-0 items-center gap-1 text-[9px] text-[#73816f] cursor-pointer", plan.slot === "weapon" ? "flex-col sm:flex-row" : "pt-1 border-t border-[#e9ece2] pr-2")} title="納入全部素材統計">
        <input type="checkbox" className="m-0 w-3 h-3 accent-[#648b72]" checked={plan.included !== false} onChange={(event) => onChange(plans.map((entry) => plannedGearId(entry) === id ? { ...entry, included: event.target.checked } : entry))} />納入統計
      </label>
      <button aria-label={`移除${titleOf(plan)}`} title="移除裝備" onClick={() => onChange(plans.filter((entry) => plannedGearId(entry) !== id))} className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded border-0 bg-transparent text-[10px] text-[#a3a89e] hover:bg-[#fbe9e3] hover:text-[#b15d4b] cursor-pointer">✕</button>
    </div>;
  };
  const armorKeys = [...new Set(plans.filter((plan) => plan.slot !== "weapon").map((plan) => plan.series))];
  // Reserve the same height for every card, including empty slots. Long skill names wrap fully.
  const cardHeight = Math.max(148, ...plans.filter((plan) => plan.slot !== "weapon").map((plan) => {
    const lines = Object.entries(skillsAtGrade(entriesFor(plan), MAX_GRADE)).reduce((count, [name, level]) => {
      const textWidth = Array.from(`${name} ${level}`).reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 11 : 6), 0);
      return count + Math.ceil(textWidth / 112);
    }, 0);
    return 104 + Math.max(1, lines) * 17;
  }));
  const openPicker = (kind: "weapon" | "armor") => { setPickerKind(kind); setPicker(true); setQuery(""); };
  const addArmor = (key: string, slot: ArmorSlot) => {
    const item = series.find((entry) => entry.key === key);
    if (!item || plans.some((plan) => plan.series === key && plan.slot === slot)) return;
    onChange([...plans, { series: key, slot, current: "unforged", target: automaticTarget(slot, seriesSkills(item, slot), "unforged", item.unlock) }]);
  };
  return <section style={{ "--plan-card-height": `${cardHeight}px` } as React.CSSProperties} className="col-span-full justify-self-start box-border w-full max-w-[340px] min-[724px]:max-w-[692px] min-w-0 rounded-2xl p-3 border border-[#d8dfcf] bg-[linear-gradient(135deg,#f5f6ef,#edf1e7)] shadow-[0_2px_8px_rgba(40,56,35,.04)]">
    <div className="flex flex-wrap items-center gap-2 pb-2.5 mb-2.5 border-b border-[#dce3d4]">
      <span aria-hidden="true" className="w-1 h-5 rounded-full bg-[#68836a]" />
      <h2 className="text-[14px] font-semibold tracking-wide text-[#344a38] m-0">待製作裝備</h2>
      <span className="rounded-full bg-[#e2e9da] px-2 py-0.5 text-[10px] font-semibold text-[#657a5d] tabular-nums">{plans.length} 件</span>
      <label className={cx("ml-auto text-[11px] flex items-center gap-1.5 rounded-full border px-2.5 py-1 cursor-pointer transition-colors", included ? "border-[#cfddca] bg-[#e8f0e2] text-[#53704c]" : "border-[#dce1d5] bg-white/60 text-[#939b8b]")}><input type="checkbox" className="m-0 w-3 h-3 accent-[#648b72]" checked={included} onChange={(event) => onIncluded(event.target.checked)} />納入素材總統計</label>
    </div>
    <section className="mb-3"><h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-[#687a5f] m-0 mb-1.5">武器<span className="text-[10px] font-normal text-[#9aa58e]">{plans.filter((plan) => plan.slot === "weapon").length}</span></h3>
      <div className="flex flex-col gap-1.5 w-full max-w-[692px]">
        {plans.filter((plan) => plan.slot === "weapon").map(renderRow)}
        <button disabled={!ready} onClick={() => openPicker("weapon")} className="w-full max-w-[692px] min-h-10 box-border px-3 py-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#c5d0bd] bg-white/30 text-[10px] text-[#88977b] hover:bg-white/80 hover:border-[#91a781] hover:text-[#526e48] transition-colors cursor-pointer"><span aria-hidden="true" className="text-xl font-light leading-5">＋</span>武器</button>
      </div>
    </section>
    <section><h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-[#687a5f] m-0 mb-1.5">防具<span className="text-[10px] font-normal text-[#9aa58e]">{plans.filter((plan) => plan.slot !== "weapon").length}</span></h3>
      <div className="flex flex-wrap items-start gap-1.5">
        {armorKeys.map((key) => <div key={key} className="w-fit max-w-full min-w-0 rounded-xl border border-[#dfe5d7] p-1.5 bg-white/75 shadow-[0_1px_2px_rgba(48,63,39,.03)]">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#526353] mb-1.5 pb-1 border-b border-[#edf0e7]"><span className={cx("block w-6 h-6", BG_ICON)} style={ctx.icons[key] ? { backgroundImage: `url(${assetPath(ctx.icons[key])})` } : undefined} />{series.find((item) => item.key === key)?.name ?? key}
            <button onClick={() => setMaterialMonster(key)} className="ml-auto border border-[#e0e7d8] rounded-full bg-[#f2f6ed] text-[#627b55] px-2 py-0.5 text-[10px] hover:bg-[#e5eddc] hover:border-[#bacaad] transition-colors cursor-pointer">全部素材</button>
          </div>
          <div className="overflow-x-auto"><div className="grid grid-cols-[repeat(5,132px)] gap-1 w-max items-start">
            {ARMOR_SLOTS.map((slot) => {
              const plan = plans.find((entry) => entry.series === key && entry.slot === slot);
              return plan ? renderRow(plan) : <button key={slot} disabled={!ready} aria-label={`加入${series.find((item) => item.key === key)?.name ?? key}${SLOT_NAMES[slot]}`} onClick={() => addArmor(key, slot)} className="h-[var(--plan-card-height)] box-border p-2 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#d7ded4] bg-[#f8faf6] text-[10px] text-[#99a293] hover:border-[#9aaf9f] hover:bg-[#eef4eb] transition-colors cursor-pointer">
                <span className={cx("block w-5 h-5 opacity-40", BG_ICON)} style={{ backgroundImage: `url(${assetPath(ARMOR_ICON[slot])})` }} />＋ {SLOT_NAMES[slot]}
              </button>;
            })}
          </div></div>
        </div>)}
        <div className="basis-full h-0" aria-hidden="true" />
        <button disabled={!ready} onClick={() => openPicker("armor")} className="w-full max-w-[692px] min-h-10 box-border px-3 py-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#c5d0bd] bg-white/30 text-[10px] text-[#88977b] hover:bg-white/80 hover:border-[#91a781] hover:text-[#526e48] transition-colors cursor-pointer"><span aria-hidden="true" className="text-xl font-light leading-5">＋</span>魔物防具</button>
      </div>
    </section>
    {plans.filter((plan) => expanded[plannedGearId(plan)]).map((plan) => <Modal key={plannedGearId(plan)} title={`${titleOf(plan)} · 詳細內容`} onClose={() => setExpanded({})}><div id={`planned-detail-${plannedGearId(plan)}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><h4 className="text-[11px] text-[#7b887c] mt-0 mb-1">技能與洞位變化</h4>
          <SkillTiers entries={entriesFor(plan)} slotGrades={plan.slot === "weapon" ? [] : series.find((item) => item.key === plan.series)?.slots?.[plan.slot]} />
          {plan.slot === "weapon" && series.find((item) => item.key === plan.series)?.traits[plan.weaponType!] ? <div className="mt-2"><TraitDetail traits={series.find((item) => item.key === plan.series)!.traits[plan.weaponType!]} /></div> : null}
        </div>
        <div><h4 className="text-[11px] text-[#7b887c] mt-0 mb-1">升級素材 · {plan.current === "unforged" ? "未製作" : plan.current} → {plan.target || "不升級"}</h4>
      <MissingMaterials rows={ctx.gradeRowsFor(plan.series, plan.slot === "weapon" ? plan.weaponType! : "armor")} range={plan} waived={plan.slot === "weapon" && ctx.discounted.includes(plan.series)} />
        </div>
      </div>
    </div></Modal>)}
    {materialMonster ? <Modal title={`${series.find((item) => item.key === materialMonster)?.name ?? materialMonster} · 全部素材`} onClose={() => setMaterialMonster(null)}>
      {(() => {
        const items = plans.filter((plan) => plan.series === materialMonster);
        const pieces = items.map((plan) => ({ key: plannedMaterialKey(plan), rows: ctx.gradeRowsFor(plan.series, plan.slot === "weapon" ? plan.weaponType! : "armor"), range: plan }));
        const pending = pieces.some((piece) => !piece.rows);
        const failed = pieces.some((piece) => piece.rows?.length === 0);
        const total = totalMissing(pieces.flatMap((piece) => piece.rows?.length ? [{ ...piece, rows: piece.rows }] : []));
        return <>
          <h3 className="text-[13px] mt-0">合併需求 · {total.pieces} 件 · Zenny {total.zenny.toLocaleString()}</h3>
          <p className={NOTE}>此處列出這隻魔物所有待製作裝備；各件的勾選只控制是否納入頁面上的素材總統計。</p>
          {pending || failed ? <p role="status" className={NOTE}>{pending ? "部分資料載入中，合計尚未完整。" : "部分升級資料無法取得，合計尚未完整。"}</p> : null}
          <div className="grid gap-1 sm:grid-cols-2">{total.materials.map((item) => <div key={item.name} className="flex justify-between gap-2 text-[12px] bg-[#f4f5ef] rounded px-2 py-1"><span>{item.name}</span><b>× {item.quantity.toLocaleString()}</b></div>)}</div>
          {items.map((plan) => <section key={plannedGearId(plan)} className="border-t border-[#e3e6dc] mt-3 pt-2"><h4 className="text-[12px] my-1">{titleOf(plan)} · {plan.current === "unforged" ? "未製作" : plan.current} → {plan.target || "不升級"}</h4><MissingMaterials rows={ctx.gradeRowsFor(plan.series, plan.slot === "weapon" ? plan.weaponType! : "armor")} range={plan} waived={plan.slot === "weapon" && ctx.discounted.includes(plan.series)} /></section>)}
        </>;
      })()}
    </Modal> : null}
    {storageError ? <p role="alert" className="text-[12px] text-red-700">無法儲存待製作裝備，重新整理後可能遺失。</p> : null}
    {picker ? <Modal title="加入待製作裝備" onClose={() => setPicker(false)}>
      {pickerKind === "weapon" ? <div role="group" aria-label="武器類型" className="flex flex-wrap gap-1 mb-2">
        {[["", "全部武器"], ...Object.entries(WEAPON_NAMES)].map(([type, name]) => <button key={type} aria-pressed={weaponFilter === type} aria-label={name} title={name} onClick={() => setWeaponFilter(type)}
          className={cx("rounded border w-9 h-9 flex items-center justify-center text-[11px] font-bold cursor-pointer", weaponFilter === type ? "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900]" : "border-[#e3e6e1] bg-white")}>
          {type ? <span aria-hidden="true" className={cx("block w-6 h-6", BG_ICON)} style={{ backgroundImage: `url(${assetPath(WEAPON_ICON[type])})` }} /> : "全"}</button>)}
      </div> : null}
      <MonsterPicker series={series.filter((item) => pickerKind === "weapon" ? (weaponFilter ? item.weaponTypes.includes(weaponFilter) : item.weaponTypes.length) : item.hasArmor)} value={monster} onPick={setMonster} icons={ctx.icons} display={display} onDisplay={setDisplay} query={query} onQuery={setQuery} placeholder="搜尋魔物、裝備、技能或武器特色" />
      <div className="grid gap-2 mt-2 sm:grid-cols-2">{candidates.filter((plan) => pickerKind === "weapon" ? plan.slot === "weapon" && (!weaponFilter || plan.weaponType === weaponFilter) : plan.slot !== "weapon").map((plan) => {
        const selected = plans.some((entry) => plannedGearId(entry) === plannedGearId(plan));
        return <button key={plannedGearId(plan)} disabled={selected || !ready} onClick={() => { onChange([...plans, plan]); if (pickerKind === "weapon") setPicker(false); }} className="border border-[#e3dac6] rounded bg-[#fffaf0] p-2 text-left cursor-pointer disabled:opacity-50">
          <span className="flex items-center gap-1 text-[12px] font-bold">{icon(plan)}{titleOf(plan)}{selected ? " ✓" : " ＋"}</span>
          {(() => { const traits = plan.slot === "weapon" ? series.find((item) => item.key === plan.series)?.traits[plan.weaponType!] : undefined; return traits ? <div className="my-1 pb-1 border-b border-[#efe6d2]"><TraitDetail traits={traits} /></div> : null; })()}
          <SkillTiers entries={entriesFor(plan)} slotGrades={plan.slot === "weapon" ? [] : series.find((item) => item.key === plan.series)?.slots?.[plan.slot]} />
        </button>;
      })}</div>
      {!candidates.length ? <p className={NOTE}>選擇魔物，或輸入技能、武器特色以加入裝備。</p> : null}
    </Modal> : null}
  </section>;
}

export default function MhnowApp() {
  const [index, setIndex] = useState<SeriesIndex | null>(null);
  const [details, setDetails] = useState<Record<string, SeriesDetail>>({});
  const [failedDetails, setFailedDetails] = useState<Record<string, boolean>>({});
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [view, setView] = useState<"loadout" | "calculator" | "driftstone">("loadout");
  const [plans, setPlans] = useState<PlannedGear[]>([]);
  const [plansRestored, setPlansRestored] = useState(false);
  const [plansStorageError, setPlansStorageError] = useState(false);
  useEffect(() => {
    try { setPlans(parsePlannedGear(localStorage.getItem(PLANNED_GEAR_KEY))); } catch { setPlansStorageError(true); }
    setPlansRestored(true);
  }, []);
  useEffect(() => {
    if (!plansRestored) return;
    try { localStorage.setItem(PLANNED_GEAR_KEY, JSON.stringify(plans)); setPlansStorageError(false); } catch { setPlansStorageError(true); }
  }, [plans, plansRestored]);
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
  // 「依技能選全身裝備」與「建議配裝」：關閉只是藏起來，選擇與結果留著；勾了「關閉即清除資料」才在關閉時卸載清掉。
  // skillGearBuild／recommendMounted 是有沒有掛著，skillGearOpen／recommendOpen 是有沒有顯示。
  const [skillGearBuild, setSkillGearBuild] = useState<string | null>(null);
  const [skillGearOpen, setSkillGearOpen] = useState(false);
  const [recommendMounted, setRecommendMounted] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [clearOnClose, setClearOnClose] = useState<ClearOnClose>(DEFAULT_CLEAR_ON_CLOSE);
  const [clearRestored, setClearRestored] = useState(false);
  // 按「清除」就換一個 key，讓視窗內容重新掛載回到空白（視窗本身不關）。
  const [recommendReset, setRecommendReset] = useState(0);
  const [skillGearReset, setSkillGearReset] = useState(0);
  useEffect(() => {
    try { setClearOnClose(parseClearOnClose(localStorage.getItem(CLEAR_ON_CLOSE_KEY))); } catch { /* 讀不到就用預設（不清除） */ }
    setClearRestored(true);
  }, []);
  useEffect(() => {
    if (!clearRestored) return;
    try { localStorage.setItem(CLEAR_ON_CLOSE_KEY, JSON.stringify(clearOnClose)); } catch { /* 存不了就只在這次有效 */ }
  }, [clearOnClose, clearRestored]);
  function closeSkillGear() {
    setSkillGearOpen(false);
    if (clearOnClose.skillGear) setSkillGearBuild(null);
  }
  function closeRecommend() {
    setRecommendOpen(false);
    if (clearOnClose.recommend) setRecommendMounted(false);
  }
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

  // 分享單組配裝：sharing 是正在分享的配裝 id；receiving 是貼上（或從網址帶進來）的文字，解析後確認才加入。
  const [sharing, setSharing] = useState<string | null>(null);
  const [copied, setCopied] = useState<"" | "code" | "link" | "fail">("");
  const [receiving, setReceiving] = useState<string | null>(null);
  // 打開分享網址（…#share=MHN1.xxx）時，等存檔讀完再跳出確認，加入後把 hash 清掉，重新整理才不會再問一次。
  useEffect(() => {
    if (!restored) return;
    const check = () => {
      if (!window.location.hash.includes(`${SHARE_PARAM}=`)) return;
      setReceiving(window.location.hash);
      setView("loadout");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [restored]);

  // 計算器
  const [calcSeries, setCalcSeries] = useState(""); const [calcKind, setCalcKind] = useState(""); const [calcQuery, setCalcQuery] = useState("");
  const [calcRange, setCalcRange] = useState<GradeRange>({ current: "unforged", target: "" });
  const [calcPickerOpen, setCalcPickerOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(dataPath("/mhnow/series-index.json")).then((response) => response.json()),
      fetch(dataPath("/mhnow/monster-icons.json")).then((response) => response.json()),
      fetch(dataPath("/mhnow/driftstones.json")).then((response) => response.json()),
    ]).then(([indexData, iconData, driftData]: [SeriesIndex, Record<string, string>, Driftstones]) => { setIndex(indexData); setIcons(iconData); setDriftstones(driftData); });
  }, []);

  // 活動素材減免的魔物（所有配裝共用，另外存），預設是這次活動的清單；同樣等讀完存檔才寫回。
  const [discounted, setDiscounted] = useState<string[]>(DEFAULT_MATERIAL_DISCOUNT.monsters);
  const [discountRestored, setDiscountRestored] = useState(false);
  const [discountStorageError, setDiscountStorageError] = useState(false);
  const [discountPickerOpen, setDiscountPickerOpen] = useState(false);
  const [discountQuery, setDiscountQuery] = useState("");
  useEffect(() => {
    try { setDiscounted(parseMaterialDiscount(localStorage.getItem(MATERIAL_DISCOUNT_KEY))); } catch { setDiscountStorageError(true); }
    setDiscountRestored(true);
  }, []);
  useEffect(() => {
    if (!discountRestored) return;
    try { localStorage.setItem(MATERIAL_DISCOUNT_KEY, serializeMaterialDiscount(discounted)); setDiscountStorageError(false); } catch { setDiscountStorageError(true); }
  }, [discounted, discountRestored]);
  const toggleDiscount = (key: string) => setDiscounted((state) => (state.includes(key) ? state.filter((item) => item !== key) : [...state, key]));

  // 魔物選單一律照原始資料（series-index.json）的順序。
  const allSeries = useMemo(() => index?.series ?? [], [index]);
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
    ...statsPlan.map((entry) => entry.series), ...plans.map((plan) => plan.series)])].join(",");
  useEffect(() => {
    for (const key of neededSeries ? neededSeries.split(",") : []) {
      if (details[key] || failedDetails[key]) continue;
      fetch(dataPath(`/mhnow/series/${key}.json`))
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
  /** 配裝用的升級表：素材減免中的魔物，武器不算採集素材與尖爪（防具、計算器照常）。 */
  const loadoutRowsFor = (key: string, kind: string): GradeRow[] | undefined => {
    const rows = gradeRowsFor(key, kind);
    return rows && kind !== "armor" && discounted.includes(key) ? waiveGatherMaterials(rows) : rows;
  };
  const cardContext: CardContext = { icons, skillLevels: index?.skillLevels ?? {}, driftstones, gradeRowsFor: loadoutRowsFor, discounted };
  const plansIncluded = !stats.excludedBuilds.includes(PLANNED_STATS_ID);
  const statsPieces = [
    ...statsPlan.map(({ row, series, piece }) => ({ key: `${row.id}|${row.itemKey}`, rows: loadoutRowsFor(series, row.kind), range: piece })),
    ...(stats.open && plansIncluded ? plans.filter((plan) => plan.target && plan.included !== false).map((plan) => ({ key: plannedMaterialKey(plan), rows: loadoutRowsFor(plan.series, plan.slot === "weapon" ? plan.weaponType! : "armor"), range: plan })) : []),
  ];
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
  function addSharedBuild(build: Build) {
    const result = appendBuilds(builds, [build]);
    if (!result.added) { setImportMessage(`匯入失敗：已經有 ${MAX_BUILDS} 組配裝，請先刪掉一組再加入。`); setReceiving(null); return; }
    setBuilds(result.state);
    setScrollTo(result.state.active);
    setImportMessage(`已加入分享的配裝「${build.name || "未命名"}」。`);
    setReceiving(null);
  }
  function openShare(build: Build) { setCopied(""); setSharing(build.id); }
  async function copyShare(kind: "code" | "link", text: string) { setCopied((await copyText(text)) ? kind : "fail"); }
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
  /** 「建議配裝」按鈕；手機與桌機放的位置不同，各出一顆再用 className 決定哪個尺寸顯示。 */
  const recommendButton = (visibility: string) => <button disabled={!loaded || !driftstones} onClick={() => { setRecommendMounted(true); setRecommendOpen(true); }}
    className={cx(visibility, "shrink-0 py-1 px-2.5 border rounded-md text-[12px] cursor-pointer bg-[#28352e] border-[#28352e] text-white disabled:opacity-50")}>建議配裝</button>;

  const navButton =(mode: typeof view, label: string) => <button onClick={() => setView(mode)}
    className={cx("border rounded-full py-2 px-6 cursor-pointer", view === mode ? "bg-[#17231d] text-white border-[#17231d]" : "bg-white border-[#d9d9d9]")}>{label}</button>;

  return <main className="min-h-screen bg-[#f4f3ee] text-[#222823]">
    <header className="h-[40px] px-[max(16px,calc((100vw_-_360px)/2))] grid grid-cols-[1fr_auto] items-center border-b border-[#d9ddd6] bg-[#fafaf7]">
      <div className="text-center"><strong className="text-[17px]">配裝紀錄</strong></div>
    </header>
    <nav className="flex flex-wrap justify-center gap-2 p-3 max-[620px]:p-2 border-b border-[#d9ddd6]">{navButton("loadout", "配裝")}{navButton("calculator", "素材計算器")}{navButton("driftstone", "漂流石")}</nav>

    {/* 所有配裝並排：每張卡固定 340px，放得下幾欄就幾欄；手機（620px 以下）一律一欄滿版，不留兩側空白。
        標題列橫跨全部欄，左緣會跟第一張卡對齊。 */}
    {view === "loadout" ? <section className="my-4 px-4 pb-8 max-[620px]:my-3 max-[620px]:px-2 max-[620px]:pb-7 grid gap-3 max-[620px]:gap-2 items-start justify-center grid-cols-[repeat(auto-fill,minmax(min(100%,340px),340px))] max-[620px]:grid-cols-[minmax(0,1fr)]">
      <div className="col-span-full flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {/* 手機版：標題自成一列，「建議配裝」放在標題同一列的最右邊；桌機版維持在右側工具列的第一個。 */}
        <div className="flex items-center justify-between gap-2 max-[620px]:basis-full">
          <PageHeading eyebrow="LOADOUT" title="裝備配置" />
          {recommendButton("hidden max-[620px]:inline-block")}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {recommendButton("max-[620px]:hidden")}
          <button aria-pressed={discounted.length > 0} title="活動素材減免：選了的魔物，武器升級不需要採集素材與尖爪" onClick={() => { setDiscountQuery(""); setDiscountPickerOpen(true); }}
            className={cx("py-1 px-2.5 border rounded-md text-[12px] cursor-pointer", discounted.length ? "bg-[#099aa5] border-[#099aa5] text-white" : "bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]")}>
            素材減免{discounted.length ? ` ${discounted.length}` : ""}</button>
          <button title="把所有配裝存成 JSON 檔" onClick={exportBuilds}
            className="py-1 px-2.5 border rounded-md text-[12px] cursor-pointer bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]">匯出</button>
          <button title="從匯出的 JSON 檔讀回配裝" onClick={() => fileInput.current?.click()}
            className="py-1 px-2.5 border rounded-md text-[12px] cursor-pointer bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]">匯入</button>
          <button title="貼上別人分享的配裝（分享碼或網址），加在現有配裝後面" onClick={() => setReceiving("")}
            className="py-1 px-2.5 border rounded-md text-[12px] cursor-pointer bg-white border-[#cfc7b4] text-[#39423a] hover:border-[#9aa39b]">貼上分享碼</button>
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
      {discounted.length || discountStorageError ? <section className="col-span-full flex flex-wrap items-center gap-1.5 py-2 px-3 max-[620px]:px-2 rounded-xl bg-[#eef8f7] border border-[#bfe1de] text-[12px] text-[#2b332c]">
        {/* 說明收成提示：桌機滑過、手機點一下（取得焦點）就顯示。 */}
        <span tabIndex={0} aria-describedby="discount-tip" className="group relative mr-1 outline-none">
          <strong className="text-[13px] underline decoration-dotted decoration-[#8b938c] underline-offset-4 cursor-help">素材減免中</strong>
          <span id="discount-tip" role="tooltip"
            className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 [transition:opacity_.12s] absolute left-0 top-full mt-1.5 z-30 w-max max-w-[220px] py-1 px-2 rounded-md bg-[#28352e] text-white text-[12px] font-normal leading-[1.5] shadow-[0_4px_12px_rgba(0,0,0,.2)]">
            武器不需採集素材與尖爪</span>
        </span>
        {/* 只放魔物圖示省空間，名稱收進 title；點一下取消減免。沒有圖示的才顯示名稱。 */}
        {discounted.map((key) => <button key={key} aria-label={`取消${seriesBy[key]?.name ?? key}的素材減免`} title={`${seriesBy[key]?.name ?? key}（點擊取消）`} onClick={() => toggleDiscount(key)}
          className="group relative grid place-items-center min-w-8 h-8 p-0.5 border border-[#bfe1de] rounded-lg bg-white text-[11px] cursor-pointer hover:border-[#099aa5]">
          {icons[key] ? <span aria-hidden="true" className={cx("w-7 h-7", BG_ICON)} style={{ backgroundImage: `url(${assetPath(icons[key])})` }} /> : <span className="px-1">{seriesBy[key]?.name ?? key}</span>}
          <span aria-hidden="true" className="absolute -top-1 -right-1 hidden group-hover:grid place-items-center w-3.5 h-3.5 rounded-full bg-[#5b635c] text-white text-[9px] leading-none">✕</span></button>)}
        {discounted.length ? <button onClick={() => setDiscounted([])} className="ml-auto border-0 bg-transparent p-0 text-[12px] text-[#099aa5] cursor-pointer hover:underline">全部清除</button> : null}
        {discountStorageError ? <span role="alert" className="basis-full text-[#b23a30]">瀏覽器無法儲存素材減免設定，重新整理後可能遺失。</span> : null}
      </section> : null}
      {stats.open ? <MissingSummary builds={[...builds.builds, ...(plans.length ? [{ id: PLANNED_STATS_ID, name: "待製作裝備", gear: {}, drifts: {}, pieces: {}, showMissing: false }] : [])]} settings={stats} onChange={setStats} total={statsTotal} loading={statsLoading} monsterName={(key) => seriesBy[key]?.name ?? key} /> : null}

      {builds.builds.map((build) => <SortableBuild key={build.id} id={build.id} name={build.name}
        onMove={(target, side) => setBuilds((state) => moveBuild(state, build.id, target, side))}
        onStep={(direction) => setBuilds((state) => {
          const index = state.builds.findIndex((entry) => entry.id === build.id);
          const target = state.builds[index + direction];
          return target ? moveBuild(state, build.id, target.id, direction < 0 ? "before" : "after") : state;
        })}>
        <BuildCard build={build} rows={rowsByBuild[build.id]} ctx={cardContext}
        editingSlot={editing?.build === build.id ? editing.slot : null} open={(slot) => !!openTiers[`${build.id}:${slot}`]} canDelete={builds.builds.length > 1}
        onEdit={(slot) => editSlot(build, slot)} onToggle={(slot) => setOpenTiers((state) => ({ ...state, [`${build.id}:${slot}`]: !state[`${build.id}:${slot}`] }))}
        onDrift={(slot, position) => setDriftPick({ build: build.id, slot, index: position })} onSkill={(name, level) => setSkillTip({ name, level })}
        onSkillGear={() => { setSkillGearBuild(build.id); setSkillGearOpen(true); }} onChange={changeBuild(build.id)} onDelete={() => deleteBuild(build)} onShare={() => openShare(build)} /></SortableBuild>)}

      <button aria-label="新增配裝" disabled={full} title={full ? `最多 ${MAX_BUILDS} 組` : "新增一組空白配裝"} onClick={addNewBuild}
        className="min-h-[120px] border border-dashed border-[#b5bbb5] rounded-xl bg-transparent text-[#5b635c] text-[14px] cursor-pointer hover:bg-[#ece8dc] disabled:cursor-default disabled:hover:bg-transparent">
        {full ? `已達上限 ${MAX_BUILDS} 組` : "＋ 新增配裝"}
      </button>

      <PlannedGearPanel series={allSeries} plans={plans} onChange={setPlans} ctx={cardContext} included={plansIncluded} ready={plansRestored} storageError={plansStorageError}
        onIncluded={(include) => setStats((state) => ({ ...state, excludedBuilds: include ? state.excludedBuilds.filter((id) => id !== PLANNED_STATS_ID) : [...new Set([...state.excludedBuilds, PLANNED_STATS_ID])] }))} />

      {recommendMounted && index && driftstones ? <RecommendPicker key={recommendReset} series={allSeries} stones={driftstones} skillLevels={index.skillLevels} weaponNames={WEAPON_NAMES} full={full}
        icons={icons} gearIcons={{ weapon: WEAPON_ICON, armor: ARMOR_ICON }}
        weaponPicker={(value, onPick) => <WeaponChooser series={weaponSeries} icons={icons} value={value} onPick={onPick} />}
        visible={recommendOpen} clearOnClose={clearOnClose.recommend} onClearOnClose={(recommend) => setClearOnClose((state) => ({ ...state, recommend }))}
        onClear={() => setRecommendReset((count) => count + 1)} onClose={closeRecommend} onSave={(build) => setBuilds((state) => appendBuilds(state, [build]).state)} /> : null}
      {/* 不用 build.id 當 key：換一組配裝打開時，搜尋條件也沿用，只是選的裝備套到新的那組。 */}
      {skillGearBuild ? builds.builds.filter((build) => build.id === skillGearBuild).map((build) => <SkillGearPicker key={`skill-gear-${skillGearReset}`} series={allSeries} icons={icons} build={build}
        visible={skillGearOpen} clearOnClose={clearOnClose.skillGear} onClearOnClose={(skillGear) => setClearOnClose((state) => ({ ...state, skillGear }))}
        onClear={() => setSkillGearReset((count) => count + 1)} onClose={closeSkillGear} onPick={(slot, key) => changeBuild(build.id)((next) => {
          const gear = { ...next.gear };
          if (gear[slot] === key) delete gear[slot];
          else gear[slot] = key;
          return { ...next, gear };
        })} />) : null}
      {discountPickerOpen ? <Modal title={`素材減免（已選 ${discounted.length}）`} onClose={() => setDiscountPickerOpen(false)}>
        <p className={cx(NOTE, "mt-0 mb-2")}>點魔物加入或取消。選了的魔物，所有武器升級都不需要採集素材（含尖爪）；防具不受影響。只套用在裝備配置與素材統計。</p>
        <MonsterPicker series={weaponSeries} value={discounted} onPick={toggleDiscount} icons={icons} display={display} onDisplay={setDisplay} query={discountQuery} onQuery={setDiscountQuery} />
        <div className="flex gap-2 mt-3">
          <button disabled={!discounted.length} onClick={() => setDiscounted([])} className="py-2 px-3 rounded-lg border border-[#cfc7b4] bg-white text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-default">全部清除</button>
          <button onClick={() => setDiscountPickerOpen(false)} className="flex-1 py-2 rounded-lg border-0 bg-[#28352e] text-white text-[13px] cursor-pointer">完成</button>
        </div>
      </Modal> : null}
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

    : view === "calculator" ? <section className={PAGE}>
      <PageHeading eyebrow="MATERIALS" title="素材計算器" description="選擇對象與階級區間，累計中間所有升級需要的素材與 Zenny。" />

      <section className="block mt-2.5 p-3.5 max-[620px]:p-2.5 bg-white border border-[#dfe2dc] rounded-[10px]">
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

    {sharing ? builds.builds.filter((build) => build.id === sharing).map((build) => {
      const code = encodeBuildShare(build);
      const link = shareUrl(code, window.location.href);
      const copyButton = "flex-1 py-2 rounded-lg border-0 bg-[#28352e] text-white text-[13px] cursor-pointer";
      return <Modal key={build.id} title={`分享「${build.name || "未命名"}」`} narrow onClose={() => setSharing(null)}>
        <div className="flex justify-center p-2 mb-2 rounded-lg border border-[#e3dac6]"><QrCode text={link} /></div>
        <p className={cx(NOTE, "mt-0 mb-2")}>對方用手機相機掃描就能打開並加入這組配裝；或把分享碼傳給對方，在「貼上分享碼」貼上。只分享裝備與漂流石，不含升級進度。</p>
        <textarea readOnly aria-label="分享碼" value={code} rows={3} onFocus={(event) => event.currentTarget.select()}
          className="block w-full box-border p-2 mb-2 border border-[#d8d0bd] rounded-md bg-[#f8f8f5] text-[11px] font-mono break-all resize-none" />
        <div className="flex gap-2">
          <button onClick={() => void copyShare("code", code)} className={copyButton}>{copied === "code" ? "✓ 已複製分享碼" : "複製分享碼"}</button>
          <button onClick={() => void copyShare("link", link)} className={copyButton}>{copied === "link" ? "✓ 已複製連結" : "複製連結"}</button>
        </div>
        {copied === "fail" ? <p role="alert" className="mt-2 mb-0 text-[12px] text-[#b23a30]">無法自動複製，請點上面的分享碼全選後手動複製。</p> : null}
      </Modal>;
    }) : null}

    {receiving !== null ? (() => {
      const result = receiving.trim() ? decodeBuildShare(receiving) : null;
      const preview = result && "build" in result ? gearRowsOf(result.build, seriesBy, weaponTypeName, slotName).filter((row) => row.item) : [];
      const stoneCount = result && "build" in result ? Object.values(result.build.drifts).flat().filter(Boolean).length : 0;
      return <Modal title="加入分享的配裝" narrow onClose={() => setReceiving(null)}>
        <textarea aria-label="貼上分享碼或網址" value={receiving} rows={3} autoFocus placeholder="貼上 MHN1. 開頭的分享碼或分享網址" onChange={(event) => setReceiving(event.target.value)}
          className="block w-full box-border p-2 mb-2 border border-[#d8d0bd] rounded-md text-[12px] break-all resize-none outline-none focus:border-[#099aa5]" />
        {result && "error" in result ? <p role="alert" className="mt-0 mb-2 text-[12px] text-[#b23a30]">{result.error}</p> : null}
        {result && "build" in result ? <section className="mb-3 p-2 rounded-lg bg-[#fffaf0] border border-[#e3dac6]">
          <strong className="block mb-1 text-[13px] text-[#2b332c]">{result.build.name || "未命名"}</strong>
          {!loaded ? <p className={cx(NOTE, "m-0")}>資料載入中……</p> : preview.map((row) => <p key={row.id} className="flex items-center gap-1.5 m-0 py-0.5 text-[12px] text-[#39423a]">
            <span aria-hidden="true" className={cx("w-4 h-4 flex-none", BG_ICON)} style={{ backgroundImage: `url(${assetPath(row.icon)})` }} />{row.title}</p>)}
          {stoneCount ? <p className={cx(NOTE, "m-0 mt-1")}>漂流石 {stoneCount} 顆</p> : null}
        </section> : null}
        <button disabled={!result || !("build" in result) || builds.builds.length >= MAX_BUILDS} onClick={() => { if (result && "build" in result) addSharedBuild(result.build); }}
          className="w-full py-2 rounded-lg border-0 bg-[#28352e] text-white text-[13px] cursor-pointer disabled:opacity-40 disabled:cursor-default">
          {builds.builds.length >= MAX_BUILDS ? `已達上限 ${MAX_BUILDS} 組，請先刪掉一組` : "加在現有配裝後面"}</button>
      </Modal>;
    })() : null}

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
