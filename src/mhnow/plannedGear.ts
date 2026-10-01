export const PLANNED_GEAR_KEY = "mhnow.plannedGear.v1";
export const PLANNED_SLOTS = ["helm", "mail", "gloves", "belt", "greaves"] as const;
export type PlannedGear = { series: string; slot: typeof PLANNED_SLOTS[number]; current: string; target: string };

export function parsePlannedGear(raw: string | null): PlannedGear[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((item): item is PlannedGear => {
      if (!item || typeof item !== "object" || typeof item.series !== "string" || !item.series
        || !PLANNED_SLOTS.includes(item.slot) || typeof item.current !== "string" || typeof item.target !== "string"
        || !/^(unforged|\d+-[1-5])$/.test(item.current) || !/^(|\d+-[1-5])$/.test(item.target)) return false;
      const key = `${item.series}::${item.slot}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch { return []; }
}
