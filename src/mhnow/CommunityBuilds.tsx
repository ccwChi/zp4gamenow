"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { assetPath, dataPath } from "./assetPath";
import type { Build, DriftPick } from "./buildStore";
import { toMhnowMeLink } from "./mhnowMe";
import { SkillGroups } from "./SkillGroups";
import { iconsForWeapon, weaponSeriesName } from "./weaponOverrides";

type Entry = {
  rank: number; likes: number; unlikes: number; shares: number; type: string;
  gear: Record<string, string>; drifts: Record<string, string[]>;
};
/** rankTotal：站方排行榜總套數（收錄的是其中代碼都對得到的）。 */
type Data = { source: string; license: string; fetchedAt: string; rankTotal?: number; builds: Entry[] };

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
 * 社群配裝：mhnow.me 玩家分享的配裝，依「讚減倒讚」排序（CC BY 4.0），可依武器種類與魔物（圖示）篩選，一鍵加進自己的配裝，
 * 或到原站用模擬器打開。資料由 scripts/build-community-builds.mjs 產生。
 */
export function CommunityBuilds({ series, icons, weaponIcons, weaponTypeName, slotName, onAdd, onSkill, skillsOf, full, monsterPicker, modal }: {
  series: { key: string; name: string }[]; icons: Record<string, string>;
  /** 武器種類 → 圖示（跟配裝頁同一套）。 */
  weaponIcons: Record<string, string>;
  weaponTypeName: (type: string) => string; slotName: (slot: typeof SLOTS[number]) => string;
  onAdd: (build: Build) => void; onSkill: (name: string, level: number) => void; full: boolean;
  /** 整套的技能等級（固有技能＋漂流石），由主程式用跟配裝頁同一套算法算。 */
  skillsOf: (build: Build) => Record<string, number>;
  /** 魔物圖示選單（跟配裝頁同一個元件）：keys 是可以選的系列，value 是目前選的（"" 為不篩選）。 */
  monsterPicker: (keys: string[], value: string, onPick: (key: string) => void) => ReactNode;
  /** 主程式的彈出視窗（跟配裝頁選裝備同一個）。 */
  modal: (title: string, onClose: () => void, content: ReactNode) => ReactNode;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  // 篩選：武器種類（小圖示直接列出）、魔物（點按鈕彈出視窗選；只看武器是哪隻魔物的，防具不算）都是單選，再點一次取消；
  // 技能 tag 從「這個武器＋這隻魔物」的配裝裡整理出來，可複選，有任一個選中的技能就列出（OR）。
  const [type, setType] = useState("");
  const [monster, setMonster] = useState("");
  const [chosenSkills, setChosenSkills] = useState<string[]>([]);
  const [choosingMonster, setChoosingMonster] = useState(false);
  const [added, setAdded] = useState<number[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => {
    fetch(dataPath("/mhnow/community-builds.json")).then((response) => response.json()).then(setData, () => setFailed(true));
  }, []);
  const nameOf = useMemo(() => Object.fromEntries(series.map((item) => [item.key, item.name])), [series]);
  /** 武器是哪隻魔物的（系列代號）；魔物篩選只看武器，防具用到不算。 */
  const weaponMonster = (entry: Entry) => entry.gear.weapon.split("::")[0];
  const builds = data?.builds ?? [];
  // 每套的技能總和要算幾千次（tag 清單、篩選、卡片），算過的依排名記起來。
  // 系列資料或社群資料換了（例如系列資料比較晚載入）就重新算，免得記住空的技能。
  const skillCache = useMemo(() => ({ series, data, byRank: new Map<number, Record<string, number>>() }), [series, data]);
  const skillsOfEntry = (entry: Entry) => {
    let skills = skillCache.byRank.get(entry.rank);
    if (!skills) skillCache.byRank.set(entry.rank, skills = skillsOf(communityToBuild(entry)));
    return skills;
  };
  const ofType = type ? builds.filter((entry) => entry.type === type) : builds;
  const ofMonster = monster ? ofType.filter((entry) => weaponMonster(entry) === monster) : ofType;
  // 技能 tag：目前武器＋魔物的配裝裡出現過的技能；換了武器或魔物，不在清單裡的已選技能就不算。
  // 技能 tag 要先選魔物才出現（沒選魔物時清單太長、也沒有篩選意義），沒選魔物就不套用技能篩選。
  const skillNames = monster ? [...new Set(ofMonster.flatMap((entry) => Object.keys(skillsOfEntry(entry))))] : [];
  // 技能出現比例：這個武器＋魔物的配裝裡，有多少比例帶這個技能（不管幾級）。
  const skillShare = Object.fromEntries(skillNames.map((name) => [name, ofMonster.filter((entry) => skillsOfEntry(entry)[name]).length / Math.max(1, ofMonster.length)]));
  // 「熱門使用」：出現在一半以上配裝的技能，依比例由高到低，最多 10 個（原本的分類裡照樣保留）。
  const popularSkills = skillNames.filter((name) => skillShare[name] >= 0.5).sort((a, b) => skillShare[b] - skillShare[a] || a.localeCompare(b, "zh-Hant")).slice(0, 10);
  const percent = (name: string) => `${Math.round(skillShare[name] * 100)}%`;
  const activeSkills = chosenSkills.filter((name) => skillNames.includes(name));
  const matches = activeSkills.length ? ofMonster.filter((entry) => activeSkills.some((name) => skillsOfEntry(entry)[name])) : ofMonster;
  // 魔物選單只列出「目前武器種類裡有這隻魔物的武器配裝」的，選了才不會變成空的。
  const monsterKeys = [...new Set(ofType.map(weaponMonster))];
  const types = Object.keys(weaponIcons).filter((option) => builds.some((entry) => entry.type === option));
  const shown = matches.slice(0, limit);
  // 先選武器或先選魔物都可以：選了魔物後，這隻魔物沒有配裝資料的武器種類會停用，所以不會選成 0 套。
  const typeAvailable = (option: string) => !monster || builds.some((entry) => entry.type === option && weaponMonster(entry) === monster);
  const pickType = (option: string) => { setType(type === option ? "" : option); setLimit(PAGE_SIZE); };
  const pickMonster = (key: string) => { setMonster(monster === key ? "" : key); setLimit(PAGE_SIZE); setChoosingMonster(false); };
  const toggleSkill = (name: string) => { setChosenSkills(activeSkills.includes(name) ? activeSkills.filter((item) => item !== name) : [...activeSkills, name]); setLimit(PAGE_SIZE); };
  const icon = (src: string | undefined, size: string) => src ? <span aria-hidden="true" className={cx(size, "flex-none bg-contain bg-center bg-no-repeat")} style={{ backgroundImage: `url(${assetPath(src)})` }} /> : null;
  const iconButton = (on: boolean) => cx("w-9 h-9 flex items-center justify-center rounded border cursor-pointer text-[12px] font-bold",
    on ? "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900]" : "border-[#e3e6e1] bg-white");
  const label = "flex-none w-9 pt-2 text-[12px] text-[#8b938c]";
  const link = "border-0 bg-transparent p-0 text-[12px] text-[#099aa5] cursor-pointer hover:underline";

  if (failed) return <p role="alert" className="text-[13px] text-[#b23a30]">社群配裝載入失敗，請重新整理。</p>;
  if (!data) return <p className="text-[13px] text-[#858d86]">載入中……</p>;
  return <div className="flex flex-col gap-3">
    {/* <p className="m-0 text-[12px] text-[#858d86] leading-[1.7]">
      資料來自 <a href={data.source} target="_blank" rel="noreferrer" className="text-[#087b84]">MHNOW.ME</a> 玩家社群的人氣配裝（{data.license}），
      快照時間 {data.fetchedAt.slice(0, 10)}，
      {data.rankTotal && data.rankTotal > data.builds.length
        ? <>站方排行共 {data.rankTotal} 套，收錄其中 {data.builds.length} 套；其餘含有我們還對不到代碼的漂流石技能或活動武器，確認後會陸續補上。</>
        : <>共 {data.builds.length} 套。</>}
      加進自己的配裝後，漂流石需要的鑲嵌洞數請自行確認。
    </p> */}
    <section className="flex flex-col gap-2 p-2.5 rounded-xl bg-white border border-[#dfe2dc]">
      <div className="flex gap-2"><span className={label}>武器</span>
        <div role="group" aria-label="武器種類" className="flex flex-wrap gap-1">
          <button aria-pressed={!type} title="全部武器" onClick={() => pickType("")} className={iconButton(!type)}>全</button>
          {types.map((option) => { const available = typeAvailable(option); return <button key={option} aria-pressed={type === option} aria-label={weaponTypeName(option)}
            disabled={!available} title={available ? weaponTypeName(option) : `${weaponTypeName(option)}（${nameOf[monster] ?? monster}沒有這種武器的配裝）`}
            onClick={() => pickType(option)} className={cx(iconButton(type === option), "disabled:opacity-25 disabled:cursor-not-allowed")}>{icon(weaponIcons[option], "w-6 h-6")}</button>; })}
        </div>
      </div>
      <div className="flex items-center gap-2"><span className={cx(label, "pt-0")}>魔物</span>
        <span className={cx("inline-flex items-center rounded-lg border text-[13px]", monster ? "border-[#099aa5] bg-[#eef8f7]" : "border-[#d8d0bd] bg-white")}>
          <button onClick={() => setChoosingMonster(true)} className="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-2 border-0 bg-transparent text-[#2b332c] cursor-pointer">
            {monster ? icon(icons[monster], "w-6 h-6") : null}<b>{monster ? nameOf[monster] ?? monster : "全部"}</b><span aria-hidden="true" className="text-[11px] text-[#8b938c]">▾</span>
          </button>
          {monster ? <button aria-label="清除魔物篩選" onClick={() => pickMonster(monster)} className="py-1 pr-2.5 pl-1 border-0 bg-transparent text-[#8b938c] cursor-pointer hover:text-[#2b332c]">✕</button> : null}
        </span>
      </div>
      {skillNames.length ? <div className="flex gap-2"><span className={label}>技能</span>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 pt-1.5 text-[12px] text-[#8b938c]">
            <span>{activeSkills.length ? `已選 ${activeSkills.length} 個，列出有其中任一個技能的配裝` : "點技能篩選配裝"}</span>
            {activeSkills.length ? <button onClick={() => setChosenSkills([])} className={link}>清除</button> : null}
          </div>
          <div className="max-h-[260px] overflow-auto">
            <SkillGroups names={skillNames} popular={popularSkills} columns="wrap" renderSkill={(name) => { const on = activeSkills.includes(name); return <button key={name} aria-pressed={on} onClick={() => toggleSkill(name)}
              className={cx("py-0.5 px-2 rounded-md border text-[12px] cursor-pointer", on ? "bg-[#099aa5] border-[#099aa5] text-white" : "bg-white border-[#d8d0bd] text-[#39423a] hover:border-[#9aa39b]")}>
                {name}<small className={cx("ml-1 tabular-nums", on ? "text-white/80" : "text-[#8b938c]")}>{percent(name)}</small></button>; }} />
          </div>
        </div>
      </div> : null}
    </section>
    {/* <p className="m-0 text-[13px] font-bold text-[#39423a]">{matches.length} 套配裝</p> */}
    {choosingMonster ? modal("選擇魔物", () => setChoosingMonster(false), <>
      {monster ? <button onClick={() => pickMonster(monster)} className="mb-2 py-1 px-2.5 border border-[#cfc7b4] rounded-md bg-white text-[12px] text-[#39423a] cursor-pointer">不篩選魔物</button> : null}
      {monsterPicker(monsterKeys, monster, pickMonster)}
    </>) : null}
    {!shown.length ? <p className="text-[13px] text-[#858d86]">沒有符合的配裝。</p> : null}
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start">
      {shown.map((entry) => {
        const [weaponKey, weaponType] = entry.gear.weapon.split("::");
        const weaponIcons = iconsForWeapon(icons, weaponType);
        const isAdded = added.includes(entry.rank);
        const build = communityToBuild(entry);
        const skills = Object.entries(skillsOfEntry(entry)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
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
            className={cx("py-0.5 px-2 border rounded-md text-[12px] min-[621px]:text-[14px] cursor-pointer", activeSkills.includes(name) ? "border-[#099aa5] bg-[#eef8f7] text-[#087b84] font-bold" : "border-[#d8d0bd] bg-white text-[#39423a]")}>{name} <b className="text-[#e08a00]">{level}</b></button>)}</div>
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
