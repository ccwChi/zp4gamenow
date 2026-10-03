/**
 * 分享單組配裝：把配裝壓成一段「分享碼」（MHN1. 開頭），可以直接貼，也可以包成網址做成 QR Code。
 * 只分享名稱、裝備與漂流石；升級目標（目前／目標階級）是各人的進度，不帶過去。
 * 收到的人貼上分享碼或打開網址，會接在現有配裝後面，不會蓋掉原本的。
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { parseBuild, type Build, type DriftPick } from "./buildStore";

const PREFIX = "MHN1.";
/** 網址 hash 裡帶分享碼的參數名：…/#share=MHN1.xxxx */
export const SHARE_PARAM = "share";

/** 依位置存，不寫欄位名稱，分享碼（和 QR Code）才小：裝備依這個順序，漂流石依防具部位順序。 */
const GEAR_ORDER = ["weapon", "helm", "mail", "gloves", "belt", "greaves"];
const DRIFT_ORDER = GEAR_ORDER.slice(1);
/** [名稱, 每格裝備（沒裝為 ""）, 每件防具的漂流石（每洞 [技能, 顏色]，空洞為 0）] */
type Payload = [string, string[], ([string, string] | 0)[][]];

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string) {
  return Uint8Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
}

/** 尾端的空值不用存。 */
function trimEnd<T>(list: T[], empty: (item: T) => boolean) {
  const result = [...list];
  while (result.length && empty(result[result.length - 1])) result.pop();
  return result;
}

export function encodeBuildShare(build: Build): string {
  const gear = trimEnd(GEAR_ORDER.map((slot) => build.gear[slot] ?? ""), (key) => !key);
  const drifts = trimEnd(DRIFT_ORDER.map((slot) => trimEnd(build.drifts[slot] ?? [], (pick) => !pick)
    .map((pick): [string, string] | 0 => (pick ? [pick.skill, pick.color] : 0))), (picks) => !picks.length);
  const payload: Payload = [build.name, gear, drifts];
  return PREFIX + toBase64Url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }));
}

/** 分享網址：目前頁面（不含 hash）加上 #share=分享碼。hash 不會送到伺服器，靜態網站也能用。 */
export function shareUrl(code: string, pageUrl: string): string {
  return `${pageUrl.split("#")[0]}#${SHARE_PARAM}=${code}`;
}

/** 從貼上的文字（分享碼本身、整段網址、或夾在其他文字裡）找出分享碼。 */
export function findShareCode(text: string): string | null {
  return text.match(/MHN1\.[A-Za-z0-9_-]+/)?.[0] ?? null;
}

/** 讀分享碼 → 一組配裝（id 隨便給，加入時 appendBuilds 會重新編號）。 */
export function decodeBuildShare(text: string): { build: Build } | { error: string } {
  const code = findShareCode(text);
  if (!code) return { error: "找不到分享碼，分享碼是 MHN1. 開頭的一串文字。" };
  let data: unknown;
  try { data = JSON.parse(strFromU8(inflateSync(fromBase64Url(code.slice(PREFIX.length))))); } catch { return { error: "分享碼不完整或已損壞，請重新複製一次。" }; }
  if (!Array.isArray(data)) return { error: "分享碼格式不對。" };
  const [name, gearList, driftList] = data as unknown[];
  const gear: Record<string, unknown> = {};
  if (Array.isArray(gearList)) GEAR_ORDER.forEach((slot, position) => { gear[slot] = gearList[position]; });
  const drifts: Record<string, (DriftPick | null)[]> = {};
  if (Array.isArray(driftList)) DRIFT_ORDER.forEach((slot, position) => {
    const picks: unknown = driftList[position];
    if (Array.isArray(picks) && picks.length) drifts[slot] = picks.map((pick) => (Array.isArray(pick) && typeof pick[0] === "string" && pick[0]
      ? { skill: pick[0], color: typeof pick[1] === "string" ? pick[1] : "" } : null));
  });
  const build = parseBuild({ id: "shared", name: typeof name === "string" ? name : "", gear, drifts, pieces: {}, showMissing: false });
  if (!build || !Object.keys(build.gear).length) return { error: "分享碼裡沒有任何裝備。" };
  return { build };
}
