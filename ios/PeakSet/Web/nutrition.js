"use strict";

// Nutrition for bodybuilders: daily calorie and macro targets (with a
// suggested starting point from body weight and phase, plus an optional prep
// high day), a daily log, and an Apple Health import of daily totals from
// MacroFactor, MyFitnessPal and similar apps. One entry per day: a day logged
// by hand always wins over that day's Health totals, and Health days are kept
// apart (healthLog) so they never reach iCloud backups. Loaded after health.js.

const NUTRITION_FIELDS = ["kcal", "protein", "carbs", "fat"];
const NUTRITION_LABELS = { kcal: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat" };
const NUTRITION_LIMITS = { kcal: 20000, protein: 2000, carbs: 3000, fat: 1000 };
const NUTRITION_HEALTH_INITIAL_DAYS = 90;
const NUTRITION_HEALTH_RESYNC_OVERLAP_DAYS = 3;
const NUTRITION_HEALTH_AUTO_SYNC_MS = 15 * 60000;
const NUTRITION_HEALTH_KEEP_DAYS = 400;
const NUTRITION_MANUAL_KEEP = 800;
const NUTRITION_HIGH_DAYS_KEEP = 200;
const NUTRITION_COACH_DAYS_KEEP = 120;
const NUTRITION_WINDOW_DAYS = 7;
// A logged day is on target when calories land within 10% of the day's target
// and protein reaches at least 90% of it.
const NUTRITION_KCAL_TOLERANCE = 0.1;
const NUTRITION_PROTEIN_FLOOR = 0.9;
const NUTRITION_DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const NUTRITION_DRAFT_FIELD = /^nut[A-Z]/;
let nutritionSyncInFlight = false;
let nutritionEditOpen = false;
let nutritionFormBeingSaved = null;

// ---------- Values ----------

function nutritionNumber(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > NUTRITION_LIMITS[field]) return null;
  return Math.round(number);
}

function nutritionTotals(source) {
  return Object.fromEntries(NUTRITION_FIELDS.map((field) => [field, nutritionNumber(source?.[field], field)]));
}

function hasNutritionValue(totals) {
  return NUTRITION_FIELDS.some((field) => totals?.[field] !== null && totals?.[field] !== undefined);
}

function isNutritionDayKey(value) {
  const text = String(value || "");
  if (!NUTRITION_DAY_KEY.test(text)) return false;
  const date = parseDateKey(text);
  return Boolean(date) && dateKey(date) === text;
}

function todayNutritionKey() {
  return dateKey(new Date());
}

// Calories for a day: as logged, or from the macros (4/4/9) when only those were.
function nutritionDayKcal(entry) {
  if (!entry) return null;
  if (entry.kcal !== null && entry.kcal !== undefined) return entry.kcal;
  const { protein, carbs, fat } = entry;
  return [protein, carbs, fat].every((value) => value !== null && value !== undefined) ? protein * 4 + carbs * 4 + fat * 9 : null;
}

function cleanNutritionEntry(entry, fromHealth) {
  if (!entry || typeof entry !== "object") return null;
  const day = String(entry.date || "");
  if (!isNutritionDayKey(day)) return null;
  const totals = nutritionTotals(entry);
  if (!hasNutritionValue(totals)) return null;
  return { id: `${fromHealth ? "hk-n" : "n"}-${day}`, date: day, ...totals, ...(fromHealth ? { source: "healthkit" } : {}) };
}

function cleanNutritionTargets(targets) {
  if (!targets || typeof targets !== "object") return null;
  const totals = nutritionTotals(targets);
  if (totals.kcal === null || totals.kcal <= 0) {
    // Macros alone still define a calorie target.
    const fromMacros = nutritionDayKcal({ ...totals, kcal: null });
    if (!(fromMacros > 0)) return null;
    totals.kcal = fromMacros;
  }
  return totals;
}

function isNutritionHealthEntry(entry) {
  return String(entry?.id || "").startsWith("hk-") || entry?.source === "healthkit" || entry?.fromHealth === true;
}

