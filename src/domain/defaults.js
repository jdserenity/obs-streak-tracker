const DEFAULT_SETTINGS = {
  dayEndTime: "04:00",
  heatmapColor: null,
  configFilePath: "Archive/streak-tracker-config.md",
  dataFilePath: "Archive/streak-tracker-data.md",
  linkColor: "#8ECCDF",
  secondaryModifier: "Alt"
};

const DEFAULT_DATA = {
  settings: DEFAULT_SETTINGS,
  logs: {},
  stats: {},
  activityStartDates: {},
  pausedActivities: {},
  unpausedActivities: {},
  activityResetCounts: {}
};

module.exports = { DEFAULT_SETTINGS, DEFAULT_DATA };
