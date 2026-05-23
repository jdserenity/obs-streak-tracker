import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { buildActivityCatalog, getActiveActivitiesForDay } = require("../src/domain/activity-catalog.js");

const dataPath = process.argv[2];
if (!dataPath) {
  console.error("Usage: node scripts/reconstruct-activity-history.mjs <streak-tracker-data.md> [config.md]");
  process.exit(1);
}

function loadJson(path) {
  const raw = readFileSync(path, "utf8");
  const start = raw.indexOf("{");
  return JSON.parse(raw.slice(start));
}

const data = loadJson(dataPath);
let config = { activities: [], archivedActivities: [] };
if (process.argv[3]) {
  config = loadJson(process.argv[3]);
}

const catalog = buildActivityCatalog(config, data);
const days = Object.keys(data.logs).sort();
const first = days[0];
const last = days[days.length - 1];

const periods = [];
let prevKey = null;
let periodStart = null;

for (const day of days) {
  const active = getActiveActivitiesForDay(catalog, data, day).map(a => a.id).sort();
  const key = active.join(",");
  if (key !== prevKey) {
    if (prevKey !== null) periods.push({ from: periodStart, to: days[days.indexOf(day) - 1], activities: prevKey.split(",").filter(Boolean) });
    periodStart = day;
    prevKey = key;
  }
}
if (prevKey !== null) periods.push({ from: periodStart, to: last, activities: prevKey.split(",").filter(Boolean) });

console.log(`Activity history (${first} → ${last}), ${catalog.length} known activities\n`);
for (const p of periods) {
  const range = p.from === p.to ? p.from : `${p.from} → ${p.to}`;
  console.log(`${range} (${p.activities.length} due)`);
  console.log(`  ${p.activities.join(", ")}\n`);
}

const logOnly = new Set();
for (const log of Object.values(data.logs)) for (const id of Object.keys(log)) logOnly.add(id);
const inCatalog = new Set(catalog.map(a => a.id));
const missingDefs = [...logOnly].filter(id => !inCatalog.has(id)).sort();
if (missingDefs.length) console.log("Log ids without config entry (inferred daily):", missingDefs.join(", "));
