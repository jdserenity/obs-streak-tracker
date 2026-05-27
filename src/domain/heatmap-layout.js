const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthIndexFromDateStr(dateStr) {
  if (!dateStr) return -1;
  return parseInt(dateStr.slice(5, 7), 10) - 1;
}

function weekColumnMonthFromDates(dateStrs) {
  for (const d of dateStrs) {
    const m = monthIndexFromDateStr(d);
    if (m >= 0) return m;
  }
  return -1;
}

function heatmapMonthSpans(weekMonths) {
  const spans = [];
  let i = 0;
  while (i < weekMonths.length) {
    const m = weekMonths[i];
    if (m < 0) { i++; continue; }
    const start = i;
    while (i < weekMonths.length && weekMonths[i] === m) i++;
    spans.push({ name: MONTH_NAMES[m], weekCount: i - start });
  }
  return spans;
}

module.exports = { MONTH_NAMES, monthIndexFromDateStr, weekColumnMonthFromDates, heatmapMonthSpans };
