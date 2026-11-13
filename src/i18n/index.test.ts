import { t } from "@/i18n";

describe("t", () => {
  it("returns plain strings", () => {
    expect(t("library.title")).toBe("Library");
  });

  it("fills placeholders", () => {
    expect(t("hero.kicker", { date: "Jan 6" })).toBe("Continue · Last played Jan 6");
  });

  it("picks the plural form from count", () => {
    expect(t("library.count", { count: 1 })).toBe("1 game");
    expect(t("library.count", { count: 0 })).toBe("0 games");
    expect(t("library.count", { count: 197 })).toBe("197 games");
  });
});
