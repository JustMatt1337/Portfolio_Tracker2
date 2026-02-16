import { getBenchmarkRefreshKey } from "../benchmark";

describe("getBenchmarkRefreshKey", () => {
  it("uses previous day before 21:00 UTC", () => {
    const key = getBenchmarkRefreshKey(new Date("2026-01-20T20:59:00.000Z"));
    expect(key).toBe("2026-01-19");
  });

  it("uses same day at or after 21:00 UTC", () => {
    const key = getBenchmarkRefreshKey(new Date("2026-01-20T21:00:00.000Z"));
    expect(key).toBe("2026-01-20");
  });
});
