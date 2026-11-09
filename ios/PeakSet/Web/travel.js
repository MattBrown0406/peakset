"use strict";

// Training on the road: hotel equipment profiles (cables, dumbbells only, a
// room with a band, a room with nothing), automatic exercise swaps when a
// workout starts, a hotel dumbbell weight cap, and a trip mode that switches
// everything over and back. Loaded after health.js.

const TRAVEL_PROFILES = [
  { id: "road-gym", name: "Road Gym", equipment: ["Dumbbells", "Cable", "Bench", "Bodyweight", "Bands"], maxDumbbell: 50, maxDumbbellUnit: "lb" },
  { id: "hotel-dumbbells", name: "Hotel Gym: Dumbbells Only", equipment: ["Dumbbells", "Bench", "Bodyweight"], maxDumbbell: 50, maxDumbbellUnit: "lb" },
  { id: "hotel-room", name: "Hotel Room + Band", equipment: ["Bodyweight", "Bands"] },
  { id: "hotel-room-bodyweight", name: "Hotel Room: No Equipment", equipment: ["Bodyweight"] },
  // Planet Fitness has machines, cables, Smith machines, and dumbbells, but
  // usually no free barbells; dumbbells often stop around 75-80 lb.
  { id: "planet-fitness", name: "Planet Fitness", equipment: ["Dumbbells", "Cable", "Machine", "Smith", "Bench", "Bodyweight"], maxDumbbell: 75, maxDumbbellUnit: "lb" }
];

// National chains for "Find a gym nearby". Apple Maps searches around the
// phone's location when the link has no coordinates. Full-equipment chains
// use the Commercial Gym profile.
const TRAVEL_GYM_CHAINS = [
  { name: "Planet Fitness", profileId: "planet-fitness" },
  { name: "24 Hour Fitness", profileId: "all-equipment" },
  { name: "LA Fitness", profileId: "all-equipment" },
  { name: "Anytime Fitness", profileId: "all-equipment" },
  { name: "Snap Fitness", profileId: "all-equipment" },
  { name: "Gold's Gym", profileId: "all-equipment" },
  { name: "Crunch Fitness", profileId: "all-equipment" },
  { name: "EoS Fitness", profileId: "all-equipment" },
  { name: "Life Time", profileId: "all-equipment" },
  { name: "YMCA", profileId: "all-equipment" },
  { name: "Equinox", profileId: "all-equipment" }
];
const TRIP_PAUSE_MIN_DAYS = 4;

function travelMigrateState() {
  // Add each travel profile once; an athlete who deletes one keeps it deleted.
  const seeded = new Set(Array.isArray(state.travelProfilesSeeded)
    ? state.travelProfilesSeeded.filter((id) => typeof id === "string")
    : state.travelProfilesSeeded === true ? ["road-gym", "hotel-dumbbells", "hotel-room", "hotel-room-bodyweight"] : []);
  TRAVEL_PROFILES.forEach((profile) => {
    if (seeded.has(profile.id)) return;
    // An existing profile (e.g. a Road Gym used as a real gym) is left alone.
    if (!state.equipmentProfiles.some((item) => item.id === profile.id)) state.equipmentProfiles.push({ ...profile, equipment: [...profile.equipment] });
    seeded.add(profile.id);
  });
  state.travelProfilesSeeded = [...seeded];
  state.equipmentProfiles.forEach((profile) => {
    const cap = Number(profile.maxDumbbell);
    if (!(cap > 0 && cap <= 400)) delete profile.maxDumbbell;
    if (profile.maxDumbbellUnit !== "kg") profile.maxDumbbellUnit = "lb";
  });
  if (state.trip?.active && !state.equipmentProfiles.some((item) => item.id === state.activeEquipmentProfileId)) state.activeEquipmentProfileId = state.equipmentProfiles[0]?.id;
  const trip = state.trip;
  const validKey = (key) => typeof parseDateKey === "function" && Boolean(parseDateKey(key));
  state.trip = trip && typeof trip === "object" && trip.active && validKey(trip.until) && validKey(trip.startedOn)
    ? {
      active: true,
      startedOn: trip.startedOn,
      until: trip.until,
      profileId: String(trip.profileId || ""),
      previousProfileId: String(trip.previousProfileId || ""),
      pauseBlock: Boolean(trip.pauseBlock),
      blockId: String(trip.blockId || ""),
      blockStartDate: String(trip.blockStartDate || "")
    }
    : { active: false };
}

