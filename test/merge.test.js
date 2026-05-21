const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { mergeState, mergeLogs } = require("../src/domain/merge");
const { makeLogCell } = require("../src/domain/logs");

describe("mergeLogs LWW", () => {
  it("newer updatedAt wins for same day and activity", () => {
    const local = {
      "2026-05-20": {
        a: makeLogCell("success", "2026-05-20T10:00:00.000Z")
      }
    };
    const remote = {
      "2026-05-20": {
        a: makeLogCell("failed", "2026-05-20T12:00:00.000Z")
      }
    };
    const merged = mergeLogs(local, remote, { mode: "incoming", today: "2026-05-20" });
    assert.equal(merged["2026-05-20"].a.state, "failed");
  });

  it("local wins on tie for incoming today", () => {
    const t = "2026-05-20T12:00:00.000Z";
    const local = { "2026-05-20": { a: makeLogCell("success", t) } };
    const remote = { "2026-05-20": { a: makeLogCell("failed", t) } };
    const merged = mergeLogs(local, remote, { mode: "incoming", today: "2026-05-20" });
    assert.equal(merged["2026-05-20"].a.state, "success");
  });

  it("deselect with newer timestamp removes cell", () => {
    const local = { "2026-05-20": {} };
    const remote = {
      "2026-05-20": {
        a: makeLogCell("success", "2026-05-20T08:00:00.000Z")
      }
    };
    const merged = mergeLogs(local, remote, { mode: "save", today: "2026-05-20" });
    assert.equal(merged["2026-05-20"]?.a, undefined);
  });
});

describe("mergeState skipActivityIds", () => {
  it("does not merge remote logs for reset activity", () => {
    const local = { logs: {}, activityStartDates: {}, pausedActivities: {}, unpausedActivities: {}, activityResetCounts: { x: 1 } };
    const remote = {
      logs: { "2026-01-01": { x: makeLogCell("success", "2026-01-02T00:00:00.000Z") } },
      activityStartDates: { x: "2026-01-01" },
      pausedActivities: {},
      unpausedActivities: {},
      activityResetCounts: { x: 0 }
    };
    const skip = new Set(["x"]);
    const merged = mergeState({ local, remote, mode: "save", today: "2026-05-20", skipActivityIds: skip });
    assert.deepEqual(merged.logs, {});
    assert.equal(merged.activityResetCounts.x, 1);
  });
});
