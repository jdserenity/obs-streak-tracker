async function refreshUIFromVault({ loadVaultData, recalculateAllStats, refreshAllTrackers }) {
  await loadVaultData();
  await recalculateAllStats();
  await refreshAllTrackers();
}

module.exports = { refreshUIFromVault };
