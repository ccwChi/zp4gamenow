import { describe, expect, it } from "vitest";
import { MAX_BUILDS, activeBuild, appendBuilds, defaultStats, exportFile, parseImport, parseStats, addBuild, initialBuildState, parseBuildState, pieceOf, removeBuild, renameBuild, serializeBuildState, setPiece, updateBuild } from "./buildStore";

const repeat = (times: number) => { let state = initialBuildState(); for (let i = 0; i < times; i++) state = addBuild(state); return state; };

describe("addBuild", () => {
  it("adds an empty build, names it after the next free number and switches to it", () => {
    const state = addBuild(initialBuildState());
    expect(state.builds.map((build) => build.name)).toEqual(["配裝 1", "配裝 2"]);
    expect(activeBuild(state)).toMatchObject({ name: "配裝 2", gear: {}, drifts: {}, pieces: {}, showMissing: false });
  });
  it("reuses a freed number instead of skipping to the end", () => {
    const three = repeat(2);
    const state = addBuild(removeBuild(three, three.builds[1].id));
    expect(state.builds.map((build) => build.name)).toEqual(["配裝 1", "配裝 3", "配裝 2"]);
  });
  it("stops at the limit", () => {
    const full = repeat(MAX_BUILDS + 5);
    expect(full.builds).toHaveLength(MAX_BUILDS);
    expect(new Set(full.builds.map((build) => build.id)).size).toBe(MAX_BUILDS);
  });
});

describe("removeBuild", () => {
  it("always keeps one build", () => {
    const state = initialBuildState();
    expect(removeBuild(state, state.active)).toBe(state);
  });
  it("moves to the build on the right, or the left when removing the last one", () => {
    const three = { ...repeat(2), active: "" };
    const [a, b, c] = three.builds.map((build) => build.id);
    expect(removeBuild({ ...three, active: b }, b).active).toBe(c);
    expect(removeBuild({ ...three, active: c }, c).active).toBe(b);
    expect(removeBuild({ ...three, active: a }, c).active).toBe(a);
  });
});

describe("renameBuild / updateBuild", () => {
  it("renames with a length cap and leaves the others alone", () => {
    const state = repeat(1);
    const renamed = renameBuild(state, state.builds[0].id, "雷屬性太刀配裝雷屬性太刀配裝雷屬性太刀配裝");
    expect(renamed.builds[0].name).toHaveLength(20);
    expect(renamed.builds[1]).toBe(state.builds[1]);
  });
  it("updates only the targeted build", () => {
    const state = repeat(1);
    const next = updateBuild(state, state.builds[1].id, (build) => ({ ...build, gear: { helm: "kulu" } }));
    expect(next.builds[1].gear).toEqual({ helm: "kulu" });
    expect(next.builds[0].gear).toEqual({});
  });
});

describe("parseBuildState", () => {
  it("round-trips what it serialized", () => {
    const state = updateBuild(repeat(2), "b0", (build) => ({ ...build, gear: { weapon: "ore::bow", helm: "kulu" }, drifts: { helm: [{ skill: "攻擊", color: "fire" }, null] }, showMissing: true, pieces: { helm: { item: "kulu::armor", current: "3-1", target: "5-5" } } }));
    expect(parseBuildState(serializeBuildState(state))).toEqual(state);
  });
  it("falls back to one empty build for missing or broken data", () => {
    for (const raw of [null, "", "not json", "[]", "{}", '{"builds":[]}', '{"builds":[1,"x",null]}']) {
      expect(parseBuildState(raw)).toEqual(initialBuildState());
    }
  });
  it("drops malformed builds and fields but keeps the good ones", () => {
    const raw = JSON.stringify({
      active: "gone",
      builds: [
        { id: "a", name: "好的", gear: { helm: "kulu", mail: 3, belt: "" }, drifts: { helm: ["攻擊", 5, ""], mail: "x" } },
        { id: "a", name: "重複 id" },
        { name: "沒有 id" },
      ],
    });
    expect(parseBuildState(raw)).toEqual({ active: "a", builds: [{ id: "a", name: "好的", gear: { helm: "kulu" }, drifts: { helm: [{ skill: "攻擊", color: "" }, null, null] }, pieces: {}, showMissing: false }] });
  });
  it("reads saves from before pieces existed, drops malformed pieces and the old pinned flag", () => {
    const raw = JSON.stringify({ active: "a", builds: [{ id: "a", name: "舊", gear: {}, drifts: {}, pieces: { helm: { item: "kulu::armor", current: "3-1", target: "5-5", pinned: true }, mail: { current: "1-1" }, belt: 3 } }] });
    expect(parseBuildState(raw).builds[0]).toMatchObject({ showMissing: false, pieces: { helm: { item: "kulu::armor", current: "3-1", target: "5-5" } } });
    expect(parseBuildState(raw).builds[0].pieces.helm).not.toHaveProperty("pinned");
    expect(Object.keys(parseBuildState(raw).builds[0].pieces)).toEqual(["helm"]);
  });
  it("reads drift picks saved as plain skill names (older saves) and drops malformed ones", () => {
    const raw = JSON.stringify({ active: "a", builds: [{ id: "a", name: "舊", gear: {}, drifts: { helm: ["攻擊", { skill: "看破", color: "water" }, { color: "fire" }, { skill: "集中" }] } }] });
    expect(parseBuildState(raw).builds[0].drifts.helm).toEqual([{ skill: "攻擊", color: "" }, { skill: "看破", color: "water" }, null, { skill: "集中", color: "" }]);
  });
  it("never restores more than the limit", () => {
    const builds = Array.from({ length: MAX_BUILDS + 3 }, (_, i) => ({ id: `x${i}`, name: `${i}`, gear: {}, drifts: {} }));
    expect(parseBuildState(JSON.stringify({ active: "x0", builds })).builds).toHaveLength(MAX_BUILDS);
  });
});

