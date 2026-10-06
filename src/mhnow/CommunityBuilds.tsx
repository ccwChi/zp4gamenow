"use client";

import { useEffect, useMemo, useState } from "react";
import { assetPath, dataPath } from "./assetPath";
import type { Build, DriftPick } from "./buildStore";
import { toMhnowMeLink } from "./mhnowMe";
import { iconsForWeapon, weaponSeriesName } from "./weaponOverrides";

type Entry = {
  rank: number; likes: number; unlikes: number; shares: number; type: string;
  gear: Record<string, string>; drifts: Record<string, string[]>;
};
type Data = { source: string; license: string; fetchedAt: string; builds: Entry[] };

const PAGE_SIZE = 30;
const SLOTS = ["helm", "mail", "gloves", "belt", "greaves"] as const;
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** 把一套社群配裝變成本站的一組配裝（漂流石顏色留空，畫面會依漂流石資料推回來）。 */
export function communityToBuild(entry: Entry): Build {
  const drifts: Record<string, (DriftPick | null)[]> = {};
  for (const slot of SLOTS) drifts[slot] = (entry.drifts[slot] ?? []).map((skill) => ({ skill, color: "" }));
  return { id: "", name: `社群 #${entry.rank}`.slice(0, 20), gear: entry.gear, drifts, pieces: {}, showMissing: false };
}

/**
 * 社群配裝：mhnow.me 玩家分享的配裝，依「讚減倒讚」排序（CC BY 4.0），可依武器種類篩選，一鍵加進自己的配裝，
 * 或到原站用模擬器打開。資料由 scripts/build-community-builds.mjs 產生。
 */
