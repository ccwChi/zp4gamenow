/**
 * 武器風格：每種武器兩個，升到一定階級才解鎖，一把武器只能選一個。
 * 代號沿用 mhnow.me（社群配裝的資料也是這組代號），這樣兩邊對得起來。
 * 中文名遊戲資料沒有附，填在 STYLE_NAMES 裡；還沒填的先顯示英文代號轉成的可讀名稱。
 */
export const WEAPON_STYLES: Record<string, string[]> = {
  "shield-sword": ["thrusting_slash", "perfect_rush"],
  "great-sword": ["surge_slash_style", "rage_slash"],
  "long-sword": ["sacred_sheath", "spirit_reckoning"],
  "dual-blades": ["demon_mode_feral", "spiral_slash"],
  hammer: ["water_strike", "impact_crater"],
  "hunting-horn": ["shockwave", "fleeting_melody"],
  lance: ["insta_block", "shield_tackle"],
  gunlance: ["guard_reload", "blast_dash"],
  "switch-axe": ["elemental_burst_counter", "soaring_wyvern_blade"],
  "charge-blade": ["sword_boost", "axe_boost"],
  "insect-glaive": ["kinsect_slash", "awakened_kinsect_attack"],
  bow: ["absolute_power_shot", "dodgebolt"],
  "light-gun": ["slide_reload", "sidestep_fire"],
  "heavy-gun": ["crouching_shot", "guard_reload"],
};

/** 代號 → 遊戲裡的中文名。銃槍與重弩共用 guard_reload，名稱也一樣。 */
export const STYLE_NAMES: Record<string, string> = {
  thrusting_slash: "穿刺斬", perfect_rush: "精準突擊",
  surge_slash_style: "流水風格", rage_slash: "激昂斬",
  sacred_sheath: "威合", spirit_reckoning: "氣刃無雙斬",
  demon_mode_feral: "鬼人化(獸)", spiral_slash: "螺旋斬",
  water_strike: "水面打擊", impact_crater: "流星穿地擊",
  fleeting_melody: "敏捷的旋律", shockwave: "響打",
  insta_block: "精準防禦", shield_tackle: "盾擊衝撞",
  guard_reload: "防禦裝填", blast_dash: "暴風衝刺",
  soaring_wyvern_blade: "飛翔龍劍", elemental_burst_counter: "屬性裝填反擊",
  sword_boost: "劍強化", axe_boost: "斧強化",
  kinsect_slash: "操蟲斬", awakened_kinsect_attack: "覺蟲擊",
  absolute_power_shot: "鋼連射", dodgebolt: "躲避箭斬",
  slide_reload: "滑行裝填", sidestep_fire: "墊步射擊",
  crouching_shot: "蹲伏射擊",
};

/** 沒有中文名時的備用顯示：crouching_shot → Crouching Shot。 */
const readable = (code: string) => code.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

export const styleName = (code: string) => STYLE_NAMES[code] ?? readable(code);

/** 這種武器可以選的風格；沒有資料的武器種類回空陣列。 */
export const stylesFor = (type: string) => WEAPON_STYLES[type] ?? [];

/** 這個風格是不是這種武器的（換武器種類時用來清掉不相符的選擇）。 */
export const styleFits = (type: string, code: string) => stylesFor(type).includes(code);
