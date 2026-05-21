# Streak Tracker — Architecture

## Overview

Streak Tracker is an Obsidian plugin built with esbuild from `src/` into deployable artifacts:

- `dist/main.js` — bundled plugin entry (`npm run build`; Obsidian still expects `main.js` at the plugin folder root in the vault)
- `styles.css` — UI styles
- `manifest.json` — Obsidian plugin metadata

`push_to_prod.sh` runs `npm run build` then copies `dist/main.js` → vault `main.js`, plus `styles.css` and `manifest.json`.

---

## Layered structure

| Layer | Location | Role |
|-------|----------|------|
| Entry | `src/main.js` | Exports `StreakTrackerPlugin` |
| Plugin shell | `src/plugin.js` | Obsidian lifecycle, secondary-mode keys, delegates to store/vault/view |
| UI | `src/ui/tracker-view.js` | Code block rendering, heatmaps, activity rows |
| Settings | `src/settings.js` | Settings tab |
| Store | `src/store/streak-store.js` | In-memory state, `setLog`, `resetActivity`, stats recompute |
| Domain | `src/domain/` | Pure merge, stats, dates, log cell normalization |
| Infra | `src/infra/vault-repository.js`, `sync-coordinator.js` | Vault read/write, debounced `modify`, hash dedup |

Tests: `npm test` → `node --test test/*.test.js`.

---

## Data storage

**`streak-tracker-config.md`** — activity definitions (`activities`, `archivedActivities`).

**`streak-tracker-data.md`** — persisted state (no `stats` field):

- `logs`: `{ "YYYY-MM-DD": { activityId: { state, updatedAt } } }` (legacy string cells normalized on load/save)
- `activityStartDates`, `pausedActivities`, `unpausedActivities`, `activityResetCounts`

**Plugin `data.json`** — `settings` only.

---

## Cross-device sync

Single merge engine: `mergeState()` / `mergeLogs()` in `src/domain/merge.js`.

| Mode | When | Log merge |
|------|------|-----------|
| `bootstrap` | `loadVaultData` | Per-cell LWW by `updatedAt`; pause from file + tombstones |
| `save` | Before write (after user action) | Merge disk into memory; **today**: local wins including deletions; past: LWW |
| `incoming` | `vault.on("modify")`, hash ≠ last write | Same as save for today; past days LWW |

Pause/unpause: `src/domain/pause-sync.js` — save path keeps in-memory pause maps; incoming uses `mergePausedOnIncoming`.

Hash dedup: `VaultRepository._lastDataWriteHash` / `_lastConfigWriteHash`. Incoming handler debounced 500ms in `SyncCoordinator`.

---

## Lifecycle

```
onload()
  └── StreakStore + VaultRepository + TrackerView + SyncCoordinator
  └── loadPluginData() → settings; migrateJsonToMd(); loadVaultData()
  └── recalculateAllStats()
  └── registerMarkdownCodeBlockProcessor → view.renderTracker
  └── registerInterval → checkDayChange
  └── vault.on("modify") → syncCoordinator
  └── onLayoutReady → retry loadVaultData if needed
```

---

## Stats

`calculateStats` / `calculateWeeklyStats` in `src/domain/stats.js` — derived only, stored in memory under `state.stats` for UI, not written to vault.

Paused activities: stats frozen at pause date (`pausedSince` substituted for today).

---

## Day boundary

`getCurrentDay(dayEndTime)` in `src/domain/dates.js` — before `dayEndTime` counts as previous calendar day.

---

## Manual multi-device checklist

1. Phone: check an activity today → desktop tracker shows success without Refresh.
2. Desktop: unpause an activity → phone does not show stale paused after sync.
3. Both devices: edit different past days offline → both logs present after sync (newer `updatedAt` per cell).
4. Settings → Refresh UI reloads vault without overwriting with stale memory.
5. Deselect today on one device → today not restored from older file on save.
