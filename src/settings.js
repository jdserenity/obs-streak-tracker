const { PluginSettingTab, Setting, Notice } = require("obsidian");
const { pausedStateFromVault } = require("./domain/pause-sync");

class StreakTrackerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Streak Tracker Settings" });

    new Setting(containerEl)
      .setName("Day End Time")
      .setDesc("When does the 'day' end? (HH:MM format, 24-hour). Activities before this time count for the previous day.")
      .addText(text => text
        .setPlaceholder("04:00")
        .setValue(this.plugin.store.state.settings.dayEndTime)
        .onChange(async (value) => {
          // Validate time format
          if (/^\d{2}:\d{2}$/.test(value)) {
            this.plugin.store.state.settings.dayEndTime = value;
            await this.plugin.savePluginData();
          }
        }));

    new Setting(containerEl)
      .setName("Heatmap Color")
      .setDesc("Base color for the contribution heatmap (leave empty for theme default)")
      .addText(text => text
        .setPlaceholder("#22c55e")
        .setValue(this.plugin.store.state.settings.heatmapColor || "")
        .onChange(async (value) => {
          this.plugin.store.state.settings.heatmapColor = value || null;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("Config File Path")
      .setDesc("Path to the activity configuration JSON file (relative to vault root)")
      .addText(text => text
        .setPlaceholder("Archive/streak-tracker-config.md")
        .setValue(this.plugin.store.state.settings.configFilePath)
        .onChange(async (value) => {
          this.plugin.store.state.settings.configFilePath = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("Data File Path")
      .setDesc("Path to the streak data file (logs, stats) in the vault. Syncs across devices.")
      .addText(text => text
        .setPlaceholder("Archive/streak-tracker-data.md")
        .setValue(this.plugin.store.state.settings.dataFilePath)
        .onChange(async (value) => {
          this.plugin.store.state.settings.dataFilePath = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("Refresh UI")
      .setDesc("Reload streak data from the vault file and refresh all tracker views. Use this if the UI seems out of sync after syncing from another device.")
      .addButton(button => button
        .setButtonText("Refresh")
        .onClick(async () => {
          await this.plugin.vault.loadVaultData();
          await this.plugin.recalculateAllStats();
          await this.plugin.refreshAllTrackers();
          new Notice("Streak tracker UI refreshed from vault data.");
        }));

    new Setting(containerEl)
      .setName("Force Load from File")
      .setDesc("Discard all in-memory data and reload exactly what's in the data file. Use this if the plugin isn't picking up an existing data file.")
      .addButton(button => button
        .setButtonText("Force Load")
        .setWarning()
        .onClick(async () => {
          const dataPath = this.plugin.store.state.settings.dataFilePath || "Archive/streak-tracker-data.md";
          const exists = await this.plugin.app.vault.adapter.exists(dataPath);
          if (!exists) {
            new Notice(`Data file not found at: ${dataPath}`);
            return;
          }
          try {
            const content = await this.plugin.app.vault.adapter.read(dataPath);
            const vaultData = JSON.parse(content);
            this.plugin.store.forceLoadFromFile(vaultData);
            await this.plugin.recalculateAllStats();
            await this.plugin.refreshAllTrackers();
            new Notice("Streak data force-loaded from file.");
          } catch (e) {
            new Notice(`Failed to load data file: ${e.message}`);
          }
        }));

    new Setting(containerEl)
      .setName("Link Color")
      .setDesc("Color for linked notes in activity names (hex format)")
      .addText(text => text
        .setPlaceholder("#8b5cf6")
        .setValue(this.plugin.store.state.settings.linkColor || "")
        .onChange(async (value) => {
          this.plugin.store.state.settings.linkColor = value || "#8b5cf6";
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName("Secondary action modifier")
      .setDesc("Hold this key while hovering over the tracker to reveal secondary actions (e.g. pause/resume an activity).")
      .addDropdown(drop => drop
        .addOption("Alt", "Alt / Option (⌥)")
        .addOption("Control", "Ctrl (^)")
        .addOption("Shift", "Shift (⇧)")
        .addOption("Meta", "Cmd / Win (⌘)")
        .setValue(this.plugin.store.state.settings.secondaryModifier || "Alt")
        .onChange(async (value) => {
          this.plugin.store.state.settings.secondaryModifier = value;
          await this.plugin.savePluginData();
        }));
  }
}

module.exports = { StreakTrackerSettingTab };
