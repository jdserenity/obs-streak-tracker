const { parseDate, formatDate } = require("./dates");

function lastLogDayForActivity(logs, activityId) {
  let last = null;
  for (const day of Object.keys(logs || {})) {
    if (logs[day]?.[activityId] && (!last || day > last)) last = day;
  }
  return last;
}

function dayAfter(dayStr) {
  const d = parseDate(dayStr);
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

/** Sets archivedAt (day after last log) on archived activities missing it. Returns true if config changed. */
function backfillArchivedAt(config, data) {
  let changed = false;
  for (const activity of config.archivedActivities || []) {
    if (activity.archivedAt) continue;
    const last = lastLogDayForActivity(data.logs, activity.id);
    activity.archivedAt = last ? dayAfter(last) : null;
    changed = true;
  }
  return changed;
}

module.exports = { backfillArchivedAt, lastLogDayForActivity, dayAfter };
