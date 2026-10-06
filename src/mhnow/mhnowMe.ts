import lz from "lz-string";
import type { Build, DriftPick } from "./buildStore";
import codes from "./mhnowMeCodes.json";

/**
 * mhnow.me 的配裝連結（https://mhnow.me/?load=…）：
 * ?load= 是 lz-string 壓縮的 JSON：[武器種類, 武器魔物, 頭, 胸, 手, 腰, 腳, { head: [洞技能…], … }]。
 * 魔物／技能代碼站方沒公開對照表，mhnowMeCodes.json 是從社群 Top 100 配裝反推出來的，
 * 沒出現過的系列或技能就沒有代碼，匯出／讀取時會明講是哪個。
 */
const SLOTS = [["head", "helm"], ["chest", "mail"], ["arms", "gloves"], ["waist", "belt"], ["legs", "greaves"]] as const;
const BASE = "https://mhnow.me/";

const invert = (table: Record<string, string>) => Object.fromEntries(Object.entries(table).map(([key, code]) => [code, key]));
const typeByCode = invert(codes.weaponTypes);
const seriesByCode = invert(codes.series);
const skillByCode = invert(codes.skills);

export type MhnowMeBuild = Pick<Build, "gear" | "drifts">;
export type SeriesName = (key: string) => string;

/** 本站配裝 → mhnow.me 連結。要全身六件都選了、系列與技能都有代碼才行；否則回傳缺什麼。 */
export function toMhnowMeLink(build: MhnowMeBuild, seriesName: SeriesName = (key) => key): { url: string } | { error: string } {
  const [weaponKey, type] = (build.gear.weapon ?? "").split("::");
  const typeCode = (codes.weaponTypes as Record<string, string>)[type];
  const series = codes.series as Record<string, string>;
  const skills = codes.skills as Record<string, string>;
  const missing: string[] = [];
  if (!weaponKey || !typeCode) return { error: "還沒選武器" };
  const pieces = SLOTS.map(([, slot]) => build.gear[slot]);
  if (pieces.some((key) => !key)) return { error: "六個部位要全部選好才能產生連結" };
  for (const key of [weaponKey, ...(pieces as string[])]) if (!series[key]) missing.push(seriesName(key));
  const drifts: Record<string, string[]> = {};
  for (const [src, slot] of SLOTS) {
    drifts[src] = (build.drifts[slot] ?? []).filter((pick): pick is DriftPick => !!pick).map((pick) => {
      if (!skills[pick.skill]) missing.push(`漂流石「${pick.skill}」`);
      return skills[pick.skill];
    });
  }
  if (missing.length) return { error: `mhnow.me 沒有這些的代碼：${[...new Set(missing)].join("、")}` };
  const payload = [typeCode, series[weaponKey], ...pieces.map((key) => series[key as string]), drifts];
  return { url: `${BASE}?load=${lz.compressToEncodedURIComponent(JSON.stringify(payload))}` };
}

/** 貼上的連結、或只有 ?load= 後面那串 → 配裝；認不得的代碼會列出來。 */
export function fromMhnowMeLink(input: string): { build: MhnowMeBuild } | { error: string } {
  const text = input.trim();
  const load = text.match(/[?&]load=([^&#\s]+)/)?.[1] ?? (/^[A-Za-z0-9+\-$]+$/.test(text) ? text : "");
  let payload: unknown;
  try { payload = JSON.parse(lz.decompressFromEncodedURIComponent(load) ?? ""); } catch { payload = null; }
  if (!Array.isArray(payload) || payload.length < 8 || typeof payload[7] !== "object" || !payload[7]) return { error: "不是 mhnow.me 的配裝連結" };
  const type = typeByCode[payload[0]];
  const weaponKey = seriesByCode[payload[1]];
  if (!type || !weaponKey) return { error: "認不得這把武器（站方的代碼我們還沒收錄）" };
  const gear: Record<string, string> = { weapon: `${weaponKey}::${type}` };
  const drifts: Record<string, (DriftPick | null)[]> = {};
  const unknown: string[] = [];
  SLOTS.forEach(([src, slot], position) => {
    const key = seriesByCode[payload[position + 2]];
    if (key) gear[slot] = key; else unknown.push(`${slot}（${payload[position + 2]}）`);
    const holes: unknown = (payload[7] as Record<string, unknown>)[src];
    drifts[slot] = (Array.isArray(holes) ? holes : []).map((code) => {
      const skill = skillByCode[String(code)];
      if (!skill) unknown.push(`漂流石 ${code}`);
      return skill ? { skill, color: "" } : null;
    });
  });
  if (unknown.length) return { error: `有認不得的代碼：${unknown.join("、")}；先把其他部位匯入，這些請自己選` };
  return { build: { gear, drifts } };
}