function sortNewestDayFirst(list) {
  return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function uniqueNutritionDays(list, fromHealth) {
  const byDay = new Map();
  (Array.isArray(list) ? list : []).forEach((item) => {
    const entry = cleanNutritionEntry(item, fromHealth);
    if (entry) byDay.set(entry.date, entry);
  });
  return sortNewestDayFirst([...byDay.values()]);
}

// Coach roster copy of an athlete's nutrition (from their check-ins).
function cleanAthleteNutrition(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const asOf = isNutritionDayKey(raw.asOf) ? raw.asOf : null;
  if (!asOf) return null;
  const rangeDays = Math.max(1, Math.min(366, Math.round(Number(raw.rangeDays)) || 7));
  const byDay = new Map();
  (Array.isArray(raw.days) ? raw.days : []).forEach((item) => {
    const fromHealth = isNutritionHealthEntry(item);
    const entry = cleanNutritionEntry(item, fromHealth);
    if (!entry || entry.date > asOf) return;
    const { source, ...rest } = entry;
    byDay.set(entry.date, { ...rest, ...(fromHealth ? { fromHealth: true } : {}), ...(item.highDay === true ? { highDay: true } : {}) });
  });
  const updatedAt = Number.isFinite(Date.parse(raw.updatedAt)) ? new Date(Date.parse(raw.updatedAt)).toISOString() : null;
  return {
    ...(updatedAt ? { updatedAt } : {}),
    asOf,
    rangeDays,
    targets: cleanNutritionTargets(raw.targets),
    highDay: cleanNutritionTargets(raw.highDay),
    targetsSuggested: raw.targetsSuggested === true,
    days: sortNewestDayFirst([...byDay.values()]).slice(0, NUTRITION_COACH_DAYS_KEEP)
  };
}

function nutritionMigrateState() {
  const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
  const current = isObject(state.nutrition) ? state.nutrition : {};
  const health = isObject(current.health) ? current.health : {};
  const validTime = (value) => (Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null);
  const resyncFrom = validTime(health.resyncFrom);
  state.nutrition = {
    targets: cleanNutritionTargets(current.targets),
    highDay: cleanNutritionTargets(current.highDay),
    targetsSuggested: current.targetsSuggested === true,
    highDays: [...new Set((Array.isArray(current.highDays) ? current.highDays : []).filter(isNutritionDayKey))].sort().slice(-NUTRITION_HIGH_DAYS_KEEP),
    log: uniqueNutritionDays(current.log, false).slice(0, NUTRITION_MANUAL_KEEP),
    healthLog: uniqueNutritionDays(current.healthLog, true),
    health: {
      enabled: health.enabled === true,
      lastSyncAt: validTime(health.lastSyncAt),
      lastResult: typeof health.lastResult === "string" ? health.lastResult.slice(0, 300) : "",
      ...(resyncFrom ? { resyncFrom } : {}),
      ...(health.pendingAuthorization === true ? { pendingAuthorization: true } : {})
    }
  };
  // Restored roster entries skip the import-time checks.
  Object.values(isObject(state.coach?.athletes) ? state.coach.athletes : {}).forEach((athlete) => {
    if (!isObject(athlete) || !("nutrition" in athlete)) return;
    const cleaned = cleanAthleteNutrition(athlete.nutrition);
    if (cleaned) athlete.nutrition = cleaned;
    else delete athlete.nutrition;
  });
}

nutritionMigrateState();

// Other modules' resets replace state (and render) before this module's
// reset runs; every entry point re-defaults the nutrition fields first.
function nutritionReady() {
  const nutrition = state.nutrition;
  if (!nutrition || typeof nutrition !== "object" || !Array.isArray(nutrition.log) || !Array.isArray(nutrition.healthLog) || !Array.isArray(nutrition.highDays) || !nutrition.health || typeof nutrition.health !== "object") nutritionMigrateState();
  return state.nutrition;
}

// ---------- Days ----------

function manualNutritionDay(day) {
  nutritionReady();
  return state.nutrition.log.find((entry) => entry.date === day) || null;
}

// The day's entry: hand-logged if there is one, otherwise Apple Health's.
function nutritionDayEntry(day) {
  nutritionReady();
  return manualNutritionDay(day) || state.nutrition.healthLog.find((entry) => entry.date === day) || null;
}

function nutritionEntries() {
  nutritionReady();
  const byDay = new Map();
  state.nutrition.healthLog.forEach((entry) => byDay.set(entry.date, entry));
  state.nutrition.log.forEach((entry) => byDay.set(entry.date, entry));
  return sortNewestDayFirst([...byDay.values()]);
}

function isNutritionHighDay(day, nutrition = nutritionReady()) {
  return Boolean(nutrition?.highDay) && Array.isArray(nutrition.highDays) && nutrition.highDays.includes(day);
}

function nutritionTargetFor(day, nutrition = nutritionReady(), highDay = isNutritionHighDay(day, nutrition)) {
  return highDay && nutrition.highDay ? nutrition.highDay : nutrition.targets || null;
}

// Averages and adherence over the full days before `endDay` (today is still
// being eaten, so it would drag every average down). Works on the athlete's
// own log and on a coach's copy of an athlete's check-in.
function summarizeNutrition(entries, nutrition, endDay, windowDays = NUTRITION_WINDOW_DAYS, isHigh = (entry) => isNutritionHighDay(entry.date, nutrition)) {
  const end = parseDateKey(endDay) || new Date();
  const days = Array.from({ length: windowDays }, (_, index) => dateKey(addDays(end, -(index + 1))));
  const byDay = new Map((Array.isArray(entries) ? entries : []).map((entry) => [entry.date, entry]));
  const logged = days.map((day) => byDay.get(day)).filter(Boolean);
  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
  const avg = {};
  const avgTarget = {};
  NUTRITION_FIELDS.forEach((field) => {
    const pairs = logged.map((entry) => ({ value: field === "kcal" ? nutritionDayKcal(entry) : entry[field], target: nutritionTargetFor(entry.date, nutrition, isHigh(entry))?.[field] }));
    avg[field] = mean(pairs.map((pair) => pair.value).filter((value) => value !== null && value !== undefined));
    // Target averaged over the days that logged this value, so high days and
    // missed days compare like with like.
    avgTarget[field] = mean(pairs.filter((pair) => pair.value !== null && pair.value !== undefined && pair.target > 0).map((pair) => pair.target));
  });
  let judged = 0;
  let onTarget = 0;
  logged.forEach((entry) => {
    const target = nutritionTargetFor(entry.date, nutrition, isHigh(entry));
    const kcal = nutritionDayKcal(entry);
    if (!(target?.kcal > 0) || kcal === null) return;
    judged += 1;
    const kcalOk = Math.abs(kcal - target.kcal) <= target.kcal * NUTRITION_KCAL_TOLERANCE;
    const proteinOk = !(target.protein > 0) || (entry.protein !== null && entry.protein >= target.protein * NUTRITION_PROTEIN_FLOOR);
    if (kcalOk && proteinOk) onTarget += 1;
  });
  return {
    windowDays,
    start: days[days.length - 1],
    end: days[0],
    loggedDays: logged.length,
    healthDays: logged.filter(isNutritionHealthEntry).length,
    judgedDays: judged,
    onTarget,
    adherence: judged ? onTarget / judged : null,
    avg,
    avgTarget
  };
}

function ownNutritionSummary(windowDays = NUTRITION_WINDOW_DAYS) {
  return summarizeNutrition(nutritionEntries(), state.nutrition, todayNutritionKey(), windowDays);
}

// ---------- Suggested starting point ----------

function nutritionBodyweight() {
  // A hand-logged weigh-in first; the newest of any kind otherwise.
  const own = state.weightLogs.find((entry) => !String(entry.id || "").startsWith("hk-") && Number(entry.bodyweight) > 0);
  const any = state.weightLogs.find((entry) => Number(entry.bodyweight) > 0);
  const value = Number(own?.bodyweight ?? any?.bodyweight ?? state.profile?.bodyweight);
  return value > 0 ? value : null;
}

// A starting point only: protein about 1 g per lb (2.2 g/kg), maintenance
// about 15 kcal per lb, +10% to bulk, -20% for prep, maintenance otherwise.
// During prep the high (refeed) day goes back to maintenance through carbs.
function suggestedNutritionTargets(phase = state.phase, bodyweight = nutritionBodyweight(), units = state.units) {
  const value = Number(bodyweight);
  if (!(value > 0)) return null;
  const pounds = units === "metric" ? value / KG_PER_LB : value;
  if (pounds < 70 || pounds > 700) return null;
  const round = (number, step) => Math.round(number / step) * step;
  const maintenance = pounds * 15;
  const factor = { bulking: 1.1, prep: 0.8 }[phase] ?? 1;
  const protein = round(pounds, 5);
  const fat = round(pounds * (phase === "prep" ? 0.3 : 0.4), 5);
  const build = (kcal) => ({ kcal, protein, carbs: Math.max(0, round((kcal - protein * 4 - fat * 9) / 4, 5)), fat });
  return {
    phase: { bulking: "bulking", prep: "prep", travel: "travel" }[phase] || "offseason",
    maintenance: round(maintenance, 50),
    targets: build(round(maintenance * factor, 50)),
    highDay: phase === "prep" ? build(round(maintenance, 50)) : null
  };
}

function suggestionExplanation(suggestion) {
  const perUnit = isMetric() ? "2.2 g per kg" : "1 g per lb";
  const change = { bulking: "a 10% surplus for bulking", prep: "a 20% deficit for prep", travel: "maintenance while travelling", offseason: "maintenance for the off-season" }[suggestion.phase];
  return `Protein about ${perUnit} of body weight, about ${Math.round(suggestion.maintenance).toLocaleString(reportNumberLocale())} kcal maintenance, and ${change}.`;
}

// ---------- Logging ----------

function readNutritionInputs(prefix) {
  const read = (field) => document.getElementById(`${prefix}${field[0].toUpperCase()}${field.slice(1)}`)?.value;
  const raw = Object.fromEntries(NUTRITION_FIELDS.map((field) => [field, read(field)]));
  const values = nutritionTotals(raw);
  const invalid = NUTRITION_FIELDS.some((field) => raw[field] !== undefined && raw[field] !== null && String(raw[field]).trim() !== "" && values[field] === null);
  return { values, invalid };
}

function withNutritionForm(fields, action) {
  nutritionFormBeingSaved = fields;
  try {
    return action();
  } finally {
    nutritionFormBeingSaved = null;
  }
}

function upsertManualNutritionDay(day, totals) {
  const entry = { id: `n-${day}`, date: day, ...totals };
  state.nutrition.log = sortNewestDayFirst([entry, ...state.nutrition.log.filter((item) => item.date !== day)]).slice(0, NUTRITION_MANUAL_KEEP);
  return entry;
}

function quickAddNutrition() {
  nutritionReady();
  return withNutritionForm(/^nutAdd/, () => {
    const { values, invalid } = readNutritionInputs("nutAdd");
    if (invalid) return toast("Enter calories and grams as positive numbers.");
    const added = { ...values };
    if (added.kcal === null) added.kcal = [added.protein, added.carbs, added.fat].some((value) => value !== null) ? (added.protein || 0) * 4 + (added.carbs || 0) * 4 + (added.fat || 0) * 9 : null;
    if (!NUTRITION_FIELDS.some((field) => added[field] > 0)) return toast("Enter calories or grams of protein, carbs, or fat to add.");
    const day = todayNutritionKey();
    const manual = manualNutritionDay(day);
    const healthDay = state.nutrition.healthLog.find((entry) => entry.date === day);
    if (!manual && healthDay && !window.confirm("Today's totals come from Apple Health. Logging food here starts a hand-logged day that replaces them for today. Continue?")) return false;
    const base = manual || { kcal: null, protein: null, carbs: null, fat: null };
    const next = Object.fromEntries(NUTRITION_FIELDS.map((field) => [field, added[field] === null ? base[field] : Math.min(NUTRITION_LIMITS[field], (base[field] || 0) + added[field])]));
    upsertManualNutritionDay(day, next);
    saveState();
    toast("Added to today.");
    render();
    return true;
  });
}

function toggleNutritionEdit(open = !nutritionEditOpen) {
  nutritionEditOpen = Boolean(open);
  render();
}

function saveNutritionDay() {
  nutritionReady();
  return withNutritionForm(/^nutEdit/, () => {
    const { values, invalid } = readNutritionInputs("nutEdit");
    if (invalid) return toast("Enter calories and grams as positive numbers.");
    const day = todayNutritionKey();
    if (!hasNutritionValue(values)) {
      state.nutrition.log = state.nutrition.log.filter((entry) => entry.date !== day);
    } else {
      upsertManualNutritionDay(day, values);
    }
    nutritionEditOpen = false;
    saveState();
    toast("Today's totals saved.");
    render();
    return true;
  });
}

function clearNutritionDay(day = todayNutritionKey()) {
  nutritionReady();
  if (!isNutritionDayKey(day) || !manualNutritionDay(day)) return false;
  const fromHealth = state.nutrition.healthLog.some((entry) => entry.date === day);
  if (!window.confirm(`Clear the food you logged for ${formatShortDate(day)}?${fromHealth ? " That day's Apple Health totals will show again." : ""}`)) return false;
  state.nutrition.log = state.nutrition.log.filter((entry) => entry.date !== day);
  if (day === todayNutritionKey()) nutritionEditOpen = false;
  saveState();
  toast("Day cleared.");
  render();
  return true;
}

function toggleNutritionHighDay(day = todayNutritionKey()) {
  nutritionReady();
  if (!isNutritionDayKey(day)) return;
  const days = new Set(state.nutrition.highDays);
  if (days.has(day)) days.delete(day);
  else days.add(day);
  state.nutrition.highDays = [...days].sort().slice(-NUTRITION_HIGH_DAYS_KEEP);
  saveState();
  render();
}

// ---------- Targets ----------

function saveNutritionTargets() {
  nutritionReady();
  return withNutritionForm(/^nut(Target|High)/, () => {
    const daily = readNutritionInputs("nutTarget");
    const high = readNutritionInputs("nutHigh");
    if (daily.invalid || high.invalid) return toast("Enter targets as positive numbers.");
    const targets = cleanNutritionTargets(daily.values);
    if (!targets) return toast("Enter a calorie target, or protein, carbs and fat.");
    const highDay = hasNutritionValue(high.values) ? cleanNutritionTargets(high.values) : null;
    if (hasNutritionValue(high.values) && !highDay) return toast("Enter high-day calories, or its protein, carbs and fat.");
    const suggestion = suggestedNutritionTargets();
    const same = (a, b) => Boolean(a) === Boolean(b) && (!a || NUTRITION_FIELDS.every((field) => a[field] === b[field]));
    state.nutrition.targets = targets;
    state.nutrition.highDay = highDay;
    state.nutrition.targetsSuggested = Boolean(suggestion) && same(targets, suggestion.targets);
    saveState();
    toast("Nutrition targets saved.");
    render();
    return true;
  });
}

function applySuggestedNutritionTargets() {
  nutritionReady();
  const suggestion = suggestedNutritionTargets();
  if (!suggestion) return toast("Log a body weight first; the starting point is based on it.");
  state.nutrition.targets = { ...suggestion.targets };
  if (suggestion.highDay) state.nutrition.highDay = { ...suggestion.highDay };
  state.nutrition.targetsSuggested = true;
  saveState();
  toast("Starting point set. Adjust it as your weekly weight trend comes in.");
  render();
  return true;
}

function clearNutritionTargets() {
  nutritionReady();
  if (!window.confirm("Clear your calorie and macro targets? Your food log stays.")) return false;
  state.nutrition.targets = null;
  state.nutrition.highDay = null;
  state.nutrition.targetsSuggested = false;
  saveState();
  render();
  return true;
}

// ---------- Apple Health ----------

function syncHealthNutrition(force = false) {
  nutritionReady();
  const bridge = healthBridge();
  const health = state.nutrition.health;
  if (!bridge || !health.enabled || nutritionSyncInFlight) return false;
  const last = Date.parse(health.lastSyncAt || "");
  if (!force && Number.isFinite(last) && Date.now() - last < NUTRITION_HEALTH_AUTO_SYNC_MS) return false;
  // Re-read a few days of overlap: food logged late (or edited) in the food
  // app changes recent totals. Whole local days, so each sum is complete.
  const resyncFrom = Date.parse(health.resyncFrom || "");
  const firstSyncStart = Math.min(Date.now() - NUTRITION_HEALTH_INITIAL_DAYS * 86400000, Number.isFinite(resyncFrom) ? resyncFrom : Infinity);
  const since = startOfLocalDay(Number.isFinite(last)
    ? new Date(last - NUTRITION_HEALTH_RESYNC_OVERLAP_DAYS * 86400000)
    : new Date(firstSyncStart));
  nutritionSyncInFlight = true;
  setTimeout(() => { nutritionSyncInFlight = false; }, 30000);
  bridge.postMessage({ action: "readNutrition", since: since.toISOString() });
  return true;
}

function applyHealthNutritionDays(days, since) {
  nutritionReady();
  const nutrition = state.nutrition;
  const today = todayNutritionKey();
  const sinceDay = since ? localDayKey(since) : null;
  const incoming = new Map();
  (Array.isArray(days) ? days : []).forEach((item) => {
    const entry = cleanNutritionEntry(item, true);
    // Health only fills days that have food in them; a future day is a clock error.
    if (!entry || entry.date > today || !NUTRITION_FIELDS.some((field) => entry[field] > 0)) return;
    incoming.set(entry.date, entry);
  });
  let changed = 0;
  const kept = nutrition.healthLog.filter((entry) => {
    // A day inside the window that Health no longer has was deleted in the food app.
    if (sinceDay && entry.date >= sinceDay && !incoming.has(entry.date)) {
      changed += 1;
      return false;
    }
    return true;
  });
  incoming.forEach((entry, day) => {
    const existing = kept.find((item) => item.date === day);
    if (!existing) {
      kept.push(entry);
      changed += 1;
    } else if (NUTRITION_FIELDS.some((field) => existing[field] !== entry[field])) {
      Object.assign(existing, entry);
      changed += 1;
    }
  });
  const cutoff = dateKey(addDays(new Date(), -NUTRITION_HEALTH_KEEP_DAYS));
  nutrition.healthLog = sortNewestDayFirst(kept.filter((entry) => entry.date >= cutoff));
  // HealthKit hides read denial by returning no data; on a first sync that is
  // far more likely than an empty food log, so point there.
  const firstSync = !nutrition.health.lastSyncAt;
  nutrition.health.lastSyncAt = new Date().toISOString();
  delete nutrition.health.resyncFrom;
  nutrition.health.lastResult = changed
    ? `Updated ${changed} ${changed === 1 ? "day" : "days"} of nutrition from Apple Health.`
    : firstSync && !incoming.size
      ? "No nutrition found in Apple Health. If your food app writes to Health, allow Mass Method to read Dietary Energy, Protein, Carbohydrates and Total Fat in Settings › Health › Data Access & Devices."
      : "Nutrition is up to date with Apple Health.";
  saveState();
  render();
  return changed;
}

function setHealthNutritionEnabled(enabled) {
  nutritionReady();
  if (enabled && !healthBridge()) {
    toast("Apple Health import works in the iPhone app.");
    render();
    return;
  }
  state.nutrition.health.enabled = Boolean(enabled);
  if (state.nutrition.health.enabled) {
    // Ask for read access first; the import runs when authorization returns.
    state.nutrition.health.pendingAuthorization = true;
    saveState();
    requestHealthKit("authorize");
  } else {
    saveState();
  }
  render();
}

function syncNutritionNow() {
  nutritionReady();
  if (!healthBridge()) return toast("Apple Health import works in the iPhone app.");
  state.nutrition.health.pendingAuthorization = true;
  saveState();
  requestHealthKit("authorize");
}

function removeHealthNutrition() {
  nutritionReady();
  if (!window.confirm("Remove the nutrition imported from Apple Health? Days you logged by hand stay.")) return false;
  state.nutrition.healthLog = [];
  state.nutrition.health = { enabled: false, lastSyncAt: null, lastResult: "Imported Apple Health nutrition removed." };
  saveState();
  render();
  return true;
}

const baseHandleNativeHealthKitForNutrition = window.handleNativeHealthKit;
window.handleNativeHealthKit = function handleNativeHealthKitWithNutrition(payload) {
  nutritionReady();
  if (payload?.status === "nutritionDays") {
    nutritionSyncInFlight = false;
    // Ignore a read that finished after the import was turned off.
    if (!state.nutrition.health.enabled) return;
    applyHealthNutritionDays(payload.days, payload.since);
    return;
  }
  if (payload?.status === "error" && payload.action === "readNutrition") {
    nutritionSyncInFlight = false;
    state.nutrition.health.lastResult = /not determined|authoriz/i.test(String(payload.message || ""))
      ? "Apple Health access isn't set up yet. Tap Sync Now and allow access, or turn on Mass Method in Settings › Health › Data Access & Devices."
      : `Apple Health nutrition import failed: ${String(payload.message || "unknown error").slice(0, 120)}`;
    saveState();
  }
  baseHandleNativeHealthKitForNutrition(payload);
  if (payload?.status === "authorizationCompleted" && state.nutrition.health.pendingAuthorization) {
    delete state.nutrition.health.pendingAuthorization;
    saveState();
    syncHealthNutrition(true);
  }
};

// Apple's HealthKit rules forbid storing Health data in iCloud: settings.js
// nativeBackupPayload leaves out imported nutrition days (and a coach's copy
// of athletes' Health days) and records where to re-import from.

// ---------- Coach check-ins and reports ----------

function nutritionRangeEntries(days) {
  const today = todayNutritionKey();
  const start = dateKey(addDays(new Date(), -days));
  return nutritionEntries().filter((entry) => entry.date > start && entry.date <= today);
}

// Health days go to the coach marked, the same way Health body readings do,
// so the coach's own iCloud backups can leave them out.
function nutritionCoachPayload(days) {
  nutritionReady();
  const range = Math.max(1, Math.min(366, Math.round(Number(days)) || logbookDays()));
  const { targets, highDay, targetsSuggested } = state.nutrition;
  return {
    asOf: todayNutritionKey(),
    rangeDays: range,
    targets,
    highDay,
    targetsSuggested,
    days: nutritionRangeEntries(range).map((entry) => ({
      id: entry.id,
      date: entry.date,
      ...nutritionTotals(entry),
      ...(isNutritionHealthEntry(entry) ? { fromHealth: true } : {}),
      ...(isNutritionHighDay(entry.date) ? { highDay: true } : {})
    }))
  };
}

const baseBuildCoachPackageForNutrition = buildCoachPackage;
buildCoachPackage = async function buildCoachPackageWithNutrition(days = logbookDays()) {
  const pkg = await baseBuildCoachPackageForNutrition(days);
  return { ...pkg, nutrition: nutritionCoachPayload(days) };
};

function mergeAthleteNutrition(existing, pkg) {
  const incoming = cleanAthleteNutrition(pkg?.nutrition);
  const current = existing && typeof existing === "object" ? existing : null;
  // A check-in from an older app version carries no nutrition: keep ours.
  if (!incoming) return current;
  const generatedAt = Number.isFinite(Date.parse(pkg?.generatedAt)) ? new Date(Date.parse(pkg.generatedAt)).toISOString() : new Date().toISOString();
  const newer = !current?.updatedAt || Date.parse(generatedAt) >= Date.parse(current.updatedAt);
  const rangeOf = (item) => [dateKey(addDays(parseDateKey(item.asOf), -item.rangeDays)), item.asOf];
  const within = ([start, end], day) => day > start && day <= end;
  const byDay = new Map((Array.isArray(current?.days) ? current.days : []).map((entry) => [entry.date, entry]));
  if (newer) {
    // A newer check-in is the athlete's complete record for its range: a day
    // it no longer has was cleared on the athlete's phone.
    const range = rangeOf(incoming);
    [...byDay.keys()].forEach((day) => { if (within(range, day)) byDay.delete(day); });
    incoming.days.forEach((entry) => byDay.set(entry.date, entry));
  } else {
    // An older file opened late only fills days the newer one did not cover.
    const covered = current?.asOf ? rangeOf(current) : null;
    incoming.days.forEach((entry) => {
      if (!byDay.has(entry.date) && !(covered && within(covered, entry.date))) byDay.set(entry.date, entry);
    });
  }
  const days = sortNewestDayFirst([...byDay.values()]).slice(0, NUTRITION_COACH_DAYS_KEEP);
  return newer ? { ...incoming, updatedAt: generatedAt, days } : { ...current, days };
}

const baseImportCoachPackageForNutrition = importCoachPackage;
importCoachPackage = async function importCoachPackageWithNutrition(pkg) {
  const imported = await baseImportCoachPackageForNutrition(pkg);
  if (!imported) return imported;
  const athlete = athleteById(String(pkg?.athlete?.id || ""));
  if (!athlete) return imported;
  const merged = mergeAthleteNutrition(athlete.nutrition, pkg);
  if (merged) athlete.nutrition = merged;
  saveState();
  render();
  return imported;
};

function athleteNutritionSummary(athlete) {
  const nutrition = athlete?.nutrition;
  if (!nutrition?.asOf) return null;
  const highDays = nutrition.days.filter((entry) => entry.highDay).map((entry) => entry.date);
  return summarizeNutrition(nutrition.days, { ...nutrition, highDays }, nutrition.asOf, NUTRITION_WINDOW_DAYS, (entry) => entry.highDay === true);
}

const baseCoachReportDataForNutrition = coachReportData;
coachReportData = function coachReportWithNutrition(days) {
  const report = baseCoachReportDataForNutrition(days);
  return { ...report, nutrition: { summary: ownNutritionSummary(), entries: nutritionRangeEntries(report.days) } };
};

function formatNutritionNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "--" : Math.round(Number(value)).toLocaleString(reportNumberLocale());
}

