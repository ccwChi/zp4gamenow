"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { assetPath, dataPath } from "./assetPath";
import type { Build, DriftPick } from "./buildStore";
import { SkillGroups } from "./SkillGroups";

type Entry = {
  /** rank：按讚數排行的名次。time：首次分享的時間（秒），舊資料沒有。 */
  rank: number; likes: number; unlikes: number; shares: number; time?: number; type: string;
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
 * 資料由 scripts/build-community-builds.mjs 產生。
 */
export function CommunityBuilds({ series, icons, weaponIcons, weaponTypeName, renderCard, onAdd, skillsOf, full, modal }: {
  series: { key: string; name: string }[]; icons: Record<string, string>;
  /** 武器種類 → 圖示（跟配裝頁同一套）。 */
  weaponIcons: Record<string, string>;
  weaponTypeName: (type: string) => string;
  /** 畫一組配裝（跟「配裝」頁同一個卡片樣式，唯讀）：header 放標題列、footer 放底下的按鈕。 */
  renderCard: (build: Build, header: ReactNode, footer: ReactNode) => ReactNode;
  onAdd: (build: Build) => void; full: boolean;
  /** 整套的技能等級（固有技能＋漂流石），由主程式用跟配裝頁同一套算法算。 */
  skillsOf: (build: Build) => Record<string, number>;
  /** 主程式的彈出視窗（魔物很多，平常收成一顆按鈕，點了才在視窗裡選）。 */
  modal: (title: string, onClose: () => void, content: ReactNode) => ReactNode;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  // 篩選：武器種類、魔物（只看武器是哪隻魔物的，防具不算）都用小圖示直接列出，單選，再點一次取消；
  // 技能 tag 從「這個武器＋這隻魔物」的配裝裡整理出來，可複選，有任一個選中的技能就列出（OR）。
  const [type, setType] = useState("");
  const [monster, setMonster] = useState("");
  const [choosingMonster, setChoosingMonster] = useState(false);
  const [chosenSkills, setChosenSkills] = useState<string[]>([]);
  const [added, setAdded] = useState<number[]>([]);
  const [sort, setSort] = useState<"likes" | "new">("likes");
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
  // 魔物圖示：所有有武器配裝的魔物，依全站的魔物順序排。
  const withWeapons = new Set(builds.map(weaponMonster));
  const monsterKeys = series.map((item) => item.key).filter((key) => withWeapons.has(key));
  const types = Object.keys(weaponIcons).filter((option) => builds.some((entry) => entry.type === option));
  // 資料本來就是按讚數排好的；「最新」改依首次分享時間，新的在前，同時間維持按讚順序。
  const sorted = sort === "new" ? [...matches].sort((a, b) => (b.time ?? 0) - (a.time ?? 0)) : matches;
  const shown = sorted.slice(0, limit);
  const newest = Math.max(0, ...(data?.builds ?? []).map((entry) => entry.time ?? 0));
  // 先選武器或先選魔物都可以：選了一邊，另一邊沒有對應配裝資料的選項會停用，所以不會選成 0 套。
  const typeAvailable = (option: string) => !monster || builds.some((entry) => entry.type === option && weaponMonster(entry) === monster);
  const monsterAvailable = (key: string) => !type || builds.some((entry) => entry.type === type && weaponMonster(entry) === key);
  const pickType = (option: string) => { setType(type === option ? "" : option); setLimit(PAGE_SIZE); };
  const pickMonster = (key: string) => { setMonster(monster === key ? "" : key); setLimit(PAGE_SIZE); setChoosingMonster(false); };
  const toggleSkill = (name: string) => { setChosenSkills(activeSkills.includes(name) ? activeSkills.filter((item) => item !== name) : [...activeSkills, name]); setLimit(PAGE_SIZE); };
  const icon = (src: string | undefined, size: string) => src ? <span aria-hidden="true" className={cx(size, "flex-none bg-contain bg-center bg-no-repeat")} style={{ backgroundImage: `url(${assetPath(src)})` }} /> : null;
  const iconButton = (on: boolean) => cx("w-[var(--ic-btn)] h-[var(--ic-btn)] flex items-center justify-center rounded border cursor-pointer fs-md font-bold",
    on ? "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900]" : "border-[#e3e6e1] bg-white");
  const tile = (on: boolean) => cx("min-w-[var(--ic-btn)] min-h-[var(--ic-btn)] p-[5px] flex items-center justify-center rounded-[7px] border text-[#2e3731] cursor-pointer",
    on ? "border-[#e0a900] bg-[#fffdf5] shadow-[inset_0_0_0_1px_#e0a900]" : "border-[#e3e6e1] bg-[#f1f2ef]");
  const label = "flex-none w-9 pt-2 fs-md text-[#8b938c]";
  const link = "border-0 bg-transparent p-0 fs-md text-[#099aa5] cursor-pointer hover:underline";

  if (failed) return <p role="alert" className="fs-md text-[#b23a30]">社群配裝載入失敗，請重新整理。</p>;
  if (!data) return <p className="fs-md text-[#858d86]">載入中……</p>;
  return <div className="flex flex-col gap-3">
    {/* <p className="m-0 fs-md text-[#858d86] leading-[1.7]">
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
            onClick={() => pickType(option)} className={cx(iconButton(type === option), "disabled:opacity-25 disabled:cursor-not-allowed")}>{icon(weaponIcons[option], "w-[var(--ic)] h-[var(--ic)]")}</button>; })}
        </div>
      </div>
      {/* 魔物很多，平常只放一顆按鈕；點了在視窗裡選（沒有對應武器資料的魔物一樣停用）。 */}
      <div className="flex items-center gap-2"><span className={cx(label, "pt-0")}>魔物</span>
        <span className={cx("inline-flex items-center rounded-lg border fs-md", monster ? "border-[#099aa5] bg-[#eef8f7]" : "border-[#d8d0bd] bg-white")}>
          <button onClick={() => setChoosingMonster(true)} className="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-2 border-0 bg-transparent text-[#2b332c] cursor-pointer">
            {monster ? icon(icons[monster], "w-[var(--ic)] h-[var(--ic)]") : null}<b>{monster ? nameOf[monster] ?? monster : "全部"}</b><span aria-hidden="true" className="fs-sm text-[#8b938c]">▾</span>
          </button>
          {monster ? <button aria-label="清除魔物篩選" onClick={() => pickMonster(monster)} className="py-1 pr-2.5 pl-1 border-0 bg-transparent text-[#8b938c] cursor-pointer hover:text-[#2b332c]">✕</button> : null}
        </span>
      </div>
      {skillNames.length ? <div className="flex gap-2"><span className={label}>技能</span>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 pt-1.5 fs-md text-[#8b938c]">
            <span>{activeSkills.length ? `已選 ${activeSkills.length} 個，列出有其中任一個技能的配裝` : "點技能篩選配裝"}</span>
            {activeSkills.length ? <button onClick={() => setChosenSkills([])} className={link}>清除</button> : null}
          </div>
          <div className="max-h-[260px] overflow-auto">
            <SkillGroups names={skillNames} popular={popularSkills} columns="wrap" renderSkill={(name) => { const on = activeSkills.includes(name); return <button key={name} aria-pressed={on} onClick={() => toggleSkill(name)}
              className={cx("py-0.5 px-2 rounded-md border fs-md cursor-pointer", on ? "bg-[#099aa5] border-[#099aa5] text-white" : "bg-white border-[#d8d0bd] text-[#39423a] hover:border-[#9aa39b]")}>
                {name}<small className={cx("ml-1 tabular-nums", on ? "text-white/80" : "text-[#8b938c]")}>{percent(name)}</small></button>; }} />
          </div>
        </div>
      </div> : null}
    </section>
    {choosingMonster ? modal("選擇魔物", () => setChoosingMonster(false),
      // 跟其他選魔物的地方一樣：只放小圖示，名稱在滑過時顯示。
      <div role="group" aria-label="魔物" className="flex flex-wrap gap-1 content-start">
        <button aria-pressed={!monster} title="全部魔物" onClick={() => pickMonster("")} className={cx(tile(!monster), "fs-md font-bold")}>全</button>
        {monsterKeys.map((key) => { const available = monsterAvailable(key); const name = nameOf[key] ?? key; return <button key={key} aria-pressed={monster === key} aria-label={name}
          disabled={!available} title={available ? name : `${name}（沒有${weaponTypeName(type)}的配裝）`} onClick={() => pickMonster(key)}
          className={cx(tile(monster === key), "disabled:opacity-25 disabled:cursor-not-allowed")}>
          {icons[key] ? icon(icons[key], "w-[var(--ic)] h-[var(--ic)]") : <span className="fs-sm font-bold leading-[1.1] px-1.5">{name}</span>}</button>; })}
      </div>) : null}
    <div className="flex flex-wrap items-center gap-2">
      <span className="fs-md font-bold text-[#39423a]">排序</span>
      <div role="group" aria-label="排序方式" className="flex rounded-md bg-[#eef0ed] p-0.5">
        {([["likes", "最多人點讚"], ["new", "最新"]] as const).map(([value, label]) => <button key={value} aria-pressed={sort === value} onClick={() => { setSort(value); setLimit(PAGE_SIZE); }}
          className={cx("px-3 py-1 rounded fs-md border-0 cursor-pointer", sort === value ? "bg-white text-[#253229] font-bold shadow-[0_1px_3px_#ccd1ca]" : "bg-transparent text-[#687168]")}>{label}</button>)}
      </div>
      <span className="fs-md text-[#858d86]">{matches.length} 套</span>
      <span className="ml-auto fs-sm text-[#8b938c]" title="資料每天更新一次；重新抓取後這個時間就會更新，就算沒有新配裝也一樣">
        資料更新 {new Date(data.fetchedAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
        {newest ? `・最新分享 ${new Date(newest * 1000).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" })}` : ""}</span>
    </div>
    {!shown.length ? <p className="fs-md text-[#858d86]">沒有符合的配裝。</p> : null}
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start">
      {shown.map((entry) => {
        const weaponType = entry.gear.weapon.split("::")[1];
        const isAdded = added.includes(entry.rank);
        const build = { ...communityToBuild(entry), id: `community-${entry.rank}` };
        return <Fragment key={entry.rank}>{renderCard(build,
          <header className="flex items-baseline justify-between gap-2 px-1 pt-0.5">
            <strong className="fs-lg text-[#2b332c]">#{entry.rank} {weaponTypeName(weaponType)}</strong>
            <span className="fs-md text-[#687168] tabular-nums">{entry.time ? `${new Date(entry.time * 1000).toLocaleDateString("zh-TW")}　` : ""}❤ {entry.likes}　分享 {entry.shares}</span>
          </header>,
          <button disabled={full || isAdded} onClick={() => { onAdd(build); setAdded([...added, entry.rank]); }}
            className="py-2 border-0 rounded-lg bg-[#28352e] text-white fs-md cursor-pointer disabled:opacity-40 disabled:cursor-default">{isAdded ? "✓ 已加入" : full ? "配裝已達上限" : "加入我的配裝"}</button>)}</Fragment>;
      })}
    </div>
    {sorted.length > shown.length ? <button onClick={() => setLimit(limit + PAGE_SIZE)} className="self-center py-2 px-6 border border-[#cfc7b4] rounded-full bg-white fs-md text-[#39423a] cursor-pointer">
      再顯示 {Math.min(PAGE_SIZE, sorted.length - shown.length)} 套（還有 {sorted.length - shown.length} 套）</button> : null}
  </div>;
}
