// 抓 mhnow.me 公開的「社群 Top 100 配裝」，轉成本站格式。
//
// 資料來源：https://mhnow.me/llms-full.txt（站方給機器讀的檔，CC BY 4.0，引用請標示 MHNOW.ME）。
// 每套配裝附一個 ?load= 連結，內容是 lz-string 壓縮的 JSON：
//   [武器種類, 武器魔物, 頭, 胸, 手, 腰, 腳, { head: [洞1技能, 洞2技能], … }]
// 魔物／技能代碼（M_9_2、S_1_1 這類）站方沒公開對照表，這裡從文字表格反推：
// 同一代碼在 100 套裡對到的名稱必須一致，不一致就中止。
// 另外抓站方首頁排行榜的公開端點（幾千套），用上面的代碼表轉成本站格式。
// 輸出：
//   public/mhnow/community-builds.json   給「社群配裝」頁用
//   src/mhnow/mhnowMeCodes.json          本站系列／技能 → mhnow.me 代碼（匯出連結、讀取連結用）
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lz = require("lz-string");
const SOURCE = "https://mhnow.me/llms-full.txt";

const WEAPON_TYPES = {
  shields_sword: "shield-sword", great_sword: "great-sword", hammer: "hammer", long_sword: "long-sword",
  light_bowgun: "light-gun", bow: "bow", dual_blades: "dual-blades", lance: "lance", charge_blade: "charge-blade",
  insect_glaive: "insect-glaive", heavy_bowgun: "heavy-gun", hunting_horn: "hunting-horn", gunlance: "gunlance", switch_axe: "switch-axe",
};
const SLOTS = [["head", "helm"], ["chest", "mail"], ["arms", "gloves"], ["waist", "belt"], ["legs", "greaves"]];
// 兩邊譯名不同的系列：mhnow.me 名稱 → 本站系列代號。
const SERIES_ALIASES = { "新年系列": "ny-24", "花環雙劍": "winter-25" };

// 兩邊技能名稱不同：mhnow.me 名稱 → 本站名稱。
const SKILL_ALIASES = { "完美蓄力釋放": "完美蓄力解放", "最有效距離威力UP": "適中距離威力UP" };
const skillZh = (text) => { const name = text.split(" / ")[0].trim(); return SKILL_ALIASES[name] ?? name; };
const zh = (text) => text.split(" / ")[0].trim();
const index = JSON.parse(await readFile("public/mhnow/series-index.json", "utf8"));
const keyByName = new Map(index.series.map((series) => [series.name, series.key]));
const nameToKey = (name) => keyByName.get(name) ?? SERIES_ALIASES[name] ?? (() => { throw new Error(`找不到系列：${name}`); })();

const text = await (await fetch(process.argv[2] ?? SOURCE)).text();
const start = text.indexOf("## 5. 社群排行配裝");
if (start < 0) throw new Error("llms-full.txt 找不到「社群排行配裝」段落，格式可能改了");
// Top 100 每天換，之前從文字對出來的代碼要留著（不然掉出榜的配裝就又對不到了）：先讀上次的結果，再累加。
const CODES_FILE = "src/mhnow/mhnowMeCodes.json";
const previous = await readFile(CODES_FILE, "utf8").then(JSON.parse, () => ({ series: {}, skills: {} }));
const seriesCodes = { ...previous.series }, skillCodes = { ...previous.skills };
const remember = (table, key, code) => {
  if (table[key] && table[key] !== code) throw new Error(`代碼對不上：${key} 同時是 ${table[key]} 與 ${code}`);
  const owner = Object.keys(table).find((other) => other !== key && table[other] === code);
  if (owner) throw new Error(`代碼對不上：${code} 同時是 ${owner} 與 ${key}`);
  table[key] = code;
};

/**
 * 推得的系列代碼：Top 100 文字裡還沒出現過，但三個獨立的條件都只剩這一個答案，才列進來。
 *   1. M_屬性_序號 的「屬性」：0 無、1 火、2 水、3 雷、4 冰、5 龍、6 毒、7 麻痺、8 睡眠、9 爆破（已知 57 個全部吻合）。
 *   2. 同屬性內的序號大致照 llms-full.txt 魔物清單的順序：要落在前後已知代碼對應的魔物之間。
 *   3. 排行榜裡用到這個代碼的武器種類／防具，本站資料裡這個系列都有（已知代碼的吻合率 99%）。
 * 跑的時候會再驗一次第 3 點，不吻合就中止；之後 Top 100 文字直接對到的代碼若跟這裡不同，remember 也會中止。
 * 活動武器（M_10_x）候選太多、對不出唯一答案，所以不列；技能代碼同理，只用文字對到的。
 */
const INFERRED_SERIES = {
  "M_0_6": "banb", "M_0_12": "arzu", "M_0_15": "serg", "M_2_6": "almu", "M_2_7": "s-cean", "M_3_3": "zino",
  "M_4_8": "velk", "M_4_9": "a-somn", "M_5_5": "s-zino", "M_6_1": "puke", "M_6_7": "v-tobi", "M_9_3": "brac",
};

