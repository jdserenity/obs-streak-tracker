function pausedStateFromVault(vaultPaused, vaultUnpaused) {
  const paused = {};
  for (const [id, date] of Object.entries(vaultPaused || {})) {
    const unpausedAt = (vaultUnpaused || {})[id];
    if (unpausedAt && unpausedAt >= date) continue;
    paused[id] = date;
  }
  return paused;
}

function mergePausedOnIncoming(memPaused, memUnpaused, filePaused, fileUnpaused) {
  const paused = { ...memPaused };
  const unpaused = { ...(fileUnpaused || {}), ...(memUnpaused || {}) };
  for (const [id, date] of Object.entries(filePaused || {})) {
    const unpausedAt = unpaused[id];
    if (unpausedAt && unpausedAt >= date) continue;
    if (!paused[id] || date < paused[id]) paused[id] = date;
  }
  for (const [id, unpausedAt] of Object.entries(unpaused)) {
    if (paused[id] && unpausedAt >= paused[id]) delete paused[id];
  }
  return { pausedActivities: paused, unpausedActivities: unpaused };
}

module.exports = { pausedStateFromVault, mergePausedOnIncoming };
