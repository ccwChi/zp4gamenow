import { describe, expect, it } from "vitest";
import { MAX_BUILDS, activeBuild, appendBuilds, defaultStats, exportFile, parseImport, parseStats, addBuild, initialBuildState, parseBuildState, pieceOf, removeBuild, renameBuild, driftProgress, gearId, setForged, setOwnedGrade, syncOwned, serializeBuildState, setPiece, updateBuild } from "./buildStore";

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
    expect(parseBuildState(raw)).toEqual({ active: "a", builds: [{ id: "a", name: "好的", gear: { helm: "kulu" }, drifts: { helm: [{ skill: "攻擊", color: "" }, null, null] }, pieces: {}, showMissing: false }], forged: {} });
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
    expect(result).toEqual({ state, stats, plans: [] });
  });
  it("also accepts a save copied straight from localStorage", () => {
    const result = parseImport(serializeBuildState(state));
    expect("state" in result && result.state).toEqual(state);
    expect("state" in result && result.stats).toBeNull();
    expect("state" in result && result.plans).toBeNull();
  });
  it("backs up planned weapon and armor ranges and all material inclusion choices", () => {
    const plans = [
      { series: "kulu", slot: "weapon" as const, weaponType: "long-sword", current: "3-1", target: "10-5", included: false },
      { series: "kulu", slot: "helm" as const, current: "unforged", target: "6-1", included: true },
    ];
    const settings = { ...stats, excludedBuilds: ["planned-gear"] };
    expect(parseImport(exportFile(state, settings, plans))).toEqual({ state, stats: settings, plans });
  });
  it("distinguishes a legacy backup from an explicitly empty planned list", () => {
    const legacy = JSON.parse(exportFile(state, stats));
    delete legacy.plans;
    expect(parseImport(JSON.stringify(legacy))).toEqual({ state, stats, plans: null });
    expect(parseImport(exportFile(state, stats, []))).toEqual({ state, stats, plans: [] });
  });
  it("validates planned equipment in imported files", () => {
    const data = JSON.parse(exportFile(state, stats));
    expect(parseImport(JSON.stringify({ ...data, plans: "broken" }))).toEqual({ error: "待製作裝備資料格式不正確。" });
    const plan = { series: "kulu", slot: "helm", current: "unforged", target: "6-1" };
    expect(parseImport(JSON.stringify({ ...data, plans: [null, plan, plan, { ...plan, slot: "bad" }] }))).toEqual({ state, stats, plans: [plan] });
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

describe("shared current grade", () => {
  it("saves standalone weapon and armor registrations before any loadout uses them", () => {
    const initial = initialBuildState();
    const weaponId = gearId("weapon", "kulu::long-sword");
    const helmId = gearId("helm", "kulu::armor");
    const state = setOwnedGrade(setOwnedGrade(initial, weaponId, "3-1"), helmId, "2-1");
    expect(state.builds).toEqual(initial.builds);
    const restored = parseBuildState(serializeBuildState(state));
    expect(restored.owned).toEqual({ [weaponId]: "3-1", [helmId]: "2-1" });
    const equipped = updateBuild(restored, restored.active, (build) => ({ ...build, gear: { weapon: "kulu::long-sword", helm: "kulu" } }));
    expect(pieceOf(equipped.builds[0], "weapon", "kulu::long-sword").current).toBe("3-1");
    expect(pieceOf(equipped.builds[0], "helm", "kulu::armor").current).toBe("2-1");
    expect(pieceOf(equipped.builds[0], "mail", "kulu::armor").current).toBe("unforged");
  });

  const wear = (state: ReturnType<typeof repeat>, index: number, helm: string, drift?: string) => updateBuild(state, state.builds[index].id, (build) => ({
    ...build, gear: { ...build.gear, helm }, drifts: drift ? { helm: [{ skill: drift, color: "" }] } : build.drifts }));
  const grade = (state: ReturnType<typeof repeat>, index: number) => pieceOf(state.builds[index], "helm", "kulu::armor").current;

  it("gives every build wearing the same piece the same current grade, but keeps drifts per build", () => {
    let state = wear(wear(repeat(1), 0, "kulu", "攻擊"), 1, "kulu", "看破");
    state = updateBuild(state, state.builds[0].id, (build) => setPiece(build, "helm", { item: "kulu::armor", current: "6-1", target: "8-1" }));
    expect([grade(state, 0), grade(state, 1)]).toEqual(["6-1", "6-1"]);
    expect(state.builds[0].pieces.helm.target).toBe("8-1");
    expect(state.builds[1].pieces.helm.target).toBe("");
    expect(state.builds.map((build) => build.drifts.helm?.[0]?.skill)).toEqual(["攻擊", "看破"]);
  });

  it("gives a piece its known grade when it is put on another build, and different slots stay separate", () => {
    let state = wear(repeat(1), 0, "kulu");
    state = updateBuild(state, state.builds[0].id, (build) => setPiece(build, "helm", { item: "kulu::armor", current: "7-2", target: "" }));
    state = wear(state, 1, "kulu");
    expect(grade(state, 1)).toBe("7-2");
    expect(state.owned).toEqual({ [gearId("helm", "kulu::armor")]: "7-2" });
    const other = updateBuild(state, state.builds[1].id, (build) => ({ ...build, gear: { ...build.gear, mail: "kulu" } }));
    expect(pieceOf(other.builds[1], "mail", "kulu::armor").current).toBe("unforged");
  });

  it("remembers a grade after every build drops the piece, and lets the gear box set it directly", () => {
    let state = wear(repeat(1), 0, "kulu");
    state = setOwnedGrade(state, gearId("helm", "kulu::armor"), "9-1");
    expect(grade(state, 0)).toBe("9-1");
    state = wear(state, 0, "rathalos");
    expect(state.owned?.[gearId("helm", "kulu::armor")]).toBe("9-1");
    expect(parseBuildState(serializeBuildState(state)).owned).toEqual(state.owned);
    const imported = parseImport(exportFile(state, defaultStats()));
    expect("state" in imported && imported.state.owned).toEqual(state.owned);
  });

  it("seeds from old saves that only stored a grade per build, using the highest one", () => {
    const old = { active: "a", builds: ["a", "b"].map((id, index) => ({ id, name: id, gear: { helm: "kulu" }, drifts: {}, showMissing: false,
      pieces: { helm: { item: "kulu::armor", current: index ? "5-1" : "8-3", target: "" } } })) };
    const state = parseBuildState(JSON.stringify(old));
    expect(state.builds.map((build) => build.pieces.helm.current)).toEqual(["8-3", "8-3"]);
    expect(syncOwned(state)).toBe(state);
  });
});

describe("forged drift stones", () => {
  const withDrifts = (): ReturnType<typeof repeat> => {
    let state = repeat(1);
    state = updateBuild(state, state.builds[0].id, (build) => ({ ...build, gear: { helm: "kulu" }, drifts: { helm: [{ skill: "攻擊", color: "" }, { skill: "看破", color: "" }] } }));
    return updateBuild(state, state.builds[1].id, (build) => ({ ...build, gear: { helm: "kulu" }, drifts: { helm: [{ skill: "連擊", color: "" }] } }));
  };
  const id = gearId("helm", "kulu::armor");

  it("treats newly chosen drift stones as not yet forged, and counts progress per build", () => {
    const state = withDrifts();
    expect(state.forged).toEqual({});
    expect(driftProgress(state.builds[0], "helm", state.forged, 2)).toEqual({ have: 0, total: 2 });
    const marked = setForged(setForged(state, id, "攻擊", true), id, "連擊", true);
    expect(marked.forged).toEqual({ [id]: ["攻擊", "連擊"] });
    // 同一件裝備練成的，每組配裝都算已有。
    expect(driftProgress(marked.builds[0], "helm", marked.forged, 2)).toEqual({ have: 1, total: 2 });
    expect(driftProgress(marked.builds[1], "helm", marked.forged, 1)).toEqual({ have: 1, total: 1 });
    expect(setForged(marked, id, "攻擊", false).forged).toEqual({ [id]: ["連擊"] });
    expect(setForged(setForged(marked, id, "攻擊", false), id, "連擊", false).forged).toEqual({});
  });

  it("survives save, load and export, and does not re-seed once saved", () => {
    const state = setForged(withDrifts(), id, "攻擊", true);
    expect(parseBuildState(serializeBuildState(state)).forged).toEqual(state.forged);
    const imported = parseImport(exportFile(state, defaultStats()));
    expect("state" in imported && imported.state.forged).toEqual(state.forged);
    // 存檔裡 forged 是空的：代表使用者就是還沒練成，不能又被當成舊存檔全部補成已有。
    expect(parseBuildState(serializeBuildState(withDrifts())).forged).toEqual({});
  });

  it("migrates saves from before this existed: whatever was already socketed is not yet forged", () => {
    const old = { active: "a", builds: [{ id: "a", name: "a", gear: { helm: "kulu", mail: "kulu" }, showMissing: false, pieces: {},
      drifts: { helm: [{ skill: "攻擊", color: "" }, { skill: "攻擊", color: "" }], mail: ["看破"] } }] };
    const state = parseBuildState(JSON.stringify(old));
    expect(state.forged).toEqual({});
    expect(state.builds[0].drifts.mail?.[0]?.skill).toBe("看破");
    // 開發中途存過、沒有版本號的 forged 也不採用。
    const interim = parseBuildState(JSON.stringify({ ...old, forged: { [id]: ["攻擊"] } }));
    expect(interim.forged).toEqual({});
  });

  it("keeps grades and forged stones when adding a build", () => {
    const state = addBuild(setOwnedGrade(setForged(withDrifts(), id, "攻擊", true), id, "8-1"));
    expect(state.owned).toEqual({ [id]: "8-1" });
    expect(state.forged).toEqual({ [id]: ["攻擊"] });
  });
});
