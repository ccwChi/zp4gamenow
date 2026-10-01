/**
 * 活動素材減免：選了哪些魔物，存成魔物代號清單（跟配裝分開存，所有配裝共用）。
 * 被減免的魔物，它的「武器」升級不需要採集素材與尖爪；防具照常。
 */
export const MATERIAL_DISCOUNT_KEY = "mhnow.materialDiscount.v1";

export function parseMaterialDiscount(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === "string" && item !== ""))];
  } catch { return []; }
}

/** 減免時拿掉的素材分類：採集素材（gather）與尖爪（武器的 wyvern）。 */
const WAIVED_GROUPS = new Set(["gather", "wyvern"]);

/** 武器升級表拿掉減免的素材；Zenny 與魔物素材照舊。 */
export function waiveGatherMaterials<Row extends { materials: { group?: string }[] }>(rows: Row[]): Row[] {
  return rows.map((row) => ({ ...row, materials: row.materials.filter((item) => !WAIVED_GROUPS.has(item.group ?? "")) }));
}