function nutritionTargetText(target) {
  if (!target) return "";
  return `${formatNutritionNumber(target.kcal)} kcal - P ${formatNutritionNumber(target.protein)} g - C ${formatNutritionNumber(target.carbs)} g - F ${formatNutritionNumber(target.fat)} g`;
}

function nutritionSummaryText(summary) {
  const pct = (field) => (summary.avg[field] !== null && summary.avgTarget[field] > 0 ? ` (${Math.round((summary.avg[field] / summary.avgTarget[field]) * 100)}% of target)` : "");
  return {
    averages: `${formatNutritionNumber(summary.avg.kcal)} kcal${pct("kcal")} - P ${formatNutritionNumber(summary.avg.protein)} g${pct("protein")} - C ${formatNutritionNumber(summary.avg.carbs)} g${pct("carbs")} - F ${formatNutritionNumber(summary.avg.fat)} g${pct("fat")}`,
    adherence: `Logged ${summary.loggedDays} of ${summary.windowDays} days${summary.judgedDays ? ` - on target ${summary.onTarget} of ${summary.judgedDays} (${Math.round(summary.adherence * 100)}%)` : ""}${summary.healthDays ? ` - ${summary.healthDays} from Apple Health` : ""}`
  };
}

function nutritionReportLines(days) {
  nutritionReady();
  const report = coachReportData(days);
  const { summary, entries } = report.nutrition;
  const lines = [];
  addReportSection(lines, "Nutrition");
  const targets = state.nutrition.targets;
  lines.push({ text: targets ? `Daily targets: ${nutritionTargetText(targets)}${state.nutrition.targetsSuggested ? " (suggested starting point)" : ""}` : "No daily targets set.", size: 10 });
  if (state.nutrition.highDay) lines.push({ text: `High day: ${nutritionTargetText(state.nutrition.highDay)}`, size: 10 });
  if (summary.loggedDays) {
    const text = nutritionSummaryText(summary);
    lines.push({ text: `Last ${summary.windowDays} full days average: ${text.averages}`, size: 10 });
    lines.push({ text: text.adherence, size: 10 });
  } else {
    lines.push({ text: `No food logged in the last ${summary.windowDays} full days.`, size: 10 });
  }
  entries.forEach((entry) => {
    lines.push({ text: `${formatShortDate(entry.date)} - ${formatNutritionNumber(nutritionDayKcal(entry))} kcal - P ${formatNutritionNumber(entry.protein)} g - C ${formatNutritionNumber(entry.carbs)} g - F ${formatNutritionNumber(entry.fat)} g${isNutritionHighDay(entry.date) ? " - High day" : ""}${isNutritionHealthEntry(entry) ? " - Apple Health" : ""}`, size: 9 });
  });
  return lines;
}

