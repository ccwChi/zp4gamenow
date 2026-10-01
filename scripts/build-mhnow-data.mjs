// 把 mhn.quest 的資料模型轉成 app 用的格式。
//
// 產出兩層（跟先前的武器清單同樣策略：清單常駐、明細用到才抓）：
//   public/mhnow/series-index.json  —— 所有系列的名稱、可做的武器種類、各部位技能（配裝畫面只需要這個）
//   public/mhnow/series/<key>.json  —— 該系列每一階的素材與 Zenny（素材計算器才抓）
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { buildCodeMap, costRowFor, decodeRow, gatherKindOf, loadSource, tablesFor } from "./mhn-quest-resolve.mjs";

const INDEX = "public/mhnow/series-index.json";
const DETAIL_DIR = "public/mhnow/series";
const MAX_GRADE = 10;
const LEVELS = ["1", "2", "3", "4", "5"];

const smelt = await import("../data-source/mhn-quest/smelt.mjs");
const DRIFT_OUT = "public/mhnow/driftstones.json";
const source = await loadSource();
const { data, zh } = source;

function gradesFor(series, kind) {
  const config = data.set[series] ?? {};
  // 防具有自己的起始階級的系列（lunar-24）用 unlockArmor。
  const unlock = (kind === "armor" ? config.unlockArmor : undefined) ?? config.unlock ?? 1;
  const tables = tablesFor(data, series, kind);
  // 防具五個部位共用一張表，用 belt 代表（只有 halloween-24 的 belt 有獨立覆寫）；武器用實際種類。
  const codeMap = buildCodeMap(source, series, kind === "armor" ? "belt" : kind);
  const rows = [];
  let unknownRows = 0;
  for (let grade = unlock; grade <= MAX_GRADE; grade++) {
    for (const level of LEVELS) {
      const isForge = grade === unlock && level === "1";
      const { costRow, typeRow } = costRowFor(tables, grade, level, isForge);
      if (!costRow || !typeRow) continue;
      const decoded = decodeRow(costRow, typeRow, codeMap);
      // 解不出名稱的代碼直接顯示代碼本身（例如 "ib"），方便對照遊戲內畫面回報是什麼素材。
      // monster：魔物專屬素材屬於哪個系列（路徑的前段，"kulu/b" → kulu），統計時同魔物排在一起；
      // sub：採集素材的細分（礦石、龍骨、植物…），統計時可以分開挑。
      const materials = decoded.materials.map((item) => {
        const monster = !item.group && typeof item.path === "string" && item.path.includes("/") ? seriesOfItemGroup(item.path.split("/")[0]) : undefined;
        const sub = item.group === "gather" ? gatherKindOf(item.path) : undefined;
        return {
          name: item.name.startsWith("?") ? item.code : item.name,
          quantity: item.quantity,
          ...(item.rare ? { rare: item.rare } : {}),
          ...(item.group ? { group: item.group } : {}),
          ...(sub ? { sub } : {}),
          ...(monster ? { monster } : {}),
          ...(item.name.startsWith("?") ? { unknown: true } : {}),
        };
      });
      if (materials.some((item) => item.unknown)) unknownRows++;
      rows.push({
        grade: `${grade}-${level}`,
        zenny: decoded.zenny,
        materials,
      });
    }
  }
  return { rows, approximate: tables.approximate, unknownRows };
}

/**
 * 武器種類專屬的特性（彈種、箭種、瓶、砲擊、旋律、獵蟲），直接轉成中文。
 * 對應方式照 mhn.quest 前端（assets/index-*.js）的顯示邏輯：
 *   ammo / heavy-ammo：[彈種, 彈數, 後座力, 裝填]，省略的值用 ammo-default[彈種分類] 補；
 *     後座力、裝填是 zh["recoil-type"]、zh["reload-type"] 的索引
 *   arrow：[箭種, 箭的等級]，陣列順序就是蓄力階段（同一種箭可能連續出現，例如碎龍弓 擴1 擴1 連4 連4）；heavy-gun-sp：zh.sp["heavy-gun"] 的索引
 *   songs：{音符: 旋律}，音符 b = 藍、r = 橘
 * 沒寫的欄位 mhn.quest 也不顯示，這裡同樣不補預設值。
 */
