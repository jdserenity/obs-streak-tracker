const { isPerfectHeatmapCell } = require("../domain/heatmap-helpers");
const { getLogState } = require("../domain/logs");

class TrackerView {
  constructor(plugin) {
    this.plugin = plugin;
    this._renderingEls = null;
    this._pendingRerender = null;
  }

  async renderTracker(el) {
    this.plugin._trackerElements.add(el);

    // Prevent concurrent renders for the same element. If a render is already
    // in progress, mark a pending re-render and return — the in-progress render
    // will do one final pass once it finishes, using the latest data.
    if (!this._renderingEls) this._renderingEls = new WeakSet();
    if (!this._pendingRerender) this._pendingRerender = new WeakSet();
    if (this._renderingEls.has(el)) {
      this._pendingRerender.add(el);
      return;
    }
    this._renderingEls.add(el);

    const config = await this.plugin.loadActivityConfig();

    // Keep activityConfigMap in sync so calculateStats can find frequency info
    this.plugin.store.activityConfigMap = {};
    for (const a of config.activities) {
      this.plugin.store.activityConfigMap[a.id] = a;
    }

    // Render into a detached container first to avoid scroll jumps
    const container = document.createElement("div");
    container.className = "streak-tracker-container";

    this.plugin._wireTrackerSecondaryMode(el, container);

    if (config.activities.length === 0) {
      container.createEl("p", {
        text: "No activities configured. Create an Archive/streak-tracker-config.md file in your vault.",
        cls: "streak-tracker-empty"
      });
    } else {
      const currentDay = this.plugin.getCurrentDay();
      const currentLog = this.plugin.data.logs[currentDay] || {};

      // Get current year for heatmap
      const currentYear = new Date().getFullYear();

      const dailyActivities = config.activities.filter(a => a.frequency !== "weekly");
      const weeklyActivities = config.activities.filter(a => a.frequency === "weekly");

      // Recalculate weekly stats now that activityConfigMap is populated
      for (const activity of weeklyActivities) {
        this.plugin.calculateWeeklyStats(activity.id, activity.weeklyTarget || 1);
      }

      // Daily heatmap — all activities including paused (historical logs are preserved)
      this.renderHeatmap(container, dailyActivities, currentYear);

      // Weekly heatmap (red, single row)
      if (weeklyActivities.length > 0) {
        this.renderWeeklyHeatmap(container, weeklyActivities, currentYear);
      }

      // Render activities
      const activitiesContainer = container.createDiv({ cls: "streak-activities" });

      if (dailyActivities.length > 0 && weeklyActivities.length > 0) {
        activitiesContainer.createEl("div", { text: "Daily", cls: "streak-section-label" });
      }
      for (const activity of dailyActivities) {
        this.renderActivity(activitiesContainer, activity, getLogState(currentLog[activity.id]));
      }
      if (weeklyActivities.length > 0) {
        activitiesContainer.createEl("div", { text: "Weekly", cls: "streak-section-label" });
        for (const activity of weeklyActivities) {
          this.renderActivity(activitiesContainer, activity, getLogState(currentLog[activity.id]));
        }
      }
    }

    // Atomic update
    el.replaceChildren(container);
    this.plugin._syncSecondaryModeClass();

    // Release lock; if a render was requested while we were in progress, do it now.
    this._renderingEls.delete(el);
    if (this._pendingRerender.has(el)) {
      this._pendingRerender.delete(el);
      await this.plugin.renderTracker(el);
    }
  }

  renderActivity(container, activity, currentState) {
    if (activity.frequency === "weekly") {
      this.renderWeeklyActivity(container, activity);
    } else {
      this.renderDailyActivity(container, activity, currentState);
    }
  }