const baseBuildCoachReportLinesForNutrition = buildCoachReportLines;
buildCoachReportLines = function buildCoachReportLinesWithNutrition(days, coachNote = "") {
  const lines = baseBuildCoachReportLinesForNutrition(days, coachNote);
  const range = Number.isFinite(Number(days)) && Number(days) > 0 ? Math.max(1, Math.round(Number(days))) : logbookDays();
  // Same Latin-1, Western-digit formatting as the rest of the PDF.
  const previous = reportFormatting;
  reportFormatting = true;
  try {
    return [...lines, ...nutritionReportLines(range).map((line) => ({ ...line, text: plainReportText(line.text) }))];
  } finally {
    reportFormatting = previous;
  }
};

// ---------- Display ----------

function nutritionBarStatus(field, value, target) {
  if (!(target > 0) || value === null || value === undefined) return "";
  const ratio = value / target;
  if (field === "protein") return ratio >= NUTRITION_PROTEIN_FLOOR ? "on" : "building";
  if (ratio > 1 + NUTRITION_KCAL_TOLERANCE) return "over";
  return ratio >= 1 - NUTRITION_KCAL_TOLERANCE ? "on" : "building";
}

function renderNutritionBars(values, target) {
  return NUTRITION_FIELDS.filter((field) => target?.[field] > 0).map((field) => {
    const value = field === "kcal" ? nutritionDayKcal(values) : values?.[field] ?? null;
    const goal = target[field];
    const status = nutritionBarStatus(field, value, goal);
    const scale = Math.max(goal * 1.25, value || 0);
    const pct = (number) => `${Math.min(100, ((number || 0) / scale) * 100).toFixed(1)}%`;
    const unit = field === "kcal" ? "kcal" : "g";
    return `
      <div class="volume-row">
        <div class="volume-label"><strong>${NUTRITION_LABELS[field]}</strong></div>
        <div class="volume-track" role="img" aria-label="${NUTRITION_LABELS[field]}: ${formatNutritionNumber(value)} of ${formatNutritionNumber(goal)} ${unit}">
          <span class="volume-target" style="left:${pct(goal * (field === "protein" ? NUTRITION_PROTEIN_FLOOR : 1 - NUTRITION_KCAL_TOLERANCE))};width:calc(${pct(goal * (1 + NUTRITION_KCAL_TOLERANCE))} - ${pct(goal * (field === "protein" ? NUTRITION_PROTEIN_FLOOR : 1 - NUTRITION_KCAL_TOLERANCE))})"></span>
          <span class="volume-fill ${status}" style="width:${pct(value)}"></span>
        </div>
        <span class="volume-value">${formatNutritionNumber(value)}<small>/${formatNutritionNumber(goal)} ${unit}</small></span>
      </div>
    `;
  }).join("");
}

