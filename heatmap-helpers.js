// Pure heatmap helpers (tested via node:test; inlined in main.js for Obsidian).

function isPerfectHeatmapCell(done, total) {
  return total > 0 && done === total;
}

module.exports = { isPerfectHeatmapCell };
