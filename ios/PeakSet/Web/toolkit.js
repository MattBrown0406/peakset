"use strict";

const TOOLKIT_SCHEMA_VERSION = 2;
const setTypeOptions = [
  ["standard", "Standard"],
  ["top", "Top set"],
  ["backoff", "Back-off"],
  ["drop", "Drop set"],
  ["rest-pause", "Rest-pause"],
  ["myo", "Myo-rep"],
  ["cluster", "Cluster"],
  ["failure", "Failure"],
  ["partials", "Lengthened partials"]
];
const equipmentOptions = ["Barbell", "Dumbbells", "Cable", "Machine", "Smith", "Bench", "Bodyweight", "Bands", "Rack", "Pull-Up Bar", "Dip Station", "Plates", "Landmine", "Stability Ball", "Ab Wheel"];
const measurementDefinitions = [
  ["chest", "Chest"], ["waist", "Waist"], ["waistNavel", "Waist at Navel"],
  ["shoulders", "Shoulders"], ["neck", "Neck"], ["hips", "Hips / Glutes"],
  ["leftArm", "Left Arm"], ["rightArm", "Right Arm"], ["forearm", "Forearm"],
  ["leftThigh", "Left Thigh"], ["rightThigh", "Right Thigh"], ["calf", "Calf"],
  ["bodyFat", "Body Fat %"]
];

// app.js's stage checklist only knew the legacy arm/thigh keys. Register the
// expanded left/right keys so measurement progress is not silently ignored.
for (const [key, label, direction, growth] of [
  ["leftArm", "Left Arm", "up", true], ["rightArm", "Right Arm", "up", true], ["forearm", "Forearm", "up", true],
  ["leftThigh", "Left Thigh", "up", true], ["rightThigh", "Right Thigh", "up", true],
  ["neck", "Neck", "up", false], ["waistNavel", "Waist at Navel", "down", false]
]) {
  if (!measurementMetrics.some((metric) => metric.key === key)) measurementMetrics.push({ key, label, direction });
  if (growth && !growthMeasurementKeys.includes(key)) growthMeasurementKeys.push(key);
}

function defaultBuilderFormDraft() {
  return { title: "", muscle: "chest", exerciseFocus: "chest", exerciseId: "incline-db-press", sets: 3, reps: "8-12", rest: DEFAULT_REST_SECONDS, setType: "standard", group: "", dropSets: 0, scheduleDay: "", note: "" };
}

// Sets saved by early builds carry only a name, and some exercises were
// renamed since (e.g. "Seated Calf Raise" -> "Seated Calf Raises").
function exerciseForLoggedName(name) {
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/s$/, "");
  const wanted = normalize(name);
  if (!wanted) return null;
  return exerciseLibrary.find((item) => normalize(item.name) === wanted) || null;
}

function toolkitMigrateState() {
  state.toolkitSchemaVersion = TOOLKIT_SCHEMA_VERSION;
  if (!Array.isArray(state.favoriteExercises)) state.favoriteExercises = [];
  if (!state.exerciseSettings || typeof state.exerciseSettings !== "object") state.exerciseSettings = {};
  if (!state.substitutionPreferences || typeof state.substitutionPreferences !== "object") state.substitutionPreferences = {};
  if (!Array.isArray(state.equipmentProfiles) || state.equipmentProfiles.length === 0) {
    state.equipmentProfiles = [
      { id: "all-equipment", name: "Commercial Gym", equipment: [] },
      { id: "road-gym", name: "Road Gym", equipment: ["Dumbbells", "Cable", "Bench", "Bodyweight", "Bands"] }
    ];
  }
  // Ids are interpolated into inline handlers; repair any a crafted backup could abuse.
  const safeId = /^[A-Za-z0-9_-]{1,64}$/;
  state.equipmentProfiles = state.equipmentProfiles.filter((profile) => profile && typeof profile === "object").map((profile) => ({
    ...profile,
    id: safeId.test(String(profile.id)) ? profile.id : `equipment-${crypto.randomUUID()}`,
    name: String(profile.name || "Equipment").slice(0, 40),
    equipment: (Array.isArray(profile.equipment) ? profile.equipment : []).filter((item) => equipmentOptions.includes(item))
  }));
  if (!state.equipmentProfiles.length) state.equipmentProfiles = [{ id: "all-equipment", name: "Commercial Gym", equipment: [] }];
  if (!state.equipmentProfiles.some((profile) => profile.id === state.activeEquipmentProfileId)) state.activeEquipmentProfileId = state.equipmentProfiles[0].id;
  const objectsOnly = (value) => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) : []);
  state.weeklyCheckIns = objectsOnly(state.weeklyCheckIns);
  state.prepLogs = objectsOnly(state.prepLogs);
  if (typeof state.librarySearch !== "string") state.librarySearch = "";
  if (!state.libraryEquipmentFilter) state.libraryEquipmentFilter = "all";
  if (!state.measurementTrendKey) state.measurementTrendKey = "waist";
  if (!state.healthKitStatus) state.healthKitStatus = "Not connected";
  if (typeof state.healthKitEnabled !== "boolean") state.healthKitEnabled = false;
  if (!state.healthKitPermissions || typeof state.healthKitPermissions !== "object") state.healthKitPermissions = { weightWrite: false, workoutWrite: false };
  if (!state.builderFormDraft || typeof state.builderFormDraft !== "object") state.builderFormDraft = defaultBuilderFormDraft();
  state.builderFormDraft = {
    ...defaultBuilderFormDraft(),
    ...state.builderFormDraft,
    sets: clampSetCount(state.builderFormDraft.sets),
    rest: clampRestSeconds(state.builderFormDraft.rest),
    dropSets: clampDropSetCount(state.builderFormDraft.dropSets)
  };
  if (!exerciseLibrary.some((exercise) => exercise.id === state.selectedExerciseId)) state.selectedExerciseId = null;
  state.customPlans = (state.customPlans || []).filter((plan) => plan && typeof plan === "object" && !String(plan.id || "").startsWith("quick-")).map((plan) => ({
    ...plan,
    id: safeId.test(String(plan.id)) ? plan.id : `custom-${crypto.randomUUID()}`,
    exercises: (Array.isArray(plan?.exercises) ? plan.exercises : []).map((draft) => {
      if (Array.isArray(draft)) return draft;
      const spec = normalizePlanExercise(draft);
      return [spec.id, spec.sets, spec.reps, spec.rest, spec.dropSets, { group: spec.group, setType: spec.setType }];
    })
  }));
  state.workoutLogs = (state.workoutLogs || []).map((log) => ({
    ...log,
    sets: workoutLogSets(log).filter((set) => set && typeof set === "object").map((set) => {
      const exercise = exerciseLibrary.find((item) => item.id === set.exerciseId) || exerciseForLoggedName(set.exercise);
      return { setType: "standard", rir: "", ...set, exerciseId: set.exerciseId || exercise?.id || "" };
    })
  }));
  state.measurements = (state.measurements || []).map((entry) => ({
    ...entry,
    leftArm: entry.leftArm ?? entry.arm ?? null,
    rightArm: entry.rightArm ?? entry.arm ?? null,
    leftThigh: entry.leftThigh ?? entry.thigh ?? null,
    rightThigh: entry.rightThigh ?? entry.thigh ?? null
  }));
  saveState();
}

toolkitMigrateState();

function clampSetCount(value) {
  return Math.max(1, Math.min(10, Math.trunc(Number(value)) || 3));
}

function clampDropSetCount(value) {
  return Math.max(0, Math.min(4, Math.trunc(Number(value)) || 0));
}

function normalizePlanExercise(spec) {
  if (!spec || typeof spec !== "object") return { id: "", sets: 3, reps: "8-12", rest: DEFAULT_REST_SECONDS, dropSets: 0, group: "", setType: "standard" };
  if (Array.isArray(spec)) {
    const [id, sets, reps, rest, dropSets = 0, metadata = {}] = spec;
    return { id, sets: clampSetCount(sets), reps: String(reps || "8-12"), rest: clampRestSeconds(rest), dropSets: clampDropSetCount(dropSets), group: metadata?.group || "", setType: metadata?.setType || "standard" };
  }
  return {
    id: spec.id,
    sets: clampSetCount(spec.sets),
    reps: String(spec.reps || "8-12"),
    rest: clampRestSeconds(spec.rest),
    dropSets: clampDropSetCount(spec.dropSets),
    group: spec.group || "",
    setType: spec.setType || "standard"
  };
}

function activeEquipmentProfile() {
  return state.equipmentProfiles.find((profile) => profile.id === state.activeEquipmentProfileId) || state.equipmentProfiles[0];
}

// Most specific phrases first; each match is removed so "cable bar" or
// "pull-up bar" never also counts as a barbell.
const EQUIPMENT_KEYWORDS = [
  ["pull-up bar", ["pull-up bar"]],
  ["dip station", ["dip bar", "dip station", "captain chair"]],
  ["landmine", ["landmine", "t-bar"]],
  ["cable", ["cable bar", "cable", "rope", "handle", "ankle cuff"]],
  ["smith", ["smith machine", "smith"]],
  ["barbell", ["barbell", "ez bar", "bar"]],
  ["dumbbells", ["dumbbell"]],
  ["machine", ["machine", "pec deck", "leg press", "leg extension"]],
  ["bench", ["bench", "step"]],
  ["bodyweight", ["bodyweight", "floor"]],
  ["bands", ["band"]],
  ["rack", ["rack"]],
  ["plates", ["plate"]],
  ["stability ball", ["stability ball"]],
  ["ab wheel", ["ab wheel"]]
];

