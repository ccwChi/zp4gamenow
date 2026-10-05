"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { assetPath } from "./assetPath";
import type { Build } from "./buildStore";
import { FloatingPicker } from "./FloatingPicker";
import { DEFAULT_CONDITIONS, SKILL_EFFECTS } from "./damage";
import { pieceSkills, recommendBuilds, swapPiece, weaponSetup, RECOMMEND_SLOTS, type Recommendation, type RecommendSeries, type RecommendDrifts } from "./recommendBuilds";

type Slot = typeof RECOMMEND_SLOTS[number];
/** need：必備（原生＋漂流補足）；drift：必備且全部靠漂流鍊成；bonus：非必備，只用來排序。 */
type Mode = "need" | "drift" | "bonus";
type Pick = { name: string; level: number; mode: Mode };

const SLOT_NAMES: Record<Slot, string> = { helm: "頭部", mail: "身體", gloves: "手部", belt: "腰部", greaves: "腳部" };
const MODE_NAMES: Record<Mode, string> = { need: "必備", bonus: "加分", drift: "全鍊成" };
const ELEMENT_NAMES: Record<string, string> = { fire: "火", water: "水", thunder: "雷", ice: "冰", dragon: "龍", poison: "毒", paralysis: "麻痺", sleep: "睡眠", blast: "爆破" };
/** 有發動條件的傷害技能（最大傷害模式讓使用者勾選要不要算）。 */
const CONDITIONAL = Object.entries(SKILL_EFFECTS).filter(([, setup]) => setup.condition).map(([skill, setup]) => ({ skill, condition: setup.condition! }));
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const BG_ICON = "bg-contain bg-center bg-no-repeat";
const NOTE = "m-0 text-[12px] text-[#858d86] leading-[1.6]";
const SECTION = "border border-[#e3dac6] rounded-lg bg-white";
const SECTION_HEAD = "flex items-center justify-between gap-2 px-3 py-2 bg-[#fffaf0] rounded-t-lg text-[13px] font-bold";
const TOGGLE_ON = "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900] text-[#2b332c]";
const TOGGLE_OFF = "border-[#e3e6e1] bg-white text-[#5b635c]";
const PRIMARY = "w-full py-2.5 rounded-lg border-0 bg-[#28352e] text-white text-[14px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-default";
const SMALL_BUTTON = "shrink-0 px-2.5 py-1 rounded-md border border-[#cfc7b4] bg-white text-[12px] cursor-pointer disabled:opacity-50 disabled:cursor-default";

