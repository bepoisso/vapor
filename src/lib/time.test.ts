import { formatRelative } from "./time";

describe("formatRelative", () => {
  const now = new Date("2026-11-12T12:00:00Z");

  it("formats recent and older times", () => {
    expect(formatRelative("2026-11-12T11:59:40Z", now)).toBe("just now");
    expect(formatRelative("2026-11-12T11:55:00Z", now)).toBe("5 minutes ago");
    expect(formatRelative("2026-11-12T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelative("2026-11-11T12:00:00Z", now)).toBe("yesterday");
  });
});
