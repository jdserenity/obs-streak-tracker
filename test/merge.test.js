const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { mergeState, mergeLogs } = require("../src/domain/merge");
const { makeLogCell, makeDeletionCell, getLogState } = require("../src/domain/logs");

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

describe("deletion tombstones (Option B)", () => {
  it("remote deletion tombstone with newer updatedAt wins on today (incoming)", () => {
    const local = {
      "2026-05-20": { a: makeLogCell("success", "2026-05-20T10:00:00.000Z") }
    };
    const remote = {
      "2026-05-20": { a: makeDeletionCell("2026-05-20T12:00:00.000Z") }
    };
    const merged = mergeLogs(local, remote, { mode: "incoming", today: "2026-05-20" });
    assert.equal(getLogState(merged["2026-05-20"]?.a), null); // deletion won (tombstone or absent)
  });

  it("local deletion tombstone wins on tie for today (save)", () => {
    const t = "2026-05-20T12:00:00.000Z";
    const local = { "2026-05-20": { a: makeDeletionCell(t) } };
    const remote = { "2026-05-20": { a: makeLogCell("success", t) } };
    const merged = mergeLogs(local, remote, { mode: "save", today: "2026-05-20" });
    assert.equal(getLogState(merged["2026-05-20"]?.a), null);
  });

  it("newer deletion tombstone wins on past day via LWW", () => {
    const local = {
      "2026-05-19": { a: makeLogCell("success", "2026-05-19T10:00:00.000Z") }
    };
    const remote = {
      "2026-05-19": { a: makeDeletionCell("2026-05-19T11:00:00.000Z") }
    };
    const merged = mergeLogs(local, remote, { mode: "incoming", today: "2026-05-20" });
    assert.equal(getLogState(merged["2026-05-19"]?.a), null);
  });

  it("old-style absence (no tombstone) still treated as weak signal on today", () => {
    const local = {
      "2026-05-20": { a: makeLogCell("success", "2026-05-20T10:00:00.000Z") }
    };
    const remote = { "2026-05-20": {} }; // pure absence, old client
    const merged = mergeLogs(local, remote, { mode: "incoming", today: "2026-05-20" });
    // local presence wins (absence has no strong timestamp to override)
    assert.equal(merged["2026-05-20"]?.a?.state, "success");
  });
});