const AMMO_CATEGORY = [["spread", "spread"], ["pierc", "pierce"], ["sticky", "sticky"], ["slicing", "slicing"], ["cluster", "cluster"], ["wyvern", "wyvern"]];
function ammoCategory(type) {
  if (["sleep", "poison", "paralysis"].includes(type)) return type;
  return AMMO_CATEGORY.find(([pattern]) => type.includes(pattern))?.[1] ?? "normal";
}
function ammoList(entries) {
  return entries.map(([type, num, recoil, reload]) => {
    // 帶連字號的表（ammo-default）只在 default export 裡。
    const fallback = data.default["ammo-default"][ammoCategory(type)] ?? [];
    return {
      name: zh.ammo[type] ?? type,
      num: num ?? fallback[0],
      recoil: zh["recoil-type"][recoil ?? fallback[1]],
      reload: zh["reload-type"][reload ?? fallback[2]],
    };
  });
}
function weaponTraits(config, weaponTypes) {
  const traits = {};
  const has = (type) => weaponTypes.includes(type);
  if (has("light-gun") && config.ammo) traits["light-gun"] = { ammo: ammoList(config.ammo) };
  if (has("heavy-gun") && config["heavy-ammo"]) {
    traits["heavy-gun"] = { ammo: ammoList(config["heavy-ammo"]) };
    const sp = zh.sp["heavy-gun"][config["heavy-gun-sp"]];
    if (sp) traits["heavy-gun"].sp = sp;
  }
  if (has("bow") && config.arrow) {
    traits.bow = { arrows: config.arrow.map(([type, level]) => ({ level, name: zh.arrow[type] ?? type })) };
    if (config.bottle && config.bottle !== "none") traits.bow.coating = zh.bottle[config.bottle] ?? config.bottle;
  }
  if (has("charge-blade") && config.phial) traits["charge-blade"] = { phial: zh.phial[config.phial] ?? config.phial };
  if (has("switch-axe") && config["sa-phial"]) traits["switch-axe"] = { phial: zh["sa-phial"][config["sa-phial"]] ?? config["sa-phial"] };
  if (has("gunlance") && config.shelling) traits.gunlance = { shelling: zh.shelling[config.shelling] ?? config.shelling };
  if (has("hunting-horn") && config.songs) {
    traits["hunting-horn"] = { songs: Object.entries(config.songs).map(([notes, song]) => ({ notes, name: zh.songs[song]?.[0] ?? song })) };
  }
  if (has("insect-glaive") && config.kinsect) {
    traits["insect-glaive"] = {
      kinsect: Object.entries(config.kinsect).map(([stat, value]) => ({ label: zh.kinsect.stat[stat] ?? stat, value: zh.kinsect[stat]?.[value]?.[0] ?? value })),
    };
  }
  return traits;
}

const weaponTypeNames = zh.parts["weapon-type"];
const slotNames = Object.fromEntries(["helm", "mail", "gloves", "belt", "greaves"].map((slot) => [slot, zh.parts[slot]]));

const index = [];
const details = [];
let unknownRows = 0;
let approximateSeries = 0;

for (const [key, config] of Object.entries(data.set)) {
  if (config.hidden) continue;
  const forgeable = data.matForge[key] ?? [];
  // mhn.quest 原始資料裡「希望」系列的 switch-axe 重複列了兩次，這裡去重避免下游用 key 拼 id 時撞號。
  const weaponTypes = [...new Set(forgeable.filter((entry) => entry !== "armor" && weaponTypeNames[entry]))];
  const hasArmor = forgeable.includes("armor") || Boolean(data.eq[key]?.helm);
  const eq = data.eq[key] ?? {};

  // unlock / lv 可能是單一值或陣列（一個技能在不同階級升級）。
  // "varies"（視武器而不同）只是佔位，真正的技能在各武器種類自己的欄位裡。
  const skillRows = (rows) => rows.filter((row) => row.skill !== "varies").map((row) => ({
    skill: row.skill,
    levels: (Array.isArray(row.lv) ? row.lv : [row.lv]).map((level, position) => ({
      level,
      grade: Array.isArray(row.unlock) ? row.unlock[position] : row.unlock,
    })).filter((entry) => entry.grade !== undefined),
    ...(row.style ? { style: row.style } : {}),
  }));
  const skills = {};
  for (const slot of ["weapon", "helm", "mail", "gloves", "belt", "greaves"]) {
    const rows = Array.isArray(eq[slot]) ? skillRows(eq[slot]) : [];
    if (rows.length) skills[slot] = rows;
  }
  // 有些系列的某些武器種類技能不同（碎龍的輕／重弩是砲術、恐暴龍每種武器都不一樣…）：
  // eq[系列][武器種類] 存在時整份取代 eq.weapon（mhn.quest 畫面也是這樣取）。
  const weaponSkills = {};
  for (const type of weaponTypes) if (Array.isArray(eq[type])) weaponSkills[type] = skillRows(eq[type]);

  // 鑲嵌槽（洞）：每個部位一個陣列，每個數字是一個洞、在該階級解鎖（[5,8] = 5 階一個、8 階再一個）。
  // 武器沒有洞；沒有這個欄位或是空陣列的部位不輸出，畫面上就不顯示。
  const slots = Object.fromEntries(Object.entries(data.eq[key]?.slot ?? {}).filter(([, grades]) => Array.isArray(grades) && grades.length));

  index.push({
    key,
    id: config.id,
    weaponElements: [...new Set(weaponTypes.map((type) => config.eff?.[type] ?? config.eff?.all ?? "white"))],
    name: zh["monster-name"][key] ?? key,
    unlock: config.unlock ?? 1,
    weaponTypes,
    hasArmor,
    skills,
    ...(Object.keys(weaponSkills).length ? { weaponSkills } : {}),
    traits: weaponTraits(config, weaponTypes),
    ...(Object.keys(slots).length ? { slots } : {}),
  });

  const detail = { key, name: zh["monster-name"][key] ?? key };
  if (hasArmor) {
    const armor = gradesFor(key, "armor");
    detail.armor = armor.rows;
    if (armor.approximate) detail.armorApproximate = true;
    unknownRows += armor.unknownRows;
  }
  if (weaponTypes.length) {
    detail.weapons = {};
    for (const type of weaponTypes) {
      const weapon = gradesFor(key, type);
      detail.weapons[type] = weapon.rows;
      if (weapon.approximate) (detail.weaponApproximate ??= []).push(type);
      unknownRows += weapon.unknownRows;
    }
  }
  if (detail.armorApproximate || detail.weaponApproximate) approximateSeries++;
  details.push(detail);
}

