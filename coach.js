"use strict";

// Coach mode without a server. Athletes send a check-in file
// (.massmethod, format mass-method-coach-package); a coach imports it into a
// roster and sends a program file (format mass-method-program) back, which
// the athlete imports into Plans. Loaded after watch.js.

const COACH_PACKAGE_FORMAT = "mass-method-coach-package";
const PROGRAM_FORMAT = "mass-method-program";
const COACH_FILE_VERSION = 1;
const COACH_PHOTOS_PER_PACKAGE = 6;
const COACH_PHOTOS_PER_ATHLETE = 12;
const COACH_HISTORY_DAYS = 180;
const COACH_STORAGE_BUDGET = 1_500_000;
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
let coachImportQueue = Promise.resolve();
let coachProgramDraft = { planIds: [], message: "", blockWeeks: 0, focus: [] };

function coachMigrateState() {
  if (!state.coach || typeof state.coach !== "object") state.coach = {};
  if (typeof state.coach.enabled !== "boolean") state.coach.enabled = false;
  if (typeof state.coach.name !== "string") state.coach.name = "";
  if (!state.coach.athletes || typeof state.coach.athletes !== "object" || Array.isArray(state.coach.athletes)) state.coach.athletes = {};
  // Ids end up inside inline handlers; drop anything a crafted backup could abuse.
  Object.entries(state.coach.athletes).forEach(([key, athlete]) => {
    if (!SAFE_ID.test(key) || key in Object.prototype || athlete?.id !== key) delete state.coach.athletes[key];
  });
  if (typeof state.coach.selectedAthleteId !== "string" || !athleteById(state.coach.selectedAthleteId)) state.coach.selectedAthleteId = "";
  // Restored roster entries skip the import-time caps; keep the fields the UI graphs finite.
  const objects = (value) => safeArray(value).filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
  const textOr = (value, fallback = "") => (typeof value === "string" ? value : fallback);
  Object.values(state.coach.athletes).forEach((athlete) => {
    if (!athlete || typeof athlete !== "object") return;
    athlete.name = textOr(athlete.name).slice(0, 60);
    athlete.notes = textOr(athlete.notes).slice(0, 5000);
    if (!athlete.profile || typeof athlete.profile !== "object") athlete.profile = {};
    athlete.weightLogs = objects(athlete.weightLogs).map((entry) => ({ ...entry, bodyweight: finiteOrNull(entry.bodyweight), note: textOr(entry.note) }));
    athlete.measurements = objects(athlete.measurements);
    athlete.workoutLogs = objects(athlete.workoutLogs).map((entry) => ({ ...entry, title: textOr(entry.title, "Workout"), setCount: finiteOrNull(entry.setCount) ?? 0, volume: finiteOrNull(entry.volume) ?? 0, sets: safeArray(entry.sets) }));
    athlete.weeklyCheckIns = objects(athlete.weeklyCheckIns).map((entry) => ({ ...entry, sleep: finiteOrNull(entry.sleep), energy: finiteOrNull(entry.energy), hunger: finiteOrNull(entry.hunger), digestion: finiteOrNull(entry.digestion), recovery: finiteOrNull(entry.recovery), notes: textOr(entry.notes) }));
    athlete.prepLogs = objects(athlete.prepLogs).map((entry) => ({ ...entry, cardioType: textOr(entry.cardioType), cardioMinutes: finiteOrNull(entry.cardioMinutes) ?? 0, steps: finiteOrNull(entry.steps) ?? 0, posingMinutes: finiteOrNull(entry.posingMinutes) ?? 0 }));
    athlete.volumeWeeks = objects(athlete.volumeWeeks).map((week) => ({ ...week, totals: Object.fromEntries(Object.entries(week.totals && typeof week.totals === "object" ? week.totals : {}).map(([key, value]) => [key, finiteOrNull(value) ?? 0])) }));
    athlete.photos = objects(athlete.photos).filter((photo) => /^[A-Za-z0-9-]+$/.test(String(photo.id || "")));
    athlete.packages = objects(athlete.packages);
    if (athlete.trainingBlock && typeof athlete.trainingBlock !== "object") athlete.trainingBlock = null;
  });
  if (state.coachMessage && typeof state.coachMessage !== "object") state.coachMessage = null;
  if (!state.lastCoachPackageAt) state.lastCoachPackageAt = null;
}

coachMigrateState();

function coachAthletes() {
  return Object.values(state.coach?.athletes || {}).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function athleteById(id) {
  const athletes = state.coach?.athletes;
  return athletes && typeof id === "string" && Object.hasOwn(athletes, id) ? athletes[id] : undefined;
}

function athleteDisplayName(athlete) {
  return athlete?.name || `${athlete?.profile?.gender || "Athlete"}, ${athlete?.profile?.age || "--"}`;
}

function fileSafe(text) {
  return String(text || "").replace(/[^A-Za-z0-9 _-]+/g, "").trim().slice(0, 40) || "Athlete";
}

// ---------- Athlete: build and send a check-in ----------

function weeklyVolumeHistory(weeks = 4) {
  const current = startOfWeek();
  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = addDays(current, -7 * index);
    return { weekStart: dateKey(weekStart), totals: weeklyHardSets(weekStart, false) };
  });
}

