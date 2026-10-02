import { expect, it } from "vitest";
import { automaticTarget, validCurrentGrade } from "./upgradeTarget";

it("targets the last skill increase instead of later driftstone slots", () => {
  const skills = [{ skill: "凶會心", levels: [{ grade: 4, level: 1 }, { grade: 6, level: 2 }] }];
  expect(automaticTarget("helm", skills, "4-1")).toBe("6-1");
  expect(automaticTarget("helm", [{ skill: "凶會心", levels: [{ grade: 4, level: 1 }, { grade: 8, level: 2 }] }], "6-1")).toBe("8-1");
  expect(automaticTarget("helm", [{ skill: "凶會心", levels: [...skills[0].levels, { grade: 8, level: 2 }] }], "4-1")).toBe("6-1");
});

it("uses all skills, handles unsorted tiers and stops upgrading when already reached", () => {
  const skills = [{ skill: "A", levels: [{ grade: 6, level: 2 }, { grade: 2, level: 1 }] }, { skill: "B", levels: [{ grade: 8, level: 1 }] }];
  expect(automaticTarget("mail", skills, "6-1")).toBe("8-1");
  expect(automaticTarget("mail", skills, "8-1")).toBe("");
  expect(automaticTarget("mail", skills, "9-2")).toBe("");
  expect(automaticTarget("mail", [], "unforged", 5)).toBe("5-1");
});

it("defaults weapons to 10-5 and validates editable grades", () => {
  expect(automaticTarget("weapon", [], "2-1")).toBe("10-5");
  expect(automaticTarget("weapon", [], "10-5")).toBe("");
  for (const grade of ["2-1", "6-3", "10-5"]) expect(validCurrentGrade(grade)).toBe(true);
  for (const grade of ["1-1", "11-1", "6-0", "6-6", "6", "6-", "06-1", ""]) expect(validCurrentGrade(grade)).toBe(false);
});
