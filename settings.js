"use strict";

// More tab: units, backup and restore, and the shared file-import dispatcher
// used by coach packages and programs. Loaded after app.js and toolkit.js.

const BACKUP_FORMAT = "mass-method-backup";
const BACKUP_VERSION = 1;
const SNAPSHOT_INTERVAL_MS = 20 * 3600000;
const LENGTH_MEASUREMENT_KEYS = [
  "chest", "waist", "waistNavel", "shoulders", "neck", "hips", "leftArm", "rightArm",
  "forearm", "leftThigh", "rightThigh", "calf", "arm", "thigh"
];
const incomingFileHandlers = {};
let nativeBackups = [];

function settingsMigrateState() {
  if (state.units !== "metric") state.units = "imperial";
  if (typeof state.athleteName !== "string") state.athleteName = "";
  if (!state.athleteId) state.athleteId = crypto.randomUUID();
  if (!state.backupStatus || typeof state.backupStatus !== "object") state.backupStatus = { message: "No automatic backup yet.", at: null };
}

settingsMigrateState();

function roundTo(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Each converted field remembers what it was. Switching back restores that
// exact value unless it was edited in between, so lb -> kg -> lb never drifts
// (no rounding rule can make every value round-trip on its own).
const UNIT_ORIGIN_KEY = "_unitOrigin";

function convertField(target, field, factor, fromUnits, toUnits) {
  if (!target || typeof target !== "object") return;
  const value = target[field];
  if (value === null || value === undefined || value === "") return;
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  const origins = target[UNIT_ORIGIN_KEY] && typeof target[UNIT_ORIGIN_KEY] === "object" ? target[UNIT_ORIGIN_KEY] : {};
  const origin = origins[field];
  if (origin && origin.units === toUnits && String(origin.converted) === String(value) && Number.isFinite(Number(origin.value))) {
    target[field] = typeof value === "string" ? String(origin.value) : Number(origin.value);
    delete origins[field];
  } else {
    const rounded = roundTo(number * factor);
    const converted = typeof value === "string" ? String(rounded) : rounded;
    origins[field] = { units: fromUnits, value, converted };
    target[field] = converted;
  }
  if (Object.keys(origins).length) target[UNIT_ORIGIN_KEY] = origins;
  else delete target[UNIT_ORIGIN_KEY];
}

// Stored numbers are always in the athlete's chosen unit, so switching units
// converts history once instead of converting on every render.
function convertStoredUnits(target) {
  if (target === state.units) return;
  const from = state.units === "metric" ? "metric" : "imperial";
  const toMetric = target === "metric";
  const weightFactor = toMetric ? KG_PER_LB : 1 / KG_PER_LB;
  const lengthFactor = toMetric ? CM_PER_IN : 1 / CM_PER_IN;
  const weight = (entry, field) => convertField(entry, field, weightFactor, from, target);
  const length = (entry, field) => convertField(entry, field, lengthFactor, from, target);
  const convertSets = (sets) => (Array.isArray(sets) ? sets : []).forEach((set) => weight(set, "weight"));

  weight(state.profile, "bodyweight");
  state.weightLogs.forEach((entry) => {
    weight(entry, "bodyweight");
    weight(entry, "leanMass");
  });
  state.measurements.forEach((entry) => LENGTH_MEASUREMENT_KEYS.forEach((key) => length(entry, key)));
  state.workoutLogs.forEach((log) => {
    convertSets(log.sets);
    // Volume is derived from the sets, so recompute it rather than convert it.
    if (log.volume !== undefined) {
      delete log[UNIT_ORIGIN_KEY]?.volume;
      log.volume = roundTo(totalVolume(log));
    }
  });
  (state.activeWorkout?.exercises || []).forEach((exercise) => convertSets(exercise.sets));
  state.units = target;
}

function setUnits(target) {
  if (!["imperial", "metric"].includes(target) || target === state.units) return;
  convertStoredUnits(target);
  saveState();
  toast(target === "metric" ? "Units set to kg and cm. History converted." : "Units set to lb and inches. History converted.");
  render();
}

function saveAthleteName(value) {
  state.athleteName = String(value || "").trim().slice(0, 60);
  saveState();
}

// ---------- Backup ----------

function backupPayload() {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, app: APP_NAME, exportedAt: new Date().toISOString(), state };
}

