import { parsePlannedGear, type PlannedGear } from "./plannedGear";

/**
 * 多組配裝與 localStorage 存檔。
 * 一組配裝＝武器／五件防具（gear）＋各部位鑲的漂流石（drifts）＋每件裝備的升級目標（pieces）；
 * 展開哪一列這類畫面狀態不存。
 */

/**
 * 一件裝備的升級目標：目前階級 → 目標階級；target 為 "" 表示不升級（不計算素材），這是預設。
 * item 記下是哪件裝備（"系列::armor" 或 "系列::武器種類"），換了裝備就不再套用，回到預設。
 */
export type Piece = { item: string; current: string; target: string };
/**
 * 一個洞鑲的漂流石：技能＋從哪種顏色挑的（fire／water／…／common／event）。
 * 同一個技能可能出現在好幾種顏色（例如紅色與神秘都有「破壞王」），所以顏色要一起記。
 * color 為 "" 表示不知道（舊存檔只存了技能名稱），畫面上再依漂流石資料推回來。
 */
export type DriftPick = { skill: string; color: string };
/** gear：武器存 "系列::武器種類"，防具存系列代號。drifts：每件防具每個洞挑的漂流石（依洞的順序）。
 *  showMissing：整組有設定目標的裝備都列出缺少素材。 */
export type Build = {
  id: string; name: string; gear: Record<string, string>; drifts: Record<string, (DriftPick | null)[]>;
  pieces: Record<string, Piece>; showMissing: boolean;
};
/**
 * 目前階級是「每件裝備」共用的：同一件裝備（部位＋系列）在每組配裝都是同一個階級，漂流石則各配裝自己鑲。
 * owned：裝備代號（gearId）→ 目前階級（"unforged" 或 "6-1" 這種）。只在有人設定過才出現。
 */
export type Owned = Record<string, string>;
/**
 * 每件裝備已經練成的漂流石技能（裝備代號 → 技能名稱），跟目前階級一樣是每件裝備共用的：
 * 一件裝備可以練出很多種漂流石、之後自由換著鑲，所以「練成了沒」記在裝備上，不是記在某一組配裝。
 * 配裝裡鑲的漂流石若在這份名單裡就是「已有」，否則是「尚未」。
 */
export type Forged = Record<string, string[]>;
/** 存檔裡 forged 的版本；對不上就當成沒有。 */
const FORGED_VERSION = 2;
export type BuildState = { active: string; builds: Build[]; owned?: Owned; forged?: Forged };

/** 部位 id：weapon、helm、mail、gloves、belt、greaves。 */
const OWNED_SLOTS = ["weapon", "helm", "mail", "gloves", "belt", "greaves"] as const;
/** 這組配裝在某部位穿的裝備代號（跟 Piece.item 同一套：武器 "系列::武器種類"，防具 "系列::armor"）；沒穿回傳空字串。 */
export function itemKeyOf(build: Build, slot: string): string {
  const gear = build.gear[slot];
  if (!gear) return "";
  return slot === "weapon" ? (gear.includes("::") ? gear : "") : `${gear}::armor`;
}
/** 共用階級的鍵：部位＋裝備（同一個魔物的頭、身是不同件裝備）。 */
export const gearId = (slot: string, item: string) => `${slot}|${item}`;
/** 階級（"6-3"）轉成可比大小的數字；"unforged" 與讀不懂的是 -1。 */
export function gradeValue(grade: string): number {
  const match = /^(\d+)-(\d+)$/.exec(grade);
  return match ? Number(match[1]) * 10 + Number(match[2]) : -1;
}
const isGrade = (value: unknown): value is string => typeof value === "string" && (value === "unforged" || gradeValue(value) >= 0);

/** 讓每組配裝的目前階級跟 owned 一致；沒有變動就回傳同一個物件。 */
function applyOwned(build: Build, owned: Owned): Build {
  let pieces = build.pieces;
  for (const slot of OWNED_SLOTS) {
    const item = itemKeyOf(build, slot);
    const grade = item ? owned[gearId(slot, item)] : undefined;
    if (!grade) continue;
    const piece = pieceOf(build, slot, item);
    if (piece.current === grade && build.pieces[slot]?.item === item) continue;
    if (pieces === build.pieces) pieces = { ...pieces };
    pieces[slot] = { ...piece, current: grade };
  }
  return pieces === build.pieces ? build : { ...build, pieces };
}

/**
 * 整理共用階級：owned 沒記過的裝備，用各配裝裡已經設定過的最高階級補上（舊存檔、匯入的配裝才會有），
 * 然後讓所有配裝的目前階級照 owned 走。owned 空的時候不加 owned 欄位，維持舊存檔的樣子。
 */
