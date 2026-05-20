const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { clearActivityLogs, incrementResetCount, mergeResetCounts } = require("../activity-reset");

describe("clearActivityLogs", () => {
  it("removes all log entries for the activity", () => {
    const logs = {
      "2026-05-10": { a: "success", b: "failed" },
      "2026-05-11": { a: "success" }
    };
    assert.deepEqual(clearActivityLogs(logs, "a"), {
      "2026-05-10": { b: "failed" }
    });
  });

  it("drops empty days", () => {
    assert.deepEqual(
      clearActivityLogs({ "2026-05-10": { a: "success" } }, "a"),
      {}
    );
  });
});

describe("incrementResetCount", () => {
  it("starts at 1 and increments", () => {
    assert.deepEqual(incrementResetCount({}, "a"), { a: 1 });
    assert.deepEqual(incrementResetCount({ a: 1 }, "a"), { a: 2 });
  });
});

describe("mergeResetCounts", () => {
  it("keeps the higher count per activity", () => {
    assert.deepEqual(
      mergeResetCounts({ a: 3, b: 1 }, { a: 2, c: 4 }),
      { a: 3, b: 1, c: 4 }
    );
  });
});