for (const block of text.slice(start).split(/\n### #/).slice(1)) {
  const head = block.split("\n")[0].match(/^(\d+) (.+?) \/ (.+?) \| score: (\d+) \| ❤️ (\d+) \| 分享 (\d+)/);
  const load = block.match(/\?load=(\S+)/)?.[1];
  if (!head || !load) throw new Error(`格式不符：${block.slice(0, 80)}`);
  const code = JSON.parse(lz.decompressFromEncodedURIComponent(load));
  const rows = block.split("\n").filter((line) => /^\| (武器|頭部|胸部|手臂|腰部|腳部)/.test(line)).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
  if (rows.length !== 6) throw new Error(`#${head[1]} 部位數不對`);
  const type = WEAPON_TYPES[code[0]];
  if (!type) throw new Error(`未知武器種類：${code[0]}`);
  const weaponName = zh(rows[0][1].match(/（(.+?)）/)[1]);
  const weaponKey = nameToKey(weaponName);
  remember(seriesCodes, weaponKey, code[1]);
  SLOTS.forEach(([src], position) => {
    const key = nameToKey(zh(rows[position + 1][1]));
    remember(seriesCodes, key, code[position + 2]);
    const cell = rows[position + 1][3];
    const names = cell === "—" || cell === "無" ? [] : cell.split(" + ").map(skillZh);
    const holes = code[7][src] ?? [];
    if (names.length !== holes.length) throw new Error(`#${head[1]} ${src} 洞數對不上`);
    holes.forEach((skillCode, hole) => remember(skillCodes, names[hole], skillCode));
  });
}

// 第二步：站方首頁排行榜用的公開讀取端點（robots.txt 明講是渲染主內容所需，開放讀取），
// 一次就有幾千套。只留下每個代碼都認得、而且系列真的有這種武器／防具的。
const RANK_API = "https://mhnow.me/rank.php?act=rank_list";
const rank = await (await fetch(RANK_API)).json();
if (rank.status !== "success" || !Array.isArray(rank.data)) throw new Error("rank_list 格式不對");
const seriesOf = Object.fromEntries(index.series.map((series) => [series.key, series]));
// 推得的系列：用排行榜實際的用法再驗一次（武器種類、防具），吻合率不到 97% 就中止，免得錯的代碼混進來。
for (const [code, key] of Object.entries(INFERRED_SERIES)) {
  const series = seriesOf[key];
  if (!series) throw new Error(`推得的系列不存在：${code} → ${key}`);
  if (seriesCodes[key] && seriesCodes[key] !== code) throw new Error(`推得的 ${code} → ${key} 跟文字對到的 ${seriesCodes[key]} 不同，請移除這筆推論`);
  let fit = 0, total = 0;
  for (const entry of rank.data) {
    const [typeCode, weapon, ...armor] = entry.data;
    if (weapon === code) { total++; if (series.weaponTypes.includes(WEAPON_TYPES[typeCode])) fit++; }
    for (const piece of armor.slice(0, 5)) if (piece === code) { total++; if (series.hasArmor) fit++; }
  }
  if (total && fit / total < 0.97) throw new Error(`推得的 ${code} → ${key} 跟排行榜用法不吻合（${fit}/${total}），請重新檢查`);
  remember(seriesCodes, key, code);
}
const keyByCode = Object.fromEntries(Object.entries(seriesCodes).map(([key, code]) => [code, key]));
const nameByCode = Object.fromEntries(Object.entries(skillCodes).map(([name, code]) => [code, name]));
const builds = [];
let skipped = 0;
for (const entry of rank.data) {
  const [typeCode, ...rest] = entry.data;
  const type = WEAPON_TYPES[typeCode], drifted = rest[6];
  const keys = rest.slice(0, 6).map((code) => keyByCode[code]);
  const holes = SLOTS.map(([src]) => (drifted?.[src] ?? []).map((code) => nameByCode[code]));
  const weaponSeries = seriesOf[keys[0]];
  if (!type || keys.includes(undefined) || holes.flat().includes(undefined) || !weaponSeries?.weaponTypes.includes(type)
    || keys.slice(1).some((key) => !seriesOf[key].hasArmor)) { skipped++; continue; }
  const gear = { weapon: `${keys[0]}::${type}` }, drifts = {};
  SLOTS.forEach(([, slot], position) => { gear[slot] = keys[position + 1]; drifts[slot] = holes[position]; });
  builds.push({ likes: entry.likes, unlikes: entry.unlikes, shares: entry.count, type, gear, drifts });
}
// 站方的 score 欄位不是按讚數（跟 Top 100 的分數也對不上），這裡改依「讚減倒讚」排。
builds.sort((a, b) => (b.likes - b.unlikes) - (a.likes - a.unlikes) || b.likes - a.likes || b.shares - a.shares);
builds.forEach((build, position) => { build.rank = position + 1; });

await writeFile("public/mhnow/community-builds.json", JSON.stringify({
  source: "https://mhnow.me/", license: "CC BY 4.0（MHNOW.ME）", fetchedAt: new Date().toISOString(),
  // 站方排行榜總套數：頁面用來說明收錄了多少、其餘為什麼還沒列。
  rankTotal: rank.data.length, builds,
}) + "\n");
const sorted = (table) => Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(CODES_FILE, JSON.stringify({
  weaponTypes: Object.fromEntries(Object.entries(WEAPON_TYPES).map(([code, type]) => [type, code])),
  series: sorted(seriesCodes), skills: sorted(skillCodes),
}, null, 1) + "\n");
console.log(`${rank.data.length} 套裡留下 ${builds.length} 套（${skipped} 套有認不得的代碼）；系列代碼 ${Object.keys(seriesCodes).length}、技能代碼 ${Object.keys(skillCodes).length}`);