function equipmentRequirements(text) {
  let rest = text;
  const requirements = [];
  EQUIPMENT_KEYWORDS.forEach(([name, matches]) => {
    matches.forEach((match) => {
      if (!rest.includes(match)) return;
      if (!requirements.includes(name)) requirements.push(name);
      rest = rest.split(match).join(" ");
    });
  });
  return requirements;
}

// "Barbell or dumbbell, bench" = (barbell or dumbbells) and a bench. An
// alternative with no known equipment (e.g. "partner") counts as unavailable.
function exerciseMatchesEquipmentProfile(exercise, profile = activeEquipmentProfile()) {
  if (!profile || !profile.equipment?.length) return true;
  const available = new Set(profile.equipment.map((item) => item.toLowerCase()));
  return String(exercise?.equipment || "").toLowerCase().split(",").map((part) => part.trim()).filter(Boolean).every((part) =>
    part.split(/\s+or\s+/).some((alternative) => {
      const requirements = equipmentRequirements(alternative);
      return requirements.length > 0 && requirements.every((requirement) => available.has(requirement));
    }));
}

// Read-only: rendering the Library must not persist a record for every
// exercise shown (they would ride into every backup). saveExerciseSetting
// creates the record.
function exerciseSetting(id) {
  return state.exerciseSettings[id] || { note: "", pain: "none" };
}

function isFavoriteExercise(id) {
  return state.favoriteExercises.includes(id);
}

function toggleFavoriteExercise(id) {
  state.favoriteExercises = isFavoriteExercise(id)
    ? state.favoriteExercises.filter((item) => item !== id)
    : [...state.favoriteExercises, id];
  saveState();
  render();
}

let librarySearchTimer = null;

// Updates only the results grid so the search box keeps focus and the next
// chip tap is not swallowed by a full re-render on blur.
function setLibrarySearch(value) {
  state.librarySearch = String(value || "");
  clearTimeout(librarySearchTimer);
  librarySearchTimer = setTimeout(() => {
    saveState();
    const results = document.getElementById("libraryResults");
    if (results) results.innerHTML = renderLibraryResults();
  }, 150);
}

function libraryRows() {
  const search = state.librarySearch.trim().toLowerCase();
  const selectedProfile = activeEquipmentProfile();
  return exerciseLibrary.filter((exercise) => {
    // A search looks through every exercise; the chips filter browsing.
    const muscleMatch = search ? true : exercise.muscle === state.libraryFilter || (state.libraryFilter === "travel" && exercise.hotel) || (state.libraryFilter === "favorites" && isFavoriteExercise(exercise.id));
    const searchMatch = !search || `${exercise.name} ${exercise.equipment} ${exercise.cue} ${exercise.muscle}`.toLowerCase().includes(search);
    const equipmentMatch = state.libraryEquipmentFilter === "all" || exerciseMatchesEquipmentProfile(exercise, selectedProfile);
    return muscleMatch && searchMatch && equipmentMatch;
  });
}

function renderLibraryResults() {
  return libraryRows().map((exercise) => {
    const setting = exerciseSetting(exercise.id);
    return `<article class="card exercise-card"><div class="card-head"><h3>${escapeHtml(exercise.name)}</h3><button class="favorite-btn ${isFavoriteExercise(exercise.id) ? "active" : ""}" onclick="toggleFavoriteExercise('${exercise.id}')" aria-label="Favorite ${escapeHtml(exercise.name)}">★</button></div><p class="muted">${escapeHtml(exercise.cue)}</p><span class="badge blue">${escapeHtml(exercise.equipment)}</span>${setting.pain !== "none" ? `<span class="badge amber">Pain: ${escapeHtml(setting.pain)}</span>` : ""}${setting.note ? `<p class="compact-note">${escapeHtml(setting.note)}</p>` : ""}${renderLastPerformance(exercise.id)}<div class="actions"><button class="secondary-btn" onclick="selectExerciseHistory('${exercise.id}')">History</button><button class="primary-btn" onclick="quickStartExercise('${exercise.id}')">Quick Start</button></div></article>`;
  }).join("") || '<div class="empty"><p class="muted">No exercises match these filters.</p></div>';
}

function setLibraryEquipmentFilter(value) {
  state.libraryEquipmentFilter = value;
  saveState();
  render();
}

function selectExerciseHistory(id) {
  state.selectedExerciseId = id;
  saveState();
  render();
}

function closeExerciseHistory() {
  state.selectedExerciseId = null;
  saveState();
  render();
}

function exerciseLoggedSets(id) {
  const exercise = exerciseById(id);
  return (state.workoutLogs || []).flatMap((log) => workoutLogSets(log)
    .filter((set) => set.exerciseId === id || (!set.exerciseId && set.exercise === exercise.name))
    .map((set) => ({ ...set, date: log.date, workoutTitle: log.title })));
}

