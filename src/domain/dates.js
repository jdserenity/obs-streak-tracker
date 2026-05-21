function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(date1, date2) {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
}

function getCurrentDay(dayEndTime = "04:00") {
  const now = new Date();
  const [endHour, endMinute] = dayEndTime.split(":").map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const endMinutes = endHour * 60 + endMinute;
  if (currentMinutes < endMinutes) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDate(yesterday);
  }
  return formatDate(now);
}

function getISOWeekStart(dateStr) {
  const d = parseDate(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

function getWeekDays(weekStartStr) {
  const days = [];
  const d = parseDate(weekStartStr);
  for (let i = 0; i < 7; i++) {
    days.push(formatDate(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

module.exports = {
  formatDate,
  parseDate,
  daysBetween,
  getCurrentDay,
  getISOWeekStart,
  getWeekDays
};