export function syncOwned(state: BuildState): BuildState {
  const seeded: Owned = {};
  for (const build of state.builds) for (const slot of OWNED_SLOTS) {
    const item = itemKeyOf(build, slot);
    const piece = item ? build.pieces[slot] : undefined;
    if (!item || !piece || piece.item !== item || piece.current === "unforged") continue;
    const id = gearId(slot, item);
    if (state.owned?.[id] === undefined && gradeValue(piece.current) > gradeValue(seeded[id] ?? "unforged")) seeded[id] = piece.current;
  }
  const owned: Owned = { ...seeded, ...state.owned };
  const builds = state.builds.map((build) => applyOwned(build, owned));
  const same = builds.every((build, index) => build === state.builds[index]);
  const ownedSame = Object.keys(owned).length === Object.keys(state.owned ?? {}).length;
  if (same && ownedSame) return state;
  const next: BuildState = { ...state, builds };
  if (Object.keys(owned).length) next.owned = owned; else delete next.owned;
  return next;
}

/** 標記某件裝備某個漂流石技能「已有」（on）或「尚未」。 */
export function setForged(state: BuildState, id: string, skill: string, on: boolean): BuildState {
  const current = state.forged?.[id] ?? [];
  if (current.includes(skill) === on) return state;
  const next = on ? [...current, skill] : current.filter((name) => name !== skill);
  const forged = { ...state.forged, [id]: next };
  if (!next.length) delete forged[id];
  return { ...state, forged };
}

/** 這件裝備在這組配裝裡鑲的漂流石，哪些已有、哪些尚未（只算有鑲的洞，洞數不超過 holes）。 */
export function driftProgress(build: Build, slot: string, forged: Forged | undefined, holes: number): { have: number; total: number } {
  const learned = forged?.[gearId(slot, itemKeyOf(build, slot))] ?? [];
  const picks = (build.drifts[slot] ?? []).slice(0, holes).filter((pick): pick is DriftPick => !!pick);
  return { have: picks.filter((pick) => learned.includes(pick.skill)).length, total: picks.length };
}

/** 直接設定某件裝備的目前階級（裝備庫用），所有穿著它的配裝一起更新。 */
export function setOwnedGrade(state: BuildState, id: string, grade: string): BuildState {
  return syncOwned({ ...state, owned: { ...state.owned, [id]: grade } });
}

/** Move a build beside another without changing identities, settings, or active selection. */
export function moveBuild(state: BuildState, id: string, targetId: string, side: "before" | "after"): BuildState {
  if (id === targetId) return state;
  const build = state.builds.find((entry) => entry.id === id);
  if (!build || !state.builds.some((entry) => entry.id === targetId)) return state;
  const builds = state.builds.filter((entry) => entry.id !== id);
  const position = builds.findIndex((entry) => entry.id === targetId) + (side === "after" ? 1 : 0);
  builds.splice(position, 0, build);
  return { ...state, builds };
}

export const MAX_BUILDS = 30;
export const STORAGE_KEY = "mhnow.builds.v1";
const MAX_NAME = 20;