// ---------- Dumbbell cap ----------

// The active profile's heaviest dumbbell in the athlete's current unit, or null.
function travelDumbbellCap(profile = activeEquipmentProfile()) {
  const cap = Number(profile?.maxDumbbell);
  if (!(cap > 0)) return null;
  const stored = profile.maxDumbbellUnit === "kg" ? "kg" : "lb";
  const unit = isMetric() ? "kg" : "lb";
  if (stored === unit) return cap;
  // Converted the way saved weights are, so real 50 lb dumbbells logged in kg
  // are never clamped below themselves.
  return Math.round((unit === "kg" ? cap * KG_PER_LB : cap / KG_PER_LB) * 100) / 100;
}

// Dumbbell work is capped unless the profile also has a barbell and the
// barbell is the first choice ("Barbell or dumbbell, bench").
function isCappedDumbbellExercise(exerciseOrId, profile = activeEquipmentProfile()) {
  const library = exerciseById(typeof exerciseOrId === "string" ? exerciseOrId : exerciseOrId?.id);
  const equipment = String(library?.equipment || "");
  if (!/dumbbell/i.test(equipment) || travelDumbbellCap(profile) === null) return false;
  return !(profile.equipment || []).includes("Barbell") || /(^|,\s*)dumbbells?\b/i.test(equipment);
}

function setDumbbellCap(profileId, value) {
  const profile = state.equipmentProfiles.find((item) => item.id === profileId);
  if (!profile) return;
  const cap = Number(value);
  if (value === "" || !(cap > 0)) {
    delete profile.maxDumbbell;
  } else {
    profile.maxDumbbell = Math.min(400, Math.round(cap * 10) / 10);
    profile.maxDumbbellUnit = isMetric() ? "kg" : "lb";
  }
  saveState();
  render();
}

// Bodyweight and band moves log reps only (the library marks them).
const baseIsRepsOnlyForTravel = isRepsOnlyExercise;
isRepsOnlyExercise = function isRepsOnlyIncludingBodyweight(exercise) {
  return baseIsRepsOnlyForTravel(exercise) || Boolean(exerciseLibrary.find((item) => item.id === exercise?.id)?.repsOnly);
};

// At the cap, progression moves to reps and harder set types instead of a
// dumbbell the hotel doesn't have.
const baseProgressionForTravel = progressionSuggestion;
progressionSuggestion = function progressionWithDumbbellCap(exercise) {
  const base = baseProgressionForTravel(exercise);
  // A deload week's instructions win over the dumbbell limit.
  if (!isCappedDumbbellExercise(exercise) || isRepsOnlyExercise(exercise) || /deload/i.test(base)) return base;
  const cap = travelDumbbellCap();
  const previous = lastExercisePerformance(exercise.id);
  const working = (previous?.sets || []).filter((set) => !set.dropSet && Number(set.weight) > 0 && Number(set.reps) > 0);
  if (!working.length) return base;
  const best = Math.max(...working.map((set) => Number(set.weight)));
  if (nextLoadableWeight(exercise.id, best) <= cap) return base;
  const unit = weightUnit();
  return `These dumbbells top out at ${formatWeight(cap, 1)} ${unit}. Use ${formatWeight(Math.min(best, cap), 1)} ${unit}, add reps, or switch the set type to Tempo, Paused reps, or 1½ reps.`;
};

const baseCopyPreviousForTravel = copyPreviousPerformance;
copyPreviousPerformance = function copyPreviousWithDumbbellCap(exIndex) {
  baseCopyPreviousForTravel(exIndex);
  const exercise = state.activeWorkout?.exercises?.[exIndex];
  if (!exercise || !isCappedDumbbellExercise(exercise)) return;
  const cap = travelDumbbellCap();
  let clamped = false;
  exercise.sets.forEach((set) => {
    if (!set.done && Number(set.weight) > cap) {
      set.weight = String(cap);
      clamped = true;
    }
  });
  if (!clamped) return;
  saveState();
  render();
  toast(`Set to ${formatWeight(cap, 1)} ${weightUnit()}, the heaviest dumbbells here. Add reps or slow the tempo.`);
};