await rm(DETAIL_DIR, { recursive: true, force: true });
await mkdir(DETAIL_DIR, { recursive: true });
await Promise.all(details.map((detail) => writeFile(`${DETAIL_DIR}/${detail.key}.json`, JSON.stringify(detail), "utf8")));
await writeFile(INDEX, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "mhn.quest（本機轉檔，請勿公開發布，詳見 data-source/mhn-quest/README.md）",
  weaponTypes: weaponTypeNames,
  slots: slotNames,
  // zh.skill 是每個技能逐級的效果說明，筆數就是等級上限（鎖定 1、防禦準備 3、攻擊 5…）。
  skillLevels: Object.fromEntries(Object.entries(zh.skill).filter(([, levels]) => Array.isArray(levels))),
  series: index,
}), "utf8");

/**
 * zh.item 的素材組有些是系列的別名（bone-heavy-gun、alloy-armor、easter-25-armor…），
 * 從後面一段一段拿掉，直到對上真正的系列代號。
 */
function seriesOfItemGroup(group) {
  for (let key = group; key; key = key.includes("-") ? key.slice(0, key.lastIndexOf("-")) : "") if (data.set[key]) return key;
  return group;
}

/**
 * 漂流石：6 種顏色各有來源魔物、技能池、稀有技能；另有共通（沒有稀有）與 21 組神秘。
 * 機率照 mhn.quest 畫面上的算法：稀有技能平分 10%，其餘（共通＋該顏色的非稀有）平分 90%。
 * 神秘漂流石的技能全部列為稀有，套同一個公式會得到怪結果，所以不輸出機率。
 * 掉落部位（drift-parts）只有 26 隻魔物有資料，沒有的就不寫。
 */
const partNames = zh["monster-parts"];
const commonSkills = smelt.general.skills;
const driftstones = {
  colors: Object.entries(smelt.color).map(([key, entry]) => {
    const rest = commonSkills.length + entry.skills.length - entry.rare.length;
    return {
      key,
      label: zh["driftstone-color"][key],
      sources: entry.source.map((monster) => {
        const parts = data.default.guide[monster]?.["drift-parts"];
        return { key: monster, name: zh["monster-name"][monster] ?? monster, ...(parts ? { parts: parts.map((part) => partNames[part] ?? part) } : {}) };
      }),
      skills: entry.skills.map((name) => ({ name, rare: entry.rare.includes(name), chance: entry.rare.includes(name) ? 10 / entry.rare.length : 90 / rest })),
      commonChance: 90 / rest,
    };
  }),
  common: commonSkills,
  events: Object.entries(smelt.event).map(([key, entry]) => ({
    key,
    label: zh["driftstone-color"]["event-format"].replace("{0}", key.replace("event-", "").toUpperCase()),
    skills: entry.skills,
  })),
};
await writeFile(DRIFT_OUT, JSON.stringify(driftstones), "utf8");

const files = await readdir(DETAIL_DIR);
const indexSize = Math.round((await readFile(INDEX)).length / 1024);
const detailSizes = await Promise.all(files.map(async (file) => (await readFile(`${DETAIL_DIR}/${file}`)).length));
console.log(`driftstones.json：${driftstones.colors.length} 色、${driftstones.events.length} 組神秘，${Math.round((await readFile(DRIFT_OUT)).length / 1024)} KB`);
console.log(`series-index.json：${index.length} 個系列，${indexSize} KB`);
console.log(`series/：${files.length} 個檔，平均 ${Math.round(detailSizes.reduce((a, b) => a + b, 0) / files.length / 1024)} KB，最大 ${Math.round(Math.max(...detailSizes) / 1024)} KB`);
console.log(`帶未知素材的階級：${unknownRows}；使用近似成本表的系列：${approximateSeries}`);
console.log(`可做武器的系列：${index.filter((s) => s.weaponTypes.length).length}，有防具的：${index.filter((s) => s.hasArmor).length}`);
