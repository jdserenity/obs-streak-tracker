const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildActivityCatalog,
  isActivityActiveOnDay,
  parseScheduledDays,
  getActiveActivitiesForDay
} = require("../src/domain/activity-catalog");
const { isDayComplete } = require("../src/domain/heatmap-helpers");

describe("buildActivityCatalog", () => {
  it("merges active, archived, and log-only activity ids", () => {
    const config = { activities: [{ id: "a" }], archivedActivities: [{ id: "b" }] };
    const data = { logs: { "2026-05-01": { c: { state: "success" } } }, activityStartDates: { d: "2026-05-01" } };
    const ids = buildActivityCatalog(config, data).map(a => a.id).sort();
    assert.deepEqual(ids, ["a", "b", "c", "d"]);
  });
});

describe("scheduled weekly on daily completion", () => {
  const school = {
    id: "school",
    frequency: "weekly",
    scheduledDays: ["Mon", "Tue", "Wed", "Thu", "Fri"]
  };
  const daily = { id: "wake-up" };

  it("requires school on weekdays after start", () => {
    const data = {
      logs: {
        "2026-03-09": { "wake-up": { state: "success" }, school: { state: "success" } },
        "2026-03-08": { "wake-up": { state: "success" } }
      },
      activityStartDates: { "wake-up": "2026-02-12", school: "2026-03-09" }
    };
    const catalog = [daily, school];
    assert.equal(isDayComplete(data, catalog, "2026-03-09"), true);
    assert.equal(isDayComplete(data, catalog, "2026-03-08"), true);
  });

  it("does not require school on weekends", () => {
    const data = {
      logs: { "2026-03-14": { "wake-up": { state: "success" } } },
      activityStartDates: { "wake-up": "2026-02-12", school: "2026-03-09" }
    };
    assert.equal(isDayComplete(data, [daily, school], "2026-03-14"), true);
  });

  it("parseScheduledDays maps day names", () => {
    assert.deepEqual(parseScheduledDays(["Mon", "Fri"]), [1, 5]);
  });
});

describe("getActivityStartDate", () => {
  it("infers start from first log when activityStartDates missing", () => {
    const data = {
      logs: { "2026-03-05": { "br-lesson": { state: "success" } } },
      activityStartDates: {}
    };
    const { getActivityStartDate } = require("../src/domain/activity-catalog");
    assert.equal(getActivityStartDate(data, "br-lesson"), "2026-03-05");
    assert.equal(getActivityStartDate(data, "never-used"), null);
  });
});

describe("log-only activities", () => {
  it("do not count after last log day", () => {
    const data = {
      logs: {
        "2026-03-05": { "br-lesson": { state: "success" } },
        "2026-05-20": { "wake-up": { state: "success" } }
      },
      activityStartDates: { "wake-up": "2026-02-12" }
    };
    const catalog = buildActivityCatalog({ activities: [{ id: "wake-up" }], archivedActivities: [] }, data);
    const active = getActiveActivitiesForDay(catalog, data, "2026-05-20").map(a => a.id);
    assert.equal(active.includes("br-lesson"), false);
    assert.equal(active.includes("wake-up"), true);
  });
});

describe("paused activities", () => {
  it("do not count on or after pause date", () => {
    const a = { id: "clean-room", _fromConfig: true };
    const data = {
      activityStartDates: { "clean-room": "2026-02-12" },
      pausedActivities: { "clean-room": "2026-04-08" },
      logs: {}
    };
    const { isActivityActiveOnDay } = require("../src/domain/activity-catalog");
    assert.equal(isActivityActiveOnDay(a, data, "2026-04-07"), true);
    assert.equal(isActivityActiveOnDay(a, data, "2026-04-08"), false);
  });
});

describe("archivedAt", () => {
  it("excludes activity on and after archive date", () => {
    const a = { id: "school", frequency: "weekly", scheduledDays: ["Mon"], archivedAt: "2026-05-01" };
    const data = { activityStartDates: { school: "2026-03-01" } };
    assert.equal(isActivityActiveOnDay(a, data, "2026-04-27"), true); // Mon
    assert.equal(isActivityActiveOnDay(a, data, "2026-05-01"), false); // Thu, archived
  });
});