if (typeof suggestedSetValues === "function") {
  const baseSuggestedForTravel = suggestedSetValues;
  suggestedSetValues = function suggestedWithDumbbellCap(exercise, setIndex) {
    const values = baseSuggestedForTravel(exercise, setIndex);
    const cap = isCappedDumbbellExercise(exercise) ? travelDumbbellCap() : null;
    if (cap !== null && Number(values.weight) > cap) return { ...values, weight: String(cap) };
    return values;
  };
}

// Bodyweight-capable moves (push-ups, bench dips) can be logged with no added
// weight: a blank weight counts as 0 instead of blocking the set.
const BODYWEIGHT_OPTIONAL_IDS = new Set(["push-up", "bench-dip"]);
const baseCompleteSetForTravel = completeSet;
completeSet = function completeSetAllowingBodyweight(exIndex, setIndex) {
  const exercise = state.activeWorkout?.exercises?.[exIndex];
  const set = exercise?.sets?.[setIndex];
  const library = exerciseLibrary.find((item) => item.id === exercise?.id);
  if (set && !set.done && set.weight === "" && !isRepsOnlyExercise(exercise)
    && (BODYWEIGHT_OPTIONAL_IDS.has(library?.id) || /^\s*bodyweight/i.test(String(library?.equipment || "")))) {
    set.weight = "0";
  }
  return baseCompleteSetForTravel(exIndex, setIndex);
};

// ---------- Automatic swaps when a workout starts ----------

// For each planned exercise the active profile can't do: the athlete's saved
// swap if it fits, else the closest same-target exercise that fits. Quick
// Start keeps exactly what the athlete picked.
function equipmentSwapsForPlan(plan, profile = activeEquipmentProfile()) {
  if (!profile?.equipment?.length || String(plan?.id || "").startsWith("quick-") || plan?.adHoc || !Array.isArray(plan?.exercises)) return null;
  // The same exercises, in the same order, that beginWorkoutFromPlan keeps.
  const specs = plan.exercises.map(normalizePlanExercise).filter((spec) => exerciseLibrary.some((item) => item.id === spec.id)).slice(0, MAX_STORED_PLAN_EXERCISES);
  const used = new Set(specs.map((spec) => spec.id));
  const travel = plan.phase === "travel" || plan.muscle === "travel";
  const fits = (item) => item && !used.has(item.id) && exerciseMatchesEquipmentProfile(item, profile) && (!travel || item.hotel);
  const swaps = [];
  const swapped = specs.map((spec) => {
    const source = exerciseLibrary.find((item) => item.id === spec.id);
    if (!source || exerciseMatchesEquipmentProfile(source, profile)) return spec;
    const saved = exerciseLibrary.find((item) => item.id === state.substitutionPreferences?.[spec.id]);
    let replacement = fits(saved) ? saved : null;
    if (!replacement) {
      const target = typeof exerciseMuscleGroup === "function" ? exerciseMuscleGroup(source) : null;
      const pool = exerciseLibrary.filter((item) => item.muscle === source.muscle && fits(item));
      replacement = pool.find((item) => target && exerciseMuscleGroup(item) === target) || pool[0] || null;
    }
    if (!replacement) return spec;
    used.add(replacement.id);
    swaps.push({ from: source.name, to: replacement.name });
    return { ...spec, id: replacement.id, plannedId: spec.id };
  });
  if (!swaps.length) return null;
  return {
    plan: { ...plan, exercises: swapped.map((spec) => [spec.id, spec.sets, spec.reps, spec.rest, spec.dropSets, { group: spec.group, setType: spec.setType }]) },
    planned: swapped.map((spec) => spec.plannedId || spec.id),
    swaps
  };
}

const baseBeginWorkoutForTravel = beginWorkoutFromPlan;
beginWorkoutFromPlan = function beginWorkoutWithEquipmentSwaps(plan) {
  const swap = state.activeWorkout ? null : equipmentSwapsForPlan(plan);
  if (!swap) return baseBeginWorkoutForTravel(plan);
  const started = baseBeginWorkoutForTravel(swap.plan);
  if (started === false || !state.activeWorkout) return started;
  // Later swaps the athlete makes are remembered against the planned movement.
  state.activeWorkout.exercises.forEach((exercise, index) => {
    if (swap.planned[index] && exercise.originalId === exercise.id) exercise.originalId = swap.planned[index];
  });
  saveState();
  const list = swap.swaps.slice(0, 3).map((item) => `${item.from} → ${item.to}`).join(", ");
  // One toast at a time: keep the deload notice volume.js just showed.
  toast(`${state.activeWorkout.deload ? "Deload week: sets halved. " : ""}Swapped for your equipment: ${list}${swap.swaps.length > 3 ? `, and ${swap.swaps.length - 3} more` : ""}.`);
  return started;
};