function exerciseHistorySessions(id) {
  const exercise = exerciseById(id);
  return (state.workoutLogs || []).map((log) => {
    const sets = workoutLogSets(log).filter((set) => set.exerciseId === id || (!set.exerciseId && set.exercise === exercise.name));
    return {
      date: log.date,
      title: log.title,
      sets,
      bestWeight: sets.reduce((best, set) => Math.max(best, Number(set.weight) || 0), 0),
      bestE1rm: sets.reduce((best, set) => Math.max(best, estimatedOneRepMax(set.weight, set.reps)), 0)
    };
  }).filter((session) => session.sets.length).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function lastExercisePerformance(id) {
  const exercise = exerciseById(id);
  const log = (state.workoutLogs || []).find((entry) => workoutLogSets(entry).some((set) => set.exerciseId === id || (!set.exerciseId && set.exercise === exercise.name)));
  if (!log) return null;
  return {
    date: log.date,
    title: log.title,
    sets: workoutLogSets(log).filter((set) => set.exerciseId === id || (!set.exerciseId && set.exercise === exercise.name))
  };
}

function estimatedOneRepMax(weight, reps) {
  const load = Number(weight) || 0;
  const count = Number(reps) || 0;
  if (!load || !count) return 0;
  return load * (1 + Math.min(count, 30) / 30);
}

function targetRepCeiling(target) {
  const matches = String(target || "").match(/\d+/g);
  return matches?.length ? Number(matches[matches.length - 1]) : null;
}

function progressionSuggestion(exercise) {
  const previous = lastExercisePerformance(exercise.id);
  if (!previous?.sets.length) return "Log a complete session to establish a progression target.";
  if (isRepsOnlyExercise(exercise)) {
    const bestReps = Math.max(0, ...previous.sets.map((set) => Number(set.reps) || 0));
    return bestReps ? `Reps-only movement. Beat ${bestReps} reps on your best set, or slow the tempo.` : "Reps-only movement. Log reps to track progression.";
  }
  const ceiling = targetRepCeiling(exercise.targetReps || previous.targetReps || "8-12") || 12;
  const workingAny = previous.sets.filter((set) => !set.dropSet && Number(set.reps) > 0);
  if (workingAny.length && workingAny.every((set) => !(Number(set.weight) > 0))) {
    const bestReps = Math.max(...workingAny.map((set) => Number(set.reps)));
    return `Bodyweight sets. Beat ${bestReps} reps on your best set, then add load or slow the tempo.`;
  }
  const working = previous.sets.filter((set) => !set.dropSet && Number(set.weight) > 0 && Number(set.reps) > 0);
  if (!working.length) return "Repeat the movement and establish working-set performance.";
  const rirOnTarget = (rir) => rir === "" || rir == null || rir === "failure" || Number(rir) <= 2;
  const allAtTop = working.every((set) => Number(set.reps) >= ceiling && rirOnTarget(set.rir));
  const bestWeight = Math.max(...working.map((set) => Number(set.weight)));
  if (allAtTop) {
    const legs = exerciseById(exercise.id).muscle === "legs";
    const increment = isMetric() ? (legs ? 2.5 : 1.25) : (legs ? 5 : 2.5);
    return `All working sets reached ${ceiling}+ reps. Try ${formatWeight(bestWeight + increment, 2)} ${weightUnit()} next time if form and RIR stay on target.`;
  }
  return `Keep ${formatWeight(bestWeight, 2)} ${weightUnit()} and add reps until every working set reaches ${ceiling} with 0-2 RIR.`;
}

function renderLastPerformance(id) {
  const previous = lastExercisePerformance(id);
  if (!previous) return '<p class="muted compact-note">No previous performance yet.</p>';
  const summary = previous.sets.slice(0, 5).map((set) => setLogSummary(set) + (set.rir !== "" && set.rir != null ? ` @ ${set.rir} RIR` : "")).join(" / ");
  return `<div class="previous-performance"><strong>Last: ${formatShortDate(previous.date)}</strong><p>${escapeHtml(summary)}</p></div>`;
}

function renderExerciseHistoryPanel(id) {
  if (!exerciseLibrary.some((exercise) => exercise.id === id)) return "";
  const exercise = exerciseById(id);
  const sessions = exerciseHistorySessions(id);
  const sets = sessions.flatMap((session) => session.sets);
  const setting = exerciseSetting(id);
  const preferred = state.substitutionPreferences?.[id];
  const swapNote = preferred && exerciseLibrary.some((item) => item.id === preferred)
    ? `<p class="compact-note">When ${escapeHtml(exercise.name)} isn't available, workouts use ${escapeHtml(exerciseById(preferred).name)}. <button class="ghost-btn" onclick="clearSubstitutionPreference('${id}')">Stop substituting</button></p>`
    : "";
  const bestWeight = sets.reduce((best, set) => Math.max(best, Number(set.weight) || 0), 0);
  const bestE1rm = sets.reduce((best, set) => Math.max(best, estimatedOneRepMax(set.weight, set.reps)), 0);
  const e1rmValues = [...sessions].reverse().map((session) => session.bestE1rm).filter(Boolean);
  const history = sessions.slice(0, 12);
  return `
    <section class="card pad toolkit-history">
      <div class="card-head"><div><p class="eyebrow">Exercise history</p><h2>${escapeHtml(exercise.name)}</h2></div><button class="ghost-btn" onclick="closeExerciseHistory()">Close</button></div>
      <div class="grid three">
        <div class="stat card"><p class="value">${bestWeight || "--"}</p><p class="label">Best weight</p></div>
        <div class="stat card"><p class="value">${bestE1rm ? Math.round(bestE1rm) : "--"}</p><p class="label">Estimated 1RM</p></div>
        <div class="stat card"><p class="value">${sets.length}</p><p class="label">Logged sets</p></div>
      </div>
      ${e1rmValues.length > 1 ? `<div style="margin-top:12px">${sparkline(e1rmValues)}</div>` : ""}
      <div class="grid two" style="margin-top:14px">
        <div class="field"><label for="exerciseNote">Setup / coaching note</label><textarea id="exerciseNote" rows="3" placeholder="Seat 4, neutral handles...">${escapeHtml(setting.note || "")}</textarea></div>
        <div class="field"><label for="exercisePain">Discomfort</label><select id="exercisePain">${["none","mild","moderate","stop"].map((value) => `<option value="${value}" ${setting.pain === value ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select><button class="secondary-btn" style="margin-top:10px" onclick="saveExerciseSetting('${id}')">Save Note</button></div>
      </div>
      ${swapNote}
      <h3 style="margin-top:16px">Recent sessions</h3>
      <div class="exercise-list">${history.map((session) => `<div class="exercise-row"><span>${formatShortDate(session.date)} · ${escapeHtml(session.title)}</span><strong>${escapeHtml(session.sets.map((set) => setLogSummary(set) + (set.rir !== "" && set.rir != null ? ` @ ${set.rir} RIR` : "")).join(" / "))}</strong></div>`).join("") || '<p class="muted">No sessions logged yet.</p>'}</div>
    </section>`;
}

function clearSubstitutionPreference(id) {
  if (state.substitutionPreferences) delete state.substitutionPreferences[id];
  saveState();
  toast("Substitution cleared.");
  render();
}

function saveExerciseSetting(id) {
  state.exerciseSettings[id] = {
    ...exerciseSetting(id),
    note: document.getElementById("exerciseNote")?.value.trim() || "",
    pain: document.getElementById("exercisePain")?.value || "none"
  };
  saveState();
  toast("Exercise note saved.");
  render();
}

renderLibrary = function renderToolkitLibrary() {
  const selectedProfile = activeEquipmentProfile();
  const searching = Boolean(state.librarySearch.trim());
  return `
    <div class="compact-page-header"><p class="eyebrow">Exercise library</p><h1>Find, favorite, and track every movement.</h1></div>
    ${renderExerciseHistoryPanel(state.selectedExerciseId)}
    <section class="card pad" style="margin-bottom:16px"><div class="grid two"><div class="field"><label for="librarySearch">Search all exercises</label><input id="librarySearch" type="search" value="${escapeHtml(state.librarySearch)}" placeholder="Exercise, muscle, equipment, cue..." oninput="setLibrarySearch(this.value)" /></div><div class="field"><label for="libraryEquipment">Equipment profile</label><select id="libraryEquipment" onchange="setLibraryEquipmentFilter(this.value)"><option value="all">All equipment</option><option value="profile" ${state.libraryEquipmentFilter === "profile" ? "selected" : ""}>${escapeHtml(selectedProfile.name)}</option></select></div></div></section>
    <div class="filters" style="margin-bottom:16px">${[...muscles,"abs","travel","favorites"].map((filter) => `<button class="chip ${!searching && state.libraryFilter === filter ? "active" : ""}" onclick="state.librarySearch = ''; setLibraryFilter('${filter}')">${filter === "travel" ? "Road Gym" : filter[0].toUpperCase() + filter.slice(1)}</button>`).join("")}</div>
    <div class="grid three" id="libraryResults">${renderLibraryResults()}</div>`;
};

function saveEquipmentProfile() {
  const name = document.getElementById("equipmentProfileName")?.value.trim();
  const equipment = equipmentOptions.filter((item) => document.getElementById(equipmentInputId(item))?.checked);
  if (!name) return toast("Name the equipment profile.");
  const profile = { id: `equipment-${Date.now()}`, name, equipment };
  state.equipmentProfiles.push(profile);
  state.activeEquipmentProfileId = profile.id;
  saveState();
  toast("Equipment profile saved.");
  render();
}

function equipmentInputId(item) {
  return `equipment-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function selectEquipmentProfile(id) {
  state.activeEquipmentProfileId = id;
  const focus = state.builderFormDraft?.exerciseFocus || "chest";
  const available = toolkitBuilderExerciseRows(focus);
  if (!available.some((exercise) => exercise.id === state.builderFormDraft?.exerciseId)) {
    state.builderFormDraft.exerciseId = available[0]?.id || "";
  }
  saveState();
  render();
}

function deleteEquipmentProfile(id) {
  if (state.equipmentProfiles.length <= 1) return toast("Keep at least one equipment profile.");
  state.equipmentProfiles = state.equipmentProfiles.filter((profile) => profile.id !== id);
  if (state.activeEquipmentProfileId === id) state.activeEquipmentProfileId = state.equipmentProfiles[0].id;
  saveState();
  render();
}

function toolkitBuilderExerciseRows(focus) {
  const profile = activeEquipmentProfile();
  return exerciseLibrary.filter((exercise) => {
    const focusMatch = focus === "travel" ? exercise.hotel : exercise.muscle === focus;
    return focusMatch && exerciseMatchesEquipmentProfile(exercise, profile);
  });
}

function toolkitBuilderExerciseOptions(focus) {
  return toolkitBuilderExerciseRows(focus).map((exercise) => `<option value="${exercise.id}">${escapeHtml(exercise.name)}</option>`).join("");
}

function updateBuilderFormField(key, value) {
  const draft = state.builderFormDraft || defaultBuilderFormDraft();
  draft[key] = ["sets", "rest", "dropSets"].includes(key) ? Number(value) : value;
  state.builderFormDraft = draft;
  saveState();
}

function toolkitUpdateBuilderExercises() {
  const focus = document.getElementById("customExerciseFocus")?.value || state.builderFormDraft.exerciseFocus || "chest";
  updateBuilderFormField("exerciseFocus", focus);
  const select = document.getElementById("customExercise");
  if (select) {
    select.innerHTML = toolkitBuilderExerciseOptions(focus);
    const available = toolkitBuilderExerciseRows(focus);
    const selected = available.some((exercise) => exercise.id === state.builderFormDraft.exerciseId) ? state.builderFormDraft.exerciseId : available[0]?.id || "";
    select.value = selected;
    updateBuilderFormField("exerciseId", selected);
  }
}

function addToolkitBuilderExercise() {
  const draft = state.builderFormDraft || defaultBuilderFormDraft();
  const id = draft.exerciseId;
  if (!id || !exerciseLibrary.some((exercise) => exercise.id === id && exerciseMatchesEquipmentProfile(exercise))) return toast("Choose an exercise available in this equipment profile.");
  builderDraft.push({
    id,
    sets: Number(draft.sets) || 3,
    reps: draft.reps || "8-12",
    rest: Number(draft.rest) || DEFAULT_REST_SECONDS,
    dropSets: Number(draft.dropSets) || 0,
    group: String(draft.group || "").trim().toUpperCase(),
    setType: draft.setType || "standard"
  });
  saveState();
  render();
}

function moveBuilderExercise(index, direction) {
  const destination = index + direction;
  if (destination < 0 || destination >= builderDraft.length) return;
  [builderDraft[index], builderDraft[destination]] = [builderDraft[destination], builderDraft[index]];
  saveState();
  render();
}

function duplicateBuilderExercise(index) {
  builderDraft.splice(index + 1, 0, { ...normalizePlanExercise(builderDraft[index]) });
  saveState();
  render();
}

removeBuilderExercise = function removeToolkitBuilderExercise(index) {
  builderDraft.splice(index, 1);
  saveState();
  render();
};

function builderPlanFromForm() {
  const draft = state.builderFormDraft || defaultBuilderFormDraft();
  const muscle = draft.muscle || "chest";
  return {
    id: `custom-${Date.now()}`,
    title: String(draft.title || "").trim() || `${muscleLabel(muscle)} Custom Session`,
    muscle,
    phase: muscle === "travel" ? "travel" : state.phase,
    rest: Number(draft.rest) || DEFAULT_REST_SECONDS,
    note: String(draft.note || "").trim() || "Custom bodybuilding session.",
    scheduleDay: draft.scheduleDay || "",
    equipmentProfileId: state.activeEquipmentProfileId,
    exercises: builderDraft.map((draft) => {
      const spec = normalizePlanExercise(draft);
      return [spec.id, spec.sets, spec.reps, spec.rest, spec.dropSets, { group: spec.group, setType: spec.setType }];
    })
  };
}

function saveBuilderTemplate() {
  if (!builderDraft.length) return toast("Add at least one exercise.");
  const plan = builderPlanFromForm();
  state.customPlans.unshift(plan);
  builderDraft = [];
  state.builderFormDraft = defaultBuilderFormDraft();
  saveState();
  toast("Workout template saved.");
  render();
}

startCustomWorkout = function startToolkitCustomWorkout() {
  if (!builderDraft.length) return toast("Add at least one exercise.");
  const plan = { ...builderPlanFromForm(), adHoc: true };
  if (!beginWorkoutFromPlan(plan)) return;
  builderDraft = [];
  state.builderFormDraft = defaultBuilderFormDraft();
  saveState();
  toast("Workout started.");
};

function duplicateCustomPlan(id) {
  const source = state.customPlans.find((plan) => plan.id === id);
  if (!source) return;
  state.customPlans.unshift({ ...structuredClone(source), id: `custom-${crypto.randomUUID()}`, title: `${source.title} Copy`, scheduleDay: "" });
  saveState();
  render();
}

function deleteCustomPlan(id) {
  const plan = state.customPlans.find((item) => item.id === id);
  if (!plan || !window.confirm(`Delete the template "${plan.title}"?`)) return;
  state.customPlans = state.customPlans.filter((item) => item.id !== id);
  saveState();
  render();
}

function duplicateScheduledWeek() {
  const scheduled = state.customPlans.filter((plan) => plan.scheduleDay);
  if (!scheduled.length) return toast("Schedule at least one custom template first.");
  const copies = scheduled.map((plan, index) => ({
    ...structuredClone(plan),
    id: `custom-${Date.now()}-${index}`,
    title: `${plan.title} (copy)`,
    // Copies stay unscheduled: Today follows the newest template for a day,
    // so scheduled copies would silently replace this week's plan.
    scheduleDay: ""
  }));
  state.customPlans.unshift(...copies);
  saveState();
  toast(`${plural(copies.length, "template")} copied. Edit and schedule the copies when you're ready.`);
  render();
}

function updateCustomPlanSchedule(id, scheduleDay) {
  const plan = state.customPlans.find((item) => item.id === id);
  if (!plan) return;
  plan.scheduleDay = scheduleDay;
  saveState();
  render();
}

renderBuilder = function renderToolkitBuilder() {
  const profile = activeEquipmentProfile();
  const form = state.builderFormDraft || defaultBuilderFormDraft();
  // A new or switched equipment profile can hide the remembered exercise;
  // fall back to the first one the select will actually show.
  const availableForForm = toolkitBuilderExerciseRows(form.exerciseFocus);
  if (!availableForForm.some((exercise) => exercise.id === form.exerciseId)) form.exerciseId = availableForForm[0]?.id || "";
  state.builderFormDraft = form;
  const normalizedDraft = builderDraft.map(normalizePlanExercise);
  builderDraft = normalizedDraft;
  return `
    <div class="builder-header"><div><p class="eyebrow">Advanced workout builder</p><h1>Build, group, schedule, and reuse your training.</h1></div></div>
    <div class="grid two">
      <section class="card pad">
        <div class="grid two"><div class="field"><label>Workout title</label><input id="customTitle" value="${escapeHtml(form.title)}" placeholder="Push A · Upper chest" oninput="updateBuilderFormField('title',this.value)" /></div><div class="field"><label>Focus</label><select id="customMuscle" onchange="updateBuilderFormField('muscle',this.value)">${[...muscles,"abs","travel"].map((item) => `<option value="${item}" ${form.muscle === item ? "selected" : ""}>${item === "travel" ? "Road Gym" : item[0].toUpperCase() + item.slice(1)}</option>`).join("")}</select></div></div>
        <div class="grid two" style="margin-top:10px"><div class="field"><label>Exercise focus</label><select id="customExerciseFocus" onchange="toolkitUpdateBuilderExercises()">${[...muscles,"abs","travel"].map((item) => `<option value="${item}" ${form.exerciseFocus === item ? "selected" : ""}>${item === "travel" ? "Road Gym" : item[0].toUpperCase() + item.slice(1)}</option>`).join("")}</select></div><div class="field"><label>Exercise · ${escapeHtml(profile.name)}</label><select id="customExercise" onchange="updateBuilderFormField('exerciseId',this.value)">${toolkitBuilderExerciseRows(form.exerciseFocus).map((exercise) => `<option value="${exercise.id}" ${form.exerciseId === exercise.id ? "selected" : ""}>${escapeHtml(exercise.name)}</option>`).join("")}</select></div></div>
        <div class="grid three" style="margin-top:10px"><div class="field"><label>Sets</label><input id="customSets" type="number" value="${form.sets}" min="1" max="10" oninput="updateBuilderFormField('sets',this.value)" /></div><div class="field"><label>Reps</label><input id="customReps" value="${escapeHtml(form.reps)}" oninput="updateBuilderFormField('reps',this.value)" /></div><div class="field"><label>Rest seconds</label><input id="customRest" type="number" value="${form.rest}" min="15" max="300" step="15" oninput="updateBuilderFormField('rest',this.value)" /></div></div>
        <div class="grid three" style="margin-top:10px"><div class="field"><label>Set type</label><select id="customSetType" onchange="updateBuilderFormField('setType',this.value)">${setTypeOptions.map(([value,label]) => `<option value="${value}" ${form.setType === value ? "selected" : ""}>${label}</option>`).join("")}</select></div><div class="field"><label>Superset group</label><input id="customGroup" value="${escapeHtml(form.group)}" placeholder="A, B, C..." maxlength="2" oninput="updateBuilderFormField('group',this.value)" /></div><div class="field"><label>Drop sets</label><input id="customDropSets" type="number" value="${form.dropSets}" min="0" max="4" oninput="updateBuilderFormField('dropSets',this.value)" /></div></div>
        <div class="grid two" style="margin-top:10px"><div class="field"><label>Schedule</label><select id="customSchedule" onchange="updateBuilderFormField('scheduleDay',this.value)"><option value="">Unscheduled</option>${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day) => `<option value="${day}" ${form.scheduleDay === day ? "selected" : ""}>${day}</option>`).join("")}</select></div><div class="field"><label>Workout note</label><input id="customNote" value="${escapeHtml(form.note)}" placeholder="Intent, sequence, coaching note..." oninput="updateBuilderFormField('note',this.value)" /></div></div>
        <div class="actions" style="margin-top:14px"><button class="secondary-btn" onclick="addToolkitBuilderExercise()">Add Exercise</button><button class="secondary-btn" onclick="saveBuilderTemplate()">Save Template</button><button class="primary-btn" onclick="startCustomWorkout()">Start Workout</button></div>
      </section>
      <section class="card pad"><h2>Draft</h2><div class="exercise-list">${normalizedDraft.map((spec,index) => `<div class="exercise-row"><div><strong>${spec.group ? `${escapeHtml(spec.group)} · ` : ""}${escapeHtml(exerciseById(spec.id).name)}</strong><p class="muted">${spec.sets} × ${escapeHtml(spec.reps)} · ${escapeHtml(setTypeOptions.find(([value]) => value === spec.setType)?.[1] || spec.setType)}${spec.dropSets ? ` · ${spec.dropSets} drop` : ""}</p></div><div class="mini-actions"><button onclick="moveBuilderExercise(${index},-1)">↑</button><button onclick="moveBuilderExercise(${index},1)">↓</button><button onclick="duplicateBuilderExercise(${index})">Copy</button><button class="danger" onclick="removeBuilderExercise(${index})">×</button></div></div>`).join("") || '<div class="empty"><p class="muted">No exercises added yet.</p></div>'}</div></section>
    </div>
    <section class="card pad" style="margin-top:16px"><div class="card-head"><div><p class="eyebrow">Equipment profiles</p><h2>${escapeHtml(profile.name)}</h2></div><select onchange="selectEquipmentProfile(this.value)">${state.equipmentProfiles.map((item) => `<option value="${item.id}" ${item.id === profile.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div><div class="grid two"><div><p class="muted">${profile.equipment.length ? profile.equipment.join(" · ") : "All equipment available"}</p><button class="ghost-btn danger" onclick="deleteEquipmentProfile('${profile.id}')">Delete Active Profile</button></div><div><div class="field"><label>New profile name</label><input id="equipmentProfileName" placeholder="Garage Gym" /></div><div class="equipment-checks">${equipmentOptions.map((item) => `<label><input id="${equipmentInputId(item)}" type="checkbox" /> ${item}</label>`).join("")}</div><button class="secondary-btn" onclick="saveEquipmentProfile()">Save Profile</button></div></div></section>
    <section class="card pad" style="margin-top:16px"><div class="card-head"><p class="eyebrow">Saved templates</p><button class="secondary-btn" onclick="duplicateScheduledWeek()">Duplicate Scheduled Week</button></div><div class="grid three">${state.customPlans.map((plan) => `<article class="card plan-card"><h3>${escapeHtml(plan.title)}</h3><p class="muted">${escapeHtml(plan.scheduleDay || "Unscheduled")} · ${plural(plan.exercises.length, "exercise")}</p><div class="field"><label>Scheduled day</label><select onchange="updateCustomPlanSchedule('${plan.id}',this.value)"><option value="">Unscheduled</option>${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day) => `<option value="${day}" ${plan.scheduleDay === day ? "selected" : ""}>${day}</option>`).join("")}</select></div><div class="actions"><button class="primary-btn" onclick="startWorkout('${plan.id}')">Start</button><button class="secondary-btn" onclick="duplicateCustomPlan('${plan.id}')">Duplicate</button><button class="ghost-btn danger" onclick="deleteCustomPlan('${plan.id}')">Delete</button></div></article>`).join("") || '<p class="muted">No saved custom templates.</p>'}</div></section>`;
};

const baseTodaysRecommendedPlan = todaysRecommendedPlan;
todaysRecommendedPlan = function scheduledRecommendedPlan() {
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  return state.customPlans.find((plan) => plan.scheduleDay === day) || baseTodaysRecommendedPlan();
};

function toolkitSetRows(spec) {
  const working = Array.from({ length: Math.max(1, spec.sets) }, (_, index) => ({ set: index + 1, label: String(index + 1), dropSet: false, setType: spec.setType || "standard", weight: "", reps: "", rir: "", done: false }));
  const drops = Array.from({ length: Math.max(0, Math.min(4, spec.dropSets)) }, (_, index) => ({ set: spec.sets + index + 1, label: `D${index + 1}`, dropSet: true, setType: "drop", weight: "", reps: "", rir: "", done: false }));
  return [...working, ...drops];
}

beginWorkoutFromPlan = function beginToolkitWorkout(plan) {
  if (state.activeWorkout) {
    // Starting a plan, quick log, or builder session must never overwrite a
    // live workout with entered sets.
    state.view = "session";
    saveState();
    render();
    toast("Finish or cancel your current workout before starting another.");
    return false;
  }
  const specs = (Array.isArray(plan?.exercises) ? plan.exercises : []).map(normalizePlanExercise).filter((spec) => exerciseLibrary.some((item) => item.id === spec.id));
  const planIds = new Set(specs.map((spec) => spec.id));
  const usedIds = new Set();
  const quickLog = String(plan?.id || "").startsWith("quick-");
  const travel = plan?.phase === "travel" || plan?.muscle === "travel";
  if (!specs.length) {
    toast("This workout has no exercises available in the library.");
    return false;
  }
  if (state.timer.running) stopTimer();
  state.activeWorkout = {
    id: crypto.randomUUID(), planId: plan.id, title: plan.title, phase: plan.phase, startedAt: new Date().toISOString(),
    exercises: specs.map((spec) => {
      const preferred = state.substitutionPreferences[spec.id];
      const source = exerciseById(spec.id);
      // A saved swap applies only when the planned movement isn't available,
      // never duplicates another exercise, respects Road Gym, and never
      // overrides an exercise the athlete picked directly (Quick Start).
      const usePreferred = !quickLog && preferred && exerciseLibrary.some((item) => item.id === preferred)
        && !planIds.has(preferred) && !usedIds.has(preferred)
        && (!travel || exerciseById(preferred).hotel)
        && !exerciseMatchesEquipmentProfile(source) && exerciseMatchesEquipmentProfile(exerciseById(preferred));
      const id = usePreferred ? preferred : spec.id;
      usedIds.add(id);
      const exercise = exerciseById(id);
      return { id, originalId: spec.id, name: exercise.name, repsOnly: exercise.muscle === "abs", targetSets: spec.sets, targetDropSets: spec.dropSets, targetReps: spec.reps, rest: spec.rest, group: spec.group, defaultSetType: spec.setType, sets: toolkitSetRows(spec) };
    })
  };
  state.view = "session";
  state.timer = { seconds: DEFAULT_REST_SECONDS, left: 0, running: false, startedAt: null, endsAt: null, fullscreen: false, exerciseIndex: null };
  saveState();
  render();
  return true;
};

function copyPreviousPerformance(exIndex) {
  const exercise = state.activeWorkout.exercises[exIndex];
  const previous = lastExercisePerformance(exercise.id);
  if (!previous) return toast("No previous performance to copy.");
  const previousWorking = previous.sets.filter((set) => !set.dropSet);
  const previousDrops = previous.sets.filter((set) => set.dropSet);
  let workingIndex = 0;
  let dropIndex = 0;
  exercise.sets.forEach((set) => {
    const source = set.dropSet ? previousDrops[dropIndex++] : previousWorking[workingIndex++];
    if (!source || set.done) return;
    set.weight = isRepsOnlyExercise(exercise) ? "" : source.weight || "";
    set.reps = source.reps || "";
    set.rir = source.rir ?? "";
    set.setType = source.setType || set.setType;
  });
  saveState();
  render();
}

function liveExerciseCandidates(currentId = null) {
  const current = currentId ? exerciseById(currentId) : null;
  const existing = new Set((state.activeWorkout?.exercises || []).map((item) => item.id));
  const travel = state.activeWorkout?.phase === "travel";
  return exerciseLibrary.filter((item) =>
    !existing.has(item.id)
    && (!travel || item.hotel)
    && exerciseMatchesEquipmentProfile(item)
    && (!current || item.muscle === current.muscle));
}

function substituteActiveExercise(exIndex, id) {
  const exercise = state.activeWorkout?.exercises?.[exIndex];
  if (!exercise || !id) return;
  if (exerciseHasProgress(exercise)) {
    // Entered sets belong to the original movement; relabelling them would
    // corrupt that exercise's history and PRs.
    toast("Sets already entered for this exercise. Add the replacement as a new exercise instead.");
    render();
    return;
  }
  if (!liveExerciseCandidates(exercise.id).some((item) => item.id === id)) {
    toast("That substitute is not available for this workout.");
    render();
    return;
  }
  state.substitutionPreferences[exercise.originalId || exercise.id] = id;
  const replacement = exerciseById(id);
  exercise.id = id;
  exercise.name = replacement.name;
  exercise.repsOnly = replacement.muscle === "abs";
  saveState();
  toast(`Substituted ${replacement.name}.`);
  render();
}

function addLiveExercise() {
  const id = document.getElementById("liveExerciseAdd")?.value;
  if (!id || !state.activeWorkout) return;
  if (!liveExerciseCandidates().some((item) => item.id === id)) return toast("That exercise is already in this workout or unavailable here.");
  const exercise = exerciseById(id);
  const spec = { id, sets: 3, reps: "8-12", rest: DEFAULT_REST_SECONDS, dropSets: 0, group: "", setType: "standard" };
  state.activeWorkout.exercises.push({ id, originalId: id, name: exercise.name, repsOnly: exercise.muscle === "abs", targetSets: 3, targetDropSets: 0, targetReps: "8-12", rest: DEFAULT_REST_SECONDS, group: "", defaultSetType: "standard", sets: toolkitSetRows(spec) });
  saveState();
  render();
}

function removeLiveExercise(index) {
  // app.js protects entered sets and keeps the rest timer attached correctly.
  return removeActiveWorkoutExercise(index);
}

function moveLiveExercise(index, direction) {
  return moveActiveWorkoutExercise(index, direction);
}

function adjustLiveSets(exIndex, delta) {
  const exercise = state.activeWorkout.exercises[exIndex];
  if (!exercise) return;
  if (delta > 0 && exercise.sets.filter((set) => !set.dropSet).length < 12) {
    const next = exercise.sets.filter((set) => !set.dropSet).length + 1;
    const row = { set: next, label: String(next), dropSet: false, setType: exercise.defaultSetType || "standard", weight: "", reps: "", rir: "", done: false };
    const firstDrop = exercise.sets.findIndex((set) => set.dropSet);
    if (firstDrop === -1) exercise.sets.push(row);
    else exercise.sets.splice(firstDrop, 0, row);
    exercise.targetSets += 1;
  } else if (delta < 0 && exercise.sets.filter((set) => !set.dropSet).length > 1) {
    const index = exercise.sets.map((set, setIndex) => ({ set, setIndex })).filter(({ set }) => !set.dropSet).at(-1).setIndex;
    if (exercise.sets[index].done) return toast("Uncheck the final working set before removing it.");
    if ((exercise.sets[index].weight !== "" || exercise.sets[index].reps !== "") && !window.confirm("The last set has entries. Remove it anyway?")) return;
    exercise.sets.splice(index, 1);
    exercise.targetSets = Math.max(1, exercise.targetSets - 1);
  }
  saveState();
  render();
}

function saveActiveWorkoutAsTemplate() {
  const workout = state.activeWorkout;
  if (!workout) return;
  state.customPlans.unshift({
    id: `custom-${Date.now()}`,
    title: `${workout.title} Template`,
    muscle: exerciseById(workout.exercises[0].id).muscle,
    phase: workout.phase || state.phase,
    rest: DEFAULT_REST_SECONDS,
    note: "Saved from an active Mass Method workout.",
    scheduleDay: "",
    equipmentProfileId: state.activeEquipmentProfileId,
    exercises: workout.exercises.map((exercise) => [
      exercise.id,
      exercise.fullSets ?? exercise.sets.filter((set) => !set.dropSet).length,
      exercise.targetReps,
      exercise.rest,
      exercise.fullDropSets ?? exercise.sets.filter((set) => set.dropSet).length,
      { group: exercise.group || "", setType: exercise.fullSetType || exercise.defaultSetType || "standard" }
    ])
  });
  saveState();
  toast("Active workout saved as a reusable template.");
}

function updateSetType(exIndex, setIndex, value) {
  updateSet(exIndex, setIndex, "setType", value);
}

completeSet = function completeToolkitSet(exIndex, setIndex) {
  const exercise = state.activeWorkout?.exercises?.[exIndex];
  const set = exercise?.sets?.[setIndex];
  if (!exercise || !set) return;
  const repsOnly = isRepsOnlyExercise(exercise);
  const weight = Number(set.weight);
  const reps = Number(set.reps);
  const weightValid = repsOnly || (set.weight !== "" && Number.isFinite(weight) && weight >= 0);
  if (set.reps === "" || !Number.isInteger(reps) || reps <= 0 || !weightValid) {
    return toast(repsOnly ? "Enter whole-number reps before completing the set." : "Enter a non-negative weight and whole-number reps before completing the set.");
  }
  set.done = !set.done;
  // Where the athlete is working: the watch returns here after a rest even
  // when exercises are done out of order.
  if (set.done) state.activeWorkout.lastExerciseIndex = exIndex;
  // Undoing a mis-tap on an untouched exercise lets the watch move on.
  else if (state.activeWorkout.lastExerciseIndex === exIndex && !exercise.sets.some((item) => item.done)) state.activeWorkout.lastExerciseIndex = null;
  saveState();
  if (set.done) {
    const group = exercise.group;
    const groupExercises = group ? state.activeWorkout.exercises.filter((item) => item.group === group) : [];
    // Match partners by the same working (or drop) set number; raw indexes
    // drift when partners have different set or drop counts.
    const ordinal = exercise.sets.slice(0, setIndex + 1).filter((item) => Boolean(item.dropSet) === Boolean(set.dropSet)).length;
    const groupPending = groupExercises.some((item) => {
      const partnerSet = item.sets.filter((candidate) => Boolean(candidate.dropSet) === Boolean(set.dropSet))[ordinal - 1];
      return partnerSet && !partnerSet.done;
    });
    if (!groupPending) startTimer(exercise.rest, state.view === "session", exIndex);
    else toast(`Complete the remaining ${group} exercise before resting.`);
  }
  render();
};

finishWorkout = function finishToolkitWorkout() {
  const workout = state.activeWorkout;
  if (!workout) return;
  const unlogged = workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => !set.done && (set.weight !== "" || set.reps !== "")).length;
  if (unlogged && !window.confirm(`${unlogged} ${unlogged === 1 ? "set has" : "sets have"} entries but ${unlogged === 1 ? "isn't" : "aren't"} marked Complete and won't be saved. Save the session anyway?`)) return;
  const sets = workout.exercises.flatMap((exercise) => exercise.sets.filter((set) => set.done).map((set) => ({
    exercise: exercise.name, exerciseId: exercise.id, weight: isRepsOnlyExercise(exercise) ? "" : set.weight, reps: set.reps,
    rir: set.rir ?? "", setType: set.setType || "standard", group: exercise.group || "", repsOnly: isRepsOnlyExercise(exercise), dropSet: Boolean(set.dropSet), label: set.label || String(set.set), targetReps: exercise.targetReps,
    // Keep the pre-switch value so a later unit switch back restores it exactly.
    ...(set._unitOrigin?.weight ? { _unitOrigin: { weight: set._unitOrigin.weight } } : {})
  })));
  if (!sets.length) return toast("Complete at least one set before saving.");
  const endedAt = new Date().toISOString();
  const log = { id: workout.id, title: workout.title, phase: workout.phase, date: endedAt, startedAt: workout.startedAt, sets, volume: sets.reduce((sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0) };
  state.workoutLogs.unshift(log);
  if (state.healthKitEnabled && window.webkit?.messageHandlers?.peaksetHealthKit) window.webkit.messageHandlers.peaksetHealthKit.postMessage({ action: "saveWorkout", id: workout.id, title: workout.title, startedAt: workout.startedAt, endedAt });
  state.activeWorkout = null;
  state.view = "today";
  stopTimer();
  saveState();
  toast("Workout saved.");
  render();
};

function renderToolkitExerciseControls(exercise, exIndex) {
  const source = exerciseById(exercise.id);
  const substitutions = exerciseHasProgress(exercise) ? [] : liveExerciseCandidates(source.id).slice(0, 30);
  const setting = exerciseSetting(exercise.id);
  return `<div class="toolkit-exercise-controls">${renderLastPerformance(exercise.id)}<p class="progression-callout">${escapeHtml(progressionSuggestion(exercise))}</p>${setting.note ? `<p class="compact-note"><strong>Note:</strong> ${escapeHtml(setting.note)}</p>` : ""}${setting.pain !== "none" ? `<span class="badge amber">Discomfort: ${escapeHtml(setting.pain)}</span>` : ""}<div class="actions"><button class="secondary-btn" onclick="copyPreviousPerformance(${exIndex})">Copy Last</button><select aria-label="Substitute ${escapeHtml(exercise.name)}" onchange="substituteActiveExercise(${exIndex},this.value)" ${substitutions.length ? "" : "disabled"}><option value="">Substitute...</option>${substitutions.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}</select><button class="ghost-btn" onclick="adjustLiveSets(${exIndex},1)">+ Set</button><button class="ghost-btn" onclick="adjustLiveSets(${exIndex},-1)">− Set</button><button class="ghost-btn" onclick="moveLiveExercise(${exIndex},-1)">↑</button><button class="ghost-btn" onclick="moveLiveExercise(${exIndex},1)">↓</button><button class="ghost-btn danger" onclick="removeLiveExercise(${exIndex})">Remove</button></div></div>`;
}

function renderToolkitSetFields(exercise, exIndex, set, setIndex) {
  return `<div class="set-row toolkit-set-row ${isRepsOnlyExercise(exercise) ? "reps-only" : ""}"><div class="set-number ${set.dropSet ? "drop" : ""}">${escapeHtml(set.label || set.set)}</div>${isRepsOnlyExercise(exercise) ? "" : `<input type="number" inputmode="decimal" min="0" placeholder="Weight" aria-label="${escapeHtml(exercise.name)} set ${escapeHtml(set.label || set.set)} weight" value="${escapeHtml(set.weight)}" oninput="updateSet(${exIndex},${setIndex},'weight',this.value)" />`}<input type="number" inputmode="numeric" min="1" step="1" placeholder="Reps" aria-label="${escapeHtml(exercise.name)} set ${escapeHtml(set.label || set.set)} reps" value="${escapeHtml(set.reps)}" oninput="updateSet(${exIndex},${setIndex},'reps',this.value)" /><select aria-label="RIR" onchange="updateSet(${exIndex},${setIndex},'rir',this.value)"><option value="">RIR</option>${[0,1,2,3,4].map((value) => `<option value="${value}" ${String(set.rir) === String(value) ? "selected" : ""}>${value} RIR</option>`).join("")}<option value="failure" ${set.rir === "failure" ? "selected" : ""}>Failure</option></select><select aria-label="Set type" onchange="updateSetType(${exIndex},${setIndex},this.value)">${setTypeOptions.map(([value,label]) => `<option value="${value}" ${set.setType === value ? "selected" : ""}>${label}</option>`).join("")}</select><button class="${set.done ? "secondary-btn" : "primary-btn"}" data-set-button="${exIndex}-${setIndex}" onclick="completeSet(${exIndex},${setIndex})">${set.done ? "Done" : "Complete"}</button></div>`;
}

const baseRenderSession = renderSession;
renderSession = function renderToolkitSession() {
  const workout = state.activeWorkout;
  if (!workout) return baseRenderSession();
  const completed = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.done).length, 0);
  const total = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const left = timerDisplaySeconds();
  const totalTimer = timerTotalSeconds();
  const progress = state.timer.running || state.timer.fullscreen ? (totalTimer - left) / totalTimer * 360 : 0;
  if (state.timer.running) setTimeout(ensureTimerTick, 0);
  return `${renderRestOverlay(left,progress)}<div class="topbar"><div><p class="eyebrow">Live workout</p><h1>${escapeHtml(workout.title)}</h1><p class="muted" data-sets-completed>${completed} of ${total} sets completed</p></div><div class="actions"><select id="liveExerciseAdd" aria-label="Add exercise"><option value="">Add exercise...</option>${liveExerciseCandidates().map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}</select><button class="secondary-btn" onclick="addLiveExercise()">Add</button><button class="secondary-btn" onclick="saveActiveWorkoutAsTemplate()">Save Template</button><button class="secondary-btn" onclick="finishWorkout()">Save Session</button><button class="ghost-btn danger" onclick="cancelWorkout()">Cancel</button></div></div><div class="session-shell"><section class="session">${workout.exercises.map((exercise,exIndex) => `<article class="card pad"><div class="card-head"><div>${exercise.group ? `<span class="badge green">Superset ${escapeHtml(exercise.group)}</span>` : ""}<span class="badge blue">${plural(exercise.targetSets, "set")}${exercise.targetDropSets ? ` + ${exercise.targetDropSets} drop` : ""} × ${escapeHtml(exercise.targetReps)}</span><h2 style="margin-top:10px">${escapeHtml(exercise.name)}</h2></div><span class="badge">${exercise.rest}s rest</span></div>${renderToolkitExerciseControls(exercise,exIndex)}<div class="set-table">${exercise.sets.map((set,setIndex) => renderToolkitSetFields(exercise,exIndex,set,setIndex)).join("")}</div></article>`).join("")}</section><aside class="card pad"><p class="eyebrow">Rest timer</p><div class="timer-face" style="--progress:${progress}deg"><div style="text-align:center"><strong data-timer-time>${formatTime(left)}</strong><p class="muted" data-timer-status>${timerStatusText()}</p></div></div><div class="timer-controls"><div class="actions"><button class="secondary-btn" onclick="adjustRest(-15)">-15s</button><button class="secondary-btn" onclick="adjustRest(15)">+15s</button></div><div class="actions">${restPresetButtons(false)}</div><button class="secondary-btn" onclick="playBoxingBell()">Test Bell</button><button class="ghost-btn danger" onclick="stopTimer()">Stop Timer</button></div></aside></div>`;
};

const baseStartTimer = startTimer;
startTimer = function startNativeBackedTimer(seconds = state.timer.seconds, fullscreen = false, exerciseIndex = state.timer.exerciseIndex ?? null, persistRest = true) {
  baseStartTimer(seconds, fullscreen, exerciseIndex, persistRest);
  // restTimerContext (watch.js) adds the Live Activity details when loaded.
  if (window.webkit?.messageHandlers?.peaksetTimer) window.webkit.messageHandlers.peaksetTimer.postMessage({ action: "start", seconds: timerTotalSeconds(), endsAt: state.timer.endsAt, ...(typeof restTimerContext === "function" ? restTimerContext() : {}) });
};

const baseStopTimer = stopTimer;
stopTimer = function stopNativeBackedTimer() {
  if (window.webkit?.messageHandlers?.peaksetTimer) window.webkit.messageHandlers.peaksetTimer.postMessage({ action: "cancel", workoutActive: Boolean(state.activeWorkout) });
  baseStopTimer();
};

function handleNativeTimerReconcile(payload) {
  if (payload?.delivered) {
    // The delivered notification can belong to a rest that has since been
    // replaced (a new rest started during the async reconcile). Swift already
    // removed the stale notification; keep the live rest ticking.
    if (state.timer.running && Number(state.timer.endsAt) - Date.now() > 1500) {
      ensureTimerTick();
      return;
    }
    // Already settled by the JS tick: nothing to announce again.
    if (!state.timer.running && state.timer.left === 0 && !state.timer.fullscreen) return;
    window.webkit?.messageHandlers?.peaksetTimer?.postMessage({ action: "cancel", workoutActive: Boolean(state.activeWorkout) });
    state.timer.running = false;
    state.timer.left = 0;
    state.timer.startedAt = null;
    state.timer.endsAt = null;
    state.timer.fullscreen = false;
    state.timer.exerciseIndex = null;
    saveState();
    toast("Rest complete. Next set.");
    render();
  } else if (state.timer.running && Date.now() - Number(state.timer.endsAt) > 1500) {
    // The rest ended while the app was away and its notification was already
    // tapped or cleared: settle quietly instead of ringing again.
    window.webkit?.messageHandlers?.peaksetTimer?.postMessage({ action: "cancel", workoutActive: Boolean(state.activeWorkout) });
    Object.assign(state.timer, { running: false, left: 0, startedAt: null, endsAt: null, fullscreen: false, exerciseIndex: null });
    saveState();
    render();
    toast("Rest complete.");
  } else if (state.timer.running) {
    ensureTimerTick();
  }
}
window.handleNativeTimerReconcile = handleNativeTimerReconcile;

measurementFields = function toolkitMeasurementFields(prefix = "") {
  return measurementDefinitions.map(([key,label]) => `<div class="field"><label for="${prefix}${key}">${label}</label><input id="${prefix}${key}" inputmode="decimal" type="number" step="0.1" placeholder="0.0" /></div>`).join("");
};

collectMeasurementInputs = function collectToolkitMeasurements(prefix) {
  return measurementDefinitions.reduce((result,[key]) => { const raw = document.getElementById(`${prefix}${key}`)?.value; result[key] = raw ? Number(raw) : null; return result; },{});
};

measurementRows = function toolkitMeasurementRows(entry) {
  if (!entry) return [];
  // Consumers in app.js (Logbook view and the PDF report) destructure
  // [label, value, unit] tuples; returning objects here crashed both.
  return measurementDefinitions
    .map(([key, label]) => [label, entry[key], key === "bodyFat" ? "%" : lengthUnit()])
    .filter(([, value]) => value !== null && value !== undefined && value !== "");
};

function optionalNumberInput(id) {
  const raw = document.getElementById(id)?.value;
  return raw === undefined || raw === null || String(raw).trim() === "" ? null : Number(raw);
}

function saveWeeklyCheckIn() {
  const entry = {
    id: crypto.randomUUID(), date: new Date().toISOString(),
    // Blank means "not rated"; anything typed (including 0) is validated below.
    sleep: optionalNumberInput("checkSleep"),
    energy: optionalNumberInput("checkEnergy"),
    hunger: optionalNumberInput("checkHunger"),
    digestion: optionalNumberInput("checkDigestion"),
    recovery: optionalNumberInput("checkRecovery"),
    notes: document.getElementById("checkNotes")?.value.trim() || ""
  };
  const readiness = [entry.energy, entry.hunger, entry.digestion, entry.recovery].filter((value) => value !== null);
  if (entry.sleep !== null && (!Number.isFinite(entry.sleep) || entry.sleep <= 0 || entry.sleep > 24)) return toast("Enter sleep between 0 and 24 hours.");
  if (readiness.some((value) => !Number.isFinite(value) || value < 1 || value > 5)) return toast("Readiness ratings must be between 1 and 5.");
  if (entry.sleep === null && readiness.length === 0 && !entry.notes) return toast("Add at least one check-in value or note.");
  state.weeklyCheckIns.unshift(entry);
  saveState();
  toast("Weekly check-in saved.");
  render();
}

function savePrepLog() {
  const entry = {
    id: crypto.randomUUID(), date: new Date().toISOString(),
    cardioType: document.getElementById("prepCardioType")?.value.trim() || "",
    cardioMinutes: Number(document.getElementById("prepCardioMinutes")?.value) || 0,
    steps: Number(document.getElementById("prepSteps")?.value) || 0,
    posingMinutes: Number(document.getElementById("prepPosing")?.value) || 0,
    notes: document.getElementById("prepNotes")?.value.trim() || ""
  };
  const numeric = [entry.cardioMinutes, entry.steps, entry.posingMinutes];
  if (numeric.some((value) => !Number.isFinite(value) || value < 0)) return toast("Activity values cannot be negative.");
  if (!entry.cardioType && numeric.every((value) => value === 0) && !entry.notes) return toast("Add cardio, steps, posing, or a note.");
  state.prepLogs.unshift(entry);
  saveState();
  toast("Cardio, steps, and posing saved.");
  render();
}

function setMeasurementTrend(key) {
  state.measurementTrendKey = key;
  saveState();
  render();
}

// Newest value for one metric; a waist-only Health reading must not blank
// out the rest of the tape check-in.
function latestMeasurementValue(key) {
  const entry = state.measurements.find((item) => item[key] !== null && item[key] !== undefined && item[key] !== "");
  return entry ? entry[key] : null;
}

function weeklyAverageWeight() {
  const cutoff = Date.now() - 7 * 86400000;
  const values = state.weightLogs.filter((entry) => new Date(entry.date).getTime() >= cutoff).map((entry) => Number(entry.bodyweight)).filter(Boolean);
  return values.length ? values.reduce((sum,value) => sum + value,0) / values.length : null;
}

function requestHealthKit(action = "authorize") {
  const bridge = window.webkit?.messageHandlers?.peaksetHealthKit;
  if (!bridge) return toast("HealthKit is available in the iOS app.");
  // Readings imported from Apple Health are never sent back as duplicates.
  const latestWeight = state.weightLogs.find((entry) => !String(entry.id || "").startsWith("hk-"));
  if (action === "syncWeight" && !(Number(latestWeight?.bodyweight) > 0)) return toast("Log a body weight before sending it to Apple Health.");
  bridge.postMessage({ action, weight: latestWeight?.bodyweight || null, unit: weightUnit(), date: latestWeight?.date || null });
}

function handleNativeHealthKit(payload) {
  if (!payload || typeof payload !== "object") return;
  state.healthKitStatus = payload.message || payload.status || "Connected";
  if (payload.status === "authorizationCompleted") {
    state.healthKitPermissions = { weightWrite: Boolean(payload.weightWrite), workoutWrite: Boolean(payload.workoutWrite) };
    state.healthKitEnabled = state.healthKitPermissions.workoutWrite;
  }
  if (Number(payload.steps) > 0) {
    const today = new Date().toDateString();
    state.prepLogs = state.prepLogs.filter((entry) => !(entry.cardioType === "HealthKit" && new Date(entry.date).toDateString() === today));
    state.prepLogs.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), cardioType: "HealthKit", cardioMinutes: 0, steps: Number(payload.steps), posingMinutes: 0, notes: "Imported from Apple Health" });
  } else if (payload.status === "stepsImported") {
    state.healthKitStatus = "No steps recorded in Apple Health today.";
  }
  saveState();
  render();
}
window.handleNativeHealthKit = handleNativeHealthKit;

