const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { SyncCoordinator } = require("../src/infra/sync-coordinator");

describe("SyncCoordinator incoming refresh (data file)", () => {
  let mockPlugin;
  let coordinator;
  let readCalls;
  let incomingCalls;
  let refreshCalls;
  let lastWriteHash;

  beforeEach(() => {
    readCalls = [];
    incomingCalls = [];
    refreshCalls = [];
    lastWriteHash = "hash-from-this-device-write";

    mockPlugin = {
      vault: {
        dataPath: () => "Archive/streak-tracker-data.md",
        configPath: () => "Archive/streak-tracker-config.md",
        hashContent: (c) => "hash-" + c.length,
        lastDataWriteHash: () => lastWriteHash,
        incomingSync: async (content) => { incomingCalls.push(content); }
      },
      app: {
        vault: {
          adapter: {
            read: async (p) => {
              readCalls.push(p);
              return '{"logs":{"2026-05-20":{"exercise":{"state":"success"}}}}';
            }
          }
        }
      },
      view: {
        refreshAllTrackers: async () => { refreshCalls.push(true); }
      }
    };

    coordinator = new SyncCoordinator(mockPlugin);
  });

  it("skips when read hash matches our last write hash (our own save)", async () => {
    // Make hashContent return the same as lastDataWriteHash
    mockPlugin.vault.hashContent = () => lastWriteHash;

    const fakeFile = { path: "Archive/streak-tracker-data.md" };
    coordinator.onFileModified(fakeFile);

    // Wait for the 500ms debounce
    await new Promise(r => setTimeout(r, 550));

    assert.equal(readCalls.length, 1);
    assert.equal(incomingCalls.length, 0);
    assert.equal(refreshCalls.length, 0);
  });

  it("performs incomingSync + refresh when hash differs (external sync change)", async () => {
    const fakeFile = { path: "Archive/streak-tracker-data.md" };
    coordinator.onFileModified(fakeFile);

    await new Promise(r => setTimeout(r, 550));

    assert.equal(readCalls.length, 1);
    assert.equal(incomingCalls.length, 1);
    assert.equal(refreshCalls.length, 1);
  });

  it("ignores non data/config files", async () => {
    const fakeFile = { path: "some-other-note.md" };
    coordinator.onFileModified(fakeFile);

    await new Promise(r => setTimeout(r, 550));

    assert.equal(readCalls.length, 0);
    assert.equal(incomingCalls.length, 0);
  });
});