// ---------- Plan picking ----------

function travelPlanFits(plan, profile = activeEquipmentProfile()) {
  if (!profile?.equipment?.length) return true;
  return (plan.exercises || []).every((row) => {
    const exercise = exerciseLibrary.find((item) => item.id === (Array.isArray(row) ? row[0] : row?.id));
    return !exercise || exerciseMatchesEquipmentProfile(exercise, profile);
  });
}

// The travel template to suggest: one that fits the equipment, training the
// muscles rested longest, and not the one done most recently.
let bestTravelPlanCache = { key: "", plan: null };
function bestTravelPlan(profile = activeEquipmentProfile()) {
  const logs = state.workoutLogs || [];
  const key = [profile?.id, (profile?.equipment || []).join(","), logs.length, logs[0]?.id, logs[0]?.date, dateKey(new Date())].join("|");
  if (bestTravelPlanCache.key === key) return bestTravelPlanCache.plan;
  const { byId } = exerciseIndexes();
  const travel = planTemplates.filter((plan) => plan.phase === "travel");
  const fitting = travel.filter((plan) => travelPlanFits(plan, profile));
  const pool = fitting.length ? fitting : travel;
  const lastByMuscle = {};
  const lastByTitle = {};
  (state.workoutLogs || []).forEach((log) => {
    const time = Date.parse(log?.date);
    if (!Number.isFinite(time)) return;
    if (log.title) lastByTitle[log.title] = Math.max(lastByTitle[log.title] ?? -Infinity, time);
    workoutLogSets(log).forEach((set) => {
      const muscle = byId.get(loggedExerciseId(set))?.muscle;
      if (muscle) lastByMuscle[muscle] = Math.max(lastByMuscle[muscle] ?? -Infinity, time);
    });
  });
  // A plan's freshness is its most recently trained muscle (lower is fresher).
  const freshness = (plan) => Math.max(-Infinity, ...(plan.exercises || []).map((row) => lastByMuscle[byId.get(Array.isArray(row) ? row[0] : row?.id)?.muscle] ?? -Infinity));
  const plan = [...pool].sort((a, b) => freshness(a) - freshness(b) || (lastByTitle[a.title] ?? -Infinity) - (lastByTitle[b.title] ?? -Infinity))[0] || null;
  bestTravelPlanCache = { key, plan };
  return plan;
}

const baseRecommendedForTravel = todaysRecommendedPlan;
todaysRecommendedPlan = function recommendedWhileTraveling(...args) {
  // Hotel setups (no machines) get travel workouts; a chain gym on the road
  // keeps the usual rotation, with swaps for anything it lacks.
  const profile = activeEquipmentProfile();
  if (state.trip?.active && profile?.equipment?.length && !profile.equipment.includes("Machine")) return bestTravelPlan() || baseRecommendedForTravel(...args);
  return baseRecommendedForTravel(...args);
};

// ---------- Trip mode ----------

function todayKey() {
  return dateKey(new Date());
}

function daysBetweenKeys(fromKey, toKey) {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return 0;
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000);
}

function startTrip() {
  const profileId = document.getElementById("tripProfile")?.value;
  const until = document.getElementById("tripUntil")?.value;
  const profile = state.equipmentProfiles.find((item) => item.id === profileId);
  if (!profile) return toast("Choose where you'll be training.");
  if (!parseDateKey(until) || daysBetweenKeys(todayKey(), until) < 1) return toast("Choose the day you'll be back (tomorrow or later).");
  if (daysBetweenKeys(todayKey(), until) > 60) return toast("Trips can be up to 60 days.");
  const capInput = document.getElementById("tripDumbbellCap");
  const capField = document.getElementById("tripCapField");
  if (capInput && !capField?.hidden) {
    const cap = Number(capInput.value);
    if (capInput.value !== "" && !(cap > 0 && cap <= 400)) return toast("Enter the heaviest dumbbell, or leave it blank for no limit.");
    // Blank means no limit.
    if (capInput.value === "") delete profile.maxDumbbell;
    else Object.assign(profile, { maxDumbbell: Math.round(cap * 10) / 10, maxDumbbellUnit: isMetric() ? "kg" : "lb" });
  }
  const blockRunning = typeof blockWeekInfo === "function" && blockWeekInfo()?.status === "active";
  state.trip = {
    active: true,
    startedOn: todayKey(),
    until,
    profileId: profile.id,
    previousProfileId: state.activeEquipmentProfileId === profile.id ? "" : state.activeEquipmentProfileId,
    pauseBlock: blockRunning && document.getElementById("tripPauseBlock")?.checked !== false,
    // Only this block is paused and moved back; one started later is not.
    blockId: blockRunning ? String(state.trainingBlock.id || "") : "",
    blockStartDate: blockRunning ? String(state.trainingBlock.startDate || "") : ""
  };
  state.activeEquipmentProfileId = profile.id;
  // Today's earlier pick was for the home gym.
  state.todayPlanId = null;
  state.todayWorkoutPick = "recommended";
  saveState();
  render();
  toast(`Trip mode on. Workouts now fit ${profile.name}.`);
}

