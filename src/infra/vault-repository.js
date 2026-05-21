const { hashStr } = require("./hash");
const { normalizeLogs } = require("../domain/logs");

class VaultRepository {
  constructor(app, store) {
    this.app = app;
    this.store = store;
    this._lastDataWriteHash = null;
    this._lastConfigWriteHash = null;
  }

  dataPath() {
    return this.store.state.settings.dataFilePath || "Archive/streak-tracker-data.md";
  }

  configPath() {
    return this.store.state.settings.configFilePath || "Archive/streak-tracker-config.md";
  }

  async dataFileExists() {
    return this.app.vault.adapter.exists(this.dataPath());
  }

  async readDataFile() {
    const content = await this.app.vault.adapter.read(this.dataPath());
    return { content, parsed: JSON.parse(content) };
  }

  async loadVaultData() {
    const exists = await this.dataFileExists();
    if (!exists) return false;
    try {
      const { parsed } = await this.readDataFile();
      this.store.applyVaultPayload(parsed, "bootstrap");
      this.store.vaultDataLoaded = true;
      return true;
    } catch (e) {
      console.error("Failed to load streak tracker vault data:", e);
      this.store.vaultDataLoaded = true;
      return false;
    }
  }

  async saveVaultData() {
    if (!this.store.vaultDataLoaded) return;
    const dataPath = this.dataPath();
    try {
      const exists = await this.app.vault.adapter.exists(dataPath);
      if (exists) {
        const raw = await this.app.vault.adapter.read(dataPath);
        const existing = JSON.parse(raw);
        this.store.mergeForSave(existing);
      }
    } catch (e) {
      console.warn("streak-tracker: merge-on-save failed, writing current data:", e);
    }
    this.store.recalculateStats();
    const vaultData = this.store.snapshotForVault();
    const jsonStr = JSON.stringify(vaultData, null, 2);
    this._lastDataWriteHash = hashStr(jsonStr);
    await this.app.vault.adapter.write(dataPath, jsonStr);
  }

  lastDataWriteHash() { return this._lastDataWriteHash; }

  async incomingSync(content) {
    const vaultData = JSON.parse(content);
    this.store.mergeIncoming(vaultData);
    this.store.recalculateStats();
  }

  setConfigWriteHash(content) {
    this._lastConfigWriteHash = hashStr(content);
  }

  configWriteHash() { return this._lastConfigWriteHash; }

  hashContent(content) { return hashStr(content); }

  normalizeLoadedConfig(parsed) {
    const config = parsed && typeof parsed === "object" ? parsed : {};
    if (!Array.isArray(config.activities)) config.activities = [];
    if (!Array.isArray(config.archivedActivities)) config.archivedActivities = [];
    return config;
  }

  async loadActivityConfig() {
    const configPath = this.configPath();
    const file = this.app.vault.getAbstractFileByPath(configPath);
    if (!file) return this.normalizeLoadedConfig({ activities: [] });
    try {
      const content = await this.app.vault.read(file);
      return this.normalizeLoadedConfig(JSON.parse(content));
    } catch (e) {
      console.error("Failed to load streak tracker config:", e);
      return this.normalizeLoadedConfig({ activities: [] });
    }
  }

  async saveActivityConfig(config) {
    const configPath = this.configPath();
    const content = JSON.stringify(config, null, 2);
    this._lastConfigWriteHash = hashStr(content);
    const file = this.app.vault.getAbstractFileByPath(configPath);
    if (file) await this.app.vault.modify(file, content);
    else await this.app.vault.adapter.write(configPath, content);
  }
}

module.exports = { VaultRepository };
