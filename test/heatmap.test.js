const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { isPerfectHeatmapCell, isDayComplete, getDayCompletionCounts } = require("../src/domain/heatmap-helpers");
const { isDateInWeek } = require("../src/domain/dates");

describe("isDateInWeek", () => {
  it("is true when date falls in the ISO week", () => {
    assert.equal(isDateInWeek("2026-05-18", "2026-05-20"), true);
    assert.equal(isDateInWeek("2026-05-18", "2026-05-17"), false);
  });
});

describe("isPerfectHeatmapCell", () => {
  it("is true when all tracked items completed", () => {
    assert.equal(isPerfectHeatmapCell(3, 3), true);
  });
  it("is false when none tracked or incomplete", () => {
    assert.equal(isPerfectHeatmapCell(0, 0), false);
    assert.equal(isPerfectHeatmapCell(2, 3), false);
  });
});

describe("isDayComplete", () => {
  const daily = [{ id: "a" }, { id: "b" }];

  it("is true when every started daily activity is success", () => {
    const data = {
      logs: { "2026-05-20": { a: { state: "success" }, b: { state: "success" } } },
      activityStartDates: { a: "2026-05-01", b: "2026-05-10" }
    };
    assert.equal(isDayComplete(data, daily, "2026-05-20"), true);
  });

  it("ignores activities that had not started yet", () => {
    const data = {
      logs: { "2026-05-20": { a: { state: "success" } } },
      activityStartDates: { a: "2026-05-01", b: "2026-05-21" }
    };
    assert.equal(getDayCompletionCounts(data, daily, "2026-05-20").historicalCount, 1);
    assert.equal(isDayComplete(data, daily, "2026-05-20"), true);
  });

  it("is false when any started activity is missing or not success", () => {
    const data = {
      logs: { "2026-05-20": { a: { state: "success" } } },
      activityStartDates: { a: "2026-05-01", b: "2026-05-01" }
    };
    assert.equal(isDayComplete(data, daily, "2026-05-20"), false);
  });
});
