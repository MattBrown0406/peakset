"use strict";

// Apple Health body data: imports body weight, body fat %, lean body mass,
// and waist circumference into the logbook. One reading per day (the first,
// i.e. the morning weigh-in). Anything the athlete logged by hand wins; Health
// only fills gaps. Loaded after coach.js.

const HEALTH_INITIAL_DAYS = 180;
const HEALTH_RESYNC_OVERLAP_DAYS = 3;
const HEALTH_AUTO_SYNC_MS = 15 * 60000;
const HEALTH_SAMPLE_TYPES = ["weight", "bodyFat", "leanMass", "waist"];
let healthSyncInFlight = false;

function healthMigrateState() {
  if (!state.healthBody || typeof state.healthBody !== "object") state.healthBody = {};
  if (typeof state.healthBody.enabled !== "boolean") state.healthBody.enabled = false;
  if (!("lastSyncAt" in state.healthBody)) state.healthBody.lastSyncAt = null;
  if (typeof state.healthBody.lastResult !== "string") state.healthBody.lastResult = "";
}

healthMigrateState();

function healthBridge() {
  return window.webkit?.messageHandlers?.peaksetHealthKit || null;
}

function isHealthEntry(entry) {
  return String(entry?.id || "").startsWith("hk-");
}

function localDayKey(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateKey(date) : null;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function syncHealthBody(force = false) {
  const bridge = healthBridge();
  if (!bridge || !state.healthBody?.enabled || healthSyncInFlight) return false;
  const last = Date.parse(state.healthBody.lastSyncAt || "");
  if (!force && Number.isFinite(last) && Date.now() - last < HEALTH_AUTO_SYNC_MS) return false;
  // Re-read a few days of overlap so late-arriving scale readings are caught.
  // Start at local midnight so the oldest day in the window is read whole and
  // its first reading stays the first reading.
  const resyncFrom = Date.parse(state.healthBody.resyncFrom || "");
  const firstSyncStart = Math.min(Date.now() - HEALTH_INITIAL_DAYS * 86400000, Number.isFinite(resyncFrom) ? resyncFrom : Infinity);
  const since = startOfLocalDay(Number.isFinite(last)
    ? new Date(last - HEALTH_RESYNC_OVERLAP_DAYS * 86400000)
    : new Date(firstSyncStart));
  healthSyncInFlight = true;
  setTimeout(() => { healthSyncInFlight = false; }, 30000);
  bridge.postMessage({ action: "readBody", since: since.toISOString(), unit: weightUnit(), lengthUnit: lengthUnit() });
  return true;
}

function markHealthField(entry, field, value) {
  const fields = new Set(Array.isArray(entry.healthFields) ? entry.healthFields : []);
  // Never overwrite a value the athlete typed in.
  if (entry[field] !== null && entry[field] !== undefined && entry[field] !== "" && !fields.has(field)) return false;
  if (entry[field] === value) return false;
  entry[field] = value;
  fields.add(field);
  entry.healthFields = [...fields];
  return true;
}

function upsertHealthMeasurement(day, fields, sourceDate) {
  const manual = state.measurements.find((entry) => !isHealthEntry(entry) && localDayKey(entry.date) === day);
  if (manual) {
    const changed = Object.entries(fields).filter(([field, value]) => markHealthField(manual, field, value)).length;
    // The day's Health-only entry is now folded into the tape check-in;
    // keeping both would count one reading twice.
    const duplicate = state.measurements.findIndex((item) => item.id === `hk-m-${day}`);
    if (duplicate !== -1) state.measurements.splice(duplicate, 1);
    return changed + (duplicate !== -1 ? 1 : 0);
  }
  const id = `hk-m-${day}`;
  let entry = state.measurements.find((item) => item.id === id);
  if (!entry) {
    entry = { id, date: sourceDate, note: "Apple Health", source: "healthkit" };
    state.measurements.push(entry);
  }
  let changed = 0;
  Object.entries(fields).forEach(([field, value]) => {
    if (entry[field] !== value) {
      entry[field] = value;
      changed += 1;
    }
  });
  return changed;
}

function applyHealthBodySamples(samples) {
  const days = new Map();
  (Array.isArray(samples) ? samples : []).forEach((sample) => {
    const value = Number(sample?.value);
    const day = localDayKey(sample?.date);
    if (!HEALTH_SAMPLE_TYPES.includes(sample?.type) || !Number.isFinite(value) || value <= 0 || !day) return;
    if (!days.has(day)) days.set(day, {});
    const slot = days.get(day);
    const current = slot[sample.type];
    if (!current || new Date(sample.date) < new Date(current.date)) {
      slot[sample.type] = { value: Math.round(value * 100) / 100, date: sample.date, source: String(sample.source || "Apple Health").slice(0, 60) };
    }
  });

  let changedDays = 0;
  for (const [day, slot] of days) {
    let changed = 0;
    const manualWeight = state.weightLogs.find((entry) => !isHealthEntry(entry) && localDayKey(entry.date) === day);
    const hkId = `hk-day-${day}`;
    const orphanBodyFat = {};
    if (manualWeight) {
      // The athlete's own weigh-in wins; attach composition data to it.
      const before = state.weightLogs.length;
      state.weightLogs = state.weightLogs.filter((entry) => entry.id !== hkId);
      changed += before - state.weightLogs.length;
      if (slot.bodyFat && markHealthField(manualWeight, "bodyFat", slot.bodyFat.value)) changed += 1;
      if (slot.leanMass && markHealthField(manualWeight, "leanMass", slot.leanMass.value)) changed += 1;
    } else if (slot.weight) {
      const next = {
        id: hkId,
        date: slot.weight.date,
        bodyweight: slot.weight.value,
        bodyFat: slot.bodyFat?.value ?? state.weightLogs.find((entry) => entry.id === hkId)?.bodyFat ?? null,
        leanMass: slot.leanMass?.value ?? state.weightLogs.find((entry) => entry.id === hkId)?.leanMass ?? null,
        note: `Apple Health · ${slot.weight.source}`,
        source: "healthkit"
      };
      const existing = state.weightLogs.find((entry) => entry.id === hkId);
      if (!existing) {
        state.weightLogs.push(next);
        changed += 1;
      } else if (JSON.stringify(existing) !== JSON.stringify({ ...existing, ...next })) {
        Object.assign(existing, next);
        changed += 1;
      }
    } else if (slot.bodyFat) {
      // Body fat with no weigh-in that day (e.g. a DEXA or caliper app).
      orphanBodyFat.bodyFat = slot.bodyFat.value;
    }
    const measurementFields = { ...orphanBodyFat, ...(slot.waist ? { waist: slot.waist.value } : {}) };
    if (Object.keys(measurementFields).length) {
      changed += upsertHealthMeasurement(day, measurementFields, (slot.waist || slot.bodyFat).date);
    }
    if (changed) changedDays += 1;
  }

  const newestFirst = (a, b) => new Date(b.date) - new Date(a.date);
  state.weightLogs.sort(newestFirst);
  state.measurements.sort(newestFirst);
  if (state.profile && state.weightLogs[0]?.bodyweight) state.profile.bodyweight = state.weightLogs[0].bodyweight;
  // HealthKit hides read denial by returning no samples. On a first sync
  // that is far more likely than an empty Health history, so point there.
  const firstSync = !state.healthBody.lastSyncAt;
  state.healthBody.lastSyncAt = new Date().toISOString();
  delete state.healthBody.resyncFrom;
  state.healthBody.lastResult = changedDays
    ? `Updated ${changedDays} ${changedDays === 1 ? "day" : "days"} from Apple Health.`
    : firstSync && !(Array.isArray(samples) && samples.length)
      ? "No body data found in Apple Health. If you expected some, allow Mass Method in Settings › Health › Data Access & Devices."
      : "Up to date with Apple Health.";
  saveState();
  render();
  return changedDays;
}

function setHealthBodyEnabled(enabled) {
  if (enabled && !healthBridge()) {
    toast("Apple Health import works in the iPhone app.");
    render();
    return;
  }
  state.healthBody.enabled = Boolean(enabled);
  saveState();
  if (state.healthBody.enabled) {
    {
      // Ask for read access first; the import runs when authorization returns.
      state.healthBody.pendingAuthorization = true;
      requestHealthKit("authorize");
    }
  }
  render();
}

// Re-requesting authorization is a no-op once decided, and finishes a prompt
// the athlete dismissed; the import runs when it returns.
function syncHealthNow() {
  if (!healthBridge()) return toast("Apple Health import works in the iPhone app.");
  state.healthBody.pendingAuthorization = true;
  saveState();
  requestHealthKit("authorize");
}

function removeHealthImports() {
  if (!window.confirm("Remove everything imported from Apple Health? Your own entries stay.")) return;
  const strip = (entry) => {
    (Array.isArray(entry.healthFields) ? entry.healthFields : []).forEach((field) => { entry[field] = null; });
    delete entry.healthFields;
    return entry;
  };
  state.weightLogs = state.weightLogs.filter((entry) => !isHealthEntry(entry)).map(strip);
  state.measurements = state.measurements.filter((entry) => !isHealthEntry(entry)).map(strip);
  if (state.profile) state.profile.bodyweight = state.weightLogs.find((entry) => Number(entry.bodyweight) > 0)?.bodyweight ?? state.profile.bodyweight;
  // everUsed keeps a Health-derived profile weight out of iCloud backups.
  state.healthBody = { ...state.healthBody, enabled: false, lastSyncAt: null, everUsed: true, lastResult: "Imported Apple Health data removed." };
  saveState();
  render();
}

const baseHandleNativeHealthKit = window.handleNativeHealthKit;
window.handleNativeHealthKit = function handleNativeHealthKitWithBody(payload) {
  if (payload?.status === "bodySamples") {
    healthSyncInFlight = false;
    // Ignore a read that finished after Health was turned off or units changed.
    if (!state.healthBody?.enabled || (payload.unit && payload.unit !== weightUnit())) return;
    applyHealthBodySamples(payload.samples);
    return;
  }
  if (payload?.status === "error" && payload.action === "readBody") {
    healthSyncInFlight = false;
    state.healthBody.lastResult = /not determined|authoriz/i.test(String(payload.message || ""))
      ? "Apple Health access isn't set up yet. Tap Sync Now and allow access, or turn on Mass Method in Settings › Health › Data Access & Devices."
      : `Apple Health import failed: ${String(payload.message || "unknown error").slice(0, 120)}`;
    saveState();
  }
  baseHandleNativeHealthKit(payload);
  if (payload?.status === "authorizationCompleted" && state.healthBody?.pendingAuthorization) {
    delete state.healthBody.pendingAuthorization;
    saveState();
    syncHealthBody(true);
  }
};

// ---------- Display ----------

function bodyFatSeries() {
  const points = [
    ...state.weightLogs.filter((entry) => Number(entry.bodyFat) > 0).map((entry) => ({ date: entry.date, value: Number(entry.bodyFat) })),
    ...state.measurements.filter((entry) => Number(entry.bodyFat) > 0).map((entry) => ({ date: entry.date, value: Number(entry.bodyFat) }))
  ];
  const byDay = new Map();
  points.forEach((point) => {
    const day = localDayKey(point.date);
    if (day && !byDay.has(day)) byDay.set(day, point);
  });
  return [...byDay.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderBodyCompositionCard() {
  const series = bodyFatSeries();
  const latest = series.at(-1);
  // Compare with a reading taken roughly four weeks before the latest one.
  const gapDays = (point) => (Date.parse(latest?.date) - Date.parse(point.date)) / 86400000;
  const monthAgo = latest ? [...series].reverse().find((point) => point !== latest && gapDays(point) >= 21 && gapDays(point) <= 35) : null;
  const lean = state.weightLogs.find((entry) => Number(entry.leanMass) > 0);
  if (!latest && !lean && !state.healthBody?.enabled) return "";
  const change = latest && monthAgo ? latest.value - monthAgo.value : null;
  return `
    <section class="card pad body-composition" style="margin-top:12px">
      <div class="card-head">
        <div><p class="eyebrow">Body composition</p><h2>${latest ? `${formatWeight(latest.value)}% body fat` : "No body fat readings yet"}</h2>${latest ? `<p class="muted">${formatShortDate(latest.date)}${change === null ? "" : ` · ${formatSignedChange(change)} pts vs 4 weeks ago`}</p>` : ""}</div>
        ${state.healthBody?.enabled ? '<span class="badge green">Apple Health</span>' : ""}
      </div>
      ${series.length > 1 ? sparkline(series.slice(-60).map((point) => point.value)) : ""}
      ${lean ? `<p class="muted compact-note">Lean body mass ${formatWeight(lean.leanMass)} ${weightUnit()} on ${formatShortDate(lean.date)}.</p>` : ""}
    </section>
  `;
}

// Reports show the newest value of each metric within the range.
const baseCoachReportDataForHealth = coachReportData;
coachReportData = function coachReportWithMergedMeasurements(days) {
  const report = baseCoachReportDataForHealth(days);
  if (!report.measurements.length) return report;
  const merged = { date: report.measurements[0].date, note: report.measurements[0].note || "" };
  const contributingDates = new Set();
  report.measurements.forEach((entry) => {
    Object.entries(entry).forEach(([key, value]) => {
      if (["id", "date", "note", "source", "healthFields", "_unitOrigin"].includes(key)) return;
      if ((merged[key] === undefined || merged[key] === null) && value !== null && value !== undefined && value !== "") {
        merged[key] = value;
        contributingDates.add(entry.date);
      }
    });
  });
  // Several check-ins merged: say so instead of stamping old tape values with the newest date and source.
  const times = [...contributingDates].map((date) => Date.parse(date)).filter(Number.isFinite);
  const contributingDays = new Set(times.map((time) => dateKey(new Date(time))));
  if (contributingDays.size > 1) {
    const span = `most recent value of each since ${formatShortDate(new Date(Math.min(...times)).toISOString())}`;
    merged.note = merged.note ? `${merged.note} (${span})` : span[0].toUpperCase() + span.slice(1);
  }
  return { ...report, latestMeasurement: merged };
};

const baseRenderProgressForHealth = renderProgress;
renderProgress = function renderProgressWithHealth() {
  const html = baseRenderProgressForHealth();
  const card = renderBodyCompositionCard();
  if (!card) return html;
  const anchor = html.indexOf('<div class="grid two progress-grid"');
  return anchor === -1 ? `${html}${card}` : `${html.slice(0, anchor)}${card}${html.slice(anchor)}`;
};

registerMoreSection(28, () => `
  <section class="card pad">
    <p class="eyebrow">Apple Health</p>
    <h2>Use your scale and Health data</h2>
    <p class="muted">Import body weight, body fat %, lean body mass, and waist from Apple Health (smart scales, tape apps, DEXA, and more). Mass Method keeps the first reading each day, and anything you log by hand always wins.</p>
    <label class="toggle-row"><input type="checkbox" ${state.healthBody?.enabled ? "checked" : ""} onchange="setHealthBodyEnabled(this.checked)" /> <span>Import body data from Apple Health automatically</span></label>
    ${state.healthBody?.enabled ? `
      <p class="muted compact-note">${escapeHtml(state.healthBody.lastResult || "Waiting for the first sync.")}${Number.isFinite(Date.parse(state.healthBody.lastSyncAt)) ? ` Last checked ${new Date(state.healthBody.lastSyncAt).toLocaleString()}.` : ""}</p>
      <div class="actions"><button class="secondary-btn" onclick="syncHealthNow()">Sync Now</button><button class="ghost-btn danger" onclick="removeHealthImports()">Remove Imported Data</button></div>
    ` : ""}
    <p class="muted compact-note">If nothing imports, allow Mass Method under Settings › Health › Data Access &amp; Devices.</p>
  </section>
`);

const baseResetForHealth = resetDemoData;
resetDemoData = function resetWithHealth() {
  baseResetForHealth();
  healthMigrateState();
  saveState();
  render();
};

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncHealthBody(false);
});

saveState();
syncHealthBody(false);
render();


// Coach PDFs carry Latin-1 text only: build every line with Western digits
// and the Gregorian calendar whatever the phone's language.
const baseBuildCoachReportLinesForLocale = buildCoachReportLines;
buildCoachReportLines = function buildCoachReportLinesInEnglishNumerals(...args) {
  reportFormatting = true;
  try {
    return baseBuildCoachReportLinesForLocale(...args);
  } finally {
    reportFormatting = false;
  }
};
