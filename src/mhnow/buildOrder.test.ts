import { expect, it } from "vitest";
import { addBuild, initialBuildState, moveBuild, parseBuildState, serializeBuildState } from "./buildStore";

it("moves build 5 after build 2 and persists order without changing identities or active build", () => {
  let state = initialBuildState();
  for (let i = 0; i < 4; i++) state = addBuild(state);
  const ids = state.builds.map((build) => build.id);
  const next = moveBuild(state, ids[4], ids[1], "after");
  expect(next.builds.map((build) => build.name)).toEqual(["配裝 1", "配裝 2", "配裝 5", "配裝 3", "配裝 4"]);
  expect(next.active).toBe(state.active);
  expect(next.builds[2]).toBe(state.builds[4]);
  expect(parseBuildState(serializeBuildState(next))).toEqual(next);
  expect(state.builds.map((build) => build.id)).toEqual(ids);
  expect(moveBuild(next, ids[0], ids[3], "after").builds.at(-1)?.id).toBe(ids[0]);
  expect(moveBuild(next, ids[3], ids[0], "before").builds[0].id).toBe(ids[3]);
  expect(moveBuild(state, ids[0], ids[0], "after")).toBe(state);
  expect(moveBuild(state, "missing", ids[0], "before")).toBe(state);
});
