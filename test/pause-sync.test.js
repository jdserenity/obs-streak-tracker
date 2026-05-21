const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { pausedStateFromVault, mergePausedOnIncoming } = require("../src/domain/pause-sync");

describe("pausedStateFromVault", () => {
  it("loads pauses from vault", () => {
    assert.deepEqual(
      pausedStateFromVault({ a: "2026-05-10" }, {}),
      { a: "2026-05-10" }
    );
  });

  it("skips pause when unpausedActivities tombstone is on or after pause date", () => {
    assert.deepEqual(
      pausedStateFromVault({ a: "2026-05-10" }, { a: "2026-05-10" }),
      {}
    );
    assert.deepEqual(
      pausedStateFromVault({ a: "2026-05-10" }, { a: "2026-05-12" }),
      {}
    );
  });
});

describe("mergePausedOnIncoming", () => {
  it("adds pause from another device when local has no tombstone", () => {
    assert.deepEqual(
      mergePausedOnIncoming({}, {}, { a: "2026-05-10" }, {}),
      { pausedActivities: { a: "2026-05-10" }, unpausedActivities: {} }
    );
  });

  it("does not restore stale file pause after local unpause tombstone", () => {
    assert.deepEqual(
      mergePausedOnIncoming({}, { a: "2026-05-12" }, { a: "2026-05-10" }, {}),
      { pausedActivities: {}, unpausedActivities: { a: "2026-05-12" } }
    );
  });

  it("keeps local pause and uses earlier date when both sides paused", () => {
    assert.deepEqual(
      mergePausedOnIncoming({ a: "2026-05-15" }, {}, { a: "2026-05-10" }, {}),
      { pausedActivities: { a: "2026-05-10" }, unpausedActivities: {} }
    );
  });
});
