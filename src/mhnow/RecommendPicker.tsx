"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Build } from "./buildStore";
import { FloatingPicker } from "./FloatingPicker";
import { recommendBuilds, RECOMMEND_SLOTS, type RecommendSeries, type RecommendDrifts, type RecommendationResult } from "./recommendBuilds";

const SLOT_NAMES = { helm: "頭部", mail: "身體", gloves: "手部", belt: "腰部", greaves: "腳部" };
const SP_SKILL = "絕對迴避【SP】";
const INPUT = "p-2 border border-[#d8d0bd] rounded-md bg-white min-w-0";
const BUTTON = "px-3 py-2 rounded-md border border-[#cfc7b4] bg-white disabled:opacity-50 disabled:cursor-default cursor-pointer";

export function RecommendPicker({ series, stones, skillLevels, weaponNames, full, onSave, onClose }: {
  series: RecommendSeries[]; stones: RecommendDrifts; skillLevels: Record<string, string[]>;
  weaponNames: Record<string, string>; full: boolean; onSave: (build: Build) => void; onClose: () => void;
}) {
  const [weaponType, setWeaponType] = useState("");
  const [weaponSeries, setWeaponSeries] = useState("");
  const [grade, setGrade] = useState(10);
  const [required, setRequired] = useState<Record<string, number>>({});
  const [skill, setSkill] = useState("");
  const [includeDrifts, setIncludeDrifts] = useState(false);
  const [driftOnly, setDriftOnly] = useState<string[]>([]);
  const [spLevel, setSpLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const listId = useId();
  useEffect(() => () => controller.current?.abort(), []);
  const names = useMemo(() => Object.fromEntries(series.map((item) => [item.key, item.name])), [series]);
  const maxLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    for (const [name, descriptions] of Object.entries(skillLevels)) if (descriptions.length) levels[name] = descriptions.length;
    for (const item of series) for (const entries of [...Object.values(item.skills), ...Object.values(item.weaponSkills ?? {})]) {
      for (const entry of entries) if (!levels[entry.skill]) levels[entry.skill] = Math.max(1, ...entry.levels.map((level) => level.level));
    }
    return levels;
  }, [series, skillLevels]);
  const skillNames = Object.keys(maxLevels).filter((name) => name !== SP_SKILL).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const targets = spLevel ? { ...required, [SP_SKILL]: spLevel } : required;
  const driftSkills = new Set([...stones.colors.flatMap((color) => color.skills.map((item) => item.name)), ...stones.common, ...stones.events.flatMap((event) => event.skills)]);
  function invalidate() { setResult(null); setError(""); setSaved([]); }
  async function search() {
    invalidate();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    try {
      const next = await recommendBuilds(series, stones, { weapon: `${weaponSeries}::${weaponType}`, required: targets, grade, includeDrifts, driftOnly, signal: active.signal });
      if (!active.signal.aborted) setResult(next);
    } catch (cause) {
      if (!active.signal.aborted) setError(cause instanceof Error ? cause.message : "搜尋失敗，請重試。");
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }
  return <FloatingPicker title="建議配裝" onClose={onClose}>
    <div className="overflow-auto min-h-0 text-[13px] space-y-3 p-1">
      <p className="m-0 text-[#687168]">指定武器與必備技能，尋找最多 10 組完整配裝。依指定階級計算技能與洞位，優先尋找較少漂流石的方案。</p>
      <fieldset disabled={busy} className="border-0 p-0 m-0 space-y-3" onChange={invalidate}>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">武器種類（必選）<select className={INPUT} value={weaponType} onChange={(event) => { setWeaponType(event.target.value); setWeaponSeries(""); }}>
            <option value="">選擇武器種類</option>{Object.entries(weaponNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select></label>
          <label className="flex flex-col gap-1">武器系列（必選）<select className={INPUT} disabled={!weaponType} value={weaponSeries} onChange={(event) => setWeaponSeries(event.target.value)}>
            <option value="">選擇武器系列</option>{series.filter((item) => item.weaponTypes.includes(weaponType)).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select></label>
        </div>
        <label className="flex items-center gap-2">武器與防具階級<select className={INPUT} value={grade} onChange={(event) => setGrade(Number(event.target.value))}>
          {Array.from({ length: 10 }, (_, index) => index + 1).map((level) => <option key={level} value={level}>G{level}</option>)}
        </select></label>
        <div className="space-y-2">
          <label className="block" htmlFor={`${listId}-input`}>想要的技能（可輸入搜尋）</label>
          <div className="flex gap-2"><input id={`${listId}-input`} list={listId} value={skill} onChange={(event) => setSkill(event.target.value)} className={`${INPUT} flex-1`} placeholder="輸入技能名稱" />
            <datalist id={listId}>{skillNames.map((name) => <option key={name} value={name} />)}</datalist>
            <button className={BUTTON} disabled={!skillNames.includes(skill) || required[skill] !== undefined} onClick={() => { setRequired({ ...required, [skill]: 1 }); setSkill(""); invalidate(); }}>加入</button>
          </div>
          {Object.entries(required).map(([name, level]) => <div key={name} className="flex flex-wrap items-center gap-2">
            <label className="flex flex-1 items-center justify-between gap-2">{name}<select className={INPUT} value={level} onChange={(event) => setRequired({ ...required, [name]: Number(event.target.value) })}>
              {Array.from({ length: maxLevels[name] }, (_, index) => index + 1).map((value) => <option key={value} value={value}>至少 Lv{value}</option>)}
            </select></label>
            <button className={BUTTON} aria-label={`移除${name}`} onClick={() => { setRequired(Object.fromEntries(Object.entries(required).filter(([key]) => key !== name))); setDriftOnly(driftOnly.filter((key) => key !== name)); invalidate(); }}>移除</button>
            <label className="basis-full flex items-center gap-2 text-[12px]">
              <input type="checkbox" aria-label={`${name}全靠漂流鍊成`} disabled={!driftSkills.has(name)} checked={driftOnly.includes(name)} onChange={(event) => {
                setDriftOnly(event.target.checked ? [...driftOnly, name] : driftOnly.filter((key) => key !== name));
                if (event.target.checked) setIncludeDrifts(true);
              }} />全靠漂流鍊成{!driftSkills.has(name) ? "（目前漂流石資料未收錄此技能）" : ""}
            </label>
          </div>)}
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={includeDrifts} disabled={driftOnly.length > 0} onChange={(event) => setIncludeDrifts(event.target.checked)} />允許漂流石（含神秘漂流石）</label>
        {driftOnly.length ? <p className="text-[12px] text-[#687168] m-0">指定技能的要求等級全部由漂流鍊成提供，原生技能不抵扣；例如集中 Lv5 需要 5 個洞位。取消各技能的「全靠漂流鍊成」後即可關閉漂流石。</p> : null}
        {includeDrifts ? <p className="text-[12px] text-[#687168] m-0">依技能池與已解鎖洞位補足技能，每洞計 1 級；不代表目前已持有或一定能鍊成。</p> : null}
        <div className="flex items-center gap-2"><label className="flex items-center gap-2"><input type="checkbox" checked={spLevel > 0} onChange={(event) => setSpLevel(event.target.checked ? 1 : 0)} />必備：{SP_SKILL}</label>
          {spLevel > 0 ? <select aria-label="絕對迴避 SP 最低等級" className={INPUT} value={spLevel} onChange={(event) => setSpLevel(Number(event.target.value))}>{[1, 2, 3].map((value) => <option key={value} value={value}>至少 Lv{value}</option>)}</select> : null}
        </div>
        <p className="m-0 text-[12px] text-[#687168]">傷害最佳化尚未提供；目前結果依技能條件搜尋，不代表最大傷害。樣式專屬技能不納入計算。</p>
        <button className={`${BUTTON} w-full !bg-[#28352e] text-white`} disabled={!weaponSeries || !weaponType || !Object.keys(targets).length} onClick={() => void search()}>產生建議配裝</button>
      </fieldset>
      {busy ? <div role="status" className="flex items-center justify-between">正在搜尋配裝……<button className={BUTTON} onClick={() => { controller.current?.abort(); setBusy(false); }}>取消搜尋</button></div> : null}
      {error ? <p role="alert">{error}</p> : null}
      {result ? <div className="space-y-3">
        <p role="status">{result.recommendations.length ? `找到 ${result.recommendations.length} 組符合條件的配裝（G${grade}）` : result.truncated ? "搜尋範圍內尚未找到符合條件的配裝，請減少條件後重試。" : "沒有符合條件的配裝，請降低技能等級、提高裝備階級或允許漂流石。"}</p>
        {result.truncated ? <p className="text-[#926d24]">已達搜尋上限，仍可能有其他組合。以下只列出已找到的方案。</p> : null}
        {result.recommendations.map((item, index) => <article key={item.build.id} className="rounded-lg border border-[#d8d0bd] bg-[#fffdf7] p-3 space-y-2">
          <h3 className="m-0 text-[14px]">方案 {index + 1} · 漂流石 {item.stoneCount} 顆</h3>
          <p className="m-0">武器：{names[weaponSeries]} · {weaponNames[weaponType]}</p>
          {RECOMMEND_SLOTS.map((slot) => <div key={slot}><b>{SLOT_NAMES[slot]}</b>：{names[item.build.gear[slot]]}
            {item.build.drifts[slot]?.length ? <span className="block text-[12px] text-[#687168]">漂流石：{item.build.drifts[slot].map((pick) => pick?.skill).join("、")}</span> : null}
          </div>)}
          <div className="text-[#087b84]">{Object.entries(targets).map(([name, level]) => {
            const driftLevel = Object.values(item.build.drifts).flat().filter((pick) => pick?.skill === name).length;
            const nativeLevel = (item.skills[name] ?? 0) - driftLevel;
            return <p key={name} className="m-0">{name} Lv{Math.min(item.skills[name] ?? 0, maxLevels[name] ?? Infinity)}／要求 {level}{driftOnly.includes(name) ? "（全靠漂流鍊成）" : ""}<span className="block text-[12px] text-[#687168]">原生 {nativeLevel} 級 ＋ 鍊成 {driftLevel} 級{nativeLevel + driftLevel > (maxLevels[name] ?? Infinity) ? "（總等級超過技能上限）" : ""}</span></p>;
          })}</div>
          <details><summary className="cursor-pointer">全部技能</summary><p>{Object.entries(item.skills).map(([name, level]) => `${name} Lv${Math.min(level, maxLevels[name] ?? level)}`).join(" · ")}</p></details>
          <button className={BUTTON} disabled={full || saved.includes(item.build.id)} onClick={() => { onSave(item.build); setSaved([...saved, item.build.id]); }}>{saved.includes(item.build.id) ? "已加入配裝" : full ? "配裝數量已達上限" : "另存為新配裝"}</button>
        </article>)}
      </div> : null}
    </div>
  </FloatingPicker>;
}
