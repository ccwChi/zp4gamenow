"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { assetPath } from "./assetPath";
import { iconsForWeapon, weaponSeriesName } from "./weaponOverrides";
import type { Build } from "./buildStore";
import { FloatingPicker } from "./FloatingPicker";
import { popularSkills } from "./popularSkills";
import { SkillGroups } from "./SkillGroups";
import { DEFAULT_CONDITIONS, SKILL_EFFECTS } from "./damage";
import { isRecommendable, pieceSkills, pieceSlots, recommendBuilds, swapPiece, weaponSetup, weaponSkillsOf, RECOMMEND_SLOTS, type Recommendation, type RecommendSeries, type RecommendDrifts } from "./recommendBuilds";

type Slot = typeof RECOMMEND_SLOTS[number];
/** need：必備（原生＋漂流補足）；drift：必備且全部靠漂流鍊成；bonus：非必備，只用來排序。 */
type Mode = "need" | "drift" | "bonus";
type Pick = { name: string; level: number; mode: Mode };

const SLOT_NAMES: Record<Slot, string> = { helm: "頭部", mail: "身體", gloves: "手部", belt: "腰部", greaves: "腳部" };
const MODE_NAMES: Record<Mode, string> = { need: "必備", bonus: "加分", drift: "全鍊成" };
const ELEMENT_NAMES: Record<string, string> = { fire: "火", water: "水", thunder: "雷", ice: "冰", dragon: "龍", poison: "毒", paralysis: "麻痺", sleep: "睡眠", blast: "爆破" };
/** 有發動條件的傷害技能（最大傷害模式讓使用者勾選要不要算）。 */
const CONDITIONAL = Object.entries(SKILL_EFFECTS).filter(([, setup]) => setup.condition).map(([skill, setup]) => ({ skill, condition: setup.condition! }));
/** 不配裝技能與傷害條件的設定存在瀏覽器，下次打開沿用；沒存過就用預設。 */
const SETTINGS_KEY = "mhnow.recommend.v3";
type Objective = "stones" | "damage";
/** 預設不用漂流石鍊的技能：沒有（要擋的話在這裡加；只擋漂流石，防具帶有沒關係）。 */
const DEFAULT_NO_DRIFT: string[] = [];
/** 不配裝技能每種模式各自一份：最大傷害預設不配裝這三個；最少鍊成不排除任何技能（要的技能可能剛好在帶這些技能的防具上）。 */
const DEFAULT_EXCLUDED: Record<Objective, string[]> = { stones: [], damage: ["超會心", "看破", "滅盡龍的渴望"] };
function loadSettings(): { excluded: Record<Objective, string[]>; noDrift: string[]; conditions: string[] } {
  const fallback = { excluded: DEFAULT_EXCLUDED, noDrift: DEFAULT_NO_DRIFT, conditions: DEFAULT_CONDITIONS };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return fallback;
    const names = (value: unknown, or: string[]) => Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : or;
    const record = saved as Record<string, unknown>;
    const by = record.excluded && typeof record.excluded === "object" && !Array.isArray(record.excluded) ? record.excluded as Record<string, unknown> : {};
    // 舊版預設會幫你勾連擊與弱點特效，且一開啟就存進瀏覽器；剛好等於舊預設的視為沒設定過，改回全不勾。
    const conditions = names(record.conditions, fallback.conditions);
    const oldDefault = conditions.length === 2 && conditions.includes("連擊") && conditions.includes("弱點特效");
    return { excluded: { stones: names(by.stones, fallback.excluded.stones), damage: names(by.damage, fallback.excluded.damage) }, noDrift: names(record.noDrift, fallback.noDrift), conditions: oldDefault ? fallback.conditions : conditions };
  } catch { return fallback; }
}
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const BG_ICON = "bg-contain bg-center bg-no-repeat";
const NOTE = "m-0 fs-md text-[#858d86] leading-[1.6]";
const SECTION = "border border-[#e3dac6] rounded-lg bg-white";
/** 區塊標題後面的說明小字：說明跟標題放同一行，不佔內容的位置。 */
const HINT = "ml-1.5 font-normal fs-sm text-[#858d86]";
const SECTION_HEAD = "flex items-center justify-between gap-2 px-3 py-2 bg-[#fffaf0] rounded-t-lg fs-md font-bold";
const TOGGLE_ON = "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900] text-[#2b332c]";
const TOGGLE_OFF = "border-[#e3e6e1] bg-white text-[#5b635c]";
const PRIMARY = "w-full py-2.5 rounded-lg border-0 bg-[#28352e] text-white fs-lg font-bold cursor-pointer disabled:opacity-50 disabled:cursor-default";
const SMALL_BUTTON = "shrink-0 px-2.5 py-1 rounded-md border border-[#cfc7b4] bg-white fs-md cursor-pointer disabled:opacity-50 disabled:cursor-default";

/** 長按（手機或滑鼠按住 0.5 秒）開技能說明；沒長按到就當一般點擊。手指滑動超過 10px 視為捲動，取消長按。 */
function useLongPress(onLong: (name: string) => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const cancel = () => window.clearTimeout(timer.current);
  useEffect(() => cancel, []);
  return (name: string, onTap: () => void) => ({
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0) return;
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      cancel();
      timer.current = window.setTimeout(() => { fired.current = true; onLong(name); }, 500);
    },
    onPointerMove: (event: PointerEvent) => { if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancel(); },
    onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    onClick: () => { if (fired.current) { fired.current = false; return; } onTap(); },
  });
}
const NO_CALLOUT = "select-none [-webkit-touch-callout:none]";

/** 圖示；沒有圖時顯示 fallback 文字的第一個字（例如魔物名稱）。 */
/** 選擇畫面裡的圖示大小：魔物／武器種類一律 IC，部位小圖示一律 IC_SLOT（對應 globals.css 的 --ic、--ic-slot）。 */
const IC = "var(--ic)", IC_SLOT = "var(--ic-slot)";
function Icon({ src, size, title, fallback }: { src?: string; size: string; title?: string; fallback?: string }) {
  return <span title={title} aria-hidden={title ? undefined : true} className={cx("flex shrink-0 items-center justify-center rounded fs-sm font-bold text-[#5b635c]", BG_ICON, !src && fallback && "bg-[#f1f2ef]")}
    style={{ width: size, height: size, backgroundImage: src ? `url(${assetPath(src)})` : undefined }}>{!src && fallback ? fallback.slice(0, 1) : null}</span>;
}