describe("pieceOf / setPiece", () => {
  const build = initialBuildState().builds[0];
  it("defaults to unforged with no target, so nothing is counted", () => {
    expect(pieceOf(build, "helm", "kulu::armor")).toEqual({ item: "kulu::armor", current: "unforged", target: "" });
  });
  it("forgets the target once that slot holds a different piece", () => {
    const next = setPiece(build, "helm", { item: "kulu::armor", current: "3-1", target: "5-5" });
    expect(pieceOf(next, "helm", "kulu::armor").target).toBe("5-5");
    expect(pieceOf(next, "helm", "g-jagr::armor")).toEqual({ item: "g-jagr::armor", current: "unforged", target: "" });
  });
});

describe("parseStats", () => {
  it("defaults to closed with every loadout and category shown", () => {
    for (const raw of [null, "", "oops", "[]"]) expect(parseStats(raw)).toEqual(defaultStats());
  });
  it("keeps valid settings and drops junk entries", () => {
    expect(parseStats(JSON.stringify({ open: true, excludedBuilds: ["b1", 3], hiddenCategories: ["r1", null, "misc"] })))
      .toEqual({ open: true, excludedBuilds: ["b1"], hiddenCategories: ["r1", "misc"] });
  });
});

describe("exportFile / parseImport", () => {
  const state = updateBuild(repeat(1), "b0", (build) => ({ ...build, name: "雷太刀", gear: { helm: "kulu" }, drifts: { helm: [{ skill: "攻擊", color: "fire" }] }, pieces: { helm: { item: "kulu::armor", current: "3-1", target: "5-5" } } }));
  const stats = { open: true, excludedBuilds: ["b0"], hiddenCategories: ["r1"] };
  it("reads back everything it exported", () => {
    const result = parseImport(exportFile(state, stats));
    expect(result).toEqual({ state, stats });
  });
  it("also accepts a save copied straight from localStorage", () => {
    const result = parseImport(serializeBuildState(state));
    expect("state" in result && result.state).toEqual(state);
    expect("state" in result && result.stats).toBeNull();
  });
  it("refuses broken files, other apps' files and files with no valid build", () => {
    expect(parseImport("{壞掉")).toEqual({ error: "檔案不是有效的 JSON。" });
    expect(parseImport(JSON.stringify({ app: "something-else", builds: state.builds }))).toEqual({ error: "這不是 MHNow 配裝工具匯出的檔案。" });
    expect(parseImport(JSON.stringify({ builds: [{ name: "沒有 id" }] }))).toEqual({ error: "檔案裡沒有可以讀的配裝。" });
  });
});

describe("appendBuilds", () => {
  it("adds imported builds after the current ones with fresh ids", () => {
    const current = repeat(1);
    const result = appendBuilds(current, current.builds);
    expect(result.added).toBe(2);
    expect(result.state.builds).toHaveLength(4);
    expect(new Set(result.state.builds.map((build) => build.id)).size).toBe(4);
    expect(result.state.builds.slice(2).map((build) => build.name)).toEqual(["配裝 1", "配裝 2"]);
  });
  it("stops at the limit and reports how many were left out", () => {
    const current = repeat(MAX_BUILDS - 2);
    const result = appendBuilds(current, repeat(4).builds);
    expect(result.state.builds).toHaveLength(MAX_BUILDS);
    expect([result.added, result.skipped]).toEqual([1, 4]);
  });
});
