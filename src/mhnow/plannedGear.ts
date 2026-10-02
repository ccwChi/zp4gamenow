export const PLANNED_GEAR_KEY = "mhnow.plannedGear.v1";
export const PLANNED_SLOTS = ["helm", "mail", "gloves", "belt", "greaves"] as const;
const WEAPON_TYPES = ["shield-sword", "great-sword", "long-sword", "dual-blades", "hammer", "hunting-horn", "lance", "gunlance", "switch-axe", "charge-blade", "insect-glaive", "light-gun", "heavy-gun", "bow"];
export type PlannedGear = { series: string; slot: typeof PLANNED_SLOTS[number] | "weapon"; weaponType?: string; current: string; target: string; included?: boolean };
export const PLANNED_STATS_ID = "planned-gear";
export const plannedGearId = (item: PlannedGear) => `${item.series}::${item.slot === "weapon" ? item.weaponType : item.slot}`;
/** Same equipment shared with a loadout counts only once in the total. */
export const plannedMaterialKey = (item: PlannedGear) => item.slot === "weapon" ? `weapon|${item.series}::${item.weaponType}` : `${item.slot}|${item.series}::armor`;

export function parsePlannedGear(raw: string | null): PlannedGear[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((item): item is PlannedGear => {
      if (!item || typeof item !== "object" || typeof item.series !== "string" || !item.series
        || !(item.slot === "weapon" ? WEAPON_TYPES.includes(item.weaponType) : PLANNED_SLOTS.includes(item.slot)) || typeof item.current !== "string" || typeof item.target !== "string"
        || (item.included !== undefined && typeof item.included !== "boolean")
        || !/^(unforged|\d+-[1-5])$/.test(item.current) || !/^(|\d+-[1-5])$/.test(item.target)) return false;
      const key = plannedGearId(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch { return []; }
}
