class SyncCoordinator {
  constructor(plugin) {
    this.plugin = plugin;
    this._reloadTimeout = null;
  }

  onFileModified(file) {
    const vault = this.plugin.vault;
    const configPath = vault.configPath();
    const dataPath = vault.dataPath();
    if (file.path !== configPath && file.path !== dataPath) return;

    if (this._reloadTimeout) clearTimeout(this._reloadTimeout);
    this._reloadTimeout = setTimeout(async () => {
      try {
        if (file.path === dataPath) {
          const content = await this.plugin.app.vault.adapter.read(dataPath);
          const readHash = vault.hashContent(content);
          if (readHash === vault.lastDataWriteHash()) return;
          await vault.incomingSync(content);
          await this.plugin.view.refreshAllTrackers();
        } else {
          const content = await this.plugin.app.vault.adapter.read(configPath);
          if (vault.hashContent(content) === vault.configWriteHash()) return;
          await this.plugin.view.refreshAllTrackers();
        }
      } catch (e) {
        console.error("streak-tracker: onFileModified handler failed:", e);
      }
    }, 500);
  }
}

module.exports = { SyncCoordinator };
