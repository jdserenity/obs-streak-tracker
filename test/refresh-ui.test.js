const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { refreshUIFromVault } = require("../src/infra/refresh-ui");

describe("refreshUIFromVault", () => {
  it("reloads vault data, recalculates stats, then refreshes trackers", async () => {
    const order = [];
    await refreshUIFromVault({
      loadVaultData: async () => { order.push("load"); },
      recalculateAllStats: async () => { order.push("stats"); },
      refreshAllTrackers: async () => { order.push("ui"); }
    });
    assert.deepEqual(order, ["load", "stats", "ui"]);
  });
});
