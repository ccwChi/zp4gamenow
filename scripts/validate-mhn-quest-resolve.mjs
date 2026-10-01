// 拿舊的 GameWith 爬蟲資料當對照，驗證 mhn.quest 解析器是否正確。
// GameWith 已確認過期（G5 生產階數量偏低，遊戲內實測以 mhn.quest 為準），
// 所以這裡的目的不是「完全一致」，而是確認代碼解析沒有解錯素材種類。
import { readFile } from "node:fs/promises";
import { buildCodeMap, costRowFor, decodeRow, loadSource, tablesFor } from "./mhn-quest-resolve.mjs";

const source = await loadSource();
const { data, zh } = source;
const armor = JSON.parse(await readFile("public/mhnow/armor-catalog.json", "utf8"));

// GameWith 用日文魔物名，mhn.quest 用系列代號；用中文名當橋接。
const jaToZh = JSON.parse(await readFile("src/mhnow/monsterTranslations.ts", "utf8").then((text) => {
  const body = text.slice(text.indexOf("{"), text.lastIndexOf("};") + 1);
  return JSON.stringify(Object.fromEntries([...body.matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]])));
}));
const zhToSeries = Object.fromEntries(Object.entries(zh["monster-name"]).map(([key, name]) => [name, key]));

let matched = 0, kindMismatch = 0, qtyMismatch = 0, skipped = 0;
const forgeStats = { match: 0, diff: 0 }; const upgradeStats = { match: 0, diff: 0 };
const problems = [];
const byGrade = {}; const badSeries = {};

for (const monster of armor.monsters) {
  const series = zhToSeries[jaToZh[monster.monster]];
  if (!series || !data.matSeries[series]) { skipped++; continue; }
  const codeMap = buildCodeMap(source, series, "belt");
  const tables = tablesFor(data, series, "armor");

  for (const step of monster.steps) {
    const [grade, level] = step.grade.split("-");
    const isForge = level === "1" && step.grade === monster.steps[0].grade;
    const { costRow, typeRow } = costRowFor(tables, grade, level, isForge);
    if (!costRow || !typeRow) { skipped++; continue; }

    const decoded = decodeRow(costRow, typeRow, codeMap);
    // i 代碼尚未解出（G6 以上 Lv2/Lv4 多出的小量素材，GameWith 過期版本沒有），先排除再比。
    const mine = new Map(decoded.materials.filter((m) => !m.code.startsWith("i")).map((m) => [m.name, m.quantity]));
    const theirs = new Map(step.materials.map((m) => [m.material, m.quantity]));
    // 只比「素材種類數」與有多少種名稱對得上——名稱一邊日文一邊中文，比數量分布。
    const sameCount = mine.size === theirs.size;
    const sameQuantities = JSON.stringify([...mine.values()].sort((a, b) => a - b)) === JSON.stringify([...theirs.values()].sort((a, b) => a - b));
    if (!sameCount) { kindMismatch++; if (problems.length < 8) problems.push(`${monster.monster} ${step.grade} 種類數 ${mine.size} vs ${theirs.size}`); }
    else if (!sameQuantities) { qtyMismatch++; if (problems.length < 8) problems.push(`${monster.monster} ${step.grade} 數量 [${[...mine.values()]}] vs [${[...theirs.values()]}]`); }
    else matched++;
    const bucket = isForge ? forgeStats : upgradeStats;
    if (sameCount && sameQuantities) bucket.match++; else { bucket.diff++; byGrade[step.grade] = (byGrade[step.grade] ?? 0) + 1; (badSeries[series] ??= []).push(step.grade); }
    if (decoded.materials.some((m) => m.name.startsWith("?"))) problems.push(`${series} ${step.grade} 有未解代碼 ${decoded.materials.filter((m) => m.name.startsWith("?")).map((m) => m.code)}`);
  }
}

const total = matched + kindMismatch + qtyMismatch;
console.log(`比對 ${total} 個階級（跳過 ${skipped}）`);
console.log(`  數量完全一致   ${matched} (${(matched / total * 100).toFixed(1)}%)`);
console.log(`  素材種類數不同 ${kindMismatch}`);
console.log(`  數量不同       ${qtyMismatch}`);
console.log(`
  生產階（首階）  一致 ${forgeStats.match} / 不同 ${forgeStats.diff}`);
console.log(`  強化階          一致 ${upgradeStats.match} / 不同 ${upgradeStats.diff}`);
console.log("  差異集中的階級:", Object.entries(byGrade).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([g, n]) => `${g}:${n}`).join(" "));
const worst = Object.entries(badSeries).sort((a, b) => b[1].length - a[1].length).slice(0, 25);
console.log("  問題系列:", worst.map(([k, v]) => `${k}(${v.length})`).join(" "));
for (const [k] of worst.slice(0, 4)) console.log(`    set[${k}].unlock=${data.set[k]?.unlock} forge=${JSON.stringify(data.set[k]?.forge)} craft=${JSON.stringify(data.set[k]?.craft)}`);
if (problems.length) console.log(`\n前幾個差異:\n  ${problems.slice(0, 10).join("\n  ")}`);
