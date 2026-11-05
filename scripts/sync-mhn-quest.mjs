// 從 mhn.quest 下載最新遊戲資料到 data-source/mhn-quest/，之後再跑 npm run data:mhnow 才會進網站。
//
//   npm run data:mhn-quest              只預覽差異，不寫檔
//   npm run data:mhn-quest -- --apply   寫入（git 看得到差異，不對可以還原）
//
// 下載的 data／smelt／motions 之後會被 build-mhnow-data.mjs 當程式載入，所以這裡只當文字比對、不執行，
// 而且內容不像純資料（有 import、fetch…）或格式對不上就中止，不寫任何檔案。
// ja.json 站方改成 JS 格式，不在同步範圍。
import { readFile, writeFile } from "node:fs/promises";

const SITE = "https://mhn.quest";
const DIR = "data-source/mhn-quest";
const apply = process.argv.includes("--apply");
// 本站刻意用的譯名（站方名稱 → 本站名稱）：不轉回來，存檔裡的技能與分類表都會對不上。
const RENAMES = { "最有效距離威力UP": "適中距離威力UP", "高速蓄力【雷】": "高能強化【雷】" };
const NOT_DATA = /\bimport\b|\brequire\(|\bfetch\(|\beval\(|\bFunction\(|\bprocess\.|\bdocument\.|\bwindow\.|\bglobalThis\b/;

const get = async (path) => {
  const response = await fetch(`${SITE}/${path}`);
  if (!response.ok) throw new Error(`${path} 下載失敗：HTTP ${response.status}`);
  return response.text();
};
const rename = (text) => Object.entries(RENAMES).reduce((result, [from, to]) => result.replaceAll(from, to), text);
const only = (pattern, text, label) => {
  const found = [...new Set([...text.matchAll(pattern)].map((match) => match[0]))];
  if (found.length !== 1) throw new Error(`找不到唯一的 ${label}（找到 ${found.length} 個），站方結構可能改了`);
  return found[0];
};

const html = await get("");
const main = await get(only(/assets\/index-[\w-]+\.js/g, html, "主程式"));
const chunk = (name) => get(`assets/${only(new RegExp(`${name}-[\\w-]+\\.js`, "g"), main, `${name} 檔`)}`);
const files = {
  "data.mjs": { text: await chunk("data"), marker: "weaponVal" },
  "smelt.mjs": { text: await chunk("smelt"), marker: "event-a" },
  "motions.mjs": { text: await chunk("motions"), marker: "export" },
  "zh.json": { text: await get(only(/assets\/zh-[\w-]+\.json/g, html, "zh 檔")), marker: "monster-name" },
};
for (const [name, file] of Object.entries(files)) {
  if (!file.text.includes(file.marker)) throw new Error(`${name} 少了 ${file.marker}，格式可能改了`);
  if (name !== "zh.json" && NOT_DATA.test(file.text)) throw new Error(`${name} 不像純資料（${file.text.match(NOT_DATA)[0]}），中止`);
  file.text = rename(file.text);
}
const remoteZh = JSON.parse(files["zh.json"].text);
for (const key of ["monster-name", "skill-name", "skill", "item"]) if (!remoteZh[key]) throw new Error(`zh.json 少了 ${key}`);

const read = (name) => readFile(`${DIR}/${name}`, "utf8").catch(() => "");
const local = Object.fromEntries(await Promise.all(Object.keys(files).map(async (name) => [name, await read(name)])));
const localZh = JSON.parse(local["zh.json"] || "{}");
const diffKeys = (section) => {
  const after = remoteZh[section] ?? {}, before = localZh[section] ?? {};
  return { added: Object.keys(after).filter((key) => !(key in before)), removed: Object.keys(before).filter((key) => !(key in after)),
    changed: Object.keys(after).filter((key) => key in before && JSON.stringify(after[key]) !== JSON.stringify(before[key])) };
};
const eventGroups = (text) => Object.fromEntries([...text.matchAll(/"(event-[a-z]+)":\{skills:\[([^\]]*)\]/g)].map((match) => [match[1], match[2]]));
const remoteEvents = eventGroups(files["smelt.mjs"].text), localEvents = eventGroups(local["smelt.mjs"]);

const list = (label, items) => { if (items.length) console.log(`${label}（${items.length}）：${items.join("、")}`); };
const monsters = diffKeys("monster-name"), skills = diffKeys("skill-name"), effects = diffKeys("skill");
list("新增系列", monsters.added.map((key) => `${key} ${remoteZh["monster-name"][key]}`));
list("移除系列", monsters.removed);
list("新增技能", skills.added);
list("移除技能", skills.removed);
list("技能說明有改", effects.changed);
list("素材名稱有改", diffKeys("item").changed);
for (const [key, value] of Object.entries(remoteEvents)) if (localEvents[key] !== value) console.log(`漂流石 ${key}：${localEvents[key] ? `${localEvents[key]} → ` : "新增 "}${value}`);
for (const [name, file] of Object.entries(files)) console.log(`${name}：${file.text === local[name] ? "沒有變動" : `${local[name].length} → ${file.text.length} 字元`}`);

if (!apply) console.log("\n以上只是預覽。確認後跑 npm run data:mhn-quest -- --apply，再跑 npm run data:mhnow。");
else {
  await Promise.all(Object.entries(files).map(([name, file]) => writeFile(`${DIR}/${name}`, file.text, "utf8")));
  console.log("\n已寫入 data-source/mhn-quest/。接著跑 npm run data:mhnow，再用 git diff 檢查結果。");
}