// Restores the home profile and, if the block was paused, moves it back by the
// whole weeks spent away (block weeks start on a week boundary).
function endTrip(automatic = false) {
  const trip = state.trip;
  if (!trip?.active) return;
  // The athlete trains at home again on the "back on" day.
  const end = automatic ? trip.until : todayKey();
  let shifted = 0;
  const block = state.trainingBlock;
  if (trip.pauseBlock && block && String(block.id || "") === trip.blockId && block.startDate === trip.blockStartDate) {
    const pausedFrom = trip.startedOn > block.startDate ? trip.startedOn : block.startDate;
    const days = Math.max(0, daysBetweenKeys(pausedFrom, end));
    const start = parseDateKey(block.startDate);
    if (days >= TRIP_PAUSE_MIN_DAYS && start) {
      shifted = Math.max(1, Math.round(days / 7));
      block.startDate = dateKey(addDays(start, shifted * 7));
    }
  }
  if (trip.previousProfileId && state.equipmentProfiles.some((item) => item.id === trip.previousProfileId)) {
    state.activeEquipmentProfileId = trip.previousProfileId;
  } else if (state.activeEquipmentProfileId === trip.profileId) {
    // The home profile was deleted while away: fall back to the full gym.
    state.activeEquipmentProfileId = (state.equipmentProfiles.find((item) => !item.equipment?.length) || state.equipmentProfiles[0])?.id;
  }
  state.trip = { active: false };
  state.todayPlanId = null;
  saveState();
  const profile = activeEquipmentProfile();
  toast(`Welcome back. ${profile?.name || "Your"} workouts are back${shifted ? `, and your block picks up where you left off (${shifted} week${shifted === 1 ? "" : "s"} later)` : ""}.`);
}

function endTripNow() {
  endTrip(false);
  render();
}

function checkTripExpiry() {
  if (state.trip?.active && daysBetweenKeys(state.trip.until, todayKey()) >= 0) {
    endTrip(true);
    return true;
  }
  return false;
}

