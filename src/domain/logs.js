const LEGACY_EPOCH = "1970-01-01T00:00:00.000Z";

function getLogState(cell) {
  if (cell == null) return null;
  if (typeof cell === "string") return cell;
  if (typeof cell === "object" && cell.state != null) return cell.state;
  return null;
}

function cellUpdatedAt(cell, fallback = LEGACY_EPOCH) {
  if (cell == null) return fallback;
  if (typeof cell === "string") return LEGACY_EPOCH;
  return cell.updatedAt || LEGACY_EPOCH;
}

function makeLogCell(state, updatedAt) {
  if (state == null || state === "none") return null;
  return { state, updatedAt: updatedAt || new Date().toISOString() };
}

function normalizeLogCell(cell, defaultUpdatedAt = LEGACY_EPOCH) {
  if (cell == null) return null;
  if (typeof cell === "string") {
    return makeLogCell(cell, defaultUpdatedAt);
  }
  const state = cell.state;
  if (state == null || state === "none") return null;
  return { state, updatedAt: cell.updatedAt || defaultUpdatedAt };
}

function normalizeLogs(logs, defaultUpdatedAt = LEGACY_EPOCH) {
  const out = {};
  for (const date of Object.keys(logs || {})) {
    const day = logs[date];
    if (!day || typeof day !== "object") continue;
    const nextDay = {};
    for (const [act, cell] of Object.entries(day)) {
      const norm = normalizeLogCell(cell, defaultUpdatedAt);
      if (norm) nextDay[act] = norm;
    }
    if (Object.keys(nextDay).length) out[date] = nextDay;
  }
  return out;
}

function serializeLogsForVault(logs) {
  return normalizeLogs(logs);
}

function logsEqualState(a, b, activityId, date) {
  return getLogState(a?.[date]?.[activityId]) === getLogState(b?.[date]?.[activityId]);
}

module.exports = {
  LEGACY_EPOCH,
  getLogState,
  cellUpdatedAt,
  makeLogCell,
  normalizeLogCell,
  normalizeLogs,
  serializeLogsForVault,
  logsEqualState
};
