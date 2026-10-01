// 解析 mhn.quest 資料模型：把「成本表 + 素材代碼」還原成具體的素材名稱與數量。
//
// 代碼→素材的規則直接照 mhn.quest 前端（assets/index-*.js 的素材彙整函式）移植，
// 不再靠反推。重點（al = 防具、否則武器）：
//   z            → Zenny
//   a            → 該系列的 a1（防具）／a2（武器）；a1、a2… 直接指定
//   c（古龍）    → 古龍系列的 c 是 c1（防具）／c2（武器），一般系列的 c 就是 c
//   b～e、f*     → 該系列自己的同字母素材（f* = 系列的 f，多半是逆鱗這類最稀有的）
//   f / F        → 大地結晶那一組，取 itemType[別名][0] / [4]
//   g            → 草蟲，取 itemType[別名][1]；j、k 分防具（1）／武器（2）；l、m 龍玉碎片、貴龍石
//   h / H        → 礦石／骨頭組，看 itemType[別名][2]（H 與 h 相反）
//   i / I        → 別的系列的素材（itemType[別名][3] / [4] 指到哪個系列）；沒有別名時 mhn.quest 不列這一項
// 「別名」預設是系列本身，set[系列].itemType 可以依武器種類／防具／武器覆寫。
import { readFile } from "node:fs/promises";

const SOURCE_DIR = "data-source/mhn-quest";

export async function loadSource() {
  const data = await import(`../${SOURCE_DIR}/data.mjs`);
  const zh = JSON.parse(await readFile(`${SOURCE_DIR}/zh.json`, "utf8"));
  return { data, zh };
}

/** "g-jagr/a2" → 中文素材名 */
export function itemName(zh, ref) {
  if (!ref) return null;
  const [group, key] = ref.split("/");
  const entry = zh.item[group];
  if (entry === undefined) return null;
  return typeof entry === "string" ? entry : (entry[key] ?? null);
}


/** default export 裡才有的具名表（帶連字號的，如 weaponCost-cheap）也要找得到。 */
export function namedTable(data, name) {
  return data[name] ?? data.default?.[name];
}

/**
 * 素材代碼 → 該素材在 zh.item 裡的路徑。
 * @param kind 防具部位（belt…）或武器種類（bow…）；"weapon" 視為一般武器
 * @returns 路徑字串；null 表示 mhn.quest 不列這一項；undefined 表示規則裡沒有這種代碼
 */
export function materialPath(data, series, kind, code) {
  const config = data.set[series] ?? {};
  const isWeapon = kind === "weapon" || data.weaponType.includes(kind);
  const override = config.itemType;
  let alias = series;
  if (override?.[kind]) alias = override[kind];
  if (!isWeapon && override?.armor) alias = override.armor;
  else if (isWeapon && override?.weapon) alias = override.weapon;
  const it = data.default.itemType?.[alias] ?? data.itemType[alias] ?? ["b", "g", "2", ""];

  let prefix = series;
  let ie = code;
  if (code.includes("/")) [prefix, ie] = code.split("/");
  const armorOrWeapon = (armor, weapon) => (isWeapon ? weapon : armor);

  if (code === "a") return `${prefix}/${armorOrWeapon("a1", "a2")}`;
  if (ie[0] === "a") return `${prefix}/${ie}`;
  if (code === "c" && config.elder) return `${prefix}/${armorOrWeapon("c1", "c2")}`;
  if ((ie >= "b" && ie <= "e") || ie === "f*") return `${prefix}/${ie === "f*" ? "f" : ie}`;
  if (ie === "f") return `f/${it[0]}`;
  if (ie === "F") return `f/${it[4]}`;
  if (ie === "f1") return `${prefix}/f1`;
  if (ie[0] === "f") return `f/${ie[1]}`;
  if (ie === "g") return `g/${it[1]}`;
  if (ie[0] === "g") return `g/${ie[1]}`;
  if (ie[0] === "h") return `${it[2] === "1" ? "h1" : "h2"}/${ie[1]}`;
  if (ie[0] === "H") return `${it[2] === "2" ? "h1" : "h2"}/${ie[1]}`;
  if (ie[0] === "i") return it[3] ? `${it[3]}/${ie[1] === "a" ? armorOrWeapon("a1", "a2") : ie[1]}` : null;
  if (ie[0] === "I") return `${it[4]}/${ie[1] === "a" ? armorOrWeapon("a1", "a2") : ie[1]}`;
  if (ie === "j" || ie === "k") return `${ie}${armorOrWeapon("1", "2")}`;
  if (ie === "l" || ie === "m") return ie;
  return undefined;
}

