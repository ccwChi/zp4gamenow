import { expect, it } from "vitest";
import { decodeBuildShare, encodeBuildShare, findShareCode, shareUrl } from "./buildShare";
import type { Build } from "./buildStore";

const build: Build = {
  id: "b1", name: "雷狼龍 太刀", showMissing: true,
  gear: { weapon: "zino::long-sword", helm: "ratha", mail: "zino" },
  drifts: { helm: [null, { skill: "攻擊", color: "fire" }, null], mail: [null] },
  pieces: { helm: { item: "ratha::armor", current: "6-1", target: "8-5" } },
};

it("round-trips name, gear and drift stones but not personal upgrade progress", () => {
  const result = decodeBuildShare(encodeBuildShare(build));
  expect(result).toEqual({ build: {
    id: "shared", name: "雷狼龍 太刀", showMissing: false, pieces: {},
    gear: build.gear, drifts: { helm: [null, { skill: "攻擊", color: "fire" }] },
  } });
});

it("uses only URL-safe characters so the code fits in a link and a QR code", () => {
  const code = encodeBuildShare(build);
  expect(code).toMatch(/^MHN1\.[A-Za-z0-9_-]+$/);
  expect(shareUrl(code, "https://example.com/mhnow/#old")).toBe(`https://example.com/mhnow/#share=${code}`);
});

it("finds the code inside a pasted link or surrounding text", () => {
  const code = encodeBuildShare(build);
  expect(findShareCode(`看看這組 https://example.com/#share=${code} 很好用`)).toBe(code);
  expect("build" in decodeBuildShare(shareUrl(code, "https://example.com/"))).toBe(true);
});

it("keeps a fully slotted build small enough for a phone-scannable QR code", () => {
  const skills = ["弱點特效", "攻擊", "超會心", "挑戰者", "看破", "破壞王", "集中", "火屬性攻擊強化", "力量解放", "迴避性能", "耐震", "心眼", "砥石使用高速化", "體術", "剛刃研磨"];
  const slots = ["helm", "mail", "gloves", "belt", "greaves"];
  const full: Build = { ...build, name: "雷狼龍 太刀 全套測試用名稱",
    gear: { weapon: "a-ratha::long-sword", helm: "s-ratha", mail: "g-rathi", gloves: "zino", belt: "devi", greaves: "magn" },
    drifts: Object.fromEntries(slots.map((slot, i) => [slot, [0, 1, 2].map((j) => ({ skill: skills[i * 3 + j], color: "fire" }))])) };
  const code = encodeBuildShare(full);
  expect(code.length).toBeLessThan(500);
  expect(decodeBuildShare(code)).toEqual({ build: { ...full, id: "shared", showMissing: false, pieces: {} } });
});

it("rejects text without a code, damaged codes and builds with no gear", () => {
  expect(decodeBuildShare("hello")).toHaveProperty("error");
  expect(decodeBuildShare("MHN1.%%%")).toHaveProperty("error");
  expect(decodeBuildShare(encodeBuildShare(build).slice(0, 20))).toHaveProperty("error");
  expect(decodeBuildShare(encodeBuildShare({ ...build, gear: {}, drifts: {} }))).toHaveProperty("error");
});