function appleMapsSearchUrl(query) {
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

function updateGymSearchLink(value) {
  const link = document.getElementById("gymSearchLink");
  if (link) link.href = appleMapsSearchUrl(String(value || "").trim() || "gym");
}

// Links (not script navigation) so iOS hands them to the Maps app.
function renderGymFinder() {
  const chips = TRAVEL_GYM_CHAINS.map((chain) => `<a class="chip gym-chip" href="${appleMapsSearchUrl(chain.name)}" target="_blank" rel="noopener">${escapeHtml(chain.name)}</a>`).join("");
  return `<details class="gym-finder" style="margin-top:10px">
    <summary><strong>Find a gym nearby</strong> <span class="muted">Opens Apple Maps to the closest one.</span></summary>
    <div class="filters gym-chain-list" style="margin-top:10px">${chips}<a class="chip gym-chip" href="${appleMapsSearchUrl("gym")}" target="_blank" rel="noopener">Any gym</a></div>
    <div class="field" style="margin-top:10px"><label for="gymSearchName">Another gym</label><input id="gymSearchName" placeholder="Gym name" autocomplete="off" oninput="updateGymSearchLink(this.value)" /></div>
    <div class="actions"><a id="gymSearchLink" class="secondary-btn gym-search-btn" href="${appleMapsSearchUrl("gym")}" target="_blank" rel="noopener">Search in Maps</a></div>
    <p class="muted compact-note">Most chains sell day passes or let members visit other locations; check with the gym. Training there? Pick its equipment under "Training at" so workouts fit.</p>
  </details>`;
}

// Profiles a trip can use: every equipment profile, with the full gym named plainly.
function tripProfileOptions(selectedId) {
  return state.equipmentProfiles.map((profile) => {
    const label = profile.equipment?.length ? profile.name : `${profile.name} (full equipment)`;
    return `<option value="${escapeHtml(profile.id)}" ${profile.equipment?.includes("Dumbbells") ? 'data-dumbbells="1"' : ""} data-cap="${travelDumbbellCap(profile) ?? ""}" ${profile.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

// Each profile has its own dumbbell limit (a hotel rack vs Planet Fitness).
function tripProfileChanged(select) {
  const option = select.selectedOptions[0];
  const field = document.getElementById("tripCapField");
  const input = document.getElementById("tripDumbbellCap");
  if (field) field.hidden = !option?.dataset.dumbbells;
  if (input) input.value = option?.dataset.cap || "";
}

function changeTripProfile(profileId) {
  const profile = state.equipmentProfiles.find((item) => item.id === profileId);
  if (!state.trip?.active || !profile) return;
  state.trip.profileId = profile.id;
  state.activeEquipmentProfileId = profile.id;
  state.todayPlanId = null;
  saveState();
  render();
  toast(`Workouts now fit ${profile.name}.`);
}

function renderTripCard() {
  const trip = state.trip;
  const unit = weightUnit();
  if (trip?.active) {
    // The equipment in use now (it can also be changed from Builder mid-trip).
    const profile = activeEquipmentProfile();
    const cap = travelDumbbellCap(profile);
    return `<section class="card pad trip-card" style="margin-top:12px">
      <div class="card-head"><div><p class="eyebrow">Trip mode</p><h2>${escapeHtml(profile?.name || "Travel")}</h2></div><span class="badge green">Back ${escapeHtml(formatShortDate(trip.until))}</span></div>
      <p class="muted">Today's workout fits this equipment, and exercises you can't do here are swapped when you start.${cap !== null ? ` Dumbbells top out at ${formatWeight(cap, 2)} ${unit}.` : ""}${trip.pauseBlock ? " Your training block is paused while you're away." : ""}</p>
      <div class="field" style="margin-top:10px"><label for="tripTrainingAt">Training at</label><select id="tripTrainingAt" onchange="changeTripProfile(this.value)">${tripProfileOptions(profile?.id)}</select></div>
      ${renderGymFinder()}
      <div class="actions"><button class="secondary-btn" onclick="endTripNow()">I'm Back</button></div>
    </section>`;
  }
  const preferred = state.equipmentProfiles.find((profile) => profile.id === "hotel-dumbbells") || state.equipmentProfiles.find((profile) => profile.equipment?.length) || state.equipmentProfiles[0];
  const blockRunning = typeof blockWeekInfo === "function" && blockWeekInfo()?.status === "active";
  const defaultUntil = dateKey(addDays(new Date(), 4));
  const earliestUntil = dateKey(addDays(new Date(), 1));
  return `<section class="card pad trip-card" style="margin-top:12px">
    <details>
      <summary><strong>Traveling?</strong> <span class="muted">Switch to hotel workouts until you're back.</span></summary>
      <div class="grid two" style="margin-top:10px">
        <div class="field"><label for="tripProfile">Where you'll train</label><select id="tripProfile" onchange="tripProfileChanged(this)">${tripProfileOptions(preferred?.id)}</select></div>
        <div class="field"><label for="tripUntil">Back on</label><input id="tripUntil" type="date" value="${defaultUntil}" min="${earliestUntil}" /></div>
        <div class="field" id="tripCapField" ${preferred?.equipment.includes("Dumbbells") ? "" : "hidden"}><label for="tripDumbbellCap">Heaviest dumbbells (${unit})</label><input id="tripDumbbellCap" type="number" inputmode="decimal" min="1" step="0.5" value="${travelDumbbellCap(preferred) ?? ""}" placeholder="No limit" /></div>
      </div>
      ${blockRunning ? `<label class="toggle-row"><input id="tripPauseBlock" type="checkbox" checked /> <span>Pause my training block while I'm away (trips of ${TRIP_PAUSE_MIN_DAYS}+ days)</span></label>` : ""}
      <div class="actions"><button class="primary-btn" onclick="startTrip()">Start Trip Mode</button></div>
      ${renderGymFinder()}
    </details>
  </section>`;
}

const baseRenderTodayForTravel = renderToday;
renderToday = function renderTodayWithTrip() {
  let html = baseRenderTodayForTravel();
  // "Start Road Gym" starts a hotel workout this equipment can actually do.
  const roadPlan = travelPlanFits(planTemplates.find((plan) => plan.id === "road-gym-full")) ? null : bestTravelPlan();
  if (roadPlan) html = html.replace(`onclick="startWorkout('road-gym-full')">Start Road Gym`, `onclick="startWorkout('${roadPlan.id}')">Start Road Gym`);
  const anchor = html.indexOf('<div class="grid today-stats">');
  const card = renderTripCard();
  return anchor === -1 ? `${card}${html}` : `${html.slice(0, anchor)}${card}${html.slice(anchor)}`;
};

// Plans > Road Gym: say which travel workouts fit the current equipment.
const baseRenderPlansForTravel = renderPlans;
renderPlans = function renderPlansWithTravelFit() {
  const html = baseRenderPlansForTravel();
  if (state.activeFilter !== "travel") return html;
  const profile = activeEquipmentProfile();
  if (!profile?.equipment?.length) return html;
  const fitting = planTemplates.filter((plan) => plan.phase === "travel" && travelPlanFits(plan, profile));
  const note = `<section class="card pad" style="margin-bottom:12px"><p class="eyebrow">${escapeHtml(profile.name)}</p><p class="muted">${fitting.length ? `Fits this equipment: ${fitting.map((plan) => escapeHtml(plan.title)).join(" · ")}.` : "None of these fit this equipment exactly."} Other workouts swap exercises you can't do when you start them.</p></section>`;
  const anchor = html.indexOf('<div class="filters"');
  return anchor === -1 ? `${note}${html}` : `${html.slice(0, anchor)}${note}${html.slice(anchor)}`;
};

// While a trip pauses the block, its week stays where the trip began and no
// deload is prescribed; endTrip moves the block back afterwards.
function tripPausesBlock(block) {
  const trip = state.trip;
  return Boolean(trip?.active && trip.pauseBlock && block && String(block.id || "") === trip.blockId && block.startDate === trip.blockStartDate);
}

const baseBlockWeekInfoForTravel = blockWeekInfo;
blockWeekInfo = function blockWeekInfoPausedForTrip(...args) {
  const block = args.length ? args[0] : (promotePendingBlock(), state.trainingBlock);
  if (args.length > 1 || !tripPausesBlock(block)) return baseBlockWeekInfoForTravel(...args);
  const frozen = baseBlockWeekInfoForTravel(block, parseDateKey(state.trip.startedOn) || new Date());
  return frozen ? { ...frozen, deload: false, paused: true } : frozen;
};

const baseBlockStatusLineForTravel = renderBlockStatusLine;
renderBlockStatusLine = function blockStatusLineWithTrip(...args) {
  const line = baseBlockStatusLineForTravel(...args);
  const info = args.length ? args[0] : blockWeekInfo();
  return info?.paused && line ? `${line} · Paused while traveling` : line;
};

// Builder > Equipment profiles: the heaviest dumbbell for the active profile.
const baseRenderBuilderForTravel = renderBuilder;
renderBuilder = function renderBuilderWithDumbbellCap() {
  const html = baseRenderBuilderForTravel();
  const profile = activeEquipmentProfile();
  const anchor = `<button class="ghost-btn danger" onclick="deleteEquipmentProfile('${profile?.id}')">Delete Active Profile</button>`;
  if (!profile || !html.includes(anchor) || !(profile.equipment?.includes("Dumbbells") || !profile.equipment?.length)) return html;
  const cap = travelDumbbellCap(profile);
  const field = `<div class="field"><label for="profileDumbbellCap">Heaviest dumbbells (${weightUnit()})</label><input id="profileDumbbellCap" type="number" inputmode="decimal" min="1" step="0.5" value="${cap ?? ""}" placeholder="No limit" onchange="setDumbbellCap('${profile.id}', this.value)" /></div>`;
  return html.replace(anchor, `${field}${anchor}`);
};

const baseResetForTravel = resetDemoData;
resetDemoData = function resetDataWithTravel(...args) {
  const result = baseResetForTravel(...args);
  travelMigrateState();
  saveState();
  render();
  return result;
};

travelMigrateState();
checkTripExpiry();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && checkTripExpiry()) render();
});
saveState();
render();