/** 斜格等級條（跟配裝卡一樣）；native 橘色、drift 青色，onPick 時每格可點。 */
function LevelBar({ max, native, drift = 0, onPick, label }: { max: number; native: number; drift?: number; onPick?: (level: number) => void; label?: string }) {
  return <div role={onPick ? "radiogroup" : undefined} aria-label={label} className="flex gap-[3px] flex-1 min-w-0">
    {Array.from({ length: max }, (_, position) => {
      const color = position < native ? "bg-[#f59a00]" : position < native + drift ? "bg-[#099aa5]" : "bg-[#dcd6c8]";
      return onPick
        ? <button key={position} role="radio" aria-checked={position + 1 === native} aria-label={`Lv${position + 1}`} onClick={() => onPick(position + 1)}
          className="flex-1 h-6 p-0 border-0 bg-transparent cursor-pointer flex items-center"><i className={cx("block w-full h-2.5 [transform:skewX(-20deg)] rounded-[1px]", color)} /></button>
        : <i key={position} className={cx("flex-1 h-2 [transform:skewX(-20deg)] rounded-[1px]", color)} />;
    })}
  </div>;
}

/** 展開的方案：五個部位（可替換）＋技能等級條。 */
function Detail({ item, picks, maxLevels, byKey, icons, gearIcons, grade, gradeOf, onSwap, onSkill }: {
  item: Recommendation; picks: Pick[]; maxLevels: Record<string, number>; byKey: Record<string, RecommendSeries>;
  icons: Record<string, string>; gearIcons: { armor: Record<string, string> }; grade: number; gradeOf: (slot: Slot) => number; onSwap: (slot: Slot, key: string) => void;
  onSkill: (name: string, level: number) => void;
}) {
  const [swapping, setSwapping] = useState<Slot | null>(null);
  const driftCount = (name: string) => Object.values(item.build.drifts).flat().filter((pick) => pick?.skill === name).length;
  const targets = picks.map((pick) => pick.name);
  const others = Object.keys(item.skills).filter((name) => !targets.includes(name)).sort((a, b) => item.skills[b] - item.skills[a] || a.localeCompare(b, "zh-Hant"));
  const skillRow = (name: string, wanted?: Pick) => {
    const total = item.skills[name] ?? 0;
    const drift = driftCount(name);
    const max = maxLevels[name] ?? Math.max(5, total);
    const short = wanted && wanted.mode !== "bonus" && total < wanted.level;
    return <div key={name} className="min-w-0">
      <p className="flex justify-between items-baseline gap-1 m-0 mb-0.5 fs-md">
        <button className={cx("min-w-0 truncate p-0 border-0 bg-transparent text-left fs-md cursor-pointer", wanted ? "font-bold text-[#2b332c]" : "text-[#39423a]")} onClick={() => onSkill(name, total)}>{name}{wanted?.mode === "bonus" ? <em className="not-italic fs-sm text-[#b06d00]"> 加分</em> : null}</button>
        <b className={cx("fs-md", total > max || short ? "text-[#d23c3c]" : "text-[#e08a00]")}>{total}{wanted && wanted.mode !== "bonus" ? <span className="font-normal text-[#8b938c]">/{wanted.level}</span> : null}</b>
      </p>
      <LevelBar max={max} native={Math.min(max, total - drift)} drift={Math.min(drift, Math.max(0, max - (total - drift)))} />
    </div>;
  };
  return <div className="px-2 pb-2 space-y-2 border-t border-dashed border-[#e8dfcb] pt-2">
    <div className="space-y-1">{RECOMMEND_SLOTS.map((slot) => {
      const key = item.build.gear[slot];
      const alternatives = item.alternatives[slot] ?? [];
      const stonesHere = item.build.drifts[slot] ?? [];
      return <div key={slot} className="rounded-md bg-[#fbfaf6]">
        <div className="flex items-center gap-2 p-1.5">
          <Icon src={gearIcons.armor[slot]} size={IC_SLOT} />
          <Icon src={icons[key]} size={IC} fallback={byKey[key]?.name} />
          <div className="flex-1 min-w-0">
            <p className="m-0 font-bold fs-md">{byKey[key]?.name}{SLOT_NAMES[slot].slice(0, 1)}{gradeOf(slot) !== grade ? <em className="not-italic font-normal text-[#b06d00]"> 指定 G{gradeOf(slot)}</em> : null}</p>
            <p className="m-0 fs-sm text-[#5b635c]">{Object.entries(pieceSkills(byKey[key], slot, gradeOf(slot))).map(([name, level]) => <button key={name} onClick={() => onSkill(name, item.skills[name] ?? level)} className={cx("mr-2 p-0 border-0 bg-transparent fs-sm cursor-pointer underline decoration-dotted underline-offset-2", targets.includes(name) ? "font-bold text-[#2b332c]" : "text-[#5b635c]")}>{name} {level}</button>)}</p>
            {stonesHere.length ? <p className="m-0 fs-sm text-[#087b84]">鍊成：{stonesHere.map((pick) => pick?.skill).join("、")}</p> : null}
          </div>
          {alternatives.length ? <button aria-expanded={swapping === slot} className={SMALL_BUTTON} onClick={() => setSwapping(swapping === slot ? null : slot)}>換（{alternatives.length}）</button> : null}
        </div>
        {swapping === slot ? <div className="px-1.5 pb-1.5 space-y-1 max-h-[220px] overflow-auto">
          <p className={NOTE}>以下替換後強度一樣，差別在其他技能或多超過上限的等級：</p>
          {alternatives.map((alternative) => <button key={alternative} onClick={() => { onSwap(slot, alternative); setSwapping(null); }}
            className="w-full flex items-center gap-2 p-1.5 rounded-md border border-[#e3dac6] bg-white text-left cursor-pointer hover:border-[#099aa5]">
            <Icon src={icons[alternative]} size={IC} fallback={byKey[alternative]?.name} />
            <span className="flex-1 min-w-0"><b className="block fs-md">{byKey[alternative]?.name}</b>
              <span className="block fs-sm text-[#5b635c]">{Object.entries(pieceSkills(byKey[alternative], slot, grade)).map(([name, level]) => `${name} ${level}`).join("、") || "無技能"}</span></span>
          </button>)}
        </div> : null}
      </div>;
    })}</div>
    <div className="rounded-md bg-[#fffaf0] border border-[#e3dac6] p-2">
      {picks.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">{picks.map((pick) => skillRow(pick.name, pick))}</div> : null}
      {others.length ? <div className={cx("grid grid-cols-2 gap-x-4 gap-y-1.5", picks.length > 0 && "mt-2 pt-2 border-t border-[#e8dfcb]")}>{others.map((name) => skillRow(name))}</div> : null}
      <p className={cx(NOTE, "mt-1.5 flex gap-3")}><span><i className="inline-block w-2 h-2 mr-1 bg-[#f59a00]" />裝備</span><span><i className="inline-block w-2 h-2 mr-1 bg-[#099aa5]" />鍊成</span></p>
    </div>
  </div>;
}

export function RecommendPicker({ series, stones, skillLevels, weaponNames, icons, gearIcons, weaponPicker, full, onSave, onClose, onSkill, visible, clearOnClose, onClearOnClose, onClear }: {
  series: RecommendSeries[]; stones: RecommendDrifts; skillLevels: Record<string, string[]>; weaponNames: Record<string, string>;
  icons: Record<string, string>; gearIcons: { weapon: Record<string, string>; armor: Record<string, string> };
  weaponPicker: (value: string, onPick: (weapon: string) => void) => ReactNode;
  full: boolean; onSave: (build: Build) => void; onClose: () => void;
  /** 開技能說明（level 是目前等級，0 表示不標示）。 */
  onSkill: (name: string, level: number) => void;
  /** 關閉時只藏起來（條件與結果都留著）；clearOnClose 勾選時由呼叫端卸載清掉。 */
  visible: boolean; clearOnClose: boolean; onClearOnClose: (next: boolean) => void; onClear: () => void;
}) {
  // 建議配裝的條件設定比較花時間，點背景不關閉，免得誤觸。
  const windowProps = { onClose, open: visible, clearOnClose, onClearOnClose, onClear, closeOnBackdrop: false };
  const [weapon, setWeapon] = useState("");
  const [choosingWeapon, setChoosingWeapon] = useState(true);
  // 一律以最高階（G10）的技能、洞數與武器數值計算。
  const grade = 10;
  const [picks, setPicks] = useState<Pick[]>([]);
  const [query, setQuery] = useState("");
  const [fixed, setFixed] = useState<Partial<Record<Slot, { key: string; grade: number }>>>({});
  const [fixing, setFixing] = useState<Slot | null>(null);
  const [fixOpen, setFixOpen] = useState(true);
  const [fixQuery, setFixQuery] = useState("");
  /** 換裝時只看有這些技能的裝備；沒選就用上面「② 技能」選的那些。 */
  const [candSkills, setCandSkills] = useState<string[]>([]);
  const [onlyHit, setOnlyHit] = useState(true);
  const [saved0] = useState(loadSettings);
  const [objective, setObjective] = useState<Objective>("stones");
  const [excludedBy, setExcludedBy] = useState(saved0.excluded);
  const excluded = excludedBy[objective];
  const [noDrift, setNoDrift] = useState(saved0.noDrift);
  const [noDriftOpen, setNoDriftOpen] = useState(false);
  const [noDriftQuery, setNoDriftQuery] = useState("");
  const setExcluded = (next: string[] | ((current: string[]) => string[])) =>
    setExcludedBy((by) => ({ ...by, [objective]: typeof next === "function" ? next(by[objective]) : next }));
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [excludeQuery, setExcludeQuery] = useState("");
  const [includeDrifts, setIncludeDrifts] = useState(true);
  const [conditions, setConditions] = useState<string[]>(saved0.conditions);
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ excluded: excludedBy, noDrift, conditions })); } catch { /* 存不了就只在這次有效 */ }
  }, [excludedBy, noDrift, conditions]);
  const [page, setPage] = useState<"form" | "results">("form");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Recommendation[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(0);
  const [saved, setSaved] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const press = useLongPress((name) => onSkill(name, picks.find((pick) => pick.name === name)?.level ?? 0));

  const byKey = useMemo(() => Object.fromEntries(series.map((item) => [item.key, item])), [series]);
  const maxLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    for (const [name, descriptions] of Object.entries(skillLevels)) if (descriptions.length) levels[name] = descriptions.length;
    for (const item of series) for (const entries of [...Object.values(item.skills), ...Object.values(item.weaponSkills ?? {})]) {
      for (const entry of entries) if (!levels[entry.skill]) levels[entry.skill] = Math.max(1, ...entry.levels.map((level) => level.level));
    }
    return levels;
  }, [series, skillLevels]);
  const driftSkills = useMemo(() => new Set([...stones.colors.flatMap((color) => color.skills.map((item) => item.name)), ...stones.common, ...stones.events.flatMap((event) => event.skills)]), [stones]);
  // 只列得出來的技能：守護者／魔物防具（不含合金、皮製與活動裝備）帶的，或漂流石能鍊的。
  const skillNames = useMemo(() => {
    const usable = new Set(driftSkills);
    for (const item of series) if (item.hasArmor && isRecommendable(item)) for (const slot of RECOMMEND_SLOTS) for (const entry of item.skills[slot] ?? []) usable.add(entry.skill);
    return Object.keys(maxLevels).filter((name) => usable.has(name)).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [maxLevels, series, driftSkills]);

  const [weaponKey, weaponType] = weapon.split("::");
  const weaponTitle = weapon ? `${weaponSeriesName(weaponKey, weaponType, byKey[weaponKey]?.name)}${weaponNames[weaponType] ?? ""}` : "";
  const weaponIcons = iconsForWeapon(icons, weaponType);
  const required = Object.fromEntries(picks.filter((pick) => pick.mode !== "bonus").map((pick) => [pick.name, pick.level]));
  const driftOnly = picks.filter((pick) => pick.mode === "drift").map((pick) => pick.name);
  const bonus = picks.filter((pick) => pick.mode === "bonus").map((pick) => pick.name);
  const terms = query.trim().toLowerCase().split(/[\s,，]+/).filter(Boolean);
  const filtered = terms.length ? skillNames.filter((name) => terms.some((term) => name.toLowerCase().includes(term))) : skillNames;
  const excludeTerms = excludeQuery.trim().toLowerCase().split(/[\s,，]+/).filter(Boolean);
  const excludeFiltered = excludeTerms.length ? skillNames.filter((name) => excludeTerms.some((term) => name.toLowerCase().includes(term))) : skillNames;
  const canSearch = !!weaponType && (objective === "damage" || Object.keys(required).length > 0);
  const stats = weapon && byKey[weaponKey] ? weaponSetup(byKey[weaponKey], weaponType, grade) : undefined;
  const weaponOwn = weapon ? Object.entries(weaponSkillsOf(byKey[weaponKey], weaponType, grade)) : [];
  const statsText = stats ? `攻擊 ${stats.atk}${stats.ele ? ` · ${ELEMENT_NAMES[stats.element] ?? stats.element} ${stats.ele}` : ""} · 會心 ${stats.crit}%` : "";

  function update(name: string, change: Partial<Pick>) {
    setPicks((current) => current.map((pick) => pick.name === name ? { ...pick, ...change } : pick));
  }
  function toggleSkill(name: string) {
    const adding = !picks.some((pick) => pick.name === name);
    setPicks((current) => current.some((pick) => pick.name === name) ? current.filter((pick) => pick.name !== name) : [...current, { name, level: maxLevels[name] ?? 1, mode: "need" }]);
    // 需要跟不配裝互斥：選了就從不配裝清單拿掉。
    if (adding) setExcludedBy((by) => ({ stones: by.stones.filter((skill) => skill !== name), damage: by.damage.filter((skill) => skill !== name) }));
    // 從搜尋結果加入後清掉搜尋字，回到完整清單。
    if (adding) setQuery("");
  }
  /** 依技能挑裝備的目標：有另外指定技能就用指定的，沒有就用「② 技能」選的。值是想要的等級（算貢獻時封頂用）。 */
  const goalLevels: Record<string, number> = candSkills.length
    ? Object.fromEntries(candSkills.map((name) => [name, picks.find((pick) => pick.name === name)?.level ?? maxLevels[name] ?? 5]))
    : Object.fromEntries(picks.map((pick) => [pick.name, pick.level]));
  const goalCount = Object.keys(goalLevels).length;
  /** 這件在 pieceGrade 階級對目標技能的貢獻（每個技能最多算到想要的等級）。 */
  const gainOf = (key: string, slot: Slot, pieceGrade: number) => {
    const skills = pieceSkills(byKey[key], slot, pieceGrade);
    return Object.entries(goalLevels).reduce((sum, [name, level]) => sum + Math.min(skills[name] ?? 0, level), 0);
  };
  const hasExcluded = (key: string, slot: Slot) => Object.keys(pieceSkills(byKey[key], slot, 10)).some((name) => excluded.includes(name));
  /** 候選裝備：搜尋字比對魔物名或技能名；有目標技能時預設只留有貢獻的，依貢獻排序。 */
  const pieceCandidates = (slot: Slot) => {
    const text = fixQuery.trim().toLowerCase();
    return series.filter((item) => item.hasArmor && (item.skills[slot] !== undefined || item.slots?.[slot] !== undefined)
      && (!text || item.name.toLowerCase().includes(text) || Object.keys(pieceSkills(item, slot, 10)).some((name) => name.toLowerCase().includes(text)))
      && (!goalCount || !onlyHit || text || gainOf(item.key, slot, 10) > 0))
      .sort((a, b) => gainOf(b.key, slot, 10) - gainOf(a.key, slot, 10) || a.name.localeCompare(b.name, "zh-Hant"));
  };
  const skillSpans = (key: string, slot: Slot, pieceGrade: number) => {
    const entries = Object.entries(pieceSkills(byKey[key], slot, pieceGrade));
    return entries.length ? entries.map(([name, level], position) => <span key={name}>{position ? "、" : ""}
      <span className={goalLevels[name] !== undefined ? "font-bold text-[#28352e]" : excluded.includes(name) ? "text-[#b23a30] line-through" : ""}>{name} {level}</span></span>) : "無技能";
  };
  function toggleExcluded(name: string) {
    const adding = !excluded.includes(name);
    setExcluded((current) => adding ? [...current, name] : current.filter((skill) => skill !== name));
    if (adding) setPicks((current) => current.filter((pick) => pick.name !== name));
  }
  async function search() {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true); setError(""); setSaved([]); setOpen(0);
    try {
      const next = await recommendBuilds(series, stones, { weapon, required, grade, includeDrifts: includeDrifts || driftOnly.length > 0, driftOnly, bonus, noDrift: objective === "damage" ? noDrift : [], exclude: excluded.filter((name) => !weaponOwn.some(([own]) => own === name)), fixed, maxLevels, signal: active.signal,
        ...(objective === "damage" ? { damage: { skillLevels, conditions } } : {}) });
      if (active.signal.aborted) return;
      setResults(next.recommendations);
      setPage("results");
    } catch (cause) {
      if (!active.signal.aborted) setError(cause instanceof Error ? cause.message : "搜尋失敗，請重試。");
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }
  function swap(index: number, slot: Slot, key: string) {
    setResults(results.map((item, position) => position === index ? swapPiece(item, slot, key, series, { grade, required, maxLevels }) : item));
    setSaved(saved.filter((id) => id !== results[index].build.id));
  }

  if (page === "results") return <FloatingPicker title="建議配裝 · 結果" {...windowProps}>
    <div className="h-full flex flex-col gap-2 fs-md">
      <div className="shrink-0 flex items-center gap-2 p-2 rounded-lg bg-[#fffaf0] border border-[#e3dac6]">
        <Icon src={gearIcons.weapon[weaponType]} size={IC} />
        <Icon src={weaponIcons[weaponKey]} size={IC} fallback={byKey[weaponKey]?.name} />
        <div className="flex-1 min-w-0">
          <p className="m-0 font-bold truncate">{weaponTitle} · G{grade}{objective === "damage" ? " · 最大傷害" : ""}</p>
          <p className="m-0 fs-md text-[#5b635c] truncate">{objective === "damage" ? `${statsText}　` : ""}{picks.map((pick) => pick.mode === "bonus" ? `+${pick.name}` : `${pick.name}${pick.level}`).join("　")}{excluded.length ? `　不配：${excluded.join("、")}` : ""}</p>
        </div>
        <button className={SMALL_BUTTON} onClick={() => setPage("form")}>修改條件</button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto space-y-1.5">
        {!results.length ? <p className="m-0 p-3 text-center text-[#5b635c]">沒有符合條件的配裝。<br />可以降低技能等級、提高階級、允許漂流石，或把部分技能改成「加分」。</p> : null}
        {results.map((item, index) => {
          const expanded = open === index;
          const isSaved = saved.includes(item.build.id);
          return <article key={item.build.id} className={cx("rounded-lg border bg-white", expanded ? "border-[#099aa5]" : "border-[#e3dac6]")}>
            <button aria-expanded={expanded} onClick={() => setOpen(expanded ? null : index)} className="w-full flex items-center gap-2 p-2 border-0 bg-transparent text-left cursor-pointer">
              <b className="w-4 shrink-0 text-center text-[#8b938c]">{index + 1}</b>
              <span className="flex shrink-0 gap-0.5">{RECOMMEND_SLOTS.map((slot) => <Icon key={slot} src={icons[item.build.gear[slot]]} size={IC} title={`${SLOT_NAMES[slot]}：${byKey[item.build.gear[slot]]?.name}`} fallback={byKey[item.build.gear[slot]]?.name} />)}</span>
              <span className="flex-1 min-w-0 flex flex-wrap justify-end gap-1 fs-sm whitespace-nowrap">
                {objective === "damage" ? <span className="px-1.5 py-0.5 rounded bg-[#28352e] text-white font-bold" title={`傷害指數 ${item.damage.toFixed(0)}`}>
                  {index ? `${(item.damage / results[0].damage * 100).toFixed(1)}%` : item.damage.toFixed(0)}</span> : null}
                <span className={cx("px-1.5 py-0.5 rounded", item.stoneCount ? "bg-[#e6f5f6] text-[#087b84]" : "bg-[#eef3e9] text-[#3d6b35]")}>{item.stoneCount ? `鍊成 ${item.stoneCount}${item.rareStones ? `·稀${item.rareStones}` : ""}` : "免鍊成"}</span>
                {item.freeSlots ? <span className="px-1.5 py-0.5 rounded bg-[#f1f2ef] text-[#5b635c]">空洞 {item.freeSlots}</span> : null}
                {item.bonus ? <span className="px-1.5 py-0.5 rounded bg-[#fff3dc] text-[#b06d00]">加分 {item.bonus}</span> : null}
              </span>
              <span className={cx("shrink-0 text-[#8b938c] [transition:transform_.15s]", expanded && "[transform:rotate(180deg)]")}>▾</span>
            </button>
            {expanded ? <Detail item={item} picks={picks} maxLevels={maxLevels} byKey={byKey} icons={icons} gearIcons={gearIcons} grade={grade} gradeOf={(slot) => fixed[slot]?.grade ?? grade} onSwap={(slot, key) => swap(index, slot, key)} onSkill={onSkill} /> : null}
            {expanded ? <div className="px-2 pb-2"><button className={PRIMARY} disabled={full || isSaved} onClick={() => { onSave(item.build); setSaved([...saved, item.build.id]); }}>
              {isSaved ? "已另存為新配裝" : full ? "配裝數量已達上限" : "另存為新配裝"}</button></div> : null}
          </article>;
        })}
        {results.length ? <p className={cx(NOTE, "px-1")}>{objective === "damage"
          ? "依傷害指數排序（第 1 名顯示指數，其餘顯示相對第 1 名的百分比），同分再比鍊成數。傷害指數 = 期望值[(武器攻擊＋鍊成攻擊)×攻擊%類＋增攻類＋(武器屬性×屬會＋屬強)×屬性%類]×會心倍率×傷害類；動作值與肉質各配裝相同不列入。空洞會自動鍊成最能提高傷害的技能。"
          : "依序比較：鍊成數少 → 稀有少 → 加分高 → 空洞多。結果只看技能條件，不代表最大傷害；樣式專屬技能不計。"}</p> : null}
      </div>
    </div>
  </FloatingPicker>;

  return <FloatingPicker title="建議配裝" {...windowProps}>
    <div className="h-full flex flex-col gap-2 fs-md">
      <div className="flex-1 min-h-0 overflow-auto space-y-2">
        <section className={SECTION}>
          <div className={SECTION_HEAD}>
            <span className="flex items-center gap-2 min-w-0">{weapon ? <><Icon src={gearIcons.weapon[weaponType]} size={IC} /><Icon src={weaponIcons[weaponKey]} size={IC} fallback={byKey[weaponKey]?.name} /></> : null}
              <span className={weapon ? "truncate" : "min-w-0"}>{weapon ? weaponTitle : "① 武器"}</span></span>
            {weapon ? <button className={SMALL_BUTTON} onClick={() => setChoosingWeapon(!choosingWeapon)}>{choosingWeapon ? "收合" : "更換"}</button> : null}
          </div>
          {choosingWeapon || !weapon ? <div className="p-2">{weaponPicker(weapon, (next) => { setWeapon(next); setChoosingWeapon(false); })}</div> : null}
          {weapon ? <div className="px-3 pb-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {stats ? <span className="fs-md text-[#39423a]">會心 {stats.crit}%</span> : null}
              <span className="fs-md text-[#687168]">武器技能</span>
              {weaponOwn.length ? weaponOwn.map(([name, level]) => <button key={name} onClick={() => onSkill(name, level)}
                className="px-2.5 py-1 rounded-full border border-[#e0a900] bg-[#fffdf5] fs-lg text-[#2b332c] cursor-pointer">{name} <b className="text-[#e08a00]">Lv{level}</b></button>)
                : <span className="fs-md text-[#858d86]">無</span>}</div>
          </div> : null}
        </section>

        <section className={SECTION}>
          <div className={SECTION_HEAD}><span className="min-w-0">② 技能{picks.length ? `（${picks.length}）` : ""}<small className={HINT}>點一下加入／取消，長按看說明</small></span>
            {picks.length ? <button className="border-0 bg-transparent p-0 fs-md text-[#099aa5] cursor-pointer" onClick={() => setPicks([])}>清除</button> : null}</div>
          <div className="p-2 space-y-2">
            {picks.map((pick) => {
              const max = maxLevels[pick.name] ?? 1;
              return <div key={pick.name} className="flex flex-wrap items-center gap-x-2 gap-y-1 p-1.5 rounded-md bg-[#fbfaf6] border border-[#eee6d4]">
                <b className="flex-1 min-w-0 truncate fs-lg">{pick.name}</b>
                <div role="group" aria-label={`${pick.name}的類型`} className="flex rounded-md bg-[#eef0ed] p-0.5">
                  {(["need", "bonus", "drift"] as const).map((mode) => <button key={mode} aria-pressed={pick.mode === mode}
                    disabled={mode === "drift" && !driftSkills.has(pick.name)} title={mode === "drift" ? (driftSkills.has(pick.name) ? "要求等級全部由漂流鍊成提供" : "漂流石資料未收錄此技能") : undefined}
                    onClick={() => update(pick.name, { mode })}
                    className={cx("px-2 py-0.5 rounded fs-sm border-0 cursor-pointer disabled:opacity-40 disabled:cursor-default", pick.mode === mode ? "bg-white text-[#253229] font-bold shadow-[0_1px_3px_#ccd1ca]" : "bg-transparent text-[#687168]")}>{MODE_NAMES[mode]}</button>)}
                </div>
                <button aria-label={`移除${pick.name}`} onClick={() => toggleSkill(pick.name)} className="w-6 h-6 border-0 bg-transparent text-[#8b938c] cursor-pointer">✕</button>
                {pick.mode === "bonus" ? null
                  : <div className="basis-full flex items-center gap-2"><LevelBar max={max} native={pick.level} label={`${pick.name}要求等級`} onPick={(level) => update(pick.name, { level })} />
                    <b className="w-9 shrink-0 text-right text-[#e08a00]">Lv{pick.level}</b></div>}
              </div>;
            })}
            <input aria-label="搜尋技能" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋技能，例如：攻擊 會心"
              className="block w-full box-border p-2 border border-[#dfe2dc] rounded-md bg-[#f8f8f5] fs-md outline-none" />
            <div className="max-h-[260px] overflow-auto">
              <SkillGroups columns="wrap" popular={popularSkills(weaponType, stats?.element)} names={filtered} searching={terms.length > 0} empty={<p className={NOTE}>找不到符合的技能。</p>} renderSkill={(name) => { const on = picks.some((pick) => pick.name === name); return <button key={name} aria-pressed={on} title="長按看說明" {...press(name, () => toggleSkill(name))}
                className={cx("flex-auto text-center", NO_CALLOUT, "px-3 py-1.5 rounded border fs-lg cursor-pointer", on ? TOGGLE_ON : TOGGLE_OFF)}>{name}</button>; }} />
            </div>
          </div>
        </section>

        <section className={SECTION}>
          <div className={SECTION_HEAD}><span className="min-w-0">③ 指定部位{Object.keys(fixed).length ? `（${Object.keys(fixed).length}）` : ""}<small className={HINT}>若有指定等級，會顯示指定等級的狀態</small></span>
            <span className="flex items-center gap-3">
              {Object.keys(fixed).length ? <button className="border-0 bg-transparent p-0 fs-md text-[#099aa5] cursor-pointer font-normal" onClick={() => { setFixed({}); setFixing(null); }}>清除</button> : null}
              <button aria-expanded={fixOpen} className="border-0 bg-transparent p-0 fs-md text-[#099aa5] cursor-pointer font-normal" onClick={() => { setFixOpen(!fixOpen); setFixing(null); }}>{fixOpen ? "收合" : "展開"} {fixOpen ? "▴" : "▾"}</button>
            </span></div>
          {fixOpen || Object.keys(fixed).length ? <div className="p-2 space-y-1.5">
            {RECOMMEND_SLOTS.map((slot) => {
              const lock = fixed[slot];
              if (!fixOpen && !lock) return null;
              const item = lock ? byKey[lock.key] : undefined;
              const lowest = Math.max(1, item?.unlock ?? 1);
              return <div key={slot} className="rounded-md bg-[#fbfaf6] border border-[#eee6d4]">
                <div className="flex items-center gap-2 p-1.5">
                  <Icon src={gearIcons.armor[slot]} size={IC_SLOT} />
                  <span className="w-8 shrink-0 fs-md font-bold">{SLOT_NAMES[slot]}</span>
                  {lock && item ? <>
                    <Icon src={icons[lock.key]} size={IC} fallback={item.name} />
                    <span className="flex-1 min-w-0 truncate fs-lg font-bold">{item.name}</span>
                    <select aria-label={`${SLOT_NAMES[slot]}階級`} value={lock.grade} onChange={(event) => setFixed({ ...fixed, [slot]: { key: lock.key, grade: Number(event.target.value) } })}
                      className="shrink-0 py-1 px-1.5 border border-[#cfc7b4] rounded-md bg-white fs-md">
                      {Array.from({ length: 11 - lowest }, (_, position) => lowest + position).map((value) => <option key={value} value={value}>G{value}</option>)}</select>
                    <button className={SMALL_BUTTON} aria-expanded={fixing === slot} onClick={() => { setFixing(fixing === slot ? null : slot); setFixQuery(""); }}>{fixing === slot ? "收合" : "換"}</button>
                    <button aria-label={`取消指定${SLOT_NAMES[slot]}`} onClick={() => { const { [slot]: _removed, ...rest } = fixed; setFixed(rest); }} className="w-6 h-6 shrink-0 border-0 bg-transparent text-[#8b938c] cursor-pointer">✕</button>
                  </> : <>
                    <span className="flex-1 fs-md text-[#858d86]">自動搭配</span>
                    <button className={SMALL_BUTTON} aria-expanded={fixing === slot} onClick={() => { setFixing(fixing === slot ? null : slot); setFixQuery(""); }}>{fixing === slot ? "收合" : "指定"}</button>
                  </>}
                </div>
                {lock && item ? <p className="m-0 px-2 pb-1.5 fs-md text-[#5b635c]">{skillSpans(lock.key, slot, lock.grade)}　{pieceSlots(item, slot, lock.grade) ? `洞 ${pieceSlots(item, slot, lock.grade)}` : "沒有洞（不能鍊成）"}</p> : null}
                {fixing === slot ? <div className="desktop-monster-picker-content px-1.5 pb-1.5 space-y-1">
                  <input aria-label="搜尋裝備" value={fixQuery} onChange={(event) => setFixQuery(event.target.value)} placeholder="搜尋魔物或技能名稱"
                    className="block w-full box-border p-2 border border-[#dfe2dc] rounded-md bg-white fs-md outline-none" />
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="fs-sm text-[#858d86]">依技能：</span>
                    {[...new Set([...picks.map((pick) => pick.name), ...candSkills])].map((name) => { const on = candSkills.includes(name);
                      return <button key={name} aria-pressed={on} onClick={() => setCandSkills(on ? candSkills.filter((skill) => skill !== name) : [...candSkills, name])}
                        className={cx("px-2 py-0.5 rounded-full border fs-md cursor-pointer", on ? TOGGLE_ON : TOGGLE_OFF)}>{name}</button>; })}
                    
                    {candSkills.length ? <button className="border-0 bg-transparent p-0 fs-md text-[#099aa5] cursor-pointer" onClick={() => setCandSkills([])}>清除</button> : null}
                    {goalCount ? <label className="ml-auto flex items-center gap-1 fs-md text-[#5b635c] cursor-pointer"><input type="checkbox" checked={onlyHit} onChange={(event) => setOnlyHit(event.target.checked)} />只看有貢獻的</label> : null}
                  </div>
                  {(() => {
                    const all = pieceCandidates(slot);
                    const current = lock ? { gain: gainOf(lock.key, slot, lock.grade), holes: pieceSlots(byKey[lock.key], slot, lock.grade) } : null;
                    const same = current ? all.filter((candidate) => candidate.key !== lock!.key && gainOf(candidate.key, slot, Math.max(lock!.grade, candidate.unlock ?? 1)) === current.gain
                      && pieceSlots(candidate, slot, Math.max(lock!.grade, candidate.unlock ?? 1)) === current.holes) : [];
                    const row = (candidate: RecommendSeries) => {
                      const bad = hasExcluded(candidate.key, slot), gain = gainOf(candidate.key, slot, 10), selected = lock?.key === candidate.key;
                      return <button key={candidate.key} disabled={bad} onClick={() => {
                        const pieceGrade = Math.max(lock?.grade ?? grade, candidate.unlock ?? 1);
                        setFixed({ ...fixed, [slot]: { key: candidate.key, grade: pieceGrade } }); setFixing(null);
                      }} className={cx("w-full flex items-center gap-2 p-1.5 rounded-md border text-left cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed", selected ? "border-[#e0a900] bg-[#fffdf5]" : "border-[#e3dac6] bg-white hover:border-[#099aa5]")}>
                        <Icon src={icons[candidate.key]} size={IC} fallback={candidate.name} />
                        <span className="flex-1 min-w-0"><b className="block fs-md">{candidate.name}{bad ? <small className="ml-1.5 font-normal text-[#b23a30]">含不配裝技能</small> : null}</b>
                          <span className="block fs-md text-[#5b635c]">{skillSpans(candidate.key, slot, 10)}　{pieceSlots(candidate, slot, 10) ? `洞 ${pieceSlots(candidate, slot, 10)}` : "沒有洞"}（G10）</span></span>
                        {goalCount ? <b className="shrink-0 fs-md text-[#e08a00]">+{gain}</b> : null}
                      </button>;
                    };
                    return <div className="max-h-[260px] overflow-auto space-y-1">
                      {same.length ? <><p className={cx(NOTE, "m-0")}><b>可換</b></p>{same.map(row)}<p className={cx(NOTE, "m-0 pt-1")}><b>其他</b></p></> : null}
                      {all.filter((candidate) => !same.includes(candidate)).map(row)}
                      {!all.length ? <p className={NOTE}>找不到符合的裝備。{goalCount && onlyHit ? "可以取消「只看有貢獻的」。" : ""}</p> : null}
                    </div>;
                  })()}
                </div> : null}
              </div>;
            })}
          </div> : null}
        </section>

        <section className={SECTION}>
          <div className={SECTION_HEAD}><span className="min-w-0">④ 不配裝技能{excluded.length ? `（${excluded.length}）` : ""}<small className={HINT}>結果不會出現帶有這些技能的防具，也不會用漂流石鍊它們</small></span>
            <span className="flex items-center gap-2 font-normal">
              {excluded.length ? <button className="border-0 bg-transparent p-0 fs-md text-[#099aa5] cursor-pointer" onClick={() => setExcluded([])}>清除</button> : null}
              <button className={SMALL_BUTTON} aria-expanded={excludeOpen} onClick={() => setExcludeOpen(!excludeOpen)}>{excludeOpen ? "收合" : "＋ 新增"}</button></span></div>
          <div className="p-2 space-y-2">
            {excluded.length ? <div className="flex flex-wrap gap-1">{excluded.map((name) => <button key={name} aria-label={`移除不配裝${name}`} onClick={() => toggleExcluded(name)}
              className="px-2.5 py-1 rounded-full border border-[#e3a3a3] bg-[#fdf1f1] fs-lg text-[#a23030] cursor-pointer">{name} ✕</button>)}</div>
              : null}
            {excludeOpen ? <>
              <input aria-label="搜尋不配裝技能" value={excludeQuery} onChange={(event) => setExcludeQuery(event.target.value)} placeholder="搜尋技能"
                className="block w-full box-border p-2 border border-[#dfe2dc] rounded-md bg-[#f8f8f5] fs-md outline-none" />
              <div className="max-h-[260px] overflow-auto">
                <SkillGroups columns="wrap" names={excludeFiltered} searching={excludeTerms.length > 0} empty={<p className={NOTE}>找不到符合的技能。</p>} renderSkill={(name) => { const on = excluded.includes(name);
                  return <button key={name} aria-pressed={on} title="長按看說明" {...press(name, () => toggleExcluded(name))}
                    className={cx("flex-auto text-center", NO_CALLOUT, "px-3 py-1.5 rounded border fs-lg cursor-pointer", on ? "border-[#d23c3c] bg-[#fdf1f1] text-[#a23030]" : TOGGLE_OFF)}>{name}</button>; }} />
              </div>
            </> : null}
          </div>
        </section>

        {objective === "damage" ? <section className={SECTION}>
          <div className={SECTION_HEAD}><span className="min-w-0">不用漂流石鍊{noDrift.length ? `（${noDrift.length}）` : ""}<small className={HINT}>自動補洞時不鍊這些；防具本身帶有沒關係，你指定要的技能也不受影響</small></span>
            <button className={SMALL_BUTTON} aria-expanded={noDriftOpen} onClick={() => setNoDriftOpen(!noDriftOpen)}>{noDriftOpen ? "收合" : "＋ 新增"}</button></div>
          <div className="p-2 space-y-2">
            {noDrift.length ? <div className="flex flex-wrap gap-1">{noDrift.map((name) => <button key={name} aria-label={`移除${name}`} onClick={() => setNoDrift(noDrift.filter((skill) => skill !== name))}
              className="px-2.5 py-1 rounded-full border border-[#cfc7b4] bg-[#f4f1e8] fs-lg text-[#5b635c] cursor-pointer">{name} ✕</button>)}</div> : null}
            {noDriftOpen ? <>
              <input aria-label="搜尋不鍊的技能" value={noDriftQuery} onChange={(event) => setNoDriftQuery(event.target.value)} placeholder="搜尋技能"
                className="block w-full box-border p-2 border border-[#dfe2dc] rounded-md bg-[#f8f8f5] fs-md outline-none" />
              <div className="max-h-[220px] overflow-auto">
                <SkillGroups columns="wrap" names={[...driftSkills].filter((name) => !noDriftQuery.trim() || name.toLowerCase().includes(noDriftQuery.trim().toLowerCase())).sort((a, b) => a.localeCompare(b, "zh-Hant"))}
                  searching={!!noDriftQuery.trim()} empty={<p className={NOTE}>找不到符合的技能。</p>} renderSkill={(name) => { const on = noDrift.includes(name);
                    return <button key={name} aria-pressed={on} title="長按看說明" {...press(name, () => setNoDrift(on ? noDrift.filter((skill) => skill !== name) : [...noDrift, name]))}
                      className={cx("flex-auto text-center", NO_CALLOUT, "px-3 py-1.5 rounded border fs-lg cursor-pointer", on ? TOGGLE_ON : TOGGLE_OFF)}>{name}</button>; }} />
              </div>
            </> : null}
          </div>
        </section> : null}

        <section className={SECTION}>
          <div className={SECTION_HEAD}><span>⑤ 排序</span>
            <div role="group" aria-label="排序方式" className="flex rounded-md bg-[#eef0ed] p-0.5 font-normal">
              {([["stones", "最少鍊成"], ["damage", "最大傷害"]] as const).map(([value, label]) => <button key={value} aria-pressed={objective === value} onClick={() => setObjective(value)}
                className={cx("px-2.5 py-0.5 rounded fs-md border-0 cursor-pointer", objective === value ? "bg-white text-[#253229] font-bold shadow-[0_1px_3px_#ccd1ca]" : "bg-transparent text-[#687168]")}>{label}</button>)}
            </div>
          </div>
          {objective === "damage" ? <div className="p-2 space-y-1.5">
            {statsText ? <p className="m-0 fs-md text-[#39423a]">武器數值（G{grade}-5）：{statsText}</p> : null}
            <p className={NOTE}>必備技能可以不選。勾選的條件技能視為發動中：</p>
            <div className="flex flex-wrap gap-1">{CONDITIONAL.map(({ skill, condition }) => { const on = conditions.includes(skill); return <button key={skill} aria-pressed={on} title={condition}
              onClick={() => setConditions(on ? conditions.filter((name) => name !== skill) : [...conditions, skill])}
              className={cx("px-2 py-1 rounded border fs-md cursor-pointer text-left leading-tight", on ? TOGGLE_ON : TOGGLE_OFF)}>{skill}<span className="block fs-sm text-[#858d86]">{condition}</span></button>; })}</div>
          </div> : null}
        </section>

        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <input type="checkbox" checked={includeDrifts || driftOnly.length > 0} disabled={driftOnly.length > 0} onChange={(event) => setIncludeDrifts(event.target.checked)} />
          <span>允許漂流鍊成補足技能<span className="block fs-sm text-[#858d86]">每個已解鎖的洞補 1 級；有「全鍊成」技能時必定開啟</span></span>
        </label>
      </div>
      <div className="shrink-0 space-y-1">
        {error ? <p role="alert" className="m-0 fs-md text-[#d23c3c]">{error}</p> : null}
        <button className={PRIMARY} disabled={!canSearch || busy} onClick={() => void search()}>
          {busy ? "搜尋中……" : !weaponType ? "先選武器" : !canSearch ? "至少選一個必備技能" : "搜尋配裝"}</button>
      </div>
    </div>
  </FloatingPicker>;
}
