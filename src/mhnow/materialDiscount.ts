/**
 * 活動素材減免：選了哪些魔物，存成魔物代號清單（跟配裝分開存，所有配裝共用）。
 * 被減免的魔物，它的「武器」升級不需要採集素材與尖爪；防具照常。
 */
export const MATERIAL_DISCOUNT_KEY = "mhnow.materialDiscount.v1";

/**
 * 目前活動預設減免的魔物。換活動時改 event（隨便一個新字串）與 monsters：
 * 使用者存的是舊活動的勾選，就會回到這份新預設；同一個活動內使用者自己的增減會保留。
 */
export const DEFAULT_MATERIAL_DISCOUNT = {
  event: "2026-10",
  // 蒼火龍、火龍、泡狐龍、恐暴龍、怨虎龍、雷狼龍、傘鳥
  monsters: ["a-ratha", "ratha", "mizu", "devi", "magn", "zino", "akno"],
};

export type MaterialDiscount = { event: string; monsters: string[] };

/** 讀存檔：沒存過、格式不對、或是別的活動存的，都回到目前活動的預設。 */
export function parseMaterialDiscount(raw: string | null, defaults: MaterialDiscount = DEFAULT_MATERIAL_DISCOUNT): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return [...defaults.monsters];
    const { event, monsters } = value as Record<string, unknown>;
    if (event !== defaults.event || !Array.isArray(monsters)) return [...defaults.monsters];
    return [...new Set(monsters.filter((item): item is string => typeof item === "string" && item !== ""))];
  } catch { return [...defaults.monsters]; }
}

export function serializeMaterialDiscount(monsters: string[], defaults: MaterialDiscount = DEFAULT_MATERIAL_DISCOUNT): string {
  return JSON.stringify({ event: defaults.event, monsters });
}

/** 減免時拿掉的素材分類：採集素材（gather）與尖爪（武器的 wyvern）。 */
const WAIVED_GROUPS = new Set(["gather", "wyvern"]);

/** 武器升級表拿掉減免的素材；Zenny 與魔物素材照舊。 */
export function waiveGatherMaterials<Row extends { materials: { group?: string }[] }>(rows: Row[]): Row[] {
  return rows.map((row) => ({ ...row, materials: row.materials.filter((item) => !WAIVED_GROUPS.has(item.group ?? "")) }));
}
