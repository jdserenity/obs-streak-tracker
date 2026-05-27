const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { streakDisplayTier, currentStreakFireEmojiClass } = require("../src/domain/streak-display");

describe("streakDisplayTier", () => {
  it("uses normal styling at 5 or below", () => {
    assert.equal(streakDisplayTier(0, "current"), "none");
    assert.equal(streakDisplayTier(5, "longest"), "none");
  });

  it("uses mid styling for 6 through 9", () => {
    assert.equal(streakDisplayTier(6, "current"), "mid");
    assert.equal(streakDisplayTier(9, "longest"), "mid");
  });

  it("uses full styling at 10 and above", () => {
    assert.equal(streakDisplayTier(10, "current"), "gold");
    assert.equal(streakDisplayTier(10, "longest"), "silver");
    assert.equal(streakDisplayTier(25, "current"), "gold");
  });
});

describe("currentStreakFireEmojiClass", () => {
  it("hides fire at 4 or below", () => {
    assert.equal(currentStreakFireEmojiClass(0), null);
    assert.equal(currentStreakFireEmojiClass(4), null);
  });

  it("uses small fire from 5 through 9", () => {
    assert.match(currentStreakFireEmojiClass(5), /streak-streak-emoji-small/);
    assert.match(currentStreakFireEmojiClass(9), /streak-streak-emoji-small/);
  });

  it("uses normal fire at 10 and above", () => {
    assert.equal(currentStreakFireEmojiClass(10), "streak-streak-emoji");
    assert.equal(currentStreakFireEmojiClass(20), "streak-streak-emoji");
  });
});