  renderDailyActivity(container, activity, currentState) {
    const isPaused = !!(this.plugin.data.pausedActivities?.[activity.id]);
    const activityEl = container.createDiv({ cls: `streak-activity${isPaused ? " streak-activity-paused" : ""}` });

    // Header row with buttons, name, and stats all inline
    const headerRow = activityEl.createDiv({ cls: "streak-activity-header" });

    // Buttons (checkmark and X) on the left
    const buttonsEl = headerRow.createDiv({ cls: "streak-buttons" });

    const successBtn = buttonsEl.createEl("button", {
      text: "✓",
      cls: `streak-btn streak-btn-success streak-btn-primary ${currentState === "success" ? "streak-btn-active" : ""}`,
      attr: { title: "Mark as success" }
    });

    successBtn.addEventListener("click", async () => {
      const newState = currentState === "success" ? "none" : "success";
      await this.plugin.saveLog(activity.id, newState);

      const trackerEl = container.closest(".streak-tracker-container");
      if (trackerEl) await this.plugin.renderTracker(trackerEl.parentElement);
    });

    if (activity.canFail) {
      const failBtn = buttonsEl.createEl("button", {
        text: "✗",
        cls: `streak-btn streak-btn-fail streak-btn-primary ${currentState === "failed" ? "streak-btn-active" : ""}`,
        attr: { title: "Mark as failed" }
      });

      failBtn.addEventListener("click", async () => {
        const newState = currentState === "failed" ? "none" : "failed";
        await this.plugin.saveLog(activity.id, newState);

        const trackerEl = container.closest(".streak-tracker-container");
        if (trackerEl) await this.plugin.renderTracker(trackerEl.parentElement);
      });
    }

    // Secondary mode: pause/resume button (only visible when modifier is held)
    const pauseBtn = buttonsEl.createEl("button", {
      text: isPaused ? "▶" : "⏸",
      cls: "streak-btn streak-btn-pause streak-btn-secondary",
      attr: { title: isPaused ? "Resume activity" : "Pause activity" }
    });
    // Use mousedown instead of click so the action fires before the modifier keyup
    // event can remove secondary mode and hide this button mid-interaction.
    pauseBtn.addEventListener("mousedown", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.plugin.data.pausedActivities) this.plugin.data.pausedActivities = {};
      if (isPaused) {
        delete this.plugin.data.pausedActivities[activity.id];
        if (!this.plugin.data.unpausedActivities) this.plugin.data.unpausedActivities = {};
        this.plugin.data.unpausedActivities[activity.id] = this.plugin.getCurrentDay();
      } else {
        this.plugin.data.pausedActivities[activity.id] = this.plugin.getCurrentDay();
        delete this.plugin.data.unpausedActivities?.[activity.id];
      }
      await this.plugin.recalculateAllStats();
      await this.plugin.saveVaultData();
      await this.plugin.refreshAllTrackers();
    });

    this.plugin.renderResetStatsButton(buttonsEl, activity);

    const archiveBtnEl = buttonsEl.createEl("button", {
      text: "🗃",
      cls: "streak-btn streak-btn-archive streak-btn-secondary",
      attr: { title: "Archive activity (stored under archivedActivities in config; hidden here)" }
    });
    archiveBtnEl.addEventListener("mousedown", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.plugin.archiveActivity(activity);
    });

    this.renderActivityNameAndStats(activityEl, headerRow, activity, "daily");

    if (isPaused) {
      activityEl.createDiv({ cls: "streak-pause-overlay" });
    }
  }

  parseScheduledDays(scheduledDays) {
    const map = {
      sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
      wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5,
      sat: 6, saturday: 6
    };
    return scheduledDays.map(d => map[d.toLowerCase()]).filter(d => d !== undefined);
  }

  renderWeeklyActivity(container, activity) {
    const isPaused = !!(this.plugin.data.pausedActivities?.[activity.id]);
    const weeklyTarget = activity.weeklyTarget || 1;
    const today = this.plugin.getCurrentDay();
    const weekStart = this.plugin.getISOWeekStart(today);
    const weekDays = this.plugin.getWeekDays(weekStart);

    const activityEl = container.createDiv({ cls: `streak-activity${isPaused ? " streak-activity-paused" : ""}` });
    const headerRow = activityEl.createDiv({ cls: "streak-activity-header" });
    const buttonsEl = headerRow.createDiv({ cls: "streak-buttons streak-buttons-weekly" });

    let sessionCount = 0;

    if (activity.scheduledDays && activity.scheduledDays.length > 0) {
      const scheduledIndices = this.parseScheduledDays(activity.scheduledDays);
      const DAY_ABBR = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

      for (const dayDate of weekDays) {
        const d = this.plugin.parseDate(dayDate);
        const dayIndex = d.getDay();
        if (!scheduledIndices.includes(dayIndex)) continue;

        const dayLog = this.plugin.data.logs[dayDate]?.[activity.id];
        const isFuture = dayDate > today;
        const isPast = dayDate < today;

        const chip = buttonsEl.createEl("button", { cls: "streak-day-chip streak-btn-primary" });
        chip.createEl("span", { text: DAY_ABBR[dayIndex], cls: "streak-day-chip-label" });

        if (getLogState(dayLog) === "success") {
          chip.classList.add("streak-day-chip-success");
          chip.setAttribute("title", "Click to undo");
          chip.addEventListener("click", async () => {
            await this.plugin.saveLog(activity.id, "none", dayDate);
            await this.plugin.refreshAllTrackers();
          });
        } else if (isPast) {
          chip.classList.add("streak-day-chip-failed");
        } else if (isFuture) {
          chip.classList.add("streak-day-chip-future");
        } else {
          // Today, not yet logged
          chip.classList.add("streak-day-chip-today");
          chip.setAttribute("title", "Log today");
          chip.addEventListener("click", async () => {
            await this.plugin.saveLog(activity.id, "success", today);
            await this.plugin.refreshAllTrackers();
          });
        }
      }

      sessionCount = weekDays.filter(d => {
        const idx = this.plugin.parseDate(d).getDay();
        return scheduledIndices.includes(idx) && getLogState(this.plugin.data.logs[d]?.[activity.id]) === "success";
      }).length;
    } else {
      // Generic: N checkmark buttons
      const sessionsThisWeek = weekDays.filter(
        day => getLogState(this.plugin.data.logs[day]?.[activity.id]) === "success"
      );
      sessionCount = sessionsThisWeek.length;
      const todayLogged = sessionsThisWeek.includes(today);

      for (let i = 0; i < weeklyTarget; i++) {
        const isActive = i < sessionCount;
        const isNext = i === sessionCount && !todayLogged;
        const cls = `streak-btn streak-btn-success streak-btn-primary${isActive ? " streak-btn-active" : ""}${!isActive && !isNext ? " streak-btn-locked" : ""}`;
        const btn = buttonsEl.createEl("button", {
          text: "✓",
          cls,
          attr: { title: isActive ? "Deselect this session" : isNext ? "Log a session" : "" }
        });

        if (isActive) {
          const idx = i;
          btn.addEventListener("click", async () => {
            await this.plugin.saveLog(activity.id, "none", sessionsThisWeek[idx]);
            const trackerEl = container.closest(".streak-tracker-container");
            if (trackerEl) await this.plugin.renderTracker(trackerEl.parentElement);
          });
        } else if (isNext) {
          btn.addEventListener("click", async () => {
            await this.plugin.saveLog(activity.id, "success", today);
            const trackerEl = container.closest(".streak-tracker-container");
            if (trackerEl) await this.plugin.renderTracker(trackerEl.parentElement);
          });
        }
        // locked buttons get no click handler
      }
    }

    // Secondary mode: pause/resume button (only visible when modifier is held)
    const pauseBtn = buttonsEl.createEl("button", {
      text: isPaused ? "▶" : "⏸",
      cls: "streak-btn streak-btn-pause streak-btn-secondary",
      attr: { title: isPaused ? "Resume activity" : "Pause activity" }
    });
    // Use mousedown instead of click so the action fires before the modifier keyup
    // event can remove secondary mode and hide this button mid-interaction.
    pauseBtn.addEventListener("mousedown", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.plugin.data.pausedActivities) this.plugin.data.pausedActivities = {};
      if (isPaused) {
        delete this.plugin.data.pausedActivities[activity.id];
        if (!this.plugin.data.unpausedActivities) this.plugin.data.unpausedActivities = {};
        this.plugin.data.unpausedActivities[activity.id] = this.plugin.getCurrentDay();
      } else {
        this.plugin.data.pausedActivities[activity.id] = this.plugin.getCurrentDay();
        delete this.plugin.data.unpausedActivities?.[activity.id];
      }
      await this.plugin.recalculateAllStats();
      await this.plugin.saveVaultData();
      await this.plugin.refreshAllTrackers();
    });

    this.plugin.renderResetStatsButton(buttonsEl, activity);

    const archiveBtnEl = buttonsEl.createEl("button", {
      text: "🗃",
      cls: "streak-btn streak-btn-archive streak-btn-secondary",
      attr: { title: "Archive activity (stored under archivedActivities in config; hidden here)" }
    });
    archiveBtnEl.addEventListener("mousedown", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.plugin.archiveActivity(activity);
    });

    this.renderActivityNameAndStats(activityEl, headerRow, activity, "weekly", sessionCount, weeklyTarget);

    if (isPaused) {
      activityEl.createDiv({ cls: "streak-pause-overlay" });
    }
  }

  // Shared helper: renders the activity name (with links/description) and stats area.
  // mode is "daily" or "weekly". weekSessionCount and weeklyTarget only used in weekly mode.
  renderActivityNameAndStats(activityEl, headerRow, activity, mode, weekSessionCount = 0, weeklyTarget = 1) {
    // Activity name with link support
    const nameEl = headerRow.createDiv({ cls: "streak-activity-name" });
    const nameParts = this.parseNameWithLinks(activity.name);
    const hasLinks = nameParts.some(p => p.isLink);

    // Apply link color as CSS variable if set
    if (hasLinks && this.plugin.data.settings.linkColor) {
      nameEl.style.setProperty("--streak-link-color", this.plugin.data.settings.linkColor);
    }

    // Description element (create early so we can reference it)
    let descriptionEl = null;
    if (activity.description) {
      descriptionEl = activityEl.createDiv({
        cls: "streak-activity-description collapsed"
      });
      const descTextEl = descriptionEl.createEl("p", {
        attr: { title: "Double-click to edit" }
      });
      this.renderDescriptionText(descTextEl, activity.description);
      descTextEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this.enterDescriptionEditMode(descriptionEl, descTextEl, activity);
      });
    }

    // Render name parts
    for (const part of nameParts) {
      if (part.isLink) {
        const linkSpan = nameEl.createEl("span", {
          text: part.display,
          cls: "streak-name-link"
        });
        linkSpan.addEventListener("click", (e) => {
          e.stopPropagation();
          this.plugin.app.workspace.openLinkText(part.target, "");
        });
      } else {
        const textSpan = nameEl.createEl("span", {
          text: part.text,
          cls: "streak-name-text"
        });
        if (activity.description) {
          textSpan.addEventListener("click", (e) => {
            e.stopPropagation();
            descriptionEl.classList.toggle("collapsed");
          });
        }
      }
    }

    if (activity.description && !hasLinks) {
      nameEl.classList.add("clickable");
      nameEl.addEventListener("click", () => {
        descriptionEl.classList.toggle("collapsed");
      });
    } else if (activity.description && hasLinks) {
      nameEl.classList.add("clickable-parts");
    }

    // Stats display
    const stats = this.plugin.data.stats[activity.id] || {
      currentStreak: 0, longestStreak: 0,
      totalSuccesses: 0, totalDays: 0
    };

    const statsEl = headerRow.createDiv({ cls: "streak-stats" });

    if (mode === "weekly") {
      // Weekly stats: streaks are in weeks, rate is successful-weeks/total-weeks
      const weeklySuccesses = stats.weeklySuccesses ?? 0;
      const totalWeeks = stats.totalDays ?? 0;
      const weekRate = totalWeeks > 0 ? ((weeklySuccesses / totalWeeks) * 100).toFixed(0) : "0";

      statsEl.createEl("span", {
        text: `🔥 ${stats.currentStreak}`,
        cls: "streak-stat streak-current",
        attr: { title: "Current streak (weeks)" }
      });
      statsEl.createEl("span", {
        text: `🔗 ${stats.longestStreak}`,
        cls: "streak-stat streak-longest",
        attr: { title: "Longest streak (weeks)" }
      });
      statsEl.createEl("span", {
        text: `✅ ${weeklySuccesses}/${totalWeeks} : ${weekRate}%`,
        cls: "streak-stat streak-total",
        attr: { title: "Weeks target met / Total weeks tracked" }
      });
      statsEl.createEl("span", {
        text: `${weekSessionCount}/${weeklyTarget} this week`,
        cls: "streak-stat streak-week-progress",
        attr: { title: "Sessions logged this week" }
      });
    } else {
      // Daily stats
      const successRate = stats.totalDays > 0 ? stats.totalSuccesses / stats.totalDays : 0;

      let rateColorCls = "";
      if (successRate >= 0.90) {
        rateColorCls = "streak-rate-green";
      } else if (successRate >= 0.70) {
        rateColorCls = "streak-rate-orange";
      } else if (successRate < 0.30) {
        rateColorCls = "streak-rate-red";
      } else {
        rateColorCls = "streak-rate-blue";
      }

      statsEl.createEl("span", {
        text: `🔥 ${stats.currentStreak}`,
        cls: "streak-stat streak-current",
        attr: { title: "Current streak" }
      });
      statsEl.createEl("span", {
        text: `🔗 ${stats.longestStreak}`,
        cls: "streak-stat streak-longest",
        attr: { title: "Longest streak" }
      });
      const totalEl = statsEl.createEl("span", {
        cls: "streak-stat streak-total",
        attr: { title: "Total successes / Total days tracked" }
      });
      totalEl.appendText(`✅ ${stats.totalSuccesses}/${stats.totalDays} : `);
      totalEl.createEl("span", {
        text: `${successRate.toFixed(2)}%`,
        cls: rateColorCls
      });
    }
  }

  enterDescriptionEditMode(descriptionEl, descTextEl, activity) {
    const originalText = activity.description || "";
    const textarea = document.createElement("textarea");
    textarea.className = "streak-description-editor";
    textarea.value = originalText;
    descTextEl.replaceWith(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const restoreText = (text) => {
      const p = document.createElement("p");
      p.title = "Double-click to edit";
      this.renderDescriptionText(p, text);
      p.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        activity.description = text;
        this.enterDescriptionEditMode(descriptionEl, p, activity);
      });
      textarea.replaceWith(p);
    };

    const commit = async () => {
      const newText = textarea.value.trim();
      if (newText !== originalText) {
        const config = await this.plugin.loadActivityConfig();
        const act = config.activities.find(a => a.id === activity.id);
        if (act) {
          if (newText) {
            act.description = newText;
          } else {
            delete act.description;
          }
          await this.plugin.saveActivityConfig(config);
          activity.description = newText;
        }
      }
      restoreText(newText || originalText);
    };

    const revert = () => {
      restoreText(originalText);
    };

    textarea.addEventListener("blur", commit);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        textarea.removeEventListener("blur", commit);
        revert();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        textarea.removeEventListener("blur", commit);
        commit();
      }
    });
  }

  renderHeatmap(container, activities, year, replaceEl = null) {
    const heatmapContainer = document.createElement("div");
    heatmapContainer.className = "streak-heatmap-container";

    // Year navigation - only show if more than one year of data
    const yearsWithData = this.plugin.getYearsWithData();
    const showYearNav = yearsWithData.length > 1;

    if (showYearNav) {
      const navEl = heatmapContainer.createDiv({ cls: "streak-heatmap-nav" });

      const prevBtn = navEl.createEl("button", {
        text: "‹",
        cls: "streak-nav-btn",
        attr: { title: "Previous year" }
      });

      const yearLabel = navEl.createEl("span", {
        text: year.toString(),
        cls: "streak-year-label"
      });

      const nextBtn = navEl.createEl("button", {
        text: "›",
        cls: "streak-nav-btn",
        attr: { title: "Next year" }
      });

      const currentYear = new Date().getFullYear();

      // Disable next if we're at current year
      if (year >= currentYear) {
        nextBtn.classList.add("streak-nav-btn-disabled");
      } else {
        nextBtn.addEventListener("click", () => {
          this.renderHeatmap(container, activities, year + 1, heatmapContainer);
        });
      }

      // Disable prev if no earlier data exists
      const earliestYear = Math.min(...yearsWithData);
      if (year <= earliestYear) {
        prevBtn.classList.add("streak-nav-btn-disabled");
      } else {
        prevBtn.addEventListener("click", () => {
          this.renderHeatmap(container, activities, year - 1, heatmapContainer);
        });
      }
    }

    // Month labels
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthLabels = heatmapContainer.createDiv({ cls: "streak-heatmap-months" });

    for (const month of months) {
      monthLabels.createEl("span", { text: month, cls: "streak-heatmap-month" });
    }

    // Create the grid wrapper
    const heatmapWrapper = heatmapContainer.createDiv({ cls: "streak-heatmap-wrapper" });

    // Day labels
    const dayLabels = heatmapWrapper.createDiv({ cls: "streak-heatmap-days" });
    const days = ["", "Mon", "", "Wed", "", "Fri", ""];
    for (const day of days) {
      dayLabels.createEl("span", { text: day, cls: "streak-heatmap-day" });
    }

    // Create the grid
    const grid = heatmapWrapper.createDiv({ cls: "streak-heatmap-grid" });

    // Start from Jan 1 of the year
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    // Calculate total weeks in the year
    const startDay = startDate.getDay(); // Day of week for Jan 1
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const totalWeeks = Math.ceil((totalDays + startDay) / 7);

    const dailyActivities = activities.filter(a => a.frequency !== "weekly");
    let currentDate = new Date(startDate);

    for (let week = 0; week < totalWeeks; week++) {
      const weekCol = grid.createDiv({ cls: "streak-heatmap-week" });

      for (let day = 0; day < 7; day++) {
        const cell = weekCol.createDiv({ cls: "streak-heatmap-cell" });

        // Skip days before Jan 1 in first week
        if (week === 0 && day < startDay) {
          cell.classList.add("streak-heatmap-empty");
          continue;
        }

        // Skip days after Dec 31
        if (currentDate > endDate) {
          cell.classList.add("streak-heatmap-empty");
          continue;
        }

        const dateStr = this.plugin.formatDate(currentDate);
        const log = this.plugin.data.logs[dateStr] || {};

        // Calculate completion percentage using only activities that existed on this date
        let successCount = 0;
        let historicalCount = 0;

        for (const activity of dailyActivities) {
          const startedOn = this.plugin.data.activityStartDates[activity.id];
          if (startedOn && startedOn > dateStr) continue; // activity didn't exist yet
          historicalCount++;
          if (getLogState(log[activity.id]) === "success") {
            successCount++;
          }
        }

        // Set intensity level
        let level = 0;
        if (historicalCount > 0) {
          const percentage = (successCount / historicalCount) * 100;
          if (percentage === 100) {
            level = 5;
          } else if (percentage >= 76) {
            level = 4;
          } else if (percentage >= 51) {
            level = 3;
          } else if (percentage >= 26) {
            level = 2;
          } else if (percentage >= 1) {
            level = 1;
          }
        }

        cell.classList.add(`streak-heatmap-level-${level}`);
        cell.setAttribute("data-date", dateStr);
        cell.setAttribute("title", `${dateStr}: ${successCount}/${historicalCount} activities`);
        if (isPerfectHeatmapCell(successCount, historicalCount)) {
          cell.classList.add("streak-heatmap-perfect");
          cell.createEl("span", { text: "✓", cls: "streak-heatmap-check" });
        }

        // Apply custom color if set
        if (this.plugin.data.settings.heatmapColor && level > 0) {
          const opacity = level * 0.2;
          cell.style.backgroundColor = this.hexToRgba(this.plugin.data.settings.heatmapColor, opacity);
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    if (replaceEl) {
      replaceEl.replaceWith(heatmapContainer);
    } else {
      container.appendChild(heatmapContainer);
    }
  }

  getWeeklyYearsWithData(weeklyActivities) {
    const years = new Set();
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    for (const activity of weeklyActivities) {
      const startDate = this.plugin.data.activityStartDates[activity.id];
      if (startDate) years.add(parseInt(startDate.split("-")[0]));
    }
    for (const dateStr of Object.keys(this.plugin.data.logs)) {
      const log = this.plugin.data.logs[dateStr];
      const y = parseInt(dateStr.split("-")[0]);
      for (const activity of weeklyActivities) {
        if (getLogState(log[activity.id]) != null) { years.add(y); break; }
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }

  renderWeeklyHeatmap(container, weeklyActivities, year, replaceEl = null) {
    const heatmapContainer = document.createElement("div");
    heatmapContainer.className = "streak-weekly-heatmap-container";

    const currentYear = new Date().getFullYear();
    const weeklyYears = this.getWeeklyYearsWithData(weeklyActivities);
    const showNav = weeklyYears.length > 1;

    if (showNav) {
      const navEl = heatmapContainer.createDiv({ cls: "streak-heatmap-nav" });
      const prevBtn = navEl.createEl("button", { text: "‹", cls: "streak-nav-btn", attr: { title: "Previous year" } });
      navEl.createEl("span", { text: `${year} weekly`, cls: "streak-year-label" });
      const nextBtn = navEl.createEl("button", { text: "›", cls: "streak-nav-btn", attr: { title: "Next year" } });

      if (year >= currentYear) nextBtn.classList.add("streak-nav-btn-disabled");
      else nextBtn.addEventListener("click", () => {
        this.renderWeeklyHeatmap(container, weeklyActivities, year + 1, heatmapContainer);
      });

      const earliestYear = Math.min(...weeklyYears);
      if (year <= earliestYear) prevBtn.classList.add("streak-nav-btn-disabled");
      else prevBtn.addEventListener("click", () => {
        this.renderWeeklyHeatmap(container, weeklyActivities, year - 1, heatmapContainer);
      });
    }

    // Month labels
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthLabels = heatmapContainer.createDiv({ cls: "streak-heatmap-months streak-weekly-months" });
    for (const month of months) {
      monthLabels.createEl("span", { text: month, cls: "streak-heatmap-month" });
    }

    // Single row of week cells
    const row = heatmapContainer.createDiv({ cls: "streak-weekly-heatmap-row" });

    const jan1 = this.plugin.formatDate(new Date(year, 0, 1));
    const dec31 = this.plugin.formatDate(new Date(year, 11, 31));
    let wStart = this.plugin.getISOWeekStart(jan1);

    while (wStart <= dec31) {
      const weekDays = this.plugin.getWeekDays(wStart);
      const wEnd = weekDays[6];
      const cell = row.createDiv({ cls: "streak-weekly-cell" });

      let completedCount = 0;
      let historicalCount = 0;

      for (const activity of weeklyActivities) {
        const startedOn = this.plugin.data.activityStartDates[activity.id];
        if (startedOn && startedOn > wEnd) continue; // activity didn't exist yet
        historicalCount++;
        const weeklyTarget = activity.weeklyTarget || 1;
        let sessions = 0;
        for (const day of weekDays) {
          if (getLogState(this.plugin.data.logs[day]?.[activity.id]) === "success") sessions++;
        }
        if (sessions >= weeklyTarget) completedCount++;
      }

      let level = 0;
      if (historicalCount > 0) {
        const pct = (completedCount / historicalCount) * 100;
        if (pct === 100) level = 5;
        else if (pct >= 76) level = 4;
        else if (pct >= 51) level = 3;
        else if (pct >= 26) level = 2;
        else if (pct >= 1) level = 1;
      }

      cell.classList.add(`streak-weekly-level-${level}`);
      if (isPerfectHeatmapCell(completedCount, historicalCount)) {
        cell.classList.add("streak-weekly-perfect");
        cell.createEl("span", { text: "✓", cls: "streak-weekly-check" });
      }
      const wEndDate = this.plugin.parseDate(wStart);
      wEndDate.setDate(wEndDate.getDate() + 6);
      const fmtDate = (d) => {
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return `${months[d.getMonth()]} ${d.getDate()}`;
      };
      const wStartDate = this.plugin.parseDate(wStart);
      const rangeLabel = `${fmtDate(wStartDate)} – ${fmtDate(wEndDate)}`;
      cell.setAttribute("title", `${rangeLabel}: ${completedCount}/${historicalCount} activities met target`);

      const next = this.plugin.parseDate(wStart);
      next.setDate(next.getDate() + 7);
      wStart = this.plugin.formatDate(next);
    }

    if (replaceEl) {
      replaceEl.replaceWith(heatmapContainer);
    } else {
      container.appendChild(heatmapContainer);
    }
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  renderDescriptionText(el, text) {
    while (el.firstChild) el.removeChild(el.firstChild);
    const lines = (text || "").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const parts = this.parseNameWithLinks(lines[i]);
      for (const part of parts) {
        if (part.isLink) {
          const span = document.createElement("span");
          span.textContent = part.display;
          span.className = "streak-name-link";
          if (this.plugin.data.settings.linkColor) {
            span.style.setProperty("--streak-link-color", this.plugin.data.settings.linkColor);
          }
          span.addEventListener("click", (e) => {
            e.stopPropagation();
            this.plugin.app.workspace.openLinkText(part.target, "");
          });
          el.appendChild(span);
        } else if (part.text) {
          el.appendChild(document.createTextNode(part.text));
        }
      }
      if (i < lines.length - 1) {
        el.appendChild(document.createElement("br"));
      }
    }
  }

  parseNameWithLinks(name) {
    const parts = [];
    const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(name)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push({ isLink: false, text: name.slice(lastIndex, match.index) });
      }

      // Add the link
      const target = match[1]; // The actual link target
      const display = match[2] || match[1]; // Display text (alias) or target
      parts.push({ isLink: true, target, display });

      lastIndex = regex.lastIndex;
    }

    // Add remaining text after last link
    if (lastIndex < name.length) {
      parts.push({ isLink: false, text: name.slice(lastIndex) });
    }

    // If no parts were found, the whole name is plain text
    if (parts.length === 0) {
      parts.push({ isLink: false, text: name });
    }

    return parts;
  }
}

module.exports = { TrackerView };
