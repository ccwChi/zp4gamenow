export const SERIES_SORT_KEY = "mhnow.seriesSort.v1";
export const SERIES_SORT_OPTIONS = { id: "系列 ID", element: "武器屬性", source: "原始資料順序", name: "中文排序" };
export type SeriesSort = keyof typeof SERIES_SORT_OPTIONS;
export function parseSeriesSort(value: string | null): SeriesSort {
  return value && Object.prototype.hasOwnProperty.call(SERIES_SORT_OPTIONS, value) ? value as SeriesSort : "name";
}
const ELEMENTS = ["white", "fire", "water", "thunder", "ice", "dragon", "status", "multiple", "none"];
export function elementGroup(effects: string[] = []): string {
  const groups = [...new Set(effects.map((effect) => ["blast", "paralysis", "poison", "sleep"].includes(effect) ? "status" : effect === "thunder2" ? "thunder" : effect))];
  return groups.length > 1 ? "multiple" : groups[0] ?? "none";
}
export function sortSeries<T extends { name: string; id?: number; weaponElements?: string[] }>(series: T[], mode: SeriesSort): T[] {
  const result = [...series];
  const byId = (a: T, b: T) => (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
  if (mode === "id") result.sort(byId);
  if (mode === "name") result.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  if (mode === "element") result.sort((a, b) => ELEMENTS.indexOf(elementGroup(a.weaponElements)) - ELEMENTS.indexOf(elementGroup(b.weaponElements)) || byId(a, b));
  return result;
}
