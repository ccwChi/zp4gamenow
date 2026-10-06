/**
 * 同一個系列有好幾種武器、其中一種有自己的名稱與圖示時（例如冬祭25 的雙劍叫「花環雙劍」，弓仍是冬祭25），
 * 在選武器與結果畫面改用這裡的名稱與圖示。鍵是 "系列::武器種類"（跟建議配裝的武器值同格式）。
 */
export const WEAPON_OVERRIDES: Record<string, { name: string; icon: string }> = {
  "winter-25::dual-blades": { name: "花環雙劍", icon: "/mhnow/monsters/twin_wreathes.webp" },
};

/** 系列名稱：該武器種類有專屬名稱就用它。 */
export const weaponSeriesName = (key: string, type: string, name: string | undefined) => WEAPON_OVERRIDES[`${key}::${type}`]?.name ?? name ?? "";

/** 系列圖示表：該武器種類有專屬圖示時，蓋掉這個系列的圖示（回傳新的表，不改原本的）。 */
export const iconsForWeapon = (icons: Record<string, string>, type: string) => {
  const entries = Object.entries(WEAPON_OVERRIDES).filter(([id]) => id.endsWith(`::${type}`));
  return entries.length ? { ...icons, ...Object.fromEntries(entries.map(([id, value]) => [id.split("::")[0], value.icon])) } : icons;
};
