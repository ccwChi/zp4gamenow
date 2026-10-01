import { describe, expect, it } from "vitest";
import { monsterNameZh } from "./monsterTranslations";
describe("monsterNameZh", () => { it("translates regular, subspecies and paired sources", () => { expect(monsterNameZh("リオレウス亜種")).toBe("蒼火龍"); expect(monsterNameZh("リオレウス, リオレイア")).toBe("火龍、雌火龍"); }); });
