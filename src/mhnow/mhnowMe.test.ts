import { describe, expect, it } from "vitest";
import lz from "lz-string";
import community from "../../public/mhnow/community-builds.json";
import index from "../../public/mhnow/series-index.json";
import { fromMhnowMeLink, toMhnowMeLink } from "./mhnowMe";

const toBuild = (entry: (typeof community.builds)[number]) => ({
  gear: entry.gear as Record<string, string>,
  drifts: Object.fromEntries(Object.entries(entry.drifts).map(([slot, names]) => [slot, names.map((skill) => ({ skill, color: "" }))])),
});

describe("mhnow.me links", () => {
  it("writes every community build as a link and reads the same build back", () => {
    const keys = new Set(index.series.map((series) => series.key));
    expect(community.builds.length).toBeGreaterThan(100);
    for (const entry of community.builds) {
      for (const key of Object.values(entry.gear)) expect(keys.has(key.split("::")[0])).toBe(true);
      const link = toMhnowMeLink(toBuild(entry));
      if ("error" in link) throw new Error(`#${entry.rank}: ${link.error}`);
      const read = fromMhnowMeLink(link.url);
      if ("error" in read) throw new Error(`#${entry.rank}: ${read.error}`);
      expect(read.build.gear).toEqual(entry.gear);
      expect(Object.fromEntries(Object.entries(read.build.drifts).map(([slot, picks]) => [slot, picks.map((pick) => pick?.skill)]))).toEqual(entry.drifts);
    }
  });

  it("accepts the bare code and rejects other text", () => {
    const link = toMhnowMeLink(toBuild(community.builds[0]));
    const load = "url" in link ? link.url.split("load=")[1] : "";
    expect("build" in fromMhnowMeLink(load)).toBe(true);
    expect(fromMhnowMeLink("hello world")).toEqual({ error: "不是 mhnow.me 的配裝連結" });
  });

  it("names the codes it cannot read or write", () => {
    const bad = lz.compressToEncodedURIComponent(JSON.stringify(["bow", "M_99_99", "M_0_1", "M_0_1", "M_0_1", "M_0_1", "M_0_1", {}]));
    expect(fromMhnowMeLink(`?load=${bad}`)).toMatchObject({ error: expect.stringContaining("認不得") });
    expect(toMhnowMeLink({ gear: { weapon: "unknown::bow" }, drifts: {} })).toEqual({ error: "六個部位要全部選好才能產生連結" });
    expect(toMhnowMeLink({ gear: { weapon: "unknown::bow", helm: "a", mail: "a", gloves: "a", belt: "a", greaves: "a" }, drifts: {} }, (key) => `名${key}`))
      .toEqual({ error: "mhnow.me 沒有這些的代碼：名unknown、名a" });
  });
});
