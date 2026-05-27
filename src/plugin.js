const { Plugin, Notice } = require("obsidian");
const { DEFAULT_SETTINGS, DEFAULT_DATA } = require("./domain/defaults");
const { StreakStore } = require("./store/streak-store");
const { VaultRepository } = require("./infra/vault-repository");
const { SyncCoordinator } = require("./infra/sync-coordinator");
const { TrackerView } = require("./ui/tracker-view");
const { StreakTrackerSettingTab } = require("./settings");
const { getCurrentDay: domainGetCurrentDay, formatDate, parseDate, daysBetween, getISOWeekStart, getWeekDays } = require("./domain/dates");
const { calculateStats: domainCalculateStats, calculateWeeklyStats: domainCalculateWeeklyStats } = require("./domain/stats");
const { getLogState } = require("./domain/logs");
const { isDayComplete } = require("./domain/heatmap-helpers");
const { buildActivityCatalog } = require("./domain/activity-catalog");
const { backfillArchivedAt } = require("./domain/archive-backfill");
const { refreshUIFromVault } = require("./infra/refresh-ui");

class StreakTrackerPlugin extends Plugin {
  get data() { return this.store.state; }

  async onload() {
    this.store = new StreakStore();
    this.vault = new VaultRepository(this.app, this.store);
    this.view = new TrackerView(this);
    this.sync = new SyncCoordinator(this);
    this.store.vaultDataLoaded = false;
    this._trackerElements = new Set();
    this.vault._lastDataWriteHash = null;
    this.vault._lastConfigWriteHash = null;
    this._reloadTimeout = null;
    this.store.activityConfigMap = {}; // id → activity object, populated on config load
    this._secondaryHoverTrackers = new Set();
    this._secondaryModifierHeld = false;
    this._bindSecondaryModeListeners();

    await this.loadPluginData();

    // Register code block processor
    this.registerMarkdownCodeBlockProcessor("streak-tracker", async (source, el, ctx) => {
      try {
        await this.loadVaultData();
      } catch (e) {
        console.error("streak-tracker: processor freshness load failed:", e);
      }
      this.view.renderTracker(el);
    });

    // Register settings tab
    this.addSettingTab(new StreakTrackerSettingTab(this.app, this));

    this.addCommand({
      id: "streak-tracker-refresh-ui",
      name: "Refresh UI",
      callback: () => this.refreshUIFromVault()
    });

    try { await this.recalculateAllStats(); } catch (e) {
      console.error("streak-tracker: recalculateAllStats on load failed:", e);
    }

    // Check for day change periodically
    this.lastCheckedDay = this.getCurrentDay();
    this.registerInterval(
      window.setInterval(() => this.checkDayChange(), 60000)
    );

    // Watch vault file modifications for sync/manual edits
    this.registerEvent(
      this.app.vault.on("modify", (file) => this.onFileModified(file))
    );

    // Opportunistic freshness for mobile (iOS often misses "modify"). Keep active-leaf
    // (user switching to the note) + onLayoutReady (app start) + the original modify path.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async () => {
        if (this._trackerElements && this._trackerElements.size > 0) {
          try {
            await this.loadVaultData();
            await this.recalculateAllStats();
            await this.refreshAllTrackers();
          } catch (e) {
            console.error("streak-tracker: active-leaf freshness check failed:", e);
          }
        }
      })
    );

    // Retry loading vault data after layout is ready (covers Proton at startup,
    // and missed external sync while app was closed/backgrounded on mobile).
    // Always attempt — the loaded flag alone is not a reliable "we have current data" signal.
    this.app.workspace.onLayoutReady(async () => {
      try {
        await this.loadVaultData();
        await this.recalculateAllStats();
        await this.maybeBackfillArchivedAt();
        await this.refreshAllTrackers();
      } catch (e) {
        console.error("streak-tracker: onLayoutReady failed:", e);
      }
    });
  }

  async maybeBackfillArchivedAt() {
    try {
      const config = await this.loadActivityConfig();
      if (backfillArchivedAt(config, this.data)) await this.saveActivityConfig(config);
    } catch (e) {
      console.error("streak-tracker: archivedAt backfill failed:", e);
    }
  }

  async loadPluginData() {
    const savedData = await this.loadData();
    this.store.initFromPluginSettings(savedData);

    // Migrate .json vault files to .md so they appear in Obsidian's file browser
    await this.migrateJsonToMd();

    // Load vault data (logs, stats, activityStartDates) from the vault file
    const vaultDataLoaded = await this.loadVaultData();

    // Auto-migration: if the vault file had no data but plugin data.json has existing logs,
    // migrate them to the vault file and clear from plugin data
    if (!vaultDataLoaded && Object.keys(savedData?.logs || {}).length > 0) {
      this.data.logs = savedData?.logs || {};
      this.data.stats = savedData.stats || {};
      this.data.activityStartDates = savedData.activityStartDates || {};
      this.store.vaultDataLoaded = true; // Migrating real data from data.json
      await this.saveVaultData();
      // Clear migrated data from plugin data.json (keep only settings)
      await this.saveData({ settings: this.data.settings });
    }
  }

  async migrateJsonToMd() {
    const migrations = [
      { setting: "configFilePath", oldDefault: "streak-tracker-config.json", newDefault: "Archive/streak-tracker-config.md" },
      { setting: "configFilePath", oldDefault: "streak-tracker-config.md", newDefault: "Archive/streak-tracker-config.md" },
      { setting: "dataFilePath", oldDefault: "streak-tracker-data.json", newDefault: "Archive/streak-tracker-data.md" },
      { setting: "dataFilePath", oldDefault: "streak-tracker-data.md", newDefault: "Archive/streak-tracker-data.md" }
    ];
    let changed = false;
    for (const { setting, oldDefault, newDefault } of migrations) {
      if (this.data.settings[setting] === oldDefault) {
        const exists = await this.app.vault.adapter.exists(oldDefault);
        if (exists) {
          await this.app.vault.adapter.rename(oldDefault, newDefault);
        }
        this.data.settings[setting] = newDefault;
        changed = true;
      }
    }
    if (changed) {
      await this.saveData({ settings: this.data.settings });
    }
  }

  async savePluginData() {
    // Save only settings to Obsidian's plugin data.json
    await this.saveData({ settings: this.data.settings });
    // Save logs, stats, activityStartDates to the vault file
    await this.saveVaultData();
  }

  async loadVaultData() {
    return this.vault.loadVaultData();
  }


  _modifierActive(e) {
    const m = this.data.settings?.secondaryModifier || "Alt";
    if (m === "Alt") return e.altKey;
    if (m === "Control") return e.ctrlKey;
    if (m === "Shift") return e.shiftKey;
    if (m === "Meta") return e.metaKey;
    return false;
  }

  _bindSecondaryModeListeners() {
    this._onSecondaryKey = (e) => {
      const held = this._modifierActive(e);
      if (held === this._secondaryModifierHeld) return;
      this._secondaryModifierHeld = held;
      this._syncSecondaryModeClass();
    };
    this._onSecondaryBlur = () => {
      if (!this._secondaryModifierHeld) return;
      this._secondaryModifierHeld = false;
      this._syncSecondaryModeClass();
    };
    this.registerDomEvent(document, "keydown", this._onSecondaryKey);
    this.registerDomEvent(document, "keyup", this._onSecondaryKey);
    this.registerDomEvent(window, "blur", this._onSecondaryBlur);
  }

  _wireTrackerSecondaryMode(trackerEl, container) {
    container.addEventListener("mouseenter", () => {
      this._secondaryHoverTrackers.add(trackerEl);
      this._syncSecondaryModeClass();
    });
    container.addEventListener("mouseleave", () => {
      this._secondaryHoverTrackers.delete(trackerEl);
      this._syncSecondaryModeClass();
    });
  }

  _syncSecondaryModeClass() {
    for (const trackerEl of this._trackerElements) {
      if (!trackerEl.isConnected) {
        this._trackerElements.delete(trackerEl);
        this._secondaryHoverTrackers.delete(trackerEl);
        continue;
      }
      const container = trackerEl.querySelector(".streak-tracker-container");
      if (!container) continue;
      const on = this._secondaryModifierHeld && this._secondaryHoverTrackers.has(trackerEl);
      container.classList.toggle("streak-secondary-mode", on);
    }
  }

  async incomingSyncFromFile(content) {
    await this.vault.incomingSync(content);
    await this.view.refreshAllTrackers();
  }


  async saveVaultData() {
    await this.vault.saveVaultData();
  }


  normalizeLoadedConfig(parsed) {
    return this.vault.normalizeLoadedConfig(parsed);
  }


  async loadActivityConfig() {
    return this.vault.loadActivityConfig();
  }


  async resetActivityStats(activity) {
    if (!this.store.vaultDataLoaded) await this.loadVaultData();
    this.store.vaultDataLoaded = true;
    this.store.resetActivity(activity.id);
    this.calculateStats(activity.id);
    await this.saveVaultData();
    new Notice(`Stats reset (${this.data.activityResetCounts[activity.id]} total)`);
    await this.refreshAllTrackers();
  }


  renderResetStatsButton(buttonsEl, activity) {
    const resetCount = this.data.activityResetCounts?.[activity.id] || 0;
    const resetBtn = buttonsEl.createEl("button", {
      cls: "streak-btn streak-btn-reset streak-btn-secondary",
      attr: { title: "Reset stats (clears all log history for this activity)" }
    });
    resetBtn.createEl("span", { text: "↻", cls: "streak-reset-icon" });
    resetBtn.createEl("span", { text: String(resetCount), cls: "streak-reset-count" });
    resetBtn.addEventListener("mousedown", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.resetActivityStats(activity);
    });
    return resetBtn;
  }

  async archiveActivity(activity) {
    const config = await this.loadActivityConfig();
    const idx = config.activities.findIndex((a) => a.id === activity.id);
    if (idx === -1) return;
    const [removed] = config.activities.splice(idx, 1);
    removed.archivedAt = this.getCurrentDay();
    config.archivedActivities.push(removed);
    if (this.data.pausedActivities?.[activity.id]) {
      delete this.data.pausedActivities[activity.id];
    }
    if (this.data.unpausedActivities?.[activity.id]) {
      delete this.data.unpausedActivities[activity.id];
    }
    await this.saveActivityConfig(config);
    await this.recalculateAllStats();
    await this.saveVaultData();
    new Notice("Activity archived");
    await this.refreshAllTrackers();
  }

  async saveActivityConfig(config) {
    await this.vault.saveActivityConfig(config);
  }


  getCurrentDay() {
    return domainGetCurrentDay(this.data.settings.dayEndTime);
  }


  formatDate(date) {
    return formatDate(date);
  }


  parseDate(dateStr) {
    return parseDate(dateStr);
  }


  daysBetween(date1, date2) {
    return daysBetween(date1, date2);
  }


  // Returns the YYYY-MM-DD string for the Monday of the ISO week containing dateStr
  getISOWeekStart(dateStr) {
    return getISOWeekStart(dateStr);
  }


  // Returns array of 7 YYYY-MM-DD strings (Mon–Sun) for the week starting at weekStartStr
  getWeekDays(weekStartStr) {
    return getWeekDays(weekStartStr);
  }


  // dayStr is optional — defaults to today. Pass a specific YYYY-MM-DD to remove
  // a past session (used when deselecting a weekly activity checkmark).
  async saveLog(activityId, state, dayStr = null) {
    if (!this.store.vaultDataLoaded) await this.loadVaultData();
    this.store.vaultDataLoaded = true;
    const targetDay = dayStr || this.getCurrentDay();
    const catalog = await this._activityCatalogForCompletion();
    const wasComplete = isDayComplete(this.data, catalog, targetDay);
    this.store.setLog(activityId, state, dayStr);
    domainCalculateStats(this.data, activityId, this.store.activityConfigMap, this.data.settings.dayEndTime);
    const nowComplete = isDayComplete(this.data, catalog, targetDay);
    if (!wasComplete && nowComplete && state === "success") {
      try { require("./ui/confetti").fireDayCompleteConfetti(); } catch (e) {
        console.error("streak-tracker: confetti failed:", e);
      }
    }
    await this.savePluginData();
  }

  async _activityCatalogForCompletion() {
    const config = await this.loadActivityConfig();
    for (const a of [...config.activities, ...(config.archivedActivities || [])]) {
      this.store.activityConfigMap[a.id] = a;
    }
    return buildActivityCatalog(config, this.data);
  }


  async recalculateAllStats() {
    const activityIds = this.store.recalculateStats();
    if (activityIds.size > 0) await this.savePluginData();
  }


  calculateStats(activityId) {
    domainCalculateStats(this.data, activityId, this.store.activityConfigMap, this.data.settings.dayEndTime);
  }


  calculateWeeklyStats(activityId, weeklyTarget) {
    domainCalculateWeeklyStats(this.data, activityId, weeklyTarget, this.data.settings.dayEndTime);
  }


  checkDayChange() {
    const currentDay = this.getCurrentDay();
    if (currentDay !== this.lastCheckedDay) {
      this.lastCheckedDay = currentDay;

      // Recalculate all stats and refresh UI
      this.recalculateAllStats().then(() => this.refreshAllTrackers());
    }
  }

  async refreshAllTrackers() {
    return this.view.refreshAllTrackers();
  }

  async refreshUIFromVault() {
    await refreshUIFromVault({
      loadVaultData: () => this.loadVaultData(),
      recalculateAllStats: () => this.recalculateAllStats(),
      refreshAllTrackers: () => this.refreshAllTrackers()
    });
    new Notice("Streak tracker UI refreshed from vault data.");
  }


  onFileModified(file) {
    this.sync.onFileModified(file);
  }


  getYearsWithData() {
    const years = new Set();
    const currentYear = new Date().getFullYear();
    years.add(currentYear); // Always include current year

    for (const dateStr of Object.keys(this.data.logs)) {
      const year = parseInt(dateStr.split("-")[0]);
      years.add(year);
    }

    return Array.from(years).sort((a, b) => b - a); // Descending order
  }
}

module.exports = StreakTrackerPlugin;