let counter = 0;
const newId = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`;

/** 預設名稱「配裝 N」，N 取目前沒被用掉的最小號碼。 */
function nextName(builds: Build[]) {
  const used = new Set(builds.map((build) => build.name));
  let n = 1;
  while (used.has(`配裝 ${n}`)) n++;
  return `配裝 ${n}`;
}

const emptyBuild = (id: string, name: string): Build => ({ id, name, gear: {}, drifts: {}, pieces: {}, showMissing: false });

/** 首次使用（或存檔壞掉）時的狀態；id 固定，伺服器端預先產生的畫面才會跟瀏覽器一致。 */
export function initialBuildState(): BuildState {
  return { active: "b0", builds: [emptyBuild("b0", "配裝 1")], forged: {} };
}

export function activeBuild(state: BuildState): Build {
  return state.builds.find((build) => build.id === state.active) ?? state.builds[0];
}

/** 新增一組空白配裝並切過去；已達上限就不動。 */
export function addBuild(state: BuildState): BuildState {
  if (state.builds.length >= MAX_BUILDS) return state;
  const build = emptyBuild(newId(), nextName(state.builds));
  return { ...state, active: build.id, builds: [...state.builds, build] };
}

/** 刪除一組；至少留一組。刪掉的是目前這組時，改選它右邊那組（沒有就左邊）。 */
export function removeBuild(state: BuildState, id: string): BuildState {
  if (state.builds.length <= 1) return state;
  const position = state.builds.findIndex((build) => build.id === id);
  if (position < 0) return state;
  const builds = state.builds.filter((build) => build.id !== id);
  const active = state.active === id ? builds[Math.min(position, builds.length - 1)].id : state.active;
  return { ...state, active, builds };
}

export function renameBuild(state: BuildState, id: string, name: string): BuildState {
  return updateBuild(state, id, (build) => ({ ...build, name: name.slice(0, MAX_NAME) }));
}

export function updateBuild(state: BuildState, id: string, update: (build: Build) => Build): BuildState {
  let owned = state.owned;
  const builds = state.builds.map((build) => {
    if (build.id !== id) return build;
    const next = update(build);
    // 這次改了哪件裝備的目前階級，就記進 owned，其他配裝跟著變。
    for (const slot of OWNED_SLOTS) {
      const item = itemKeyOf(next, slot);
      if (!item) continue;
      const after = pieceOf(next, slot, item).current;
      if (after !== pieceOf(build, slot, item).current) owned = { ...owned, [gearId(slot, item)]: after };
    }
    return next;
  });
  return syncOwned({ ...state, builds, ...(owned ? { owned } : {}) });
}

/** 某件裝備的升級目標；沒設定過、或設定的是換掉之前那件，就回到「尚未生產 → 不升級」。 */
export function pieceOf(build: Build, slot: string, item: string): Piece {
  const piece = build.pieces[slot];
  return piece && piece.item === item ? piece : { item, current: "unforged", target: "" };
}

export function setPiece(build: Build, slot: string, piece: Piece): Build {
  return { ...build, pieces: { ...build.pieces, [slot]: piece } };
}

/** 舊存檔每個洞只是技能名稱字串；新的是 { skill, color }。 */
function parseDriftPick(pick: unknown): DriftPick | null {
  if (typeof pick === "string") return pick ? { skill: pick, color: "" } : null;
  if (isRecord(pick) && typeof pick.skill === "string" && pick.skill) return { skill: pick.skill, color: typeof pick.color === "string" ? pick.color : "" };
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** 只留下形狀正確的欄位；任何一組壞掉就丟掉那一組，而不是整份存檔。 */
export function parseBuild(value: unknown): Build | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.name !== "string") return null;
  const gear: Record<string, string> = {};
  if (isRecord(value.gear)) for (const [slot, key] of Object.entries(value.gear)) if (typeof key === "string" && key) gear[slot] = key;
  const drifts: Record<string, (DriftPick | null)[]> = {};
  if (isRecord(value.drifts)) for (const [slot, picks] of Object.entries(value.drifts)) {
    if (Array.isArray(picks)) drifts[slot] = picks.map(parseDriftPick);
  }
  const pieces: Record<string, Piece> = {};
  if (isRecord(value.pieces)) for (const [slot, piece] of Object.entries(value.pieces)) {
    if (isRecord(piece) && typeof piece.item === "string" && piece.item && typeof piece.current === "string" && typeof piece.target === "string") {
      pieces[slot] = { item: piece.item, current: piece.current, target: piece.target };
    }
  }
  return { id: value.id, name: value.name.slice(0, MAX_NAME), gear, drifts, pieces, showMissing: value.showMissing === true };
}

/** 讀存檔：格式不對、是空的或讀不到，一律回到預設的一組空白配裝。 */
/** 已經 JSON.parse 過的資料 → 配裝；一組有效的都沒有就回傳 null（讓呼叫端決定要退回預設還是報錯）。 */
function readBuildState(data: unknown): BuildState | null {
  if (!isRecord(data) || !Array.isArray(data.builds)) return null;
  const seen = new Set<string>();
  const builds = data.builds.map(parseBuild).filter((build): build is Build => {
    if (!build || seen.has(build.id)) return false;
    seen.add(build.id);
    return true;
  }).slice(0, MAX_BUILDS);
  if (!builds.length) return null;
  const active = typeof data.active === "string" && builds.some((build) => build.id === data.active) ? data.active : builds[0].id;
  const owned: Owned = {};
  if (isRecord(data.owned)) for (const [id, grade] of Object.entries(data.owned)) if (isGrade(grade)) owned[id] = grade;
  // 「已練成」：舊存檔沒有這回事，原本鑲著的漂流石一律當成「尚未」，要自己標記。
  // 只認 forgedVersion 對得上的存檔（開發中途曾經存過別的算法，那份不採用）。
  const forged: Forged = {};
  if (data.forgedVersion === FORGED_VERSION && isRecord(data.forged)) for (const [id, skills] of Object.entries(data.forged)) { const list = stringList(skills); if (list.length) forged[id] = [...new Set(list)]; }
  return syncOwned({ active, builds, ...(Object.keys(owned).length ? { owned } : {}), forged });
}

export function parseBuildState(raw: string | null): BuildState {
  if (!raw) return initialBuildState();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return initialBuildState(); }
  return readBuildState(data) ?? initialBuildState();
}

export function serializeBuildState(state: BuildState): string {
  return JSON.stringify({ active: state.active, builds: state.builds, ...(state.owned ? { owned: state.owned } : {}), forged: state.forged ?? {}, forgedVersion: FORGED_VERSION });
}

/** localStorage 在無痕視窗、被封鎖時可能直接丟錯，讀寫都包起來。 */
export function loadBuilds(): BuildState {
  try { return parseBuildState(window.localStorage.getItem(STORAGE_KEY)); } catch { return initialBuildState(); }
}

export function saveBuilds(state: BuildState) {
  try { window.localStorage.setItem(STORAGE_KEY, serializeBuildState(state)); } catch { /* 存不了就算了，畫面照常可用 */ }
}

/**
 * 配裝頁「缺少素材統計」的設定，跟配裝分開存。
 * 存「排除的」配裝與「隱藏的」類別：之後新增的配裝、新出現的素材類別預設都會算進來、顯示出來。
 */
export type StatsSettings = { open: boolean; excludedBuilds: string[]; hiddenCategories: string[] };
export const STATS_KEY = "mhnow.stats.v1";

export function defaultStats(): StatsSettings {
  return { open: false, excludedBuilds: [], hiddenCategories: [] };
}

const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

function readStats(data: unknown): StatsSettings {
  if (!isRecord(data)) return defaultStats();
  return { open: data.open === true, excludedBuilds: stringList(data.excludedBuilds), hiddenCategories: stringList(data.hiddenCategories) };
}

export function parseStats(raw: string | null): StatsSettings {
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  return readStats(data);
}

export function loadStats(): StatsSettings {
  try { return parseStats(window.localStorage.getItem(STATS_KEY)); } catch { return defaultStats(); }
}

export function saveStats(settings: StatsSettings) {
  try { window.localStorage.setItem(STATS_KEY, JSON.stringify(settings)); } catch { /* 存不了就算了 */ }
}

/**
 * 匯出／匯入：整份配裝、裝備庫、待製作裝備與素材統計設定存成一個 JSON 檔。
 * app 欄位用來認出是這個工具的檔案；version 留給以後格式改變時判斷。
 */
export const EXPORT_APP = "mhnow-builds";

export function exportFile(state: BuildState, stats: StatsSettings, plans: PlannedGear[] = []): string {
  return JSON.stringify({ app: EXPORT_APP, version: 1, exportedAt: new Date().toISOString(), active: state.active, builds: state.builds, ...(state.owned ? { owned: state.owned } : {}), forged: state.forged ?? {}, forgedVersion: FORGED_VERSION, stats, plans }, null, 2);
}

/** null plans means an older backup: importing it must leave the current plans intact. */
export type ImportedData = { state: BuildState; stats: StatsSettings | null; plans: PlannedGear[] | null };

/**
 * 讀匯入的檔案。也接受直接從 localStorage 複製出來的存檔（沒有 app 欄位）。
 * 讀不出任何一組有效配裝就回傳 error，不會動到現在的配裝。
 */
export function parseImport(raw: string): ImportedData | { error: string } {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { error: "檔案不是有效的 JSON。" }; }
  if (isRecord(data) && data.app !== undefined && data.app !== EXPORT_APP) return { error: "這不是 MHNow 配裝工具匯出的檔案。" };
  const state = readBuildState(data);
  if (!state) return { error: "檔案裡沒有可以讀的配裝。" };
  if (isRecord(data) && data.plans !== undefined && !Array.isArray(data.plans)) return { error: "待製作裝備資料格式不正確。" };
  return { state, stats: isRecord(data) && isRecord(data.stats) ? readStats(data.stats) : null,
    plans: isRecord(data) && Array.isArray(data.plans) ? parsePlannedGear(JSON.stringify(data.plans)) : null };
}

/**
 * 把匯入的配裝接在現有的後面：重新給 id（免得跟現有的撞號），超過上限的不加。
 * 回傳新的狀態，以及實際加了幾組、因為上限略過幾組。
 */
export function appendBuilds(state: BuildState, incoming: Build[]): { state: BuildState; added: number; skipped: number } {
  const room = Math.max(0, MAX_BUILDS - state.builds.length);
  const taken = incoming.slice(0, room).map((build) => ({ ...build, id: newId() }));
  return {
    state: taken.length ? syncOwned({ ...state, active: taken[0].id, builds: [...state.builds, ...taken] }) : state,
    added: taken.length,
    skipped: incoming.length - taken.length,
  };
}
