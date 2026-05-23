const { getLogState } = require("./logs");
const { isActivityActiveOnDay } = require("./activity-catalog");

function isPerfectHeatmapCell(done, total) {
  return total > 0 && done === total;
}

function getDayCompletionCounts(data, activities, dayStr) {
  let successCount = 0;
  let historicalCount = 0;
  const log = data.logs[dayStr] || {};
  for (const activity of activities) {
    if (!isActivityActiveOnDay(activity, data, dayStr)) continue;
    historicalCount++;
    if (getLogState(log[activity.id]) === "success") successCount++;
  }
  return { successCount, historicalCount };
}

function isDayComplete(data, activities, dayStr) {
  const { successCount, historicalCount } = getDayCompletionCounts(data, activities, dayStr);
  return isPerfectHeatmapCell(successCount, historicalCount);
}

module.exports = { isPerfectHeatmapCell, getDayCompletionCounts, isDayComplete };
