const { parseDate } = require("./dates");

const DAY_NAME_TO_INDEX = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5,
  sat: 6, saturday: 6
};

function parseScheduledDays(scheduledDays) {
  if (!scheduledDays?.length) return [];
  return scheduledDays.map(d => DAY_NAME_TO_INDEX[d.toLowerCase()]).filter(d => d !== undefined);
}

function buildActivityCatalog(config, data) {
  const byId = new Map();
  const add = (a, opts) => {
    if (!a?.id) return;
    const prev = byId.get(a.id) || {};
    byId.set(a.id, {
      ...prev,
      ...a,
      _fromConfig: !!(prev._fromConfig || opts?.fromConfig),
      _logOnly: !!(prev._logOnly || opts?.logOnly) && !prev._fromConfig && !opts?.fromConfig
    });
  };
  for (const a of config?.activities || []) add(a, { fromConfig: true });
  for (const a of config?.archivedActivities || []) add(a, { fromConfig: true });
  for (const id of Object.keys(data?.activityStartDates || {})) {
    if (!byId.has(id)) add({ id }, { logOnly: true });
  }
  for (const log of Object.values(data?.logs || {})) {
    for (const id of Object.keys(log)) {
      if (!byId.has(id)) add({ id }, { logOnly: true });
    }
  }
  return [...byId.values()];
}

function isActivityDueOnDay(activity, dayStr) {
  if (activity.frequency === "weekly") {
    const indices = parseScheduledDays(activity.scheduledDays);
    if (!indices.length) return false;
    return indices.includes(parseDate(dayStr).getDay());
  }
  return true;
}

function getActivityStartDate(data, activityId) {
  if (!data._inferredStartDates) data._inferredStartDates = {};
  if (data._inferredStartDates[activityId] !== undefined) return data._inferredStartDates[activityId];
  let start = data.activityStartDates?.[activityId] || null;
  if (!start) {
    for (const day of Object.keys(data.logs || {})) {
      if (data.logs[day]?.[activityId] && (!start || day < start)) start = day;
    }
  }
  data._inferredStartDates[activityId] = start;
  return start;
}

function getActivityLastLogDate(data, activityId) {
  if (!data._inferredLastLogDates) data._inferredLastLogDates = {};
  if (data._inferredLastLogDates[activityId] !== undefined) return data._inferredLastLogDates[activityId];
  let last = null;
  for (const day of Object.keys(data.logs || {})) {
    if (data.logs[day]?.[activityId] && (!last || day > last)) last = day;
  }
  data._inferredLastLogDates[activityId] = last;
  return last;
}

function isActivityActiveOnDay(activity, data, dayStr) {
  const startedOn = getActivityStartDate(data, activity.id);
  if (!startedOn || startedOn > dayStr) return false;
  const pausedSince = data.pausedActivities?.[activity.id];
  if (pausedSince && pausedSince <= dayStr) return false;
  if (activity.archivedAt && activity.archivedAt <= dayStr) return false;
  if (activity._logOnly) {
    const lastLog = getActivityLastLogDate(data, activity.id);
    if (!lastLog || dayStr > lastLog) return false;
  }
  return isActivityDueOnDay(activity, dayStr);
}

function getActiveActivitiesForDay(catalog, data, dayStr) {
  return catalog.filter(a => isActivityActiveOnDay(a, data, dayStr));
}

module.exports = {
  parseScheduledDays,
  buildActivityCatalog,
  getActivityStartDate,
  isActivityDueOnDay,
  isActivityActiveOnDay,
  getActiveActivitiesForDay
};