function nutritionInputs(prefix, values = {}, placeholders = {}) {
  return `<div class="nutrition-inputs">${NUTRITION_FIELDS.map((field) => {
    const id = `${prefix}${field[0].toUpperCase()}${field.slice(1)}`;
    const value = values?.[field];
    return `<div class="field"><label for="${id}">${field === "kcal" ? "Calories" : `${NUTRITION_LABELS[field]} (g)`}</label><input id="${id}" type="number" inputmode="numeric" min="0" step="1" value="${value === null || value === undefined ? "" : escapeHtml(value)}" placeholder="${escapeHtml(placeholders[field] ?? "")}" /></div>`;
  }).join("")}</div>`;
}

function renderTodayNutritionCard() {
  nutritionReady();
  const nutrition = state.nutrition;
  const day = todayNutritionKey();
  const entry = nutritionDayEntry(day);
  const manual = manualNutritionDay(day);
  const high = isNutritionHighDay(day);
  const target = nutritionTargetFor(day);
  const kcal = nutritionDayKcal(entry);
  const fromHealth = entry && isNutritionHealthEntry(entry);
  const heading = entry
    ? `${formatNutritionNumber(kcal)}${target?.kcal ? ` / ${formatNutritionNumber(target.kcal)}` : ""} kcal`
    : target ? `0 / ${formatNutritionNumber(target.kcal)} kcal` : "Nothing logged yet";
  const offerHighDay = nutrition.highDay && (state.phase === "prep" || high);
  return `
    <section class="card pad today-nutrition" id="today-nutrition">
      <div class="card-head">
        <div>
          <p class="eyebrow">Nutrition today</p><h2>${heading}</h2>
          ${entry && !target ? `<p class="muted">P ${formatNutritionNumber(entry.protein)} g · C ${formatNutritionNumber(entry.carbs)} g · F ${formatNutritionNumber(entry.fat)} g</p>` : ""}
          ${high || fromHealth || (target && nutrition.targetsSuggested) ? `<div class="filters nutrition-badges">${high ? '<span class="badge amber">High day</span>' : ""}${fromHealth ? '<span class="badge green">Apple Health</span>' : ""}${target && nutrition.targetsSuggested ? '<span class="badge blue">Suggested starting point</span>' : ""}</div>` : ""}
        </div>
      </div>
      ${target ? `<div class="volume-list">${renderNutritionBars(entry || {}, target)}</div>` : `<p class="muted compact-note">Set daily calorie and macro targets on Progress to track them here. <button class="ghost-btn compact-btn" onclick="openNutritionTargets()">Set Targets</button></p>`}
      ${fromHealth ? '<p class="muted compact-note">From Apple Health. Adding food here starts a hand-logged day that replaces it for today.</p>' : ""}
      ${nutritionEditOpen ? `
        <p class="muted compact-note">Today's totals (leave a box empty if you didn't track it).</p>
        ${nutritionInputs("nutEdit", manual || {})}
        <div class="actions" style="margin-top:10px"><button class="primary-btn" onclick="saveNutritionDay()">Save Totals</button><button class="ghost-btn" onclick="toggleNutritionEdit(false)">Cancel</button></div>
      ` : `
        ${nutritionInputs("nutAdd", {}, { kcal: "auto from macros" })}
        <div class="actions" style="margin-top:10px">
          <button class="primary-btn" onclick="quickAddNutrition()">Add Food</button>
          <button class="secondary-btn" onclick="toggleNutritionEdit(true)">Edit Day</button>
          ${manual ? `<button class="ghost-btn danger" onclick="clearNutritionDay('${day}')">Clear Day</button>` : ""}
          ${offerHighDay ? `<button class="ghost-btn" onclick="toggleNutritionHighDay('${day}')">${high ? "Back to Normal Day" : "Make Today a High Day"}</button>` : ""}
        </div>
      `}
    </section>
  `;
}

