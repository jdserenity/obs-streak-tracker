const { DEFAULT_DATA } = require("../domain/defaults");
const { normalizeLogs } = require("../domain/logs");
const { mergeState } = require("../domain/merge");
const { pausedStateFromVault } = require("../domain/pause-sync");
const { recalculateAllStats } = require("../domain/stats");
const { getCurrentDay } = require("../domain/dates");
const { clearActivityLogs, incrementResetCount } = require("../domain/activity-reset");
const { makeLogCell, getLogState } = require("../domain/logs");

class StreakStore {
  constructor() {
    this.state = { ...DEFAULT_DATA, settings: { ...DEFAULT_DATA.settings } };
    this.vaultDataLoaded = false;
    this.activityConfigMap = {};
    this._skipLogMergeFor = null;
  }

  get data() { return this.state; }

  initFromPluginSettings(savedData) {
    this.state = Object.assign({}, DEFAULT_DATA, savedData);
    if (!this.state.settings) this.state.settings = { ...DEFAULT_DATA.settings };
    if (!this.state.logs) this.state.logs = {};
    if (!this.state.stats) this.state.stats = {};
    if (!this.state.activityStartDates) this.state.activityStartDates = {};
    if (!this.state.pausedActivities) this.state.pausedActivities = {};
    if (!this.state.unpausedActivities) this.state.unpausedActivities = {};
    if (!this.state.activityResetCounts) this.state.activityResetCounts = {};
  }

  today() {
    return getCurrentDay(this.state.settings.dayEndTime);
  }

  applyVaultPayload(vaultData, mode, skipActivityIds) {
    const today = this.today();
    const local = {
      logs: this.state.logs,
      activityStartDates: this.state.activityStartDates,
      pausedActivities: this.state.pausedActivities,
      unpausedActivities: this.state.unpausedActivities,
      activityResetCounts: this.state.activityResetCounts
    };
    const remote = {
      logs: normalizeLogs(vaultData.logs || {}),
      activityStartDates: vaultData.activityStartDates || {},
      pausedActivities: vaultData.pausedActivities || {},
      unpausedActivities: vaultData.unpausedActivities || {},
      activityResetCounts: vaultData.activityResetCounts || {}
    };
    const merged = mergeState({ local, remote, mode, today, skipActivityIds });
    this.state.logs = merged.logs;
    this.state.activityStartDates = merged.activityStartDates;
    this.state.pausedActivities = merged.pausedActivities;
    this.state.unpausedActivities = merged.unpausedActivities;
    this.state.activityResetCounts = merged.activityResetCounts;
    this.vaultDataLoaded = true;
  }

  bootstrapFromVault(vaultData) {
    if (!vaultData) return false;
    this.applyVaultPayload(vaultData, "bootstrap");
    return true;
  }

  mergeForSave(remoteVaultData) {
    const skip = this._skipLogMergeFor;
    this.applyVaultPayload(remoteVaultData, "save", skip);
    if (skip) this._skipLogMergeFor = null;
  }

  mergeIncoming(vaultData) {
    this.applyVaultPayload(vaultData, "incoming");
  }

  forceLoadFromFile(vaultData) {
    this.state.logs = normalizeLogs(vaultData.logs || {});
    this.state.activityStartDates = vaultData.activityStartDates || {};
    this.state.unpausedActivities = vaultData.unpausedActivities || {};
    this.state.pausedActivities = pausedStateFromVault(
      vaultData.pausedActivities,
      this.state.unpausedActivities
    );
    this.state.activityResetCounts = vaultData.activityResetCounts || {};
    this.state.stats = {};
    this.vaultDataLoaded = true;
  }

  snapshotForVault() {
    return {
      logs: normalizeLogs(this.state.logs),
      activityStartDates: this.state.activityStartDates,
      pausedActivities: this.state.pausedActivities || {},
      unpausedActivities: this.state.unpausedActivities || {},
      activityResetCounts: this.state.activityResetCounts || {}
    };
  }

  setLog(activityId, state, dayStr) {
    delete this.state._inferredStartDates;
    delete this.state._inferredLastLogDates;
    const targetDay = dayStr || this.today();
    if (!this.state.logs[targetDay]) this.state.logs[targetDay] = {};
    if (!this.state.activityStartDates[activityId]) {
      this.state.activityStartDates[activityId] = targetDay;
    }
    if (state === "none") {
      delete this.state.logs[targetDay][activityId];
      if (!Object.keys(this.state.logs[targetDay]).length) delete this.state.logs[targetDay];
    } else {
      this.state.logs[targetDay][activityId] = makeLogCell(state);
    }
  }

  getLogStateForDay(activityId, dayStr) {
    return getLogState(this.state.logs[dayStr]?.[activityId]);
  }

  resetActivity(activityId) {
    this.state.logs = clearActivityLogs(this.state.logs, activityId);
    delete this.state.activityStartDates[activityId];
    delete this.state.stats[activityId];
    delete this.state.pausedActivities?.[activityId];
    delete this.state.unpausedActivities?.[activityId];
    this.state.activityResetCounts = incrementResetCount(this.state.activityResetCounts, activityId);
    if (!this._skipLogMergeFor) this._skipLogMergeFor = new Set();
    this._skipLogMergeFor.add(activityId);
  }

  recalculateStats() {
    return recalculateAllStats(this.state, this.activityConfigMap, this.state.settings.dayEndTime);
  }
}

module.exports = { StreakStore };
