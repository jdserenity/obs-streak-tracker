const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { backfillArchivedAt } = require("../src/domain/archive-backfill");

describe("backfillArchivedAt", () => {
  it("sets archivedAt to day after last log", () => {
    const config = { archivedActivities: [{ id: "school" }] };
    const data = { logs: { "2026-05-01": { school: { state: "success" } } } };
    assert.equal(backfillArchivedAt(config, data), true);
    assert.equal(config.archivedActivities[0].archivedAt, "2026-05-02");
  });

  it("skips entries that already have archivedAt", () => {
    const config = { archivedActivities: [{ id: "a", archivedAt: "2026-04-01" }] };
    assert.equal(backfillArchivedAt(config, { logs: {} }), false);
  });
});