renderProgress = function renderToolkitProgress() {
  const weights = [...state.weightLogs].reverse().map((entry) => Number(entry.bodyweight)).filter(Boolean);
  const latestWeight = state.weightLogs[0];
  // Pre-fill Save Weight from a hand-entered weigh-in, never a Health one.
  const latestManualWeight = state.weightLogs.find((entry) => !String(entry.id || "").startsWith("hk-"));
  const latestMeasurement = state.measurements[0];
  const trendKey = state.measurementTrendKey;
  const trendValues = [...state.measurements].reverse().map((entry) => Number(entry[trendKey])).filter(Boolean);
  const checkIn = state.weeklyCheckIns[0];
  const prep = state.prepLogs[0];
  const average = weeklyAverageWeight();
  return `
    <div class="compact-page-header"><p class="eyebrow">Progress command center</p><h1>Training, physique, recovery, and prep in one check-in.</h1></div>
    <div class="grid three"><article class="card stat"><p class="value">${average ? average.toFixed(1) : "--"}</p><p class="label">7-day average weight</p></article><article class="card stat"><p class="value">${prep?.steps?.toLocaleString() || "--"}</p><p class="label">Latest steps</p></article><article class="card stat"><p class="value">${checkIn?.recovery || "--"}</p><p class="label">Latest recovery / 5</p></article></div>
    <div class="grid two progress-grid" style="margin-top:12px"><section class="card pad"><p class="eyebrow">Frequent log</p><h2>Body Weight</h2><div class="grid two"><div class="field"><label>Scale weight</label><input id="logWeight" type="number" step="0.1" value="${latestManualWeight?.bodyweight || ""}" /></div><div class="field"><label>Note</label><input id="logWeightNote" placeholder="Morning fasted..." /></div></div><button class="primary-btn" onclick="saveWeight()">Save Weight</button><div class="actions" style="margin-top:10px"><button class="secondary-btn" onclick="requestHealthKit('authorize')">Connect Apple Health</button><button class="secondary-btn" onclick="requestHealthKit('readSteps')">Import Steps</button><button class="secondary-btn" onclick="requestHealthKit('syncWeight')">Send Weight</button></div><p class="muted">${escapeHtml(state.healthKitStatus)}</p></section><section class="card pad"><h2>Body Weight Trend</h2>${weights.length > 1 ? sparkline(weights) : '<div class="empty"><p class="muted">Add two weigh-ins.</p></div>'}</section></div>
    <div class="grid two progress-grid" style="margin-top:12px"><section class="card pad"><p class="eyebrow">Physique check-in</p><h2>Expanded Measurements</h2><div class="measurement-grid">${measurementFields("measure")}</div><button class="primary-btn" onclick="saveMeasurement()">Save Measurements</button></section><section class="card pad"><div class="card-head"><h2>Measurement Trend</h2><select onchange="setMeasurementTrend(this.value)">${measurementDefinitions.map(([key,label]) => `<option value="${key}" ${key === trendKey ? "selected" : ""}>${label}</option>`).join("")}</select></div>${trendValues.length > 1 ? sparkline(trendValues) : '<div class="empty"><p class="muted">Add two measurements for this marker.</p></div>'}${latestMeasurement ? `<div class="measurement-grid" style="margin-top:12px">${measurementDefinitions.map(([key,label]) => `<div class="stat card"><p class="value">${latestMeasurementValue(key) ?? "--"}</p><p class="label">${label}</p></div>`).join("")}</div>` : ""}</section></div>
    <div class="grid two" style="margin-top:12px"><section class="card pad"><p class="eyebrow">Weekly check-in</p><h2>Recovery and readiness</h2><div class="grid three">${[["checkSleep","Sleep","0.5"],["checkEnergy","Energy / 5","1"],["checkHunger","Hunger / 5","1"],["checkDigestion","Digestion / 5","1"],["checkRecovery","Recovery / 5","1"]].map(([id,label,step]) => `<div class="field"><label>${label}</label><input id="${id}" type="number" min="1" max="${id === "checkSleep" ? 24 : 5}" step="${step}" /></div>`).join("")}</div><div class="field"><label>Notes</label><textarea id="checkNotes" rows="3" placeholder="Sleep, joints, appetite, stress..."></textarea></div><button class="primary-btn" onclick="saveWeeklyCheckIn()">Save Weekly Check-In</button></section><section class="card pad"><p class="eyebrow">Contest-prep adherence</p><h2>Cardio, Steps, and Posing</h2><div class="grid two"><div class="field"><label>Cardio type</label><input id="prepCardioType" placeholder="Incline treadmill" /></div><div class="field"><label>Minutes</label><input id="prepCardioMinutes" type="number" min="0" /></div><div class="field"><label>Steps</label><input id="prepSteps" type="number" min="0" /></div><div class="field"><label>Posing minutes</label><input id="prepPosing" type="number" min="0" /></div></div><div class="field"><label>Notes</label><input id="prepNotes" placeholder="Coach-prescribed work and adherence..." /></div><button class="primary-btn" onclick="savePrepLog()">Save Prep Activity</button></section></div>
    <section class="card pad" style="margin-top:12px"><h2>Recent Check-Ins</h2><div class="grid two"><div>${state.weeklyCheckIns.slice(0,6).map((entry) => `<div class="exercise-row"><span>${formatShortDate(entry.date)} · Sleep ${entry.sleep || "--"}h</span><strong>Recovery ${entry.recovery || "--"}/5</strong></div>`).join("") || '<p class="muted">No weekly check-ins.</p>'}</div><div>${state.prepLogs.slice(0,6).map((entry) => `<div class="exercise-row"><span>${formatShortDate(entry.date)} · ${escapeHtml(entry.cardioType || "Activity")}</span><strong>${entry.cardioMinutes || 0} min · ${(entry.steps || 0).toLocaleString()} steps · ${entry.posingMinutes || 0} posing</strong></div>`).join("") || '<p class="muted">No prep activity.</p>'}</div></div></section>`;
};