// Apple's HealthKit rules forbid storing Health data in iCloud, so automatic
// (iCloud/device) snapshots leave out anything imported from Apple Health; it
// is re-imported from Health after a restore. "Export Backup" stays complete
// because the athlete chooses where that file goes.
function nativeBackupPayload() {
  const copy = JSON.parse(JSON.stringify(state));
  const fromHealth = (entry) => String(entry?.id || "").startsWith("hk-");
  const strip = (entry) => {
    (Array.isArray(entry.healthFields) ? entry.healthFields : []).forEach((field) => { entry[field] = null; });
    delete entry.healthFields;
    return entry;
  };
  copy.weightLogs = (copy.weightLogs || []).filter((entry) => !fromHealth(entry)).map(strip);
  copy.measurements = (copy.measurements || []).filter((entry) => !fromHealth(entry)).map(strip);
  copy.prepLogs = (copy.prepLogs || []).filter((entry) => entry?.cardioType !== "HealthKit");
  if (copy.healthBody) copy.healthBody.lastSyncAt = null;
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, app: APP_NAME, exportedAt: new Date().toISOString(), state: copy };
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function shareOrDownload(text, filename, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  if (await shareNativePdf(blob, filename)) return "shared";
  downloadBlob(blob, filename);
  return "downloaded";
}

async function exportBackupFile() {
  const result = await shareOrDownload(JSON.stringify(backupPayload()), `mass-method-backup-${todayStamp()}.json`);
  toast(result === "shared" ? "Backup ready. Save it to Files or iCloud Drive." : "Backup downloaded.");
}

function isBackupPayload(payload) {
  return payload?.format === BACKUP_FORMAT && payload.state && typeof payload.state === "object" && !Array.isArray(payload.state);
}

function backupSummary(payloadState) {
  const logs = Array.isArray(payloadState.workoutLogs) ? payloadState.workoutLogs.length : 0;
  const weights = Array.isArray(payloadState.weightLogs) ? payloadState.weightLogs.length : 0;
  return `${logs} workouts and ${weights} weigh-ins`;
}

