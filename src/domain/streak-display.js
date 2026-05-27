function streakDisplayTier(value, kind) {
  const n = Number(value) || 0;
  if (n <= 5) return "none";
  if (n <= 9) return "mid";
  return kind === "current" ? "gold" : "silver";
}

function currentStreakFireEmojiClass(value) {
  const n = Number(value) || 0;
  if (n <= 4) return null;
  if (n <= 9) return "streak-streak-emoji streak-streak-emoji-small";
  return "streak-streak-emoji";
}

module.exports = { streakDisplayTier, currentStreakFireEmojiClass };