function openNutritionTargets() {
  setView("progress");
  scrollIntoViewIfPresent("#nutrition", "start");
}

function renderProgressNutritionSection() {
  nutritionReady();
  const nutrition = state.nutrition;
  const summary = ownNutritionSummary();
  const suggestion = suggestedNutritionTargets();
  const text = nutritionSummaryText(summary);
  const recent = nutritionEntries().slice(0, 14);
  const health = nutrition.health;
  const avgBars = nutrition.targets && summary.loggedDays ? renderNutritionBars(summary.avg, summary.avgTarget) : "";
  return `
    <section class="card pad nutrition-progress" id="nutrition" style="margin-top:12px">
      <div class="card-head">
        <div><p class="eyebrow">Nutrition</p><h2>Targets and adherence</h2><p class="muted">Last ${summary.windowDays} full days · ${escapeHtml(text.adherence.replace(/ - /g, " · "))}</p></div>
        ${health.enabled ? '<span class="badge green">Apple Health</span>' : ""}
      </div>
      <div class="grid three">
        <article class="card stat"><p class="value">${formatNutritionNumber(summary.avg.kcal)}</p><p class="label">7-day average kcal${summary.avgTarget.kcal ? ` (target ${formatNutritionNumber(summary.avgTarget.kcal)})` : ""}</p></article>
        <article class="card stat"><p class="value">${formatNutritionNumber(summary.avg.protein)}</p><p class="label">7-day average protein (g)${summary.avgTarget.protein ? ` (target ${formatNutritionNumber(summary.avgTarget.protein)})` : ""}</p></article>
        <article class="card stat"><p class="value">${summary.adherence === null ? "--" : `${Math.round(summary.adherence * 100)}%`}</p><p class="label">Days on target${summary.judgedDays ? ` (${summary.onTarget} of ${summary.judgedDays})` : ""}</p></article>
      </div>
      ${avgBars ? `<div class="volume-list" style="margin-top:12px">${avgBars}</div>` : ""}
      <p class="muted compact-note">On target: calories within 10% of the day's target and protein at 90% or more.</p>
      <div class="grid two" style="margin-top:12px">
        <div>
          <h3>Daily targets</h3>
          ${nutritionInputs("nutTarget", nutrition.targets || {})}
          <h3 style="margin-top:12px">High day <small class="muted">(optional, for refeeds during prep)</small></h3>
          ${nutritionInputs("nutHigh", nutrition.highDay || {})}
          <div class="actions" style="margin-top:10px"><button class="primary-btn" onclick="saveNutritionTargets()">Save Targets</button>${nutrition.targets ? '<button class="ghost-btn danger" onclick="clearNutritionTargets()">Clear Targets</button>' : ""}</div>
        </div>
        <div>
          <div class="signal-card">
            <span class="badge blue">Suggested starting point</span>
            ${suggestion ? `
              <strong>${phaseLabel(state.phase)}: ${escapeHtml(nutritionTargetText(suggestion.targets).replace(/ - /g, " · "))}</strong>
              ${suggestion.highDay ? `<p class="muted">High day: ${escapeHtml(nutritionTargetText(suggestion.highDay).replace(/ - /g, " · "))}</p>` : ""}
              <p class="muted">${escapeHtml(suggestionExplanation(suggestion))} Based on ${formatWeight(nutritionBodyweight())} ${weightUnit()}. It is a starting point, not a prescription: adjust every week or two from your scale trend, or use your coach's numbers.</p>
              <button class="secondary-btn" onclick="applySuggestedNutritionTargets()">Use Starting Point</button>
            ` : '<p class="muted">Log a body weight to get a suggested starting point.</p>'}
          </div>
        </div>
      </div>
      <h3 style="margin-top:12px">Recent days</h3>
      <div class="exercise-list">${recent.map((entry) => `<div class="exercise-row"><span><span class="row-date">${formatShortDate(entry.date)}</span>${isNutritionHighDay(entry.date) ? ' <span class="badge amber">High</span>' : ""}${isNutritionHealthEntry(entry) ? ' <span class="badge green">Apple Health</span>' : ""}</span><strong>${formatNutritionNumber(nutritionDayKcal(entry))} kcal · P ${formatNutritionNumber(entry.protein)} · C ${formatNutritionNumber(entry.carbs)} · F ${formatNutritionNumber(entry.fat)}</strong>${isNutritionHealthEntry(entry) ? "" : `<button class="ghost-btn danger compact-btn" aria-label="Clear food logged on ${formatShortDate(entry.date)}" onclick="clearNutritionDay('${entry.date}')">Clear</button>`}</div>`).join("") || '<p class="muted">No food logged yet. Add it on Today, or import it from Apple Health in More.</p>'}</div>
      ${health.enabled ? `<p class="muted compact-note">${escapeHtml(health.lastResult || "Waiting for the first Apple Health sync.")}</p>` : ""}
    </section>
  `;
}