function restoreBackupPayload(payload, sourceLabel = "this backup") {
  if (!isBackupPayload(payload)) {
    toast("That file is not a Mass Method backup.");
    return false;
  }
  const native = Boolean(nativeBackupBridge());
  const confirmed = window.confirm(`Replace everything on this device with ${sourceLabel} (${backupSummary(payload.state)})? ${native ? "Your current data is saved to your backups first, so you can switch back." : "Export a backup first if you might want your current data back."}`);
  if (!confirmed) return false;
  if (native && state.profile) {
    // A separately named file, never overwritten by the daily snapshot.
    nativeBackupBridge().postMessage({ action: "snapshot", reason: "before-restore", filename: `mass-method-before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, json: JSON.stringify(nativeBackupPayload()) });
  }
  // The restored data's old backup time must not trigger an immediate
  // snapshot that overwrites today's backup with older data.
  const restored = { ...payload.state, backupStatus: { message: `Restored ${sourceLabel}.`, at: new Date().toISOString() } };
  try {
    Object.keys(localStorage).filter((key) => key.startsWith(`${STORE_KEY}-before-restore-`)).forEach((key) => localStorage.removeItem(key));
    restoringState = true;
    localStorage.setItem(STORE_KEY, JSON.stringify(restored));
  } catch {
    restoringState = false;
    toast("Could not write the backup to this device's storage.");
    return false;
  }
  window.location.reload();
  return true;
}

function registerIncomingFileHandler(format, handler) {
  incomingFileHandlers[format] = handler;
}

registerIncomingFileHandler(BACKUP_FORMAT, (payload) => restoreBackupPayload(payload));

// Every imported file (backup, coach package, coach program) arrives here,
// whether picked in the More tab or opened from Messages/Mail on iOS.
function handleIncomingFileText(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    toast("That file could not be read.");
    return false;
  }
  const handler = incomingFileHandlers[payload?.format];
  if (!handler) {
    toast("That file is not a Mass Method file.");
    return false;
  }
  return handler(payload);
}
window.handleIncomingFileText = handleIncomingFileText;

function importFileFromInput(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => handleIncomingFileText(String(reader.result || ""));
  reader.onerror = () => toast("That file could not be read.");
  reader.readAsText(file);
  input.value = "";
}

function nativeBackupBridge() {
  return window.webkit?.messageHandlers?.peaksetBackup || null;
}

function requestAutomaticSnapshot(reason = "scheduled", force = false) {
  const bridge = nativeBackupBridge();
  if (!bridge || !state.profile) return false;
  const last = Date.parse(state.backupStatus?.at || "");
  if (!force && Number.isFinite(last) && Date.now() - last < SNAPSHOT_INTERVAL_MS) return false;
  // The athlete id keeps a fresh install (new id until it restores) from
  // overwriting another install's backup for the same day in iCloud Drive.
  bridge.postMessage({ action: "snapshot", reason, filename: `mass-method-backup-${todayStamp()}-${String(state.athleteId || "device").slice(0, 8)}.json`, json: JSON.stringify(nativeBackupPayload()) });
  return true;
}

function refreshNativeBackups() {
  const bridge = nativeBackupBridge();
  if (!bridge) return;
  bridge.postMessage({ action: "list" });
}

function restoreNativeBackup(index) {
  const backup = nativeBackups[index];
  const bridge = nativeBackupBridge();
  if (!backup || !bridge) return;
  bridge.postMessage({ action: "restore", name: backup.name, location: backup.location });
}

function handleNativeBackup(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.status === "saved") {
    state.backupStatus = { message: `Backed up to ${payload.location || "this iPhone"}.`, at: new Date().toISOString(), location: payload.location || "" };
    saveState();
    if (state.view === "more") render();
  } else if (payload.status === "list") {
    nativeBackups = Array.isArray(payload.backups) ? payload.backups : [];
    if (state.view === "more" || onboardingRestoreOpen) render();
  } else if (payload.status === "restore") {
    let parsed = null;
    try { parsed = JSON.parse(payload.json || ""); } catch {}
    restoreBackupPayload(parsed, `the ${payload.location || "saved"} backup from ${formatShortDate(payload.date)}`);
  } else if (payload.status === "error") {
    state.backupStatus = { ...state.backupStatus, message: payload.message || "Automatic backup failed." };
    saveState();
    if (state.view === "more") render();
  }
}
window.handleNativeBackup = handleNativeBackup;

// Snapshot after every saved workout and at most daily on launch.
const baseFinishWorkoutForBackup = finishWorkout;
finishWorkout = function finishWorkoutWithBackup() {
  const before = state.workoutLogs.length;
  baseFinishWorkoutForBackup();
  if (state.workoutLogs.length > before) requestAutomaticSnapshot("workout", true);
};

// ---------- More tab ----------

function renderUnitsCard() {
  return `
    <section class="card pad">
      <p class="eyebrow">Units</p>
      <h2>Weight and measurements</h2>
      <div class="choice-grid" style="margin-top:12px">
        <button class="choice-btn ${state.units === "imperial" ? "active" : ""}" aria-pressed="${state.units === "imperial"}" onclick="setUnits('imperial')">lb · inches</button>
        <button class="choice-btn ${state.units === "metric" ? "active" : ""}" aria-pressed="${state.units === "metric"}" onclick="setUnits('metric')">kg · cm</button>
      </div>
      <p class="muted compact-note">Switching converts your saved weights, sets, and measurements once.</p>
      <div class="field" style="margin-top:12px">
        <label for="athleteName">Your name (shown to your coach)</label>
        <input id="athleteName" value="${escapeHtml(state.athleteName)}" placeholder="First and last name" maxlength="60" onchange="saveAthleteName(this.value)" />
      </div>
    </section>
  `;
}

function renderBackupCard() {
  const native = Boolean(nativeBackupBridge());
  const list = nativeBackups.slice(0, 10).map((backup, index) => `
    <div class="exercise-row">
      <div><strong>${formatShortDate(backup.date)}</strong><p class="muted" style="margin:2px 0 0">${escapeHtml(backup.location || "")} · ${Math.max(1, Math.round((Number(backup.bytes) || 0) / 1024))} KB</p></div>
      <button class="secondary-btn" onclick="restoreNativeBackup(${index})">Restore</button>
    </div>
  `).join("");
  return `
    <section class="card pad">
      <p class="eyebrow">Backup and restore</p>
      <h2>Keep your logbook safe</h2>
      ${native ? `
        <p class="muted">Mass Method backs up automatically after each saved workout and once a day. Backups go to iCloud Drive when it is on, otherwise to this iPhone (visible in the Files app). Apple Health data is not included; it re-imports from Apple Health after a restore.</p>
        <div class="signal-card"><span class="badge green">Automatic</span><strong>${escapeHtml(state.backupStatus?.message || "")}</strong>${state.backupStatus?.at ? `<p class="muted" style="margin:4px 0 0">${new Date(state.backupStatus.at).toLocaleString()}</p>` : ""}</div>
        <div class="actions" style="margin-top:12px">
          <button class="primary-btn" onclick="requestAutomaticSnapshot('manual', true)">Back Up Now</button>
          <button class="secondary-btn" onclick="refreshNativeBackups()">Show Backups</button>
        </div>
        ${list ? `<div class="exercise-list" style="margin-top:12px">${list}</div>` : ""}
      ` : `<p class="muted">Export a backup file and keep it somewhere safe. Automatic iCloud backups run in the iPhone app.</p>`}
      <div class="actions" style="margin-top:12px">
        <button class="secondary-btn" onclick="exportBackupFile()">Export Backup</button>
        <label class="secondary-btn file-btn">Import File<input type="file" accept=".json,.massmethod,application/json" onchange="importFileFromInput(this)" hidden /></label>
      </div>
      <p class="muted compact-note">Import also opens coach check-ins and programs (.massmethod files).</p>
    </section>
  `;
}

const moreSections = [];

function registerMoreSection(order, renderSection) {
  moreSections.push({ order, renderSection });
  moreSections.sort((a, b) => a.order - b.order);
}

registerMoreSection(10, renderUnitsCard);
registerMoreSection(20, renderBackupCard);

function renderMore() {
  return `
    <div class="compact-page-header"><p class="eyebrow">More</p><h1>Settings, backup, and coaching.</h1></div>
    <div class="grid more-grid">${moreSections.map((section) => section.renderSection()).join("")}</div>
  `;
}

// Restoring onto a new phone must not require completing onboarding first.
let onboardingRestoreOpen = false;

function openOnboardingRestore(open) {
  onboardingRestoreOpen = Boolean(open);
  if (onboardingRestoreOpen) refreshNativeBackups();
  render();
}

const baseRenderOnboardingForRestore = renderOnboarding;
renderOnboarding = function renderOnboardingWithRestore() {
  if (state.profile) return "";
  if (!onboardingRestoreOpen) {
    return baseRenderOnboardingForRestore().replace('<button class="primary-btn" onclick="saveProfile()">', '<button class="ghost-btn" onclick="openOnboardingRestore(true)">Restore from a backup</button><button class="primary-btn" onclick="saveProfile()">');
  }
  return `
    <div class="modal-screen">
      <section class="modal card pad">
        <p class="eyebrow">Welcome back</p>
        <h1>Restore your logbook</h1>
        ${renderBackupCard()}
        <button class="secondary-btn" style="margin-top:12px" onclick="openOnboardingRestore(false)">Start fresh instead</button>
      </section>
    </div>
  `;
};

const baseRenderContentWithMore = renderContent;
renderContent = function renderContentWithMore() {
  if (state.view === "more") return renderMore();
  return baseRenderContentWithMore();
};

const baseResetForSettings = resetDemoData;
resetDemoData = function resetWithSettings() {
  baseResetForSettings();
  settingsMigrateState();
  saveState();
  render();
};

const baseSetViewForMore = setView;
setView = function setViewWithMore(view) {
  baseSetViewForMore(view);
  if (view === "more" && nativeBackupBridge() && !nativeBackups.length) refreshNativeBackups();
};

saveState();
requestAutomaticSnapshot("launch");
render();