function mergedLatestMeasurement() {
  if (!state.measurements.length && !state.weightLogs.some((entry) => Number(entry.bodyFat) > 0)) return null;
  const newest = state.measurements[0]?.date || state.weightLogs.find((entry) => Number(entry.bodyFat) > 0)?.date;
  const merged = { id: `latest-${newest}`, date: newest, healthFields: [] };
  const fromHealth = (entry, key) => String(entry.id || "").startsWith("hk-") || (Array.isArray(entry.healthFields) && entry.healthFields.includes(key));
  let bodyFatDate = null;
  const contributingDates = new Set();
  state.measurements.forEach((entry) => {
    Object.entries(entry).forEach(([key, value]) => {
      if (["id", "date", "note", "source", "healthFields", "_unitOrigin"].includes(key)) return;
      if ((merged[key] === undefined || merged[key] === null) && value !== null && value !== undefined && value !== "") {
        merged[key] = value;
        contributingDates.add(entry.date);
        if (key === "bodyFat") bodyFatDate = entry.date;
        if (fromHealth(entry, key)) merged.healthFields.push(key);
      }
    });
  });
  // Smart-scale body fat lives on weigh-ins; show the newest reading.
  const scaleBodyFat = state.weightLogs.find((entry) => Number(entry.bodyFat) > 0);
  // Compare against the date of the body-fat reading it would replace.
  if (scaleBodyFat && (!merged.bodyFat || Date.parse(scaleBodyFat.date) > Date.parse(bodyFatDate))) {
    merged.bodyFat = Number(scaleBodyFat.bodyFat);
    merged.healthFields = merged.healthFields.filter((key) => key !== "bodyFat");
    if (fromHealth(scaleBodyFat, "bodyFat")) merged.healthFields.push("bodyFat");
  }
  // Values merged from several check-ins must not read as all measured on the newest date.
  const times = [...contributingDates].map((date) => Date.parse(date)).filter(Number.isFinite);
  if (times.length > 1) merged.sinceDate = new Date(Math.min(...times)).toISOString();
  return merged;
}

async function buildCoachPackage(days = logbookDays()) {
  const report = coachReportData(days);
  const photos = PHOTO_POSES
    .map(([pose]) => latestPhotoForPose(pose))
    .filter((photo) => photo && isWithinDays(photo.date, Math.max(days, 28)))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, COACH_PHOTOS_PER_PACKAGE);
  const photoData = [];
  for (const photo of photos) {
    const dataUrl = await photoThumbnail(photo, 720);
    if (dataUrl) photoData.push({ pose: photo.pose, date: photo.date, dataUrl });
  }
  const info = blockWeekInfo();
  return {
    format: COACH_PACKAGE_FORMAT,
    version: COACH_FILE_VERSION,
    generatedAt: new Date().toISOString(),
    rangeDays: days,
    athlete: {
      id: state.athleteId,
      name: state.athleteName || "",
      gender: state.profile?.gender || "",
      age: state.profile?.age || null,
      division: state.profile?.division || "",
      goalDate: state.profile?.goalDate || "",
      phase: state.phase,
      units: state.units
    },
    note: coachNoteDraft || "",
    weightLogs: report.weights,
    // Latest value of every metric first (Health adds waist-only days), then
    // the athlete's own tape check-ins.
    measurements: [mergedLatestMeasurement(), ...state.measurements.filter((entry) => !String(entry.id || "").startsWith("hk-")).slice(0, 5)].filter(Boolean),
    workoutLogs: report.workouts,
    weeklyCheckIns: report.weeklyCheckIns || [],
    prepLogs: report.prepLogs || [],
    volumeWeeks: weeklyVolumeHistory(4),
    trainingBlock: state.trainingBlock ? { ...state.trainingBlock, statusLine: renderBlockStatusLine(info) } : null,
    photos: photoData
  };
}

let pendingCoachShare = null;

const baseHandleNativeShare = window.handleNativeShare;
window.handleNativeShare = function handleNativeShareForCoach(payload) {
  baseHandleNativeShare?.(payload);
  if (pendingCoachShare && payload?.filename === pendingCoachShare.filename) {
    if (payload.completed) {
      state.lastCoachPackageAt = pendingCoachShare.at;
      // The note went out with this check-in; don't resend it with the next.
      coachNoteDraft = "";
      saveState();
      render();
    }
    pendingCoachShare = null;
  }
};

