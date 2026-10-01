// 下載魔物紋章縮圖，以 mhn.quest 的系列代號（a-ratha、g-jagr…）當鍵。
//
// 兩邊的命名不同，用「繁體中文魔物名」當橋接：
//   mhn.quest   系列代號 → 中文名（series-index.json）
//   mhnow.me    中文名   → slug（llms-full.txt，CC BY 4.0）
//   圖檔        https://mhnow.me/images/icon/<slug>.webp
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ICON_DIR = "public/mhnow/monsters";
const MANIFEST = "public/mhnow/monster-icons.json";
const LLMS = "https://mhnow.me/llms-full.txt";

// mhnow.me 的圖檔 id 偶爾與 slug 不同。
const iconIdOverrides = {
  "雪鬼獸": "gossharag", "飛毒龍": "vipertobikadachi",
  // 兩邊譯名詞序不同 / llms-full 尚未收錄，直接指定圖檔 id。
  "銀爵龍": "malzeno", "碎龍": "brachydios",
  "冰人魚龍": "aurorasomnacanth",
};
// 不是魔物的系列（素材系、活動系），本來就沒有紋章。
const notMonsters = new Set(["ore", "bone", "leather", "alloy", "guardian"]);

const index = JSON.parse(await readFile("public/mhnow/series-index.json", "utf8"));

const text = await (await fetch(LLMS)).text();
const slugByName = {};
for (const heading of text.matchAll(/^### (.+?) \/ (.+?) \/ (.+?) \/ (.+?) \/ (.+?)$/gm)) {
  const slug = text.slice(heading.index, heading.index + 400).match(/\*\*slug\*\*: `([a-z0-9_]+)`/)?.[1];
  if (slug) slugByName[heading[1].trim()] = slug;
}
console.log(`llms-full 提供 ${Object.keys(slugByName).length} 筆中文名 → slug`);

await mkdir(ICON_DIR, { recursive: true });
const manifest = {};
const unresolved = [];
const cache = new Map();

for (const series of index.series) {
  if (notMonsters.has(series.key) || /^(lunar|halloween|ny|mr-beast|carnival|hope|easter|summer|winter|spring)/.test(series.key)) continue;
  const iconId = iconIdOverrides[series.name] ?? slugByName[series.name];
  if (!iconId) { unresolved.push(`${series.key}（${series.name}）找不到 slug`); continue; }
  const filename = `${iconId}.webp`;
  if (!cache.has(filename)) {
    const response = await fetch(`https://mhnow.me/images/icon/${filename}`);
    const ok = response.ok && response.headers.get("content-type")?.startsWith("image/");
    if (ok) await writeFile(`${ICON_DIR}/${filename}`, Buffer.from(await response.arrayBuffer()));
    cache.set(filename, ok);
  }
  if (cache.get(filename)) manifest[series.key] = `/mhnow/monsters/${filename}`;
  else unresolved.push(`${series.key}（${series.name}）${iconId} 下載失敗`);
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
console.log(`完成 ${Object.keys(manifest).length} 個系列有圖示`);
if (unresolved.length) console.log(`未取得：\n  ${unresolved.join("\n  ")}`);