/**
 * 建立某個系列 + 某個部位／武器種類的素材代碼解析器。
 * decodeRow 透過 __resolve(code) 取得 { name, rare, path }（null = 這項不列）。
 */
export function buildCodeMap({ data, zh }, series, kind) {
  return {
    __zh: zh,
    __resolve(code) {
      const path = materialPath(data, series, kind, code);
      if (path === null) return null;
      return { path, name: path ? itemName(zh, path) : null, rare: rarityOf(code) };
    },
  };
}

/**
 * 選成本表與素材類型表，照 mhn.quest 前端的規則：
 *   set[系列][武器種類] 有的話整組覆寫（forge / craft 各自的 cost 與 type）；
 *   否則 forge / craft 的 armor|weapon 是成本表、type 是類型表，防具另有 armorType，
 *   forge[武器種類] / craft[武器種類] 可以再單獨覆寫類型表；都沒寫才用預設的 forgeArmorCost、armorCost、costType…
 * @param kind "armor" 或武器種類
 */
export function tablesFor(data, series, kind) {
  const isWeapon = kind !== "armor";
  const config = data.set[series] ?? {};
  const perType = isWeapon ? config[kind] : undefined;
  let forgeCost, forgeType, craftCost, craftType;
  if (perType) {
    ({ cost: forgeCost, type: forgeType } = perType.forge ?? {});
    ({ cost: craftCost, type: craftType } = perType.craft ?? {});
  } else {
    const forge = config.forge ?? {}; const craft = config.craft ?? {};
    forgeCost = isWeapon ? forge.weapon : forge.armor;
    craftCost = isWeapon ? craft.weapon : craft.armor;
    // 武器種類（bow…）可以單獨覆寫類型表；防具的 kind 是 "armor"，會撞到 forge.armor（那是成本表名），所以只給武器用。
    forgeType = (isWeapon ? forge[kind] : forge.armorType) ?? forge.type;
    craftType = (isWeapon ? craft[kind] : craft.armorType) ?? craft.type;
  }
  const table = (name, fallback) => {
    if (!name) return data[fallback];
    // 帶連字號的表名（weaponCost-cheap、g5ArmorCost-mizu…）不是具名 export，但在 default export 裡找得到。
    const found = namedTable(data, name);
    if (found) return found;
    // 兩邊都沒有的（目前只有 winter-25-*）才退回破折號前的基底表，並標記為近似值。
    return data[name.split("-")[0]] ?? data[fallback];
  };
  return {
    forge: table(forgeCost, isWeapon ? "forgeWeaponCost" : "forgeArmorCost"),
    craft: table(craftCost, isWeapon ? "weaponCost" : "armorCost"),
    forgeType: table(forgeType, "costType"),
    craftType: table(craftType, "costType"),
    approximate: [forgeCost, craftCost, forgeType, craftType].some((name) => typeof name === "string" && name.includes("-") && !namedTable(data, name)),
  };
}

/** 某一階的成本列與類型列。首階（isForge）用生產表；生產表若是依階級分層的（g5ArmorCost 之類），取第 1 層。 */
export function costRowFor(tables, grade, level, isForge) {
  let costRow = isForge ? tables.forge?.[grade] : tables.craft?.[grade]?.[level];
  if (isForge && typeof costRow?.[1] === "object") costRow = costRow[1];
  const typeRow = (isForge ? tables.forgeType : tables.craftType)?.[grade]?.[level];
  return { costRow, typeRow };
}