const baseCoachReportData = coachReportData;
coachReportData = function toolkitCoachReport(days) {
  const report = baseCoachReportData(days);
  const cutoff = Date.now() - Number(days) * 86400000;
  return { ...report, weeklyCheckIns: state.weeklyCheckIns.filter((entry) => new Date(entry.date).getTime() >= cutoff), prepLogs: state.prepLogs.filter((entry) => new Date(entry.date).getTime() >= cutoff) };
};

const baseBuildCoachReportLines = buildCoachReportLines;
buildCoachReportLines = function buildToolkitCoachReportLines(days, coachNote = "") {
  const lines = baseBuildCoachReportLines(days, coachNote);
  const report = coachReportData(days);
  addReportSection(lines, "Recovery / Weekly Check-ins");
  if (report.weeklyCheckIns.length) {
    report.weeklyCheckIns.forEach((entry) => {
      lines.push({ text: `${formatShortDate(entry.date)} - Sleep ${entry.sleep ?? "--"}h - Energy ${entry.energy ?? "--"}/5 - Hunger ${entry.hunger ?? "--"}/5 - Digestion ${entry.digestion ?? "--"}/5 - Recovery ${entry.recovery ?? "--"}/5${entry.notes ? ` - ${entry.notes}` : ""}`, size: 9 });
    });
  } else lines.push({ text: "No weekly check-ins in this range.", size: 10 });
  addReportSection(lines, "Cardio, Steps, and Posing");
  if (report.prepLogs.length) {
    report.prepLogs.forEach((entry) => {
      lines.push({ text: `${formatShortDate(entry.date)} - ${entry.cardioType || "Activity"} - ${entry.cardioMinutes || 0} cardio min - ${(entry.steps || 0).toLocaleString()} steps - ${entry.posingMinutes || 0} posing min${entry.notes ? ` - ${entry.notes}` : ""}`, size: 9 });
    });
  } else lines.push({ text: "No prep activity in this range.", size: 10 });
  return lines.map((line) => ({ ...line, text: plainReportText(line.text) }));
};