/** 圖示；沒有圖時顯示 fallback 文字的第一個字（例如魔物名稱）。 */
function Icon({ src, size, title, fallback }: { src?: string; size: number; title?: string; fallback?: string }) {
  return <span title={title} aria-hidden={title ? undefined : true} className={cx("flex shrink-0 items-center justify-center rounded text-[11px] font-bold text-[#5b635c]", BG_ICON, !src && fallback && "bg-[#f1f2ef]")}
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
function Detail({ item, picks, maxLevels, byKey, icons, gearIcons, grade, onSwap }: {
  item: Recommendation; picks: Pick[]; maxLevels: Record<string, number>; byKey: Record<string, RecommendSeries>;
  icons: Record<string, string>; gearIcons: { armor: Record<string, string> }; grade: number; onSwap: (slot: Slot, key: string) => void;
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
      <p className="flex justify-between items-baseline gap-1 m-0 mb-0.5 text-[12px]">
        <span className={cx("min-w-0 truncate", wanted && "font-bold text-[#2b332c]")}>{name}{wanted?.mode === "bonus" ? <em className="not-italic text-[10px] text-[#b06d00]"> 加分</em> : null}</span>
        <b className={cx("text-[13px]", total > max || short ? "text-[#d23c3c]" : "text-[#e08a00]")}>{total}{wanted && wanted.mode !== "bonus" ? <span className="font-normal text-[#8b938c]">/{wanted.level}</span> : null}</b>
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
          <Icon src={gearIcons.armor[slot]} size={18} />
          <Icon src={icons[key]} size={30} fallback={byKey[key]?.name} />
          <div className="flex-1 min-w-0">
            <p className="m-0 font-bold text-[12px]">{byKey[key]?.name}{SLOT_NAMES[slot].slice(0, 1)}</p>
            <p className="m-0 text-[11px] text-[#5b635c]">{Object.entries(pieceSkills(byKey[key], slot, grade)).map(([name, level]) => <span key={name} className={cx("mr-2", targets.includes(name) && "font-bold text-[#2b332c]")}>{name} {level}</span>)}</p>
            {stonesHere.length ? <p className="m-0 text-[11px] text-[#087b84]">鍊成：{stonesHere.map((pick) => pick?.skill).join("、")}</p> : null}
          </div>
          {alternatives.length ? <button aria-expanded={swapping === slot} className={SMALL_BUTTON} onClick={() => setSwapping(swapping === slot ? null : slot)}>換（{alternatives.length}）</button> : null}
        </div>
        {swapping === slot ? <div className="px-1.5 pb-1.5 space-y-1 max-h-[220px] overflow-auto">
          <p className={NOTE}>以下替換後條件一樣成立，差別在其他技能：</p>
          {alternatives.map((alternative) => <button key={alternative} onClick={() => { onSwap(slot, alternative); setSwapping(null); }}
            className="w-full flex items-center gap-2 p-1.5 rounded-md border border-[#e3dac6] bg-white text-left cursor-pointer hover:border-[#099aa5]">
            <Icon src={icons[alternative]} size={26} fallback={byKey[alternative]?.name} />
            <span className="flex-1 min-w-0"><b className="block text-[12px]">{byKey[alternative]?.name}</b>
              <span className="block text-[11px] text-[#5b635c]">{Object.entries(pieceSkills(byKey[alternative], slot, grade)).map(([name, level]) => `${name} ${level}`).join("、") || "無技能"}</span></span>
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

export function RecommendPicker({ series, stones, skillLevels, weaponNames, icons, gearIcons, weaponPicker, full, onSave, onClose }: {
  series: RecommendSeries[]; stones: RecommendDrifts; skillLevels: Record<string, string[]>; weaponNames: Record<string, string>;
  icons: Record<string, string>; gearIcons: { weapon: Record<string, string>; armor: Record<string, string> };
  weaponPicker: (value: string, onPick: (weapon: string) => void) => ReactNode;
  full: boolean; onSave: (build: Build) => void; onClose: () => void;
}) {
  const [weapon, setWeapon] = useState("");
  const [choosingWeapon, setChoosingWeapon] = useState(true);
  // 一律以最高階（G10）的技能、洞數與武器數值計算。
  const grade = 10;
  const [picks, setPicks] = useState<Pick[]>([]);
  const [query, setQuery] = useState("");
  const [includeDrifts, setIncludeDrifts] = useState(true);
  const [objective, setObjective] = useState<"stones" | "damage">("stones");
  const [conditions, setConditions] = useState<string[]>(DEFAULT_CONDITIONS);
  const [page, setPage] = useState<"form" | "results">("form");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Recommendation[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(0);
  const [saved, setSaved] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const byKey = useMemo(() => Object.fromEntries(series.map((item) => [item.key, item])), [series]);
  const maxLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    for (const [name, descriptions] of Object.entries(skillLevels)) if (descriptions.length) levels[name] = descriptions.length;
    for (const item of series) for (const entries of [...Object.values(item.skills), ...Object.values(item.weaponSkills ?? {})]) {
      for (const entry of entries) if (!levels[entry.skill]) levels[entry.skill] = Math.max(1, ...entry.levels.map((level) => level.level));
    }
    return levels;
  }, [series, skillLevels]);
  const skillNames = useMemo(() => Object.keys(maxLevels).sort((a, b) => a.localeCompare(b, "zh-Hant")), [maxLevels]);
  const driftSkills = useMemo(() => new Set([...stones.colors.flatMap((color) => color.skills.map((item) => item.name)), ...stones.common, ...stones.events.flatMap((event) => event.skills)]), [stones]);

  const [weaponKey, weaponType] = weapon.split("::");
  const weaponTitle = weapon ? `${byKey[weaponKey]?.name ?? ""}${weaponNames[weaponType] ?? ""}` : "";
  const required = Object.fromEntries(picks.filter((pick) => pick.mode !== "bonus").map((pick) => [pick.name, pick.level]));
  const driftOnly = picks.filter((pick) => pick.mode === "drift").map((pick) => pick.name);
  const bonus = picks.filter((pick) => pick.mode === "bonus").map((pick) => pick.name);
  const terms = query.trim().toLowerCase().split(/[\s,，]+/).filter(Boolean);
  const filtered = terms.length ? skillNames.filter((name) => terms.some((term) => name.toLowerCase().includes(term))) : skillNames;
  const canSearch = !!weaponType && (objective === "damage" || Object.keys(required).length > 0);
  const stats = weapon && byKey[weaponKey] ? weaponSetup(byKey[weaponKey], weaponType, grade) : undefined;
  const statsText = stats ? `攻擊 ${stats.atk}${stats.ele ? ` · ${ELEMENT_NAMES[stats.element] ?? stats.element} ${stats.ele}` : ""} · 會心 ${stats.crit}%` : "";

  function update(name: string, change: Partial<Pick>) {
    setPicks((current) => current.map((pick) => pick.name === name ? { ...pick, ...change } : pick));
  }
  function toggleSkill(name: string) {
    const adding = !picks.some((pick) => pick.name === name);
    setPicks((current) => current.some((pick) => pick.name === name) ? current.filter((pick) => pick.name !== name) : [...current, { name, level: maxLevels[name] ?? 1, mode: "need" }]);
    // 從搜尋結果加入後清掉搜尋字，回到完整清單。
    if (adding) setQuery("");
  }
  async function search() {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true); setError(""); setSaved([]); setOpen(0);
    try {
      const next = await recommendBuilds(series, stones, { weapon, required, grade, includeDrifts: includeDrifts || driftOnly.length > 0, driftOnly, bonus, maxLevels, signal: active.signal,
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

  if (page === "results") return <FloatingPicker title="建議配裝 · 結果" onClose={onClose}>
    <div className="h-full flex flex-col gap-2 text-[13px]">
      <div className="shrink-0 flex items-center gap-2 p-2 rounded-lg bg-[#fffaf0] border border-[#e3dac6]">
        <Icon src={gearIcons.weapon[weaponType]} size={22} />
        <Icon src={icons[weaponKey]} size={30} fallback={byKey[weaponKey]?.name} />
        <div className="flex-1 min-w-0">
          <p className="m-0 font-bold truncate">{weaponTitle} · G{grade}{objective === "damage" ? " · 最大傷害" : ""}</p>
          <p className="m-0 text-[12px] text-[#5b635c] truncate">{objective === "damage" ? `${statsText}　` : ""}{picks.map((pick) => pick.mode === "bonus" ? `+${pick.name}` : `${pick.name}${pick.level}`).join("　")}</p>
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
              <span className="flex shrink-0 gap-0.5">{RECOMMEND_SLOTS.map((slot) => <Icon key={slot} src={icons[item.build.gear[slot]]} size={28} title={`${SLOT_NAMES[slot]}：${byKey[item.build.gear[slot]]?.name}`} fallback={byKey[item.build.gear[slot]]?.name} />)}</span>
              <span className="flex-1 min-w-0 flex flex-wrap justify-end gap-1 text-[11px] whitespace-nowrap">
                {objective === "damage" ? <span className="px-1.5 py-0.5 rounded bg-[#28352e] text-white font-bold" title={`傷害指數 ${item.damage.toFixed(0)}`}>
                  {index ? `${(item.damage / results[0].damage * 100).toFixed(1)}%` : item.damage.toFixed(0)}</span> : null}
                <span className={cx("px-1.5 py-0.5 rounded", item.stoneCount ? "bg-[#e6f5f6] text-[#087b84]" : "bg-[#eef3e9] text-[#3d6b35]")}>{item.stoneCount ? `鍊成 ${item.stoneCount}${item.rareStones ? `·稀${item.rareStones}` : ""}` : "免鍊成"}</span>
                {item.freeSlots ? <span className="px-1.5 py-0.5 rounded bg-[#f1f2ef] text-[#5b635c]">空洞 {item.freeSlots}</span> : null}
                {item.bonus ? <span className="px-1.5 py-0.5 rounded bg-[#fff3dc] text-[#b06d00]">加分 {item.bonus}</span> : null}
              </span>
              <span className={cx("shrink-0 text-[#8b938c] [transition:transform_.15s]", expanded && "[transform:rotate(180deg)]")}>▾</span>
            </button>
            {expanded ? <Detail item={item} picks={picks} maxLevels={maxLevels} byKey={byKey} icons={icons} gearIcons={gearIcons} grade={grade} onSwap={(slot, key) => swap(index, slot, key)} /> : null}
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

  return <FloatingPicker title="建議配裝" onClose={onClose}>
    <div className="h-full flex flex-col gap-2 text-[13px]">
      <div className="flex-1 min-h-0 overflow-auto space-y-2">
        <section className={SECTION}>
          <div className={SECTION_HEAD}>
            <span className="flex items-center gap-2 min-w-0">{weapon ? <><Icon src={gearIcons.weapon[weaponType]} size={22} /><Icon src={icons[weaponKey]} size={28} fallback={byKey[weaponKey]?.name} /></> : null}
              <span className="truncate">{weapon ? weaponTitle : "① 武器"}</span></span>
            {weapon ? <button className={SMALL_BUTTON} onClick={() => setChoosingWeapon(!choosingWeapon)}>{choosingWeapon ? "收合" : "更換"}</button> : null}
          </div>
          {choosingWeapon || !weapon ? <div className="p-2">{weaponPicker(weapon, (next) => { setWeapon(next); setChoosingWeapon(false); })}</div> : null}
        </section>

        <section className={SECTION}>
          <div className={SECTION_HEAD}><span>② 技能{picks.length ? `（${picks.length}）` : ""}</span>
            {picks.length ? <button className="border-0 bg-transparent p-0 text-[12px] text-[#099aa5] cursor-pointer" onClick={() => setPicks([])}>清除</button> : null}</div>
          <div className="p-2 space-y-2">
            {picks.map((pick) => {
              const max = maxLevels[pick.name] ?? 1;
              return <div key={pick.name} className="flex flex-wrap items-center gap-x-2 gap-y-1 p-1.5 rounded-md bg-[#fbfaf6] border border-[#eee6d4]">
                <b className="flex-1 min-w-0 truncate text-[13px]">{pick.name}</b>
                <div role="group" aria-label={`${pick.name}的類型`} className="flex rounded-md bg-[#eef0ed] p-0.5">
                  {(["need", "bonus", "drift"] as const).map((mode) => <button key={mode} aria-pressed={pick.mode === mode}
                    disabled={mode === "drift" && !driftSkills.has(pick.name)} title={mode === "drift" ? (driftSkills.has(pick.name) ? "要求等級全部由漂流鍊成提供" : "漂流石資料未收錄此技能") : undefined}
                    onClick={() => update(pick.name, { mode })}
                    className={cx("px-2 py-0.5 rounded text-[11px] border-0 cursor-pointer disabled:opacity-40 disabled:cursor-default", pick.mode === mode ? "bg-white text-[#253229] font-bold shadow-[0_1px_3px_#ccd1ca]" : "bg-transparent text-[#687168]")}>{MODE_NAMES[mode]}</button>)}
                </div>
                <button aria-label={`移除${pick.name}`} onClick={() => toggleSkill(pick.name)} className="w-6 h-6 border-0 bg-transparent text-[#8b938c] cursor-pointer">✕</button>
                {pick.mode === "bonus" ? <p className={cx(NOTE, "basis-full")}>不強制，越高的方案排越前面</p>
                  : <div className="basis-full flex items-center gap-2"><LevelBar max={max} native={pick.level} label={`${pick.name}要求等級`} onPick={(level) => update(pick.name, { level })} />
                    <b className="w-9 shrink-0 text-right text-[#e08a00]">Lv{pick.level}</b></div>}
              </div>;
            })}
            <input aria-label="搜尋技能" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋技能，例如：攻擊 會心"
              className="block w-full box-border p-2 border border-[#dfe2dc] rounded-md bg-[#f8f8f5] text-[13px] outline-none" />
            <div className="flex flex-wrap gap-1 max-h-[180px] overflow-auto">
              {filtered.map((name) => { const on = picks.some((pick) => pick.name === name); return <button key={name} aria-pressed={on} onClick={() => toggleSkill(name)}
                className={cx("px-2 py-1 rounded border text-[12px] cursor-pointer", on ? TOGGLE_ON : TOGGLE_OFF)}>{name}</button>; })}
              {!filtered.length ? <p className={NOTE}>找不到符合的技能。</p> : null}
            </div>
          </div>
        </section>

        <section className={SECTION}>
          <div className={SECTION_HEAD}><span>③ 排序</span>
            <div role="group" aria-label="排序方式" className="flex rounded-md bg-[#eef0ed] p-0.5 font-normal">
              {([["stones", "最少鍊成"], ["damage", "最大傷害"]] as const).map(([value, label]) => <button key={value} aria-pressed={objective === value} onClick={() => setObjective(value)}
                className={cx("px-2.5 py-0.5 rounded text-[12px] border-0 cursor-pointer", objective === value ? "bg-white text-[#253229] font-bold shadow-[0_1px_3px_#ccd1ca]" : "bg-transparent text-[#687168]")}>{label}</button>)}
            </div>
          </div>
          {objective === "damage" ? <div className="p-2 space-y-1.5">
            {statsText ? <p className="m-0 text-[12px] text-[#39423a]">武器數值（G{grade}-5）：{statsText}</p> : null}
            <p className={NOTE}>必備技能可以不選。勾選的條件技能視為發動中：</p>
            <div className="flex flex-wrap gap-1">{CONDITIONAL.map(({ skill, condition }) => { const on = conditions.includes(skill); return <button key={skill} aria-pressed={on} title={condition}
              onClick={() => setConditions(on ? conditions.filter((name) => name !== skill) : [...conditions, skill])}
              className={cx("px-2 py-1 rounded border text-[12px] cursor-pointer text-left leading-tight", on ? TOGGLE_ON : TOGGLE_OFF)}>{skill}<span className="block text-[10px] text-[#858d86]">{condition}</span></button>; })}</div>
          </div> : null}
        </section>

        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <input type="checkbox" checked={includeDrifts || driftOnly.length > 0} disabled={driftOnly.length > 0} onChange={(event) => setIncludeDrifts(event.target.checked)} />
          <span>允許漂流鍊成補足技能<span className="block text-[11px] text-[#858d86]">每個已解鎖的洞補 1 級；有「全鍊成」技能時必定開啟</span></span>
        </label>
      </div>
      <div className="shrink-0 space-y-1">
        {error ? <p role="alert" className="m-0 text-[12px] text-[#d23c3c]">{error}</p> : null}
        <button className={PRIMARY} disabled={!canSearch || busy} onClick={() => void search()}>
          {busy ? "搜尋中……" : !weaponType ? "先選武器" : !canSearch ? "至少選一個必備技能" : "搜尋配裝"}</button>
      </div>
    </div>
  </FloatingPicker>;
}
