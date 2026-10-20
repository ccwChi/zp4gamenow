/**
 * 武器屬性分類：選魔物時用來篩「有這個屬性武器的魔物」。
 * 看的是武器的屬性（weaponElement／weaponEff），不是魔物本身。
 * 雷有 thunder 與 thunder2 兩種資料代號（同一隻魔物的兩把雷武器），都算雷。
 */
export const WEAPON_ELEMENT_NAMES = {
  fire: "火", water: "水", ice: "冰", thunder: "雷", dragon: "龍",
  paralysis: "麻痺", blast: "爆破", sleep: "睡眠", poison: "毒", white: "無屬性",
} as const;

export type WeaponElement = keyof typeof WEAPON_ELEMENT_NAMES;

/** 篩選鈕的顏色：選中時當底色，沒選時當文字色。 */
export const WEAPON_ELEMENT_COLORS: Record<WeaponElement, string> = {
  fire: "#c2512c", water: "#2f6cc0", ice: "#2f8fa8", thunder: "#b08a10", dragon: "#7a4fb0",
  paralysis: "#9c8b12", blast: "#9a5a22", sleep: "#4a6ea8", poison: "#8e3f9e", white: "#6b726c",
};

export const WEAPON_ELEMENTS = Object.keys(WEAPON_ELEMENT_NAMES) as WeaponElement[];

export type ElementSource = { weaponElement?: string; weaponElements?: string[]; weaponEff?: Record<string, string> };

const normalize = (value: string) => value === "thunder2" ? "thunder" : value;

/**
 * 這個系列的武器有哪些屬性。
 * type 有給就只看那種武器（weaponEff 是跟系列預設屬性不同的武器種類），沒給就看整個系列。
 */
export function weaponElementsOf(item: ElementSource, type?: string): string[] {
  if (type) {
    const element = item.weaponEff?.[type] ?? item.weaponElement;
    return element ? [normalize(element)] : [];
  }
  const all = item.weaponElements ?? (item.weaponElement ? [item.weaponElement] : []);
  return [...new Set(all.map(normalize))];
}

export function hasWeaponElement(item: ElementSource, element: string, type?: string): boolean {
  return weaponElementsOf(item, type).includes(normalize(element));
}
