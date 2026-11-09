"use strict";

// Home Screen and Lock Screen widgets: publishes a small summary of today
// (the workout, the training-block week, the muscles furthest behind on weekly
// sets, and the 7-day body-weight average) to the iOS app, which stores it in
// the App Group for the widget extension. Loaded after health.js.

const WIDGET_SUMMARY_VERSION = 1;
const WIDGET_PUBLISH_DELAY_MS = 1000;
const WIDGET_BEHIND_LIMIT = 4;
let lastWidgetSummary = "";
let widgetPublishTimer = null;

function nativeWidgetBridge() {
  return window.webkit?.messageHandlers?.peaksetWidget || null;
}

// Shorter than renderBlockStatusLine: a widget line holds about 25 characters.
function widgetBlockLine(info) {
  if (!info) return "";
  if (info.status === "upcoming") {
    const start = parseDateKey(state.trainingBlock?.startDate);
    return start ? `Block starts ${start.toLocaleDateString(reportLocale(), { month: "short", day: "numeric" })}` : "";
  }
  if (info.status !== "active") return "";
  return `Week ${info.weekNumber} of ${info.length} · ${info.deload ? "Deload" : `${info.targetRir} RIR`}`;
}

// The same muscles the Today tab's "This week" card lists, furthest behind first.
function widgetBehindMuscles(info, limit = WIDGET_BEHIND_LIMIT) {
  const totals = weeklyHardSets();
  return MUSCLE_GROUPS
    .map((group) => ({ group, value: Number(totals[group.key]) || 0, target: groupWeeklyTarget(group, info) }))
    .filter(({ value, target }) => value < target.low)
    .sort((a, b) => (b.target.low - b.value) - (a.target.low - a.value))
    .slice(0, limit)
    .map(({ group, value, target }) => ({ label: group.label, sets: Number(value.toFixed(1)), low: target.low, high: target.high }));
}

function latestWorkoutFinishedToday(now = new Date()) {
  const today = now.toDateString();
  return (state.workoutLogs || [])
    .filter((log) => Number.isFinite(Date.parse(log?.date)) && new Date(log.date).toDateString() === today)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] || null;
}

function buildWidgetSummary(now = new Date()) {
  const info = blockWeekInfo();
  const plan = todaysSelectedPlan();
  const done = latestWorkoutFinishedToday(now);
  const workout = state.activeWorkout;
  const activeSets = workout ? workout.exercises.flatMap((exercise) => exercise.sets) : [];
  const average = weeklyAverageWeight();
  return {
    version: WIDGET_SUMMARY_VERSION,
    // Local calendar day: the widget treats a summary from another day as stale.
    day: dateKey(now),
    title: String(plan?.title || ""),
    exerciseCount: knownPlanExercises(todayPreviewPlan(plan)).length,
    doneToday: Boolean(done),
    doneTitle: String(done?.title || ""),
    active: Boolean(workout),
    activeTitle: String(workout?.title || ""),
    completedSets: activeSets.filter((set) => set.done).length,
    totalSets: activeSets.length,
    blockLine: widgetBlockLine(info),
    behind: widgetBehindMuscles(info),
    weightAverage: Number.isFinite(average) && average > 0 ? Math.round(average * 10) / 10 : null,
    unit: weightUnit()
  };
}

function publishWidgetSummary() {
  if (widgetPublishTimer) clearTimeout(widgetPublishTimer);
  widgetPublishTimer = null;
  const bridge = nativeWidgetBridge();
  if (!bridge) return;
  const summary = JSON.stringify(buildWidgetSummary());
  if (summary === lastWidgetSummary) return;
  lastWidgetSummary = summary;
  bridge.postMessage({ summary });
}

function scheduleWidgetSummary() {
  if (!nativeWidgetBridge() || widgetPublishTimer) return;
  widgetPublishTimer = setTimeout(publishWidgetSummary, WIDGET_PUBLISH_DELAY_MS);
}

// Every state change goes through saveState, so the widget follows along.
const baseSaveStateForWidget = saveState;
saveState = function saveStateAndPublishWidget(...args) {
  const saved = baseSaveStateForWidget(...args);
  // The rest timer saves in the background every second; nothing the widget
  // shows changes then.
  if (!args[0]?.background) scheduleWidgetSummary();
  return saved;
};

// Leaving the app sends the latest summary at once (a pending debounce would
// be suspended with the page); coming back on a new day refreshes "today".
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (widgetPublishTimer) publishWidgetSummary();
  } else {
    scheduleWidgetSummary();
  }
});

publishWidgetSummary();
