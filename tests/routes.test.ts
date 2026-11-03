import { describe, expect, it } from "vitest";
import { findPage, isNavActive } from "../app/_lib/routes";

describe("findPage", () => {
  it("一覧と入力の画面の見出しを返す", () => {
    expect(findPage("/properties")?.title).toBe("物件一覧");
    expect(findPage("/properties/new")?.title).toBe("物件情報の入力");
    expect(findPage("/settings")?.title).toBe("設定");
  });

  it("/strategy/<id> は詳細の画面になる", () => {
    expect(findPage("/strategy/12")?.title).toBe("販売戦略の詳細");
  });

  it("事実シートの画面は無くした（表は販売戦略の画面で見せる）", () => {
    expect(findPage("/properties/3/facts")).toBeUndefined();
  });

  it("知らない画面は undefined", () => {
    expect(findPage("/dashboard")).toBeUndefined();
    expect(findPage("/strategy")).toBeUndefined();
  });
});

describe("isNavActive", () => {
  const list = { href: "/properties", alsoActive: ["/strategy"] };
  const settings = { href: "/settings" };

  it("物件の画面・入力・販売戦略のレポートでは「物件一覧」を選択中にする", () => {
    expect(isNavActive(list, "/properties")).toBe(true);
    expect(isNavActive(list, "/properties/new")).toBe(true);
    expect(isNavActive(list, "/strategy/12")).toBe(true);
    expect(isNavActive(list, "/settings")).toBe(false);
  });

  it("「/properties」で始まるだけの別の画面は選択中にしない", () => {
    expect(isNavActive(list, "/propertiesx")).toBe(false);
    expect(isNavActive(settings, "/properties")).toBe(false);
    expect(isNavActive(settings, "/settings")).toBe(true);
  });
});
