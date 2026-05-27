const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { weekColumnMonthFromDates, heatmapMonthSpans } = require("../src/domain/heatmap-layout");

describe("heatmapMonthSpans", () => {
  it("groups consecutive week columns by month", () => {
    assert.deepEqual(
      heatmapMonthSpans([0, 0, 1, 1, 1, 2]),
      [
        { name: "Jan", weekCount: 2 },
        { name: "Feb", weekCount: 3 },
        { name: "Mar", weekCount: 1 }
      ]
    );
  });

  it("skips leading columns with no dated cells", () => {
    assert.deepEqual(heatmapMonthSpans([-1, 0, 0]), [{ name: "Jan", weekCount: 2 }]);
  });
});

describe("weekColumnMonthFromDates", () => {
  it("uses the first dated cell in the column", () => {
    assert.equal(weekColumnMonthFromDates([null, "2026-02-10"]), 1);
  });
});
