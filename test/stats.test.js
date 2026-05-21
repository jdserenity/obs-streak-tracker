const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { calculateStats } = require("../src/domain/stats");

describe("calculateStats longest streak", () => {
  it("counts consecutive successes (not log[dateStr] typo)", () => {
    const data = {
      logs: {
        "2026-05-10": { a: "success" },
        "2026-05-11": { a: "success" },
        "2026-05-12": { a: "failed" },
        "2026-05-13": { a: "success" }
      },
      stats: {},
      activityStartDates: { a: "2026-05-10" },
      pausedActivities: {},
      settings: { dayEndTime: "04:00" }
    };
    const map = { a: { id: "a", frequency: "daily" } };
    calculateStats(data, "a", map, "04:00");
    assert.equal(data.stats.a.longestStreak, 2);
  });
});
