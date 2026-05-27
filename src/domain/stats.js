const { getLogState } = require("./logs");
const { getCurrentDay, parseDate, formatDate, daysBetween, getISOWeekStart, getWeekDays } = require("./dates");

function calculateStats(data, activityId, activityConfigMap, dayEndTime) {
  const activity = activityConfigMap?.[activityId];
  if (activity?.frequency === "weekly") {
    return calculateWeeklyStats(data, activityId, activity.weeklyTarget || 1, dayEndTime);
  }

  const logs = data.logs;
  const pausedSince = data.pausedActivities?.[activityId];
  const realToday = getCurrentDay(dayEndTime);
  const today = pausedSince && pausedSince <= realToday ? pausedSince : realToday;

  let currentStreak = 0;
  let longestStreak = 0;
  let totalSuccesses = 0;
  let totalDays = 0;
  let tempStreak = 0;

  let startDate = data.activityStartDates[activityId];
  if (!startDate) {
    const datesWithActivity = Object.keys(logs)
      .filter(date => getLogState(logs[date]?.[activityId]) != null)
      .sort();
    if (datesWithActivity.length > 0) {
      startDate = datesWithActivity[0];
      data.activityStartDates[activityId] = startDate;
    }
  }

  if (!startDate) {
    data.stats[activityId] = {
      currentStreak: 0,
      longestStreak: 0,
      totalSuccesses: 0,
      totalDays: 0
    };
    return;
  }

  totalDays = daysBetween(startDate, today);
  if (totalDays < 0) totalDays = 0;

  for (const date of Object.keys(logs)) {
    if (date < startDate || date > today) continue;
    if (getLogState(logs[date][activityId]) === "success") totalSuccesses++;
  }

  let checkDate = parseDate(today);
  const startDateObj = parseDate(startDate);
  const todayLog = logs[today];
  if (getLogState(todayLog?.[activityId]) !== "success") {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (checkDate >= startDateObj) {
    const dateStr = formatDate(checkDate);
    if (getLogState(logs[dateStr]?.[activityId]) === "success") {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  tempStreak = 0;
  let iterDate = new Date(startDateObj);
  while (iterDate <= parseDate(today)) {
    const dateStr = formatDate(iterDate);
    if (getLogState(logs[dateStr]?.[activityId]) === "success") {
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
    iterDate.setDate(iterDate.getDate() + 1);
  }

  if (currentStreak > longestStreak) longestStreak = currentStreak;

  data.stats[activityId] = {
    currentStreak,
    longestStreak,
    totalSuccesses,
    totalDays
  };
}

function calculateWeeklyStats(data, activityId, weeklyTarget, dayEndTime) {
  const logs = data.logs;
  const pausedSince = data.pausedActivities?.[activityId];
  const realToday = getCurrentDay(dayEndTime);
  const today = pausedSince && pausedSince <= realToday ? pausedSince : realToday;

  let startDate = data.activityStartDates[activityId];
  if (!startDate) {
    const datesWithActivity = Object.keys(logs)
      .filter(date => getLogState(logs[date]?.[activityId]) != null)
      .sort();
    if (datesWithActivity.length > 0) {
      startDate = datesWithActivity[0];
      data.activityStartDates[activityId] = startDate;
    }
  }

  if (!startDate) {
    data.stats[activityId] = {
      currentStreak: 0, longestStreak: 0,
      totalSuccesses: 0, totalDays: 0,
      weeklySuccesses: 0, weeklyTarget, isWeekly: true
    };
    return;
  }

  let totalSuccesses = 0;
  for (const date of Object.keys(logs)) {
    if (date < startDate || date > today) continue;
    if (getLogState(logs[date][activityId]) === "success") totalSuccesses++;
  }

  const currentWeekStart = getISOWeekStart(today);
  const startWeekStart = getISOWeekStart(startDate);

  let currentStreak = 0;
  let longestStreak = 0;
  let weeklySuccesses = 0;
  let totalWeeks = 0;
  let tempStreak = 0;

  let wStart = startWeekStart;
  while (wStart < currentWeekStart) {
    const weekDays = getWeekDays(wStart);
    let sessions = 0;
    for (const day of weekDays) {
      if (getLogState(logs[day]?.[activityId]) === "success") sessions++;
    }
    totalWeeks++;
    if (sessions >= weeklyTarget) {
      weeklySuccesses++;
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
    const next = parseDate(wStart);
    next.setDate(next.getDate() + 7);
    wStart = formatDate(next);
  }
  currentStreak = tempStreak;
  if (currentStreak > longestStreak) longestStreak = currentStreak;

  data.stats[activityId] = {
    currentStreak,
    longestStreak,
    totalSuccesses,
    totalDays: totalWeeks,
    weeklySuccesses,
    weeklyTarget,
    isWeekly: true
  };
}

function recalculateAllStats(data, activityConfigMap, dayEndTime) {
  const activityIds = new Set();
  for (const dateStr of Object.keys(data.logs)) {
    for (const activityId of Object.keys(data.logs[dateStr])) {
      activityIds.add(activityId);
    }
  }
  for (const act of Object.keys(data.activityStartDates)) activityIds.add(act);
  for (const activityId of activityIds) {
    calculateStats(data, activityId, activityConfigMap, dayEndTime);
  }
  return activityIds;
}

module.exports = { calculateStats, calculateWeeklyStats, recalculateAllStats };