async function sendCheckInToCoach() {
  if (!state.athleteName) {
    toast("Add your name in More so your coach knows who this is from.");
    setView("more");
    return;
  }
  toast("Preparing your check-in...");
  // Cover everything since the last check-in (plus a day of overlap; the coach
  // side de-duplicates), so a late send never drops data.
  const since = Date.parse(state.lastCoachPackageAt || "");
  const gapDays = Number.isFinite(since) ? Math.ceil((Date.now() - since) / 86400000) + 1 : 0;
  const pkg = await buildCoachPackage(Math.min(60, Math.max(logbookDays(), gapDays)));
  const name = `${fileSafe(state.athleteName)} check-in ${todayStamp()}.massmethod`;
  const result = await shareOrDownload(JSON.stringify(pkg), name, "application/x-massmethod");
  const sentAt = new Date().toISOString();
  if (result === "shared") {
    // Only a completed share counts; a cancelled sheet must not shrink the
    // next check-in's range.
    pendingCoachShare = { filename: name.replace(/\//g, "-"), at: sentAt };
  } else {
    state.lastCoachPackageAt = sentAt;
    coachNoteDraft = "";
    saveState();
  }
  toast(result === "shared" ? "Check-in ready. Send it to your coach by Messages, Mail, or AirDrop." : "Check-in file downloaded. Send it to your coach.");
  render();
}

// ---------- Coach: import check-ins ----------

// Check-ins come from other people's files: keep only the fields the coach
// views display, with bounded sizes and validated numbers.
function cleanNumber(value, min, max) {
  const number = Number(value);
  return value !== null && value !== "" && Number.isFinite(number) && number >= min && number <= max ? Math.round(number * 100) / 100 : null;
}

function cleanText(value, max) {
  return value === null || value === undefined ? "" : String(value).slice(0, max);
}

function cleanDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function cleanEntry(entry, fields) {
  const date = cleanDate(entry?.date);
  if (!date) return null;
  return { id: cleanText(entry.id, 64) || date, date, ...fields(entry) };
}

// Which fields of an athlete's entry came from Apple Health (kept so the
// coach's own iCloud backups can leave them out).
function cleanHealthFields(entry, allowed) {
  if (!Array.isArray(entry?.healthFields)) return {};
  return { healthFields: entry.healthFields.filter((key) => allowed.includes(key)) };
}

const CLEAN = {
  weight: (entry) => cleanEntry(entry, (e) => ({ bodyweight: cleanNumber(e.bodyweight, 0.1, 2000), bodyFat: cleanNumber(e.bodyFat, 1, 75), leanMass: cleanNumber(e.leanMass, 0.1, 2000), ...cleanHealthFields(e, ["bodyFat", "leanMass"]) })),
  measurement: (entry) => cleanEntry(entry, (e) => ({ ...Object.fromEntries([...measurementDefinitions.map(([key]) => key), "arm", "thigh"].map((key) => [key, cleanNumber(e[key], 0.1, key === "bodyFat" ? 75 : 400)])), ...cleanHealthFields(e, [...measurementDefinitions.map(([key]) => key), "arm", "thigh"]), ...(cleanDate(e.sinceDate) ? { sinceDate: cleanDate(e.sinceDate) } : {}) })),
  workout: (entry) => cleanEntry(entry, (e) => ({ title: cleanText(e.title, 80) || "Workout", setCount: Array.isArray(e.sets) ? Math.min(e.sets.length, 500) : Math.max(0, Math.min(500, Math.trunc(Number(e.setCount)) || 0)), exercises: workoutExerciseSummary(e) })),
  checkIn: (entry) => cleanEntry(entry, (e) => ({ sleep: cleanNumber(e.sleep, 0, 24), energy: cleanNumber(e.energy, 1, 5), hunger: cleanNumber(e.hunger, 1, 5), digestion: cleanNumber(e.digestion, 1, 5), recovery: cleanNumber(e.recovery, 1, 5), notes: cleanText(e.notes, 500) })),
  prep: (entry) => cleanEntry(entry, (e) => ({ cardioType: cleanText(e.cardioType, 60), cardioMinutes: cleanNumber(e.cardioMinutes, 0, 1440), steps: cleanNumber(e.steps, 0, 200000), posingMinutes: cleanNumber(e.posingMinutes, 0, 1440) }))
};

// Per-exercise summary the coach can read (best set and set count). Built
// from the athlete's sets on import, or kept from an earlier import.
function workoutExerciseSummary(entry) {
  if (!Array.isArray(entry?.sets)) {
    return safeArray(entry?.exercises).slice(0, 15).map((item) => ({ name: cleanText(item?.name, 60), sets: cleanNumber(item?.sets, 0, 100) ?? 0, weight: cleanNumber(item?.weight, 0, 2000), reps: cleanNumber(item?.reps, 0, 500) })).filter((item) => item.name);
  }
  const byExercise = new Map();
  entry.sets.slice(0, 500).forEach((set) => {
    const name = cleanText(set?.exercise, 60);
    if (!name) return;
    const item = byExercise.get(name) || { name, sets: 0, weight: null, reps: null };
    item.sets += 1;
    const weight = cleanNumber(set?.weight, 0, 2000);
    const reps = cleanNumber(set?.reps, 0, 500);
    if (weight !== null && (item.weight === null || weight > item.weight || (weight === item.weight && (reps ?? 0) > (item.reps ?? 0)))) {
      item.weight = weight;
      item.reps = reps;
    } else if (item.weight === null && reps !== null && reps > (item.reps ?? 0)) {
      item.reps = reps;
    }
    byExercise.set(name, item);
  });
  return [...byExercise.values()].slice(0, 15);
}

function cleanList(list, cleaner) {
  return safeArray(list).map(cleaner).filter(Boolean);
}

function cleanAthleteProfile(athlete) {
  return {
    gender: cleanText(athlete?.gender, 20),
    age: cleanNumber(athlete?.age, 10, 110),
    division: cleanText(athlete?.division, 60),
    goalDate: /^\d{4}-\d{2}-\d{2}$/.test(String(athlete?.goalDate || "")) ? athlete.goalDate : "",
    phase: ["offseason", "bulking", "prep", "travel"].includes(athlete?.phase) ? athlete.phase : "offseason",
    units: athlete?.units === "metric" ? "metric" : "imperial"
  };
}

function cleanVolumeWeeks(weeks) {
  return safeArray(weeks).slice(0, 4).map((week) => ({
    weekStart: /^\d{4}-\d{2}-\d{2}$/.test(String(week.weekStart || "")) ? week.weekStart : "",
    totals: Object.fromEntries(MUSCLE_GROUPS.map((group) => [group.key, cleanNumber(week.totals?.[group.key], 0, 200) || 0]))
  }));
}

function cleanTrainingBlock(block) {
  if (!block || typeof block !== "object") return null;
  return {
    name: cleanText(block.name, 40),
    statusLine: cleanText(block.statusLine, 80),
    focus: (Array.isArray(block.focus) ? block.focus : []).filter((key) => MUSCLE_GROUPS.some((group) => group.key === key)).slice(0, 3)
  };
}

// If an athlete switched lb/kg between check-ins, bring stored history into
// the newest package's units so charts never mix them.
function convertAthleteHistory(athlete, targetUnits) {
  if (!athlete.units || athlete.units === targetUnits) return;
  const toMetric = targetUnits === "metric";
  const weightFactor = toMetric ? KG_PER_LB : 1 / KG_PER_LB;
  const lengthFactor = toMetric ? CM_PER_IN : 1 / CM_PER_IN;
  const scale = (value, factor) => (value === null || value === undefined ? value : Math.round(value * factor * 100) / 100);
  safeArray(athlete.weightLogs).forEach((entry) => {
    entry.bodyweight = scale(entry.bodyweight, weightFactor);
    entry.leanMass = scale(entry.leanMass, weightFactor);
  });
  safeArray(athlete.measurements).forEach((entry) => {
    Object.keys(entry).forEach((key) => {
      if (!["id", "date", "bodyFat"].includes(key) && typeof entry[key] === "number") entry[key] = scale(entry[key], lengthFactor);
    });
  });
  safeArray(athlete.workoutLogs).forEach((log) => safeArray(log.exercises).forEach((item) => { item.weight = scale(item.weight, weightFactor); }));
}

function mergeById(existing, incoming, limitDays = COACH_HISTORY_DAYS) {
  const byId = new Map();
  [...safeArray(existing), ...safeArray(incoming)].forEach((entry) => {
    if (entry.date) byId.set(entry.id, entry);
  });
  return [...byId.values()]
    .filter((entry) => isWithinDays(entry.date, limitDays))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function importCoachPackage(pkg) {
  const athleteId = String(pkg?.athlete?.id || "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(athleteId) || athleteId in Object.prototype) {
    toast("That check-in is missing an athlete id.");
    return false;
  }
  if (athleteId === state.athleteId) {
    toast("This is your own check-in. Open it on your coach's phone.");
    return false;
  }
  if (!state.coach.enabled) {
    if (!window.confirm(`Turn on coach mode and add ${cleanText(pkg.athlete.name, 60) || "this athlete"} to your roster?`)) return false;
    state.coach.enabled = true;
  }
  const generatedAt = cleanDate(pkg.generatedAt) || new Date().toISOString();
  const profile = cleanAthleteProfile(pkg.athlete);
  const before = athleteById(athleteId);
  const storedPhotos = [];
  for (const photo of safeArray(pkg.photos).slice(0, COACH_PHOTOS_PER_PACKAGE)) {
    const date = cleanDate(photo.date);
    const pose = PHOTO_POSES.some(([key]) => key === photo.pose) ? photo.pose : "front-relaxed";
    if (!date || safeArray(before?.photos).some((item) => item.pose === pose && item.date === date)) continue;
    const stored = await storeImportedPhoto(photo.dataUrl, "coach");
    if (stored) storedPhotos.push({ ...stored, pose, date });
  }
  // Re-read after the awaits so a concurrent change is not overwritten.
  const existing = athleteById(athleteId) || { id: athleteId, notes: "", photos: [], packages: [] };
  const newer = !existing.updatedAt || new Date(generatedAt) >= new Date(existing.updatedAt);
  if (newer) {
    convertAthleteHistory(existing, profile.units);
    existing.units = profile.units;
  }
  const incomingUnitsMatch = profile.units === (existing.units || profile.units);
  const photos = [...storedPhotos, ...safeArray(existing.photos)].sort((a, b) => new Date(b.date) - new Date(a.date));
  const athlete = {
    ...existing,
    id: athleteId,
    units: existing.units || profile.units,
    name: newer ? cleanText(pkg.athlete.name, 60) || existing.name || "" : existing.name,
    profile: newer ? profile : existing.profile,
    updatedAt: newer ? generatedAt : existing.updatedAt,
    weightLogs: mergeById(existing.weightLogs, incomingUnitsMatch ? cleanList(pkg.weightLogs, CLEAN.weight) : []),
    measurements: mergeById(existing.measurements, incomingUnitsMatch ? cleanList(pkg.measurements, CLEAN.measurement) : [], 365).slice(0, 30),
    // Exercise summaries are shown for the newest workouts only; dropping
    // them from older entries keeps a full roster inside the storage budget.
    workoutLogs: mergeById(existing.workoutLogs, cleanList(pkg.workoutLogs, CLEAN.workout)).slice(0, 60).map((log, index) => (index < 15 ? log : (({ exercises, ...rest }) => rest)(log))),
    weeklyCheckIns: mergeById(existing.weeklyCheckIns, cleanList(pkg.weeklyCheckIns, CLEAN.checkIn)).slice(0, 40),
    prepLogs: mergeById(existing.prepLogs, cleanList(pkg.prepLogs, CLEAN.prep)).slice(0, 120),
    volumeWeeks: newer ? cleanVolumeWeeks(pkg.volumeWeeks) : safeArray(existing.volumeWeeks),
    trainingBlock: newer ? cleanTrainingBlock(pkg.trainingBlock) : existing.trainingBlock,
    lastNote: newer ? cleanText(pkg.note, 2000) : existing.lastNote,
    photos: photos.slice(0, COACH_PHOTOS_PER_ATHLETE),
    packages: [{ generatedAt, rangeDays: cleanNumber(pkg.rangeDays, 1, 366) }, ...safeArray(existing.packages)].slice(0, 30)
  };
  const previous = athleteById(athleteId);
  state.coach.athletes[athleteId] = athlete;
  if (JSON.stringify(state.coach).length > COACH_STORAGE_BUDGET) {
    // Never let coach data crowd out the coach's own logbook.
    if (previous) state.coach.athletes[athleteId] = previous;
    else delete state.coach.athletes[athleteId];
    storedPhotos.forEach(deletePhotoFile);
    toast("Your roster is full on this device. Remove an athlete before importing more check-ins.");
    return false;
  }
  // Only now that the import is kept, drop photo files beyond the cap.
  photos.slice(COACH_PHOTOS_PER_ATHLETE).forEach(deletePhotoFile);
  state.coach.selectedAthleteId = athleteId;
  state.view = "coach";
  saveState();
  toast(`Check-in from ${athleteDisplayName(athlete)} imported.`);
  render();
  return true;
}

// One import at a time: two files opened together must not race each other.
registerIncomingFileHandler(COACH_PACKAGE_FORMAT, (payload) => {
  coachImportQueue = coachImportQueue.then(() => importCoachPackage(payload)).catch(() => toast("That check-in could not be imported."));
  return true;
});

// ---------- Athlete: import a program from the coach ----------

function sanitizePlan(plan, from) {
  const exercises = (Array.isArray(plan?.exercises) ? plan.exercises : [])
    .map((spec) => normalizePlanExercise(spec))
    .filter((spec) => exerciseLibrary.some((exercise) => exercise.id === spec.id))
    .slice(0, MAX_PLAN_EXERCISES)
    .map((spec) => [
      spec.id,
      spec.sets,
      // Free text like "10/side" or "8-10 (pause)", same rule as the builder.
      planRepsText(spec.reps),
      spec.rest,
      spec.dropSets,
      { group: /^[A-Z0-9]{0,2}$/.test(String(spec.group || "").toUpperCase()) ? String(spec.group || "").toUpperCase() : "", setType: setTypeOptions.some(([value]) => value === spec.setType) ? spec.setType : "standard" }
    ]);
  if (!exercises.length) return null;
  const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].includes(plan.scheduleDay) ? plan.scheduleDay : "";
  return {
    id: `coach-${crypto.randomUUID()}`,
    title: String(plan.title || "Coach workout").slice(0, 60),
    muscle: [...muscles, "abs", "travel"].includes(plan.muscle) ? plan.muscle : "chest",
    phase: ["offseason", "bulking", "prep", "travel"].includes(plan.phase) ? plan.phase : state.phase,
    rest: clampRestSeconds(plan.rest),
    note: String(plan.note || `From ${from}`).slice(0, 300),
    scheduleDay: day,
    fromCoach: from,
    exercises
  };
}

function importProgram(program) {
  const from = String(program?.from || "your coach").slice(0, 60);
  const offered = Array.isArray(program?.plans) ? program.plans : [];
  const plans = offered.slice(0, MAX_PROGRAM_PLANS).map((plan) => sanitizePlan(plan, from)).filter(Boolean);
  const block = program?.block && typeof program.block === "object" ? program.block : null;
  if (!plans.length && !block) {
    toast("That program has no workouts this app can load.");
    return false;
  }
  // Say so when a program was larger than this app accepts, rather than dropping workouts silently.
  const summary = [plans.length ? `${plans.length} workout${plans.length === 1 ? "" : "s"}${offered.length > MAX_PROGRAM_PLANS ? ` (the first ${MAX_PROGRAM_PLANS} of ${offered.length})` : ""}` : "", block ? `a ${Number(block.accumulationWeeks) || 4}-week training block` : ""].filter(Boolean).join(" and ");
  if (!window.confirm(`Add ${summary} from ${from}?`)) return false;
  state.customPlans.unshift(...plans);
  if (block) {
    const incoming = {
      id: crypto.randomUUID(),
      name: String(block.name || `${from}'s block`).slice(0, 40),
      startDate: dateKey(block.start === "next" ? addDays(startOfWeek(), 7) : startOfWeek()),
      accumulationWeeks: Math.max(3, Math.min(6, Number(block.accumulationWeeks) || 4)),
      deload: true,
      focus: (Array.isArray(block.focus) ? block.focus : []).filter((key) => MUSCLE_GROUPS.some((group) => group.key === key)).slice(0, 3),
      createdAt: new Date().toISOString()
    };
    // Finish the current block (often its deload) first; the coach's block
    // takes over on its start date.
    if (blockWeekInfo()?.status === "active" && parseDateKey(incoming.startDate) > startOfWeek()) state.pendingTrainingBlock = incoming;
    else {
      if (state.trainingBlock) archiveTrainingBlock("replaced by coach");
      state.trainingBlock = incoming;
      state.pendingTrainingBlock = null;
    }
  }
  state.coachMessage = { from, message: String(program.message || "").slice(0, 2000), receivedAt: new Date().toISOString(), planCount: plans.length };
  saveState();
  toast(`Program from ${from} added to Plans.`);
  setView("plans");
  return true;
}

registerIncomingFileHandler(PROGRAM_FORMAT, importProgram);

function dismissCoachMessage() {
  state.coachMessage = null;
  saveState();
  render();
}

// ---------- Coach: build and send a program ----------

const MAX_PROGRAM_PLANS = 50;

function toggleProgramPlan(id) {
  const ids = new Set(coachProgramDraft.planIds);
  if (ids.has(id)) ids.delete(id);
  else if (ids.size >= MAX_PROGRAM_PLANS) return toast(`A program can include up to ${MAX_PROGRAM_PLANS} workouts.`);
  else ids.add(id);
  coachProgramDraft = { ...coachProgramDraft, planIds: [...ids] };
  render();
}

function updateProgramDraft(key, value) {
  coachProgramDraft = { ...coachProgramDraft, [key]: key === "blockWeeks" ? Number(value) || 0 : value };
}

function toggleProgramFocus(key) {
  const focus = new Set(coachProgramDraft.focus);
  if (focus.has(key)) focus.delete(key);
  else if (focus.size < 3) focus.add(key);
  coachProgramDraft = { ...coachProgramDraft, focus: [...focus] };
  render();
}

async function sendProgramToAthlete(athleteId) {
  const athlete = athleteById(athleteId);
  const plans = state.customPlans.filter((plan) => coachProgramDraft.planIds.includes(plan.id));
  if (!plans.length && !coachProgramDraft.blockWeeks) {
    toast("Pick at least one saved template or a training block.");
    return;
  }
  const program = {
    format: PROGRAM_FORMAT,
    version: COACH_FILE_VERSION,
    createdAt: new Date().toISOString(),
    from: state.coach.name || "Your coach",
    athleteId,
    message: coachProgramDraft.message || "",
    plans: plans.map(({ id, title, muscle, phase, rest, note, scheduleDay, exercises }) => ({ id, title, muscle, phase, rest, note, scheduleDay, exercises })),
    block: coachProgramDraft.blockWeeks ? { name: `${state.coach.name || "Coach"} block`, accumulationWeeks: coachProgramDraft.blockWeeks, focus: coachProgramDraft.focus, start: "next" } : null
  };
  const result = await shareOrDownload(JSON.stringify(program), `Program for ${fileSafe(athleteDisplayName(athlete))} ${todayStamp()}.massmethod`, "application/x-massmethod");
  toast(result === "shared" ? "Program ready to send." : "Program file downloaded.");
}

// ---------- Coach views ----------

function setCoachEnabled(enabled) {
  state.coach.enabled = Boolean(enabled);
  saveState();
  render();
}

function saveCoachName(value) {
  state.coach.name = String(value || "").trim().slice(0, 60);
  saveState();
}

function openAthlete(id) {
  state.coach.selectedAthleteId = athleteById(id) ? id : "";
  coachProgramDraft = { planIds: [], message: "", blockWeeks: 0, focus: [] };
  state.view = "coach";
  saveState();
  render();
  window.scrollTo?.(0, 0);
}

function saveAthleteNotes(id, value) {
  if (!athleteById(id)) return;
  state.coach.athletes[id].notes = String(value || "").slice(0, 5000);
  saveState();
}

function removeAthlete(id) {
  const athlete = athleteById(id);
  if (!athlete || !window.confirm(`Remove ${athleteDisplayName(athlete)} and their check-ins from your roster?`)) return;
  safeArray(athlete.photos).forEach(deletePhotoFile);
  delete state.coach.athletes[id];
  state.coach.selectedAthleteId = "";
  saveState();
  render();
}

// The check-in's current week is partial (empty on a Monday check-in); show
// it only once it has training, otherwise the last completed week.
function athleteVolumeWeek(athlete) {
  const weeks = safeArray(athlete.volumeWeeks).filter((week) => week && typeof week === "object" && week.totals && typeof week.totals === "object");
  const total = (week) => Object.values(week.totals).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return weeks[0] && total(weeks[0]) > 0 ? weeks[0] : weeks[1] || weeks[0] || null;
}

function athleteSummary(athlete) {
  // Windows end at the check-in, not at "now": the numbers must not shrink
  // the longer the coach waits to open it.
  const anchor = Number.isFinite(Date.parse(athlete.updatedAt)) ? Date.parse(athlete.updatedAt) : Date.now();
  const within = (date, days) => {
    const time = Date.parse(date);
    return Number.isFinite(time) && time <= anchor + 60000 && anchor - time < days * 86400000;
  };
  const weights = safeArray(athlete.weightLogs).map((entry) => ({ date: entry.date, value: Number(entry.bodyweight) })).filter((entry) => entry.value > 0);
  const recent = weights.filter((entry) => within(entry.date, 7));
  const avg = recent.length ? recent.reduce((sum, entry) => sum + entry.value, 0) / recent.length : null;
  const prior = weights.filter((entry) => !within(entry.date, 7) && within(entry.date, 14));
  const priorAvg = prior.length ? prior.reduce((sum, entry) => sum + entry.value, 0) / prior.length : null;
  const workouts7 = safeArray(athlete.workoutLogs).filter((log) => within(log.date, 7)).length;
  const checkIn = safeArray(athlete.weeklyCheckIns)[0];
  const days = athlete.updatedAt ? Math.floor((Date.now() - new Date(athlete.updatedAt)) / 86400000) : null;
  return {
    unit: athlete.profile?.units === "metric" ? "kg" : "lb",
    avg,
    change: avg !== null && priorAvg !== null ? avg - priorAvg : null,
    workouts7,
    recovery: cleanNumber(checkIn?.recovery, 1, 5),
    daysSince: days,
    stale: days === null || days > 8
  };
}

function renderRoster() {
  const athletes = coachAthletes();
  return `
    <div class="compact-page-header"><p class="eyebrow">Coach hub</p><h1>Your athletes</h1></div>
    <section class="card pad" style="margin-bottom:12px">
      <p class="muted">Athletes tap <strong>Send to Coach</strong> in their Logbook and text or email you the file. Open it on this phone (or use Import File in More) to update their dashboard.</p>
      <div class="field" style="margin-top:10px"><label for="coachName">Your name on programs you send</label><input id="coachName" value="${escapeHtml(state.coach.name)}" placeholder="Coach name" maxlength="60" onchange="saveCoachName(this.value)" /></div>
      <label class="secondary-btn file-btn" style="margin-top:12px">Import Check-In<input type="file" accept=".massmethod,.json,application/json" onchange="importFileFromInput(this)" hidden /></label>
    </section>
    <div class="grid roster">
      ${athletes.map((athlete) => {
        const summary = athleteSummary(athlete);
        return `
          <button class="card pad roster-card" onclick="openAthlete('${escapeHtml(athlete.id)}')">
            <div class="card-head"><div><h3>${escapeHtml(athleteDisplayName(athlete))}</h3><p class="muted">${escapeHtml(phaseLabel(athlete.profile?.phase))}${athlete.profile?.division ? ` · ${escapeHtml(athlete.profile.division)}` : ""}</p></div><span class="badge ${summary.stale ? "amber" : "green"}">${summary.daysSince === null ? "No check-in" : summary.daysSince === 0 ? "Today" : `${summary.daysSince}d ago`}</span></div>
            <div class="roster-stats">
              <span><strong>${summary.avg ? formatWeight(summary.avg) : "--"}</strong> ${summary.unit} avg</span>
              <span><strong>${summary.change === null ? "--" : `${summary.change >= 0 ? "+" : ""}${formatWeight(summary.change, 2)}`}</strong> vs prior wk</span>
              <span><strong>${summary.workouts7}</strong> workouts/7d</span>
              <span><strong>${escapeHtml(summary.recovery ?? "--")}</strong> recovery/5</span>
            </div>
          </button>
        `;
      }).join("") || '<div class="empty"><p class="muted">No athletes yet. Import a check-in file to add one.</p></div>'}
    </div>
  `;
}

function renderAthleteVolume(athlete) {
  const week = athleteVolumeWeek(athlete);
  if (!week?.totals) return '<p class="muted">No volume data in this check-in.</p>';
  const totals = Object.fromEntries(MUSCLE_GROUPS.map((group) => [group.key, Number(week.totals[group.key]) || 0]));
  const block = athlete.trainingBlock ? { focus: Array.isArray(athlete.trainingBlock.focus) ? athlete.trainingBlock.focus : [] } : null;
  return renderVolumeBars(totals, null, block, athlete.profile?.phase || "offseason");
}

function renderAthleteDetail(athlete) {
  const summary = athleteSummary(athlete);
  const weights = [...safeArray(athlete.weightLogs)].reverse().map((entry) => Number(entry.bodyweight)).filter((value) => value > 0);
  const latestMeasurement = safeArray(athlete.measurements)[0];
  const lengthLabel = athlete.profile?.units === "metric" ? "cm" : "in";
  const plans = state.customPlans;
  return `
    <div class="topbar">
      <div><p class="eyebrow">Athlete</p><h1>${escapeHtml(athleteDisplayName(athlete))}</h1><p class="muted">${escapeHtml(phaseLabel(athlete.profile?.phase))}${athlete.profile?.goalDate ? ` · Show ${formatShortDate(athlete.profile.goalDate)}` : ""} · Last check-in ${athlete.updatedAt ? formatShortDate(athlete.updatedAt) : "--"}</p></div>
      <div class="actions"><button class="secondary-btn" onclick="openAthlete('')">All Athletes</button></div>
    </div>
    ${athlete.lastNote ? `<section class="card pad coach-note-card"><p class="eyebrow">Athlete note</p><p>${escapeHtml(athlete.lastNote)}</p></section>` : ""}
    <div class="grid today-stats">
      <article class="card stat"><p class="value">${summary.avg ? formatWeight(summary.avg) : "--"}</p><p class="label">7-day avg ${summary.unit}</p></article>
      <article class="card stat"><p class="value">${summary.change === null ? "--" : `${summary.change >= 0 ? "+" : ""}${formatWeight(summary.change, 2)}`}</p><p class="label">Change vs prior week</p></article>
      <article class="card stat"><p class="value">${summary.workouts7}</p><p class="label">Workouts last 7 days</p></article>
      <article class="card stat"><p class="value">${escapeHtml(summary.recovery ?? "--")}</p><p class="label">Latest recovery / 5</p></article>
    </div>
    <div class="grid two" style="margin-top:12px">
      <section class="card pad"><h2>Body weight</h2>${weights.length > 1 ? sparkline(weights) : '<p class="muted">Needs two weigh-ins.</p>'}</section>
      <section class="card pad"><h2>Latest measurements</h2>${latestMeasurement ? `<p class="muted">${latestMeasurement.sinceDate ? `Most recent value of each, ${formatShortDate(latestMeasurement.sinceDate)} to ${formatShortDate(latestMeasurement.date)}` : formatShortDate(latestMeasurement.date)}</p><div class="measurement-grid">${measurementDefinitions.filter(([key]) => latestMeasurement[key] !== null && latestMeasurement[key] !== undefined).map(([key, label]) => `<div class="stat card"><p class="value">${escapeHtml(latestMeasurement[key])}</p><p class="label">${escapeHtml(String(label).replace(/ %$/, ""))} ${key === "bodyFat" ? "%" : lengthLabel}</p></div>`).join("")}</div>` : '<p class="muted">No measurements yet.</p>'}</section>
    </div>
    <section class="card pad" style="margin-top:12px"><div class="card-head"><div><p class="eyebrow">Weekly volume</p><h2>${athleteVolumeWeek(athlete)?.weekStart ? `Hard sets, week of ${escapeHtml(formatShortDate(athleteVolumeWeek(athlete).weekStart))}` : "Hard sets"}</h2></div>${athlete.trainingBlock ? `<span class="badge blue">${escapeHtml(athlete.trainingBlock.statusLine || athlete.trainingBlock.name || "")}</span>` : ""}</div><div class="volume-list">${renderAthleteVolume(athlete)}</div></section>
    ${safeArray(athlete.photos).length ? `<section class="card pad" style="margin-top:12px"><p class="eyebrow">Progress photos</p><div class="photo-strip">${safeArray(athlete.photos).map((photo) => `<figure class="photo-thumb">${photoImg(photo)}<figcaption>${escapeHtml(poseLabel(photo.pose))}<br />${formatShortDate(photo.date)}</figcaption></figure>`).join("")}</div></section>` : ""}
    <div class="grid two" style="margin-top:12px">
      <section class="card pad"><h2>Recent workouts</h2><div class="exercise-list">${safeArray(athlete.workoutLogs).slice(0, 8).map((log) => `<div class="exercise-row"><div><strong>${escapeHtml(log.title || "Workout")}</strong><p class="muted" style="margin:2px 0 0">${formatShortDate(log.date)} · ${plural(Number(log.setCount ?? workoutLogSets(log).length) || 0, "set")}</p>${safeArray(log.exercises).length ? `<p class="muted compact-note" style="margin:2px 0 0">${safeArray(log.exercises).map((item) => `${escapeHtml(item.name)}: ${plural(Number(item.sets) || 0, "set")}${item.weight ? `, best ${escapeHtml(formatWeight(item.weight))} ${athlete.profile?.units === "metric" ? "kg" : "lb"}${item.reps ? ` × ${escapeHtml(String(item.reps))}` : ""}` : item.reps ? `, best ${escapeHtml(String(item.reps))} reps` : ""}`).join(" · ")}</p>` : ""}</div></div>`).join("") || '<p class="muted">No workouts in range.</p>'}</div></section>
      <section class="card pad"><h2>Recovery check-ins</h2><div class="exercise-list">${safeArray(athlete.weeklyCheckIns).slice(0, 6).map((entry) => `<div class="exercise-row"><span>${formatShortDate(entry.date)} · Sleep ${escapeHtml(entry.sleep ?? "--")}h</span><strong>Energy ${escapeHtml(entry.energy ?? "--")} · Recovery ${escapeHtml(entry.recovery ?? "--")}/5</strong></div>${entry.notes ? `<p class="muted compact-note">${escapeHtml(entry.notes)}</p>` : ""}`).join("") || '<p class="muted">No check-ins in range.</p>'}</div></section>
    </div>
    <section class="card pad" style="margin-top:12px">
      <p class="eyebrow">Private notes</p>
      <textarea rows="4" aria-label="Notes about ${escapeHtml(athleteDisplayName(athlete))}" placeholder="Only you see these notes." onchange="saveAthleteNotes('${escapeHtml(athlete.id)}', this.value)">${escapeHtml(athlete.notes || "")}</textarea>
    </section>
    <section class="card pad" style="margin-top:12px">
      <p class="eyebrow">Send a program</p>
      <h2>Templates, block, and message</h2>
      <p class="muted compact-note">Build templates in the Builder tab, then pick them here. The athlete imports the file and the workouts land in their Plans.</p>
      <div class="program-plans">${plans.map((plan) => `<label class="toggle-row"><input type="checkbox" ${coachProgramDraft.planIds.includes(plan.id) ? "checked" : ""} onchange="toggleProgramPlan('${escapeHtml(plan.id)}')" /> <span>${escapeHtml(plan.title)} <small class="muted">${plural(plan.exercises.length, "exercise")}${plan.scheduleDay ? ` · ${escapeHtml(plan.scheduleDay)}` : ""}</small></span></label>`).join("") || '<p class="muted">No saved templates yet. Save some from the Builder tab.</p>'}</div>
      <div class="grid two" style="margin-top:12px">
        <div class="field"><label for="programBlock">Training block</label><select id="programBlock" onchange="updateProgramDraft('blockWeeks', this.value); render()"><option value="0">No block</option>${[3, 4, 5, 6].map((weeks) => `<option value="${weeks}" ${coachProgramDraft.blockWeeks === weeks ? "selected" : ""}>${weeks} build weeks + deload, starting next week</option>`).join("")}</select></div>
        <div class="field"><label for="programMessage">Message</label><input id="programMessage" value="${escapeHtml(coachProgramDraft.message)}" placeholder="Focus for this block..." oninput="updateProgramDraft('message', this.value)" /></div>
      </div>
      ${coachProgramDraft.blockWeeks ? `<p class="muted compact-note">Weak points (up to 3):</p><div class="filters">${MUSCLE_GROUPS.map((group) => `<button class="chip ${coachProgramDraft.focus.includes(group.key) ? "active" : ""}" onclick="toggleProgramFocus('${group.key}')">${escapeHtml(group.label)}</button>`).join("")}</div>` : ""}
      <div class="actions" style="margin-top:12px"><button class="primary-btn" onclick="sendProgramToAthlete('${escapeHtml(athlete.id)}')">Send Program</button><button class="ghost-btn danger" onclick="removeAthlete('${escapeHtml(athlete.id)}')">Remove Athlete</button></div>
    </section>
  `;
}

function renderCoach() {
  const selected = athleteById(state.coach.selectedAthleteId);
  return selected ? renderAthleteDetail(selected) : renderRoster();
}

registerMoreSection(25, () => `
  <section class="card pad">
    <p class="eyebrow">Coaching</p>
    <h2>Work with a coach</h2>
    <p class="muted">Send your coach a check-in with weight, measurements (including readings imported from Apple Health), workouts, recovery, volume, and your latest photos. ${state.lastCoachPackageAt ? `Last sent ${formatShortDate(state.lastCoachPackageAt)}.` : ""}</p>
    <button class="primary-btn" onclick="sendCheckInToCoach()">Send Check-In to Coach</button>
    <label class="toggle-row"><input type="checkbox" ${state.coach?.enabled ? "checked" : ""} onchange="setCoachEnabled(this.checked)" /> <span>I coach athletes (adds a roster of athlete check-ins)</span></label>
    ${state.coach?.enabled ? `<button class="secondary-btn" style="margin-top:10px" onclick="openAthlete('')">Open Coach Hub (${coachAthletes().length})</button>` : ""}
  </section>
`);

const baseRenderContentForCoach = renderContent;
renderContent = function renderContentWithCoach() {
  if (state.view === "coach") return renderCoach();
  return baseRenderContentForCoach();
};

const baseRenderLogbookForCoach = renderLogbook;
renderLogbook = function renderLogbookWithCoach() {
  const html = baseRenderLogbookForCoach();
  return html.replace('<button class="primary-btn" onclick="exportLogbookPdf()">Export PDF</button>', '<button class="primary-btn" onclick="sendCheckInToCoach()">Send to Coach</button><button class="secondary-btn" onclick="exportLogbookPdf()">Export PDF</button>');
};

const baseRenderTodayForCoach = renderToday;
renderToday = function renderTodayWithCoach() {
  const html = baseRenderTodayForCoach();
  const message = state.coachMessage;
  if (!message) return html;
  return `<section class="card pad coach-note-card" style="margin-bottom:12px"><div class="card-head"><div><p class="eyebrow">From ${escapeHtml(message.from)}</p><h2>${message.planCount ? `${message.planCount} new workout${message.planCount === 1 ? "" : "s"} in Plans` : "New program"}</h2></div><button class="ghost-btn" onclick="dismissCoachMessage()">Dismiss</button></div>${message.message ? `<p>${escapeHtml(message.message)}</p>` : ""}</section>${html}`;
};

const baseRenderPlanCardForCoach = renderPlanCard;
renderPlanCard = function renderPlanCardWithCoach(plan) {
  const html = baseRenderPlanCardForCoach(plan);
  return plan.fromCoach ? html.replace("<h3", `<span class="badge amber">From ${escapeHtml(plan.fromCoach)}</span><h3`) : html;
};

const baseResetForCoach = resetDemoData;
resetDemoData = function resetWithCoach() {
  baseResetForCoach();
  coachMigrateState();
  saveState();
  render();
};

saveState();
render();