export function CommunityBuilds({ series, icons, weaponTypeName, slotName, onAdd, onSkill, skillsOf, full }: {
  series: { key: string; name: string }[]; icons: Record<string, string>;
  weaponTypeName: (type: string) => string; slotName: (slot: typeof SLOTS[number]) => string;
  onAdd: (build: Build) => void; onSkill: (name: string, level: number) => void; full: boolean;
  /** 整套的技能等級（固有技能＋漂流石），由主程式用跟配裝頁同一套算法算。 */
  skillsOf: (build: Build) => Record<string, number>;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<number[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => {
    fetch(dataPath("/mhnow/community-builds.json")).then((response) => response.json()).then(setData, () => setFailed(true));
  }, []);
  const nameOf = useMemo(() => Object.fromEntries(series.map((item) => [item.key, item.name])), [series]);
  const types = useMemo(() => [...new Set(data?.builds.map((entry) => entry.type) ?? [])], [data]);
  const matches = (data?.builds ?? []).filter((entry) => {
    if (type && entry.type !== type) return false;
    const text = query.trim();
    if (!text) return true;
    return Object.values(entry.drifts).flat().some((name) => name.includes(text))
      || Object.values(entry.gear).some((key) => (nameOf[key.split("::")[0]] ?? "").includes(text))
      || Object.keys(skillsOf(communityToBuild(entry))).some((name) => name.includes(text));
  });
  const shown = matches.slice(0, limit);
  const chip = (on: boolean) => cx("py-1 px-3 border rounded-full text-[13px] cursor-pointer", on ? "bg-[#17231d] border-[#17231d] text-white" : "bg-white border-[#d9d9d9] text-[#39423a]");

  if (failed) return <p role="alert" className="text-[13px] text-[#b23a30]">社群配裝載入失敗，請重新整理。</p>;
  if (!data) return <p className="text-[13px] text-[#858d86]">載入中……</p>;
  return <div className="flex flex-col gap-3">
    <p className="m-0 text-[12px] text-[#858d86] leading-[1.7]">
      資料來自 <a href={data.source} target="_blank" rel="noreferrer" className="text-[#087b84]">MHNOW.ME</a> 玩家社群的人氣配裝（{data.license}），
      快照時間 {data.fetchedAt.slice(0, 10)}，共 {data.builds.length} 套；站方有些魔物／技能的代碼我們還對不到，含這些的配裝先不列。加進自己的配裝後，漂流石需要的鑲嵌洞數請自行確認。
    </p>
    <div className="flex flex-wrap items-center gap-1.5">
      <button aria-pressed={!type} onClick={() => { setType(""); setLimit(PAGE_SIZE); }} className={chip(!type)}>全部 {data.builds.length}</button>
      {types.map((option) => <button key={option} aria-pressed={type === option} onClick={() => { setType(type === option ? "" : option); setLimit(PAGE_SIZE); }} className={chip(type === option)}>
        {weaponTypeName(option)} {data.builds.filter((entry) => entry.type === option).length}</button>)}
      <input aria-label="搜尋技能或魔物" value={query} placeholder="搜尋技能／魔物" onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
        className="ml-auto w-[160px] py-1 px-2 border border-[#d8d0bd] rounded-md bg-white text-[13px] outline-none focus:border-[#099aa5]" />
    </div>
    {!shown.length ? <p className="text-[13px] text-[#858d86]">沒有符合的配裝。</p> : null}
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start">
      {shown.map((entry) => {
        const [weaponKey, weaponType] = entry.gear.weapon.split("::");
        const weaponIcons = iconsForWeapon(icons, weaponType);
        const isAdded = added.includes(entry.rank);
        const build = communityToBuild(entry);
        const skills = Object.entries(skillsOf(build)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
        const link = toMhnowMeLink(build);
        return <article key={entry.rank} className="min-w-0 flex flex-col gap-1.5 p-2.5 rounded-xl bg-[#ece8dc] border border-[#d8d0bd]">
          <header className="flex items-baseline justify-between gap-2">
            <strong className="text-[15px] text-[#2b332c]">#{entry.rank} {weaponTypeName(weaponType)}</strong>
            <span className="text-[12px] text-[#687168] tabular-nums">❤ {entry.likes}　分享 {entry.shares}</span>
          </header>
          <div className="flex flex-col gap-1 p-2 rounded-[10px] bg-[#fffaf0] border border-[#e3dac6]">
            {[["weapon", `${weaponTypeName(weaponType)}・${weaponSeriesName(weaponKey, weaponType, nameOf[weaponKey] ?? weaponKey)}`, weaponKey, ""] as const,
              ...SLOTS.map((slot) => [slot, nameOf[entry.gear[slot]] ?? entry.gear[slot], entry.gear[slot], slotName(slot)] as const)].map(([slot, title, key, label]) =>
              <div key={slot} className="flex items-center gap-2 text-[13px] min-[621px]:text-[15px] text-[#2b332c]">
                {weaponIcons[key] ?? icons[key] ? <span className="w-7 h-7 flex-none bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${assetPath(weaponIcons[key] ?? icons[key])})` }} /> : <span className="w-7 flex-none" />}
                <span className="min-w-0 flex-1 truncate">{label ? <small className="mr-1.5 text-[#858d86]">{label}</small> : null}{title}</span>
                {slot !== "weapon" ? <span className="flex-none text-[12px] min-[621px]:text-[14px] text-[#087b84]">{(entry.drifts[slot] ?? []).join("、")}</span> : null}
              </div>)}
          </div>
          <div className="flex flex-wrap gap-1">{skills.map(([name, level]) => <button key={name} onClick={() => onSkill(name, level)}
            className="py-0.5 px-2 border border-[#d8d0bd] rounded-md bg-white text-[12px] min-[621px]:text-[14px] text-[#39423a] cursor-pointer">{name} <b className="text-[#e08a00]">{level}</b></button>)}</div>
          <div className="flex gap-1.5">
            <button disabled={full || isAdded} onClick={() => { onAdd(build); setAdded([...added, entry.rank]); }}
              className="flex-1 py-1.5 border-0 rounded-lg bg-[#28352e] text-white text-[13px] cursor-pointer disabled:opacity-40 disabled:cursor-default">{isAdded ? "✓ 已加入" : full ? "配裝已達上限" : "加入我的配裝"}</button>
            {"url" in link ? <a href={link.url} target="_blank" rel="noreferrer"
              className="py-1.5 px-3 border border-[#cfc7b4] rounded-lg bg-white text-[#39423a] text-[13px] no-underline">在 mhnow.me 開啟</a> : null}
          </div>
        </article>;
      })}
    </div>
    {matches.length > shown.length ? <button onClick={() => setLimit(limit + PAGE_SIZE)} className="self-center py-2 px-6 border border-[#cfc7b4] rounded-full bg-white text-[13px] text-[#39423a] cursor-pointer">
      再顯示 {Math.min(PAGE_SIZE, matches.length - shown.length)} 套（還有 {matches.length - shown.length} 套）</button> : null}
  </div>;
}
