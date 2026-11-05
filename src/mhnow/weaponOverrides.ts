/**
 * 同一個系列有好幾種武器、其中一種有自己的名稱與圖示時（例如冬祭25 的雙劍叫「花環雙劍」，弓仍是冬祭25），
 * 畫面上都改用這裡的名稱與圖示。鍵是 "系列::武器種類"（跟配裝的武器值同格式）。
 */
export const WEAPON_OVERRIDES: Record<string, { name: string; icon: string }> = {
  "winter-25::dual-blades": { name: "花環雙劍", icon: "/mhnow/monsters/twin_wreathes.webp" },
  "halloween-24::long-sword": { name: "禍鐮瓦爾納烏斯", icon: "/mhnow/monsters/halloween-long_sword.png" },
  "halloween-25::hunting-horn": { name: "骸骨之笛", icon: "/mhnow/monsters/halloween-hunting_horn.png" },
};

/** 系列名稱：該武器種類有專屬名稱就用它。 */
export const weaponSeriesName = (key: string, type: string, name: string | undefined) => WEAPON_OVERRIDES[`${key}::${type}`]?.name ?? name ?? "";

/** 完整標題：有專屬名稱就只顯示名稱（不會變成「花環雙劍雙劍」），否則是「系列名＋種類名」。 */
export const weaponTitle = (key: string, type: string, seriesName: string, typeName: string) => WEAPON_OVERRIDES[`${key}::${type}`]?.name ?? `${seriesName}${typeName}`;

/** 裝備圖示；gearKey 是 "系列::武器種類"、"系列::armor" 或 "系列"。 */
export const gearIcon = (icons: Record<string, string>, gearKey: string): string | undefined => WEAPON_OVERRIDES[gearKey]?.icon ?? icons[gearKey.split("::")[0]];

/** 系列圖示表：該武器種類有專屬圖示時，蓋掉這個系列的圖示（回傳新的表，不改原本的）。 */
export const iconsForWeapon = (icons: Record<string, string>, type: string) => {
  const entries = Object.entries(WEAPON_OVERRIDES).filter(([id]) => id.endsWith(`::${type}`));
  return entries.length ? { ...icons, ...Object.fromEntries(entries.map(([id, value]) => [id.split("::")[0], value.icon])) } : icons;
};