/**
 * 素材稀有度（R1～R6），換算規則照 mhn.quest 前端（assets/index-*.js 的素材彙整函式）：
 *   a 系列 1；b～e 依字母 2～5；f* 6；f／F 3、f1 6；g 1；h/H/i/I 系列取第二個字母（a=1、b=2、c=3）；
 *   j 1、k 3、l/m（龍玉碎片、貴龍石）6。帶路徑的代碼（alloy-armor/b）只看斜線後的字母。
 * 不在規則內的代碼（如 z、pts）回傳 undefined，畫面上就不標。
 */
export function rarityOf(code) {
  const letter = code.includes("/") ? code.split("/")[1] : code;
  if (letter[0] === "a") return 1;
  if ((letter >= "b" && letter <= "e") || letter === "f*") return letter.charCodeAt(0) - 96;
  if (letter === "f1") return 6;
  if (letter[0] === "f" || letter === "F") return 3;
  if (letter[0] === "g") return 1;
  if (/^[hHiI]./.test(letter)) return letter.charCodeAt(1) - 96;
  if (letter === "j") return 1;
  if (letter === "k") return 3;
  if (letter === "l" || letter === "m") return 6;
  return undefined;
}

/**
 * 素材分類，給素材清單排序用（畫面上的順序是 wyvern → gather → 魔物專屬 → misc）：
 *   wyvern  j：翼龍的皮／尖爪（打小型魔物得到）
 *   gather  f / F、g、h / H：採集得到的（黏著黑蟻、大地結晶、上龍骨、草蟲菇、礦石、龍骨）
 *   misc    k、l、m：精鍊素材、龍玉碎片、貴龍石（通用，不屬於採集也不屬於哪隻魔物）
 *   其餘（a～e、f*、f1、i / I、帶路徑的代碼）是魔物專屬，回傳 undefined 當預設值，不佔資料檔空間。
 */
export function groupOf(code) {
  const letter = code.includes("/") ? code.split("/")[1] : code;
  if (letter === "j") return "wyvern";
  if (letter === "k" || letter === "l" || letter === "m") return "misc";
  if (letter === "f*" || letter === "f1") return undefined;
  if (/^[fFgG]/.test(letter) || /^[hH]./.test(letter)) return "gather";
  return undefined;
}

/**
 * 採集素材再細分（依 zh.item 的路徑）：f 是稀有採集（黏著黑蟻、大地結晶、上龍骨），
 * h1 龍骨、h2 礦石；g 是草蟲菇，依項目分成植物、蟲、菇。不是採集素材回傳 undefined。
 */
const GATHER_G = { a: "plant", b: "plant", c: "plant", h: "plant", i: "plant", f: "bug", g: "bug", d: "mushroom", e: "mushroom", j: "mushroom" };
export function gatherKindOf(path) {
  if (typeof path !== "string") return undefined;
  const [group, key] = path.split("/");
  if (group === "f") return "rare";
  if (group === "h1") return "bone";
  if (group === "h2") return "ore";
  if (group === "g") return GATHER_G[key];
  return undefined;
}

/** 把一列 [zenny, qty...] + ["z","a",...] 還原成 { zenny, materials } */
export function decodeRow(costRow, typeRow, codeMap) {
  let zenny = 0;
  const materials = [];
  typeRow.forEach((code, index) => {
    const value = costRow[index];
    if (value === undefined) return;
    if (code === "z") { zenny = value; return; }
    const resolved = codeMap.__resolve(code);
    if (resolved === null) return; // mhn.quest 也不列這一項
    materials.push({ name: resolved.name ?? `?${code}`, quantity: value, code, path: resolved.path, rare: resolved.rare, group: groupOf(code) });
  });
  return { zenny, materials };
}
