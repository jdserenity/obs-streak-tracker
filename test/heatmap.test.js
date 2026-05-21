const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { isPerfectHeatmapCell } = require("../src/domain/heatmap-helpers");

describe("isPerfectHeatmapCell", () => {
  it("is true when all tracked items completed", () => {
    assert.equal(isPerfectHeatmapCell(3, 3), true);
  });
  it("is false when none tracked or incomplete", () => {
    assert.equal(isPerfectHeatmapCell(0, 0), false);
    assert.equal(isPerfectHeatmapCell(2, 3), false);
  });
});