function renderLogbookNutrition() {
  nutritionReady();
  const days = logbookDays();
  const { summary, entries } = coachReportData(days).nutrition;
  const text = nutritionSummaryText(summary);
  return `<section class="card pad" style="margin-top:16px"><p class="eyebrow">Nutrition</p><h2>${state.nutrition.targets ? escapeHtml(nutritionTargetText(state.nutrition.targets).replace(/ - /g, " · ")) : "No daily targets set"}</h2><p class="muted">Last ${summary.windowDays} full days: ${escapeHtml(summary.loggedDays ? text.averages.replace(/ - /g, " · ") : "nothing logged")}</p><p class="muted">${escapeHtml(text.adherence.replace(/ - /g, " · "))}</p>${entries.slice(0, 31).map((entry) => `<p class="muted compact-note">${formatShortDate(entry.date)} · ${formatNutritionNumber(nutritionDayKcal(entry))} kcal · P ${formatNutritionNumber(entry.protein)} · C ${formatNutritionNumber(entry.carbs)} · F ${formatNutritionNumber(entry.fat)}${isNutritionHighDay(entry.date) ? " · High day" : ""}${isNutritionHealthEntry(entry) ? " · Apple Health" : ""}</p>`).join("")}</section>`;
}

function renderAthleteNutritionCard(athlete) {
  const nutrition = athlete?.nutrition;
  if (!nutrition?.asOf) return "";
  const summary = athleteNutritionSummary(athlete);
  const text = nutritionSummaryText(summary);
  return `
    <section class="card pad" style="margin-top:12px">
      <div class="card-head"><div><p class="eyebrow">Nutrition</p><h2>${nutrition.targets ? escapeHtml(nutritionTargetText(nutrition.targets).replace(/ - /g, " · ")) : "No targets set"}</h2><p class="muted">${nutrition.targetsSuggested ? "Suggested starting point · " : ""}${nutrition.highDay ? `High day ${escapeHtml(nutritionTargetText(nutrition.highDay).replace(/ - /g, " · "))}` : "No high day"}</p></div></div>
      ${summary.loggedDays ? `<p class="muted">7 full days to ${formatShortDate(summary.end)}: ${escapeHtml(text.averages.replace(/ - /g, " · "))}</p>` : '<p class="muted">No food logged in the 7 days before this check-in.</p>'}
      <p class="muted">${escapeHtml(text.adherence.replace(/ - /g, " · "))}</p>
      ${nutrition.targets && summary.loggedDays ? `<div class="volume-list">${renderNutritionBars(summary.avg, summary.avgTarget)}</div>` : ""}
      <div class="exercise-list" style="margin-top:10px">${nutrition.days.slice(0, 10).map((entry) => `<div class="exercise-row"><span><span class="row-date">${formatShortDate(entry.date)}</span>${entry.highDay ? ' <span class="badge amber">High</span>' : ""}${entry.fromHealth ? ' <span class="badge green">Apple Health</span>' : ""}</span><strong>${formatNutritionNumber(nutritionDayKcal(entry))} kcal · P ${formatNutritionNumber(entry.protein)} · C ${formatNutritionNumber(entry.carbs)} · F ${formatNutritionNumber(entry.fat)}</strong></div>`).join("")}</div>
    </section>
  `;
}

