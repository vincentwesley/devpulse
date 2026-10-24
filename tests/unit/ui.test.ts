import { describe, expect, it } from "vitest";
import { compact, updatedAgo } from "../../src/web/ui";

describe("ui helpers", () => {
  it("compact", () => {
    expect(compact(950)).toBe("950");
    expect(compact(12345)).toBe("12.3K");
    expect(compact(3456)).toBe("3.5K");
    expect(compact(1_200_000)).toBe("1.2M");
  });
  it("updatedAgo", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(updatedAgo("2026-10-20T11:59:40Z", now)).toBe("Updated just now");
    expect(updatedAgo("2026-10-20T11:55:00Z", now)).toBe("Updated 5m ago");
    expect(updatedAgo("2026-10-20T09:00:00Z", now)).toBe("Updated 3h ago");
    expect(updatedAgo("2026-10-17T12:00:00Z", now)).toBe("Updated 3d ago");
    expect(updatedAgo("2026-10-21T12:00:00Z", now)).toBe("Updated just now"); // future clamps
    expect(updatedAgo(null)).toBe("");
    expect(updatedAgo("nope")).toBe("");
  });
});