const baseRenderLogbook = renderLogbook;
renderLogbook = function renderToolkitLogbook() {
  const base = baseRenderLogbook();
  const days = logbookDays();
  const report = coachReportData(days);
  const addition = `<section class="card pad" style="margin-top:16px"><p class="eyebrow">Coach check-in detail</p><div class="grid two"><article><h3>Recovery</h3>${report.weeklyCheckIns.map((entry) => `<p class="muted">${formatShortDate(entry.date)} · Sleep ${entry.sleep || "--"} · Energy ${entry.energy || "--"}/5 · Recovery ${entry.recovery || "--"}/5</p>`).join("") || '<p class="muted">No check-ins.</p>'}</article><article><h3>Prep activity</h3>${report.prepLogs.map((entry) => `<p class="muted">${formatShortDate(entry.date)} · ${entry.cardioMinutes || 0} cardio min · ${(entry.steps || 0).toLocaleString()} steps · ${entry.posingMinutes || 0} posing min</p>`).join("") || '<p class="muted">No prep activity.</p>'}</article></div></section>`;
  return `${base}${addition}`;
};

resetDemoData = function resetToolkitData() {
  if (window.webkit?.messageHandlers?.peaksetTimer) window.webkit.messageHandlers.peaksetTimer.postMessage({ action: "cancel", workoutActive: Boolean(state.activeWorkout) });
  clearInterval(timerTick);
  timerTick = null;
  localStorage.removeItem(STORE_KEY);
  state = freshDefaultState();
  builderDraft = [];
  coachNoteDraft = "";
  toolkitMigrateState();
  render();
};