const baseRenderTodayForNutrition = renderToday;
renderToday = function renderTodayWithNutrition() {
  const html = baseRenderTodayForNutrition();
  const card = `<div style="margin-top: 16px;">${renderTodayNutritionCard()}</div>`;
  // Right under the stat tiles, above the weekly volume and stage timeline.
  const anchor = html.indexOf('<div style="margin-top: 16px;">');
  return anchor === -1 ? `${html}${card}` : `${html.slice(0, anchor)}${card}${html.slice(anchor)}`;
};

const baseRenderProgressForNutrition = renderProgress;
renderProgress = function renderProgressWithNutrition() {
  const html = baseRenderProgressForNutrition();
  const section = renderProgressNutritionSection();
  const anchor = html.indexOf('<div class="grid two progress-grid"');
  return anchor === -1 ? `${html}${section}` : `${html.slice(0, anchor)}${section}${html.slice(anchor)}`;
};

const baseRenderLogbookForNutrition = renderLogbook;
renderLogbook = function renderLogbookWithNutrition() {
  return `${baseRenderLogbookForNutrition()}${renderLogbookNutrition()}`;
};

const baseRenderAthleteDetailForNutrition = renderAthleteDetail;
renderAthleteDetail = function renderAthleteDetailWithNutrition(athlete) {
  const html = baseRenderAthleteDetailForNutrition(athlete);
  const card = renderAthleteNutritionCard(athlete);
  if (!card) return html;
  const marker = html.indexOf('<p class="eyebrow">Weekly volume</p>');
  const anchor = marker === -1 ? -1 : html.lastIndexOf("<section", marker);
  return anchor === -1 ? `${html}${card}` : `${html.slice(0, anchor)}${card}${html.slice(anchor)}`;
};

registerMoreSection(29, () => nutritionReady() && `
  <section class="card pad">
    <p class="eyebrow">Apple Health</p>
    <h2>Import nutrition</h2>
    <p class="muted">Bring in daily calories, protein, carbs and fat from apps that write to Apple Health, such as MacroFactor, MyFitnessPal, Cronometer and Lose It. Mass Method keeps one total per day, and any day you log by hand always wins. Imported nutrition is never included in automatic iCloud backups.</p>
    <label class="toggle-row"><input type="checkbox" ${state.nutrition.health.enabled ? "checked" : ""} onchange="setHealthNutritionEnabled(this.checked)" /> <span>Import nutrition from Apple Health automatically</span></label>
    ${state.nutrition.health.enabled ? `
      <p class="muted compact-note">${escapeHtml(state.nutrition.health.lastResult || "Waiting for the first sync.")}${Number.isFinite(Date.parse(state.nutrition.health.lastSyncAt)) ? ` Last checked ${new Date(state.nutrition.health.lastSyncAt).toLocaleString()}.` : ""}</p>
      <div class="actions"><button class="secondary-btn" onclick="syncNutritionNow()">Sync Now</button><button class="ghost-btn danger" onclick="removeHealthNutrition()">Remove Imported Nutrition</button></div>
    ` : ""}
  </section>
`);

// Typed-but-unsaved numbers survive a redraw (a Health sync or a tap
// elsewhere); the form being saved starts fresh.
const baseRenderForNutritionDrafts = render;
render = function renderKeepingNutritionDrafts() {
  const typed = ["today", "progress"].includes(state.view)
    ? [...document.querySelectorAll("#app input[id]")]
      .filter((field) => NUTRITION_DRAFT_FIELD.test(field.id) && !nutritionFormBeingSaved?.test(field.id) && field.value !== field.defaultValue)
      .map((field) => [field.id, field.value])
    : [];
  baseRenderForNutritionDrafts();
  if (!["today", "progress"].includes(state.view)) return;
  typed.forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value;
  });
};

const baseResetForNutrition = resetDemoData;
resetDemoData = function resetWithNutrition() {
  baseResetForNutrition();
  nutritionEditOpen = false;
  nutritionMigrateState();
  saveState();
  render();
};

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncHealthNutrition(false);
});

saveState();
syncHealthNutrition(false);
render();
