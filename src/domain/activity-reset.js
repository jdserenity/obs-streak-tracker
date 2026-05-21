const { getLogState } = require("./logs");

function clearActivityLogs(logs, activityId) {
  const next = {};
  for (const date of Object.keys(logs || {})) {
    const day = logs[date];
    if (!day?.[activityId]) { next[date] = day; continue; }
    const copy = { ...day };
    delete copy[activityId];
    if (Object.keys(copy).length) next[date] = copy;
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

function dayHasActivityLog(day, activityId) {
  if (!day?.[activityId]) return false;
  return getLogState(day[activityId]) != null;
}

module.exports = { clearActivityLogs, incrementResetCount, mergeResetCounts, dayHasActivityLog };
