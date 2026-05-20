// Pure helpers for activity stat reset (tested via node:test).

function clearActivityLogs(logs, activityId) {
  const next = {};
  for (const date of Object.keys(logs || {})) {
    if (!logs[date]?.[activityId]) {
      next[date] = logs[date];
      continue;
    }
    const day = { ...logs[date] };
    delete day[activityId];
    if (Object.keys(day).length) next[date] = day;
  }
  return next;
}

function incrementResetCount(counts, activityId) {
  const next = { ...(counts || {}) };
  next[activityId] = (next[activityId] || 0) + 1;
  return next;
}

function mergeResetCounts(memCounts, fileCounts) {
  const merged = { ...(fileCounts || {}) };
  for (const [id, count] of Object.entries(memCounts || {})) {
    merged[id] = Math.max(merged[id] || 0, count);
  }
  return merged;
}

module.exports = { clearActivityLogs, incrementResetCount, mergeResetCounts };
