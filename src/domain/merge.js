const { pausedStateFromVault, mergePausedOnIncoming } = require("./pause-sync");
const { mergeResetCounts } = require("./activity-reset");
const { getLogState, cellUpdatedAt, normalizeLogCell, normalizeLogs } = require("./logs");

function mergeLogCell(localCell, remoteCell, preferLocalOnTie = false, localWinsAbsent = false) {
  const lState = getLogState(localCell);
  const rState = getLogState(remoteCell);
  const lIsDel = localCell && localCell.state === "none";
  const rIsDel = remoteCell && remoteCell.state === "none";

  // Both deletions (or both absent) → pick newer timestamp (local on tie for today rules)
  if ((lState == null || lIsDel) && (rState == null || rIsDel)) {
    if (lState == null && rState == null) return null;
    if (lState == null) return normalizeLogCell(remoteCell); // remote deletion wins
    if (rState == null) return normalizeLogCell(localCell);   // local deletion wins
    const lAt = cellUpdatedAt(localCell);
    const rAt = cellUpdatedAt(remoteCell);
    if (lAt > rAt) return normalizeLogCell(localCell);
    if (rAt > lAt) return normalizeLogCell(remoteCell);
    return normalizeLogCell(preferLocalOnTie ? localCell : remoteCell);
  }

  // Local is deletion (with timestamp), remote is positive
  if (lIsDel && rState != null) {
    const lAt = cellUpdatedAt(localCell);
    const rAt = cellUpdatedAt(remoteCell);
    if (lAt > rAt) return normalizeLogCell(localCell); // local deletion wins
    if (rAt > lAt) return normalizeLogCell(remoteCell);
    return normalizeLogCell(preferLocalOnTie ? localCell : remoteCell);
  }

  // Remote is deletion (with timestamp), local is positive
  if (rIsDel && lState != null) {
    const lAt = cellUpdatedAt(localCell);
    const rAt = cellUpdatedAt(remoteCell);
    if (rAt > lAt) return normalizeLogCell(remoteCell); // remote deletion wins
    if (lAt > rAt) return normalizeLogCell(localCell);
    return normalizeLogCell(preferLocalOnTie ? localCell : remoteCell);
  }

  // Original logic for positive cells and pure absence cases (old data)
  if (lState == null && rState == null) return null;
  if (lState == null) {
    if (localWinsAbsent) return null;
    return normalizeLogCell(remoteCell);
  }
  if (rState == null) return normalizeLogCell(localCell);
  const lAt = cellUpdatedAt(localCell);
  const rAt = cellUpdatedAt(remoteCell);
  if (lAt > rAt) return normalizeLogCell(localCell);
  if (rAt > lAt) return normalizeLogCell(remoteCell);
  return normalizeLogCell(preferLocalOnTie ? localCell : remoteCell);
}

function mergeLogs(localLogs, remoteLogs, { today, mode, skipActivityIds } = {}) {
  const local = normalizeLogs(localLogs || {});
  const remote = normalizeLogs(remoteLogs || {});
  const out = {};
  const dates = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const date of dates) {
    const acts = new Set([
      ...Object.keys(local[date] || {}),
      ...Object.keys(remote[date] || {})
    ]);
    const day = {};
    for (const act of acts) {
      if (skipActivityIds?.has?.(act)) continue;
      const isToday = date === today;
      const preferLocalOnTie = (mode === "incoming" && isToday) || (mode === "save" && isToday);
      const localWinsAbsent = (mode === "incoming" && isToday) || (mode === "save" && isToday);
      const merged = mergeLogCell(
        local[date]?.[act],
        remote[date]?.[act],
        preferLocalOnTie,
        localWinsAbsent
      );
      if (merged) day[act] = merged;
    }
    if (Object.keys(day).length) out[date] = day;
  }
  return out;
}

function mergeStartDates(local, remote, skipActivityIds) {
  const out = { ...(local || {}) };
  for (const [act, date] of Object.entries(remote || {})) {
    if (skipActivityIds?.has?.(act)) continue;
    if (!out[act] || date < out[act]) out[act] = date;
  }
  return out;
}

function mergeState({ local, remote, mode, today, skipActivityIds }) {
  const l = local || {};
  const r = remote || {};
  const logs = mergeLogs(l.logs, r.logs, { today, mode, skipActivityIds });
  const activityStartDates = mergeStartDates(l.activityStartDates, r.activityStartDates, skipActivityIds);
  const activityResetCounts = mergeResetCounts(l.activityResetCounts, r.activityResetCounts);

  let pausedActivities;
  let unpausedActivities;

  if (mode === "bootstrap") {
    unpausedActivities = { ...(r.unpausedActivities || {}) };
    pausedActivities = pausedStateFromVault(r.pausedActivities, unpausedActivities);
  } else if (mode === "save") {
    pausedActivities = { ...(l.pausedActivities || {}) };
    unpausedActivities = { ...(l.unpausedActivities || {}) };
  } else {
    const merged = mergePausedOnIncoming(
      l.pausedActivities,
      l.unpausedActivities,
      r.pausedActivities,
      r.unpausedActivities
    );
    pausedActivities = merged.pausedActivities;
    unpausedActivities = merged.unpausedActivities;
  }

  return {
    logs,
    activityStartDates,
    pausedActivities,
    unpausedActivities,
    activityResetCounts
  };
}

module.exports = { mergeState, mergeLogs, mergeLogCell, mergeStartDates };