// No rest is running after a cold launch: clear any leftover Live Activity
// and pending notification from a session that was killed mid-rest.
if (!state.timer.running) window.webkit?.messageHandlers?.peaksetTimer?.postMessage({ action: "cancel", workoutActive: Boolean(state.activeWorkout) });

saveState();
render();

// Progress has four separate forms, and every save (or trend/pose tap)
// redraws the page. Typed-but-unsaved values in the other forms are carried
// across the redraw; the form being saved starts fresh.
const PROGRESS_DRAFT_FIELD = /^(logWeight|logWeightNote|measure[A-Za-z]+|check[A-Z][A-Za-z]*|prep[A-Z][A-Za-z]*)$/;
let progressFormBeingSaved = null;
const baseRenderForProgressDrafts = render;
render = function renderKeepingProgressDrafts() {
  const typed = state.view === "progress"
    ? [...document.querySelectorAll("#app input[id], #app textarea[id]")]
      .filter((field) => PROGRESS_DRAFT_FIELD.test(field.id) && !progressFormBeingSaved?.test(field.id) && field.value !== field.defaultValue)
      .map((field) => [field.id, field.value])
    : [];
  baseRenderForProgressDrafts();
  if (state.view !== "progress") return;
  typed.forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value;
  });
};

[["saveWeight", /^logWeight/], ["saveMeasurement", /^measure/], ["saveWeeklyCheckIn", /^check[A-Z]/], ["savePrepLog", /^prep[A-Z]/]].forEach(([name, fields]) => {
  const baseSave = globalThis[name];
  globalThis[name] = function saveProgressForm(...args) {
    progressFormBeingSaved = fields;
    try { return baseSave.apply(this, args); } finally { progressFormBeingSaved = null; }
  };
});
