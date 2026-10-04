#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readBuffer = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const app = read("app.js");
const toolkit = read("toolkit.js");
// The page's scripts, in the order index.html loads them.
const webScripts = [...read("index.html").matchAll(/<script src="\.\/([\w-]+\.js)"><\/script>/g)].map((match) => match[1]);
assert.deepEqual(webScripts.slice(0, 2), ["app.js", "toolkit.js"], "index.html must load app.js then toolkit.js first");
const styles = read("styles.css");
const swiftApp = read("ios/PeakSet/PeakSetApp.swift");
const swiftWebView = read("ios/PeakSet/PeakSetWebView.swift");
const nativeServices = read("ios/PeakSet/PeakSetNativeServices.swift");
const xcodeProject = read("ios/PeakSet.xcodeproj/project.pbxproj");
const infoPlist = read("ios/PeakSet/Info.plist");
const entitlements = read("ios/PeakSet/PeakSet.entitlements");
const appIcon = readBuffer("ios/PeakSet/Assets.xcassets/AppIcon.appiconset/MassMethodIcon.png");

function literalBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing ${start}`);
  assert.notEqual(endIndex, -1, `Missing ${end}`);
  return source.slice(startIndex + start.length, endIndex).trim();
}

const exercises = Function(`"use strict"; return ${literalBetween(app, "const exerciseLibrary = ", ";\n\nconst planTemplates")};`)();
const plans = Function(`"use strict"; return ${literalBetween(app, "const planTemplates = ", ";\n\nconst abFinishersByPlan")};`)();

const ids = exercises.map((exercise) => exercise.id);
assert.equal(new Set(ids).size, ids.length, "Exercise IDs must be unique");

const requestedNames = [
  "Seated Calf Raises",
  "Standing Machine Calf Raises",
  "Machine Hip Thrust",
  "Machine Decline Chest Press",
  "Machine Incline Chest Press",
  "Decline Skull Crusher",
  "Machine Preacher Curl",
  "Stability Ball Crunches"
];
for (const name of requestedNames) {
  assert(exercises.some((exercise) => exercise.name === name), `Missing requested exercise: ${name}`);
}

const shoulderPlans = plans.filter((plan) => plan.muscle === "shoulders" || plan.id === "shoulders-road-gym");
assert(shoulderPlans.length > 0, "No shoulder plans found");
for (const plan of shoulderPlans) {
  assert(plan.exercises.some(([id]) => id === "y-raise"), `Incline Y-Raise missing from ${plan.id}`);
}

assert(app.includes('libraryExercise.muscle === "abs"'), "Abs exercises must be initialized as reps-only");
assert(app.includes('isRepsOnlyExercise(exercise) ? ""'), "Abs weight input must be omitted");
assert(app.includes('toast(repsOnly ? "Enter reps before completing the set."'), "Abs completion must require reps only");
assert(styles.includes(".set-row.reps-only"), "Missing reps-only set layout");
assert(swiftApp.includes("UIApplication.shared.applicationSupportsShakeToEdit = false"), "Shake-to-undo is not disabled");
assert(app.includes('new Audio("assets/boxing-bell.wav")'), "Boxing bell audio asset is not preloaded");
assert(app.includes('await awaitWithTimeout(audio.play(), 800, "Bell audio playback")'), "Boxing bell media playback is not timeout-protected");
assert(app.includes("primeTimerAudio();"), "Timer start does not unlock audio playback");
assert(app.includes('onclick="playBoxingBell()">Test Bell</button>'), "Timer does not provide a user-gesture bell test");
assert(app.includes("messageHandlers?.peaksetPlayBell"), "Timer bell does not prefer native iOS playback");
assert(app.includes('document.addEventListener("visibilitychange"'), "Timer audio is not restored after foregrounding");
assert(swiftApp.includes("AVAudioSession.sharedInstance()"), "Native audio session is not configured");
assert(swiftApp.includes("UIApplication.didBecomeActiveNotification"), "Native audio session is not restored after foregrounding");
assert(swiftWebView.includes("mediaTypesRequiringUserActionForPlayback = []"), "WKWebView media playback is still gesture-restricted");
assert(swiftWebView.includes('"peaksetPlayBell"'), "Native bell message handler is not registered");
assert(swiftWebView.includes("AVAudioPlayer(contentsOf: bellURL)"), "Native bell player is not configured");
for (const feature of [
  "lastExercisePerformance", "progressionSuggestion", "renderExerciseHistoryPanel",
  "substituteActiveExercise", "equipmentProfiles", "Superset", "setTypeOptions",
  "saveWeeklyCheckIn", "savePrepLog", "measurementDefinitions", "requestHealthKit",
  "favoriteExercises", "saveExerciseSetting"
]) {
  assert(toolkit.includes(feature), `Bodybuilder toolkit feature is missing: ${feature}`);
}
assert(toolkit.includes("peaksetTimer"), "Web timer is not connected to the native background timer");
assert(nativeServices.includes("UNTimeIntervalNotificationTrigger"), "Native background timer notification is missing");
assert(nativeServices.includes("HKStatisticsQuery"), "HealthKit step import is missing");
assert(nativeServices.includes("traditionalStrengthTraining"), "HealthKit workout export is missing");
assert(nativeServices.includes("HKWorkoutBuilder"), "HealthKit workout export is not using the iOS 17 workout builder");
assert(swiftWebView.includes("withFractionalSeconds"), "HealthKit bridge cannot parse JavaScript ISO timestamps");
assert(toolkit.includes("builderFormDraft"), "Builder form state is not preserved across draft edits");
assert(toolkit.includes("buildToolkitCoachReportLines"), "Check-ins and prep activity are missing from coach PDFs");
{
  // app.js destructures [label, value, unit] from measurementRows(); the toolkit override must return tuples.
  const source = literalBetween(toolkit, "measurementRows = function toolkitMeasurementRows(entry) {", "\n};");
  const measurementRows = Function("measurementDefinitions", "lengthUnit", "entry", source)
    .bind(null, [["chest", "Chest"], ["bodyFat", "Body Fat %"]], () => "in");
  const rows = measurementRows({ chest: 44, bodyFat: null });
  assert.deepEqual(rows, [["Chest", 44, "in"]], "Toolkit measurementRows must return [label, value, unit] tuples");
}
assert(!app.includes("state.customPlans.unshift({\n    id: `quick-"), "Quick Start must not persist throwaway templates");
assert(toolkit.includes('startsWith("quick-")'), "Legacy quick-start templates are not pruned on migration");
assert(toolkit.includes("handleNativeTimerReconcile"), "Background timer reconciliation is missing");
assert(app.includes('postMessage({ action: "reconcile" })'), "Foreground timer reconciliation is missing");
assert(xcodeProject.includes("PeakSetNativeServices.swift in Sources"), "Native services are not in the Xcode source phase");
assert(xcodeProject.includes("CODE_SIGN_ENTITLEMENTS = PeakSet/PeakSet.entitlements"), "HealthKit entitlements are not configured for signing");
assert(infoPlist.includes("NSHealthShareUsageDescription") && infoPlist.includes("NSHealthUpdateUsageDescription"), "HealthKit privacy descriptions are missing");
assert(entitlements.includes("com.apple.developer.healthkit"), "HealthKit entitlement is missing");
assert(app.includes('const APP_NAME = "Mass Method"'), "Visible app branding is not Mass Method");
assert(infoPlist.includes("<string>Mass Method</string>"), "iOS display name is not Mass Method");
assert(xcodeProject.includes('INFOPLIST_KEY_CFBundleDisplayName = "Mass Method"'), "Xcode display name is not Mass Method");
const buildNumbers = [...xcodeProject.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((match) => Number(match[1]));
assert.equal(buildNumbers.length, 6, "Expected a CURRENT_PROJECT_VERSION in Debug and Release for the app, widget extension, and watch app");
assert(buildNumbers.every((value) => Number.isInteger(value) && value > 0), "Build numbers must be positive integers");
assert.equal(new Set(buildNumbers).size, 1, `App, extension, and watch build numbers must match: ${buildNumbers.join(", ")}`);
const marketingVersions = [...xcodeProject.matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map((match) => match[1]);
assert.equal(new Set(marketingVersions).size, 1, `App, extension, and watch versions must match: ${marketingVersions.join(", ")}`);
assert.equal(appIcon.readUInt32BE(16), 1024, "Mass Method app icon must be 1024 px wide");
assert.equal(appIcon.readUInt32BE(20), 1024, "Mass Method app icon must be 1024 px tall");
assert.equal(appIcon[25], 2, "Mass Method app icon must be opaque RGB without alpha");

for (const filename of [...webScripts, "styles.css", "index.html", "assets/physique-lines.svg"]) {
  assert.equal(read(filename), read(`ios/PeakSet/Web/${filename}`), `${filename} is not synced into the iOS bundle`);
}
assert.deepEqual(readBuffer("assets/boxing-bell.wav"), readBuffer("ios/PeakSet/Web/assets/boxing-bell.wav"), "Boxing bell audio is not synced into the iOS bundle");
assert.deepEqual(readBuffer("assets/boxing-bell.wav"), readBuffer("ios/PeakSet/boxing-bell.wav"), "Native notification bell is not synced");

console.log(`Validated ${exercises.length} exercises and ${plans.length} workout templates.`);
console.log(`Incline Y-Raise is present in ${shoulderPlans.length} shoulder workout templates.`);
console.log("Abs session rows are reps-only and shake-to-undo is disabled.");
console.log("Timer bell asset, audio unlock, and iOS audio-session recovery are configured.");
console.log("Bodybuilder toolkit, native background timer, and HealthKit bridges are configured.");

// Runtime regression checks. The shipped page loads app.js and then toolkit.js,
// which overrides several app.js functions, so both scripts run here.
const runtimeSource = webScripts.map(read).join("\n;\n");

function makeContext(storedState = null) {
  const storage = new Map();
  if (storedState !== null) storage.set("stageforge-v1", JSON.stringify(storedState));
  const elements = new Map();
  const rootElement = { innerHTML: "" };
  const document = {
    hidden: false,
    addEventListener() {},
    body: { appendChild() {} },
    createElement() { return { className: "", textContent: "", setAttribute() {}, remove() {} }; },
    getElementById(id) {
      if (id === "app") return rootElement;
      if (!elements.has(id)) elements.set(id, { value: "", innerHTML: "", classList: { add() {}, remove() {} } });
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    document,
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    },
    window: { confirm: () => true },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    JSON,
    Blob,
    URL,
    structuredClone
  });
  vm.runInContext(runtimeSource, context, { filename: webScripts.join("+") });
  return { context, elements, storage };
}

const baseline = makeContext();
const catalog = vm.runInContext(`({
  exerciseIds: exerciseLibrary.map((item) => item.id),
  planIds: planTemplates.map((item) => item.id),
  referencedExerciseIds: planTemplates.flatMap((plan) => plan.exercises.map(([id]) => id))
})`, baseline.context);
assert.equal(new Set(catalog.exerciseIds).size, catalog.exerciseIds.length, "exercise IDs must be unique");
assert.equal(new Set(catalog.planIds).size, catalog.planIds.length, "plan IDs must be unique");
for (const id of catalog.referencedExerciseIds) assert.ok(catalog.exerciseIds.includes(id), `plan references missing exercise ${id}`);

for (const [id, value] of Object.entries({ gender: "Male", age: "45", bodyweight: "200", phase: "offseason" })) {
  baseline.elements.set(id, { value, innerHTML: "", classList: { add() {}, remove() {} } });
}
vm.runInContext("saveProfile()", baseline.context);
assert.equal(vm.runInContext("state.measurements.length", baseline.context), 0, "blank onboarding measurements must not create a fake check-in");
assert.equal(vm.runInContext("state.weightLogs.length", baseline.context), 1, "onboarding must create one starting weight");

vm.runInContext("quickStartExercise('flat-db-press')", baseline.context);
const firstWorkoutId = vm.runInContext("state.activeWorkout.id", baseline.context);
assert.equal(vm.runInContext("state.customPlans.length", baseline.context), 0, "quick logs must not pollute saved plans");
vm.runInContext("quickStartExercise('barbell-bench')", baseline.context);
assert.equal(vm.runInContext("state.activeWorkout.id", baseline.context), firstWorkoutId, "starting another workout must not overwrite an active session");
vm.runInContext("setView('today')", baseline.context);
assert.match(vm.runInContext("renderActiveWorkoutBanner()", baseline.context), /Resume Workout/, "active sessions must always expose a resume action");
vm.runInContext("state.activeWorkout.exercises[0].sets[0].weight = '-1'; state.activeWorkout.exercises[0].sets[0].reps = '10'; completeSet(0, 0)", baseline.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[0].done", baseline.context), false, "negative loads must not complete a set");
vm.runInContext("state.activeWorkout.exercises[0].sets[0].weight = '50'; state.activeWorkout.exercises[0].sets[0].reps = '10'; completeSet(0, 0); updateSet(0, 0, 'weight', '55')", baseline.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[0].done", baseline.context), false, "editing a completed set must reopen it");

vm.runInContext("state.activeWorkout = null; startWorkout('chest-density')", baseline.context);
assert.deepEqual(Array.from(vm.runInContext("state.activeWorkout.exercises.map((exercise) => exercise.rest)", baseline.context)), [120, 105, 60, 90, 45], "built-in plans must honor their configured rest periods");

vm.runInContext("state.weightLogs.push({ id: 'sentinel', date: new Date().toISOString(), bodyweight: 201 }); resetDemoData()", baseline.context);
assert.equal(vm.runInContext("state.weightLogs.length", baseline.context), 0, "reset must not reuse mutable default arrays");
vm.runInContext("state.weightLogs.push({ id: 'after-reset', date: new Date().toISOString(), bodyweight: 202 }); resetDemoData()", baseline.context);
assert.equal(vm.runInContext("state.weightLogs.length", baseline.context), 0, "repeated resets must remain empty");

const report = makeContext({
  profile: { bodyweight: 200 },
  measurements: [{ id: "old", date: "2020-01-01T12:00:00Z", waist: 30 }],
  weightLogs: [{ id: "old-weight", date: "2020-01-01T12:00:00Z", bodyweight: 180 }]
});
assert.equal(vm.runInContext("coachReportData(7).latestMeasurement", report.context), undefined, "reports must not leak measurements outside the selected range");
assert.equal(vm.runInContext("coachReportData(7).latestWeight", report.context), undefined, "reports must not leak weights outside the selected range");
assert.equal(vm.runInContext("formatShortDate('2026-08-28')", report.context), new Date(2026, 7, 28).toLocaleDateString(), "date-only values must stay on their local calendar day");

const live = makeContext();
vm.runInContext("startWorkout('chest-density')", live.context);
vm.runInContext("state.timer.exerciseIndex = 0", live.context);
const originalFirstId = vm.runInContext("state.activeWorkout.exercises[0].id", live.context);
const originalSecondId = vm.runInContext("state.activeWorkout.exercises[1].id", live.context);
assert.equal(vm.runInContext("moveActiveWorkoutExercise(0, 1)", live.context), true, "live exercises must move down");
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].id", live.context), originalSecondId, "reordering must preserve the exercise objects");
assert.equal(vm.runInContext("state.activeWorkout.exercises[1].id", live.context), originalFirstId, "reordering must preserve the displaced exercise");
assert.equal(vm.runInContext("state.timer.exerciseIndex", live.context), 1, "reordering must keep the timer attached to the same exercise");

live.elements.set("activeSubstitute-0", { value: "barbell-row", innerHTML: "", classList: { add() {}, remove() {} } });
assert.equal(vm.runInContext("substituteActiveWorkoutExercise(0)", live.context), false, "cross-muscle substitutions must be rejected");
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].id", live.context), originalSecondId, "a rejected substitute must not mutate the exercise");
live.elements.get("activeSubstitute-0").value = "incline-barbell-press";
assert.equal(vm.runInContext("substituteActiveWorkoutExercise(0)", live.context), true, "an untouched exercise must be substitutable");
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].id", live.context), "incline-barbell-press", "substitution must use a same-muscle suggestion");
vm.runInContext("state.activeWorkout.exercises[0].sets[0].weight = '50'", live.context);
live.elements.set("activeSubstitute-0", { value: "flat-db-press", innerHTML: "", classList: { add() {}, remove() {} } });
assert.equal(vm.runInContext("substituteActiveWorkoutExercise(0)", live.context), false, "entered sets must block destructive substitution");
assert.equal(vm.runInContext("removeActiveWorkoutExercise(0)", live.context), false, "entered sets must block destructive removal");

const beforeRemove = vm.runInContext("state.activeWorkout.exercises.length", live.context);
vm.runInContext("state.timer.exerciseIndex = 3", live.context);
assert.equal(vm.runInContext("removeActiveWorkoutExercise(1)", live.context), true, "an untouched exercise must be removable");
assert.equal(vm.runInContext("state.activeWorkout.exercises.length", live.context), beforeRemove - 1, "removal must delete exactly one exercise");
assert.equal(vm.runInContext("state.timer.exerciseIndex", live.context), 2, "removal must keep the timer attached to the same later exercise");

for (const [id, value] of Object.entries({ activeExerciseToAdd: "push-up", activeExerciseSets: "4.8", activeExerciseReps: "12-15", activeExerciseRest: "75", activeExerciseDropSets: "1.9" })) {
  live.elements.set(id, { value, innerHTML: "", classList: { add() {}, remove() {} } });
}
const beforeAdd = vm.runInContext("state.activeWorkout.exercises.length", live.context);
assert.equal(vm.runInContext("addExerciseToActiveWorkout()", live.context), true, "an exercise must be addable during a live workout");
assert.equal(vm.runInContext("state.activeWorkout.exercises.length", live.context), beforeAdd + 1, "adding must append exactly one exercise");
const addedExercise = JSON.parse(vm.runInContext("JSON.stringify({ targetSets: state.activeWorkout.exercises.at(-1).targetSets, targetDropSets: state.activeWorkout.exercises.at(-1).targetDropSets, targetReps: state.activeWorkout.exercises.at(-1).targetReps, rest: state.activeWorkout.exercises.at(-1).rest, rowCount: state.activeWorkout.exercises.at(-1).sets.length })", live.context));
assert.deepEqual(addedExercise, { targetSets: 4, targetDropSets: 1, targetReps: "12-15", rest: 75, rowCount: 5 }, "live additions must use whole-number counts and generate matching rows");
assert.equal(vm.runInContext("addExerciseToActiveWorkout()", live.context), false, "duplicate live exercises must be rejected");
assert.equal(vm.runInContext("state.activeWorkout.exercises.length", live.context), beforeAdd + 1, "a duplicate exercise must not mutate the workout");
live.elements.get("activeExerciseToAdd").value = "missing-exercise";
assert.equal(vm.runInContext("addExerciseToActiveWorkout()", live.context), false, "unknown exercise IDs must be rejected");
assert.equal(vm.runInContext("state.activeWorkout.exercises.length", live.context), beforeAdd + 1, "a rejected exercise must not mutate the workout");

Object.assign(live.elements.get("activeExerciseToAdd"), { value: "barbell-bench" });
Object.assign(live.elements.get("activeExerciseSets"), { value: "-3" });
Object.assign(live.elements.get("activeExerciseDropSets"), { value: "9" });
assert.equal(vm.runInContext("addExerciseToActiveWorkout()", live.context), true, "out-of-range counts must normalize safely");
const minimumAddition = JSON.parse(vm.runInContext("JSON.stringify({ targetSets: state.activeWorkout.exercises.at(-1).targetSets, targetDropSets: state.activeWorkout.exercises.at(-1).targetDropSets, rowCount: state.activeWorkout.exercises.at(-1).sets.length })", live.context));
assert.deepEqual(minimumAddition, { targetSets: 1, targetDropSets: 4, rowCount: 5 }, "negative/high counts must clamp to supported bounds");

Object.assign(live.elements.get("activeExerciseToAdd"), { value: "pec-deck" });
Object.assign(live.elements.get("activeExerciseSets"), { value: "99" });
Object.assign(live.elements.get("activeExerciseDropSets"), { value: "-2" });
assert.equal(vm.runInContext("addExerciseToActiveWorkout()", live.context), true, "opposite out-of-range counts must normalize safely");
const maximumAddition = JSON.parse(vm.runInContext("JSON.stringify({ targetSets: state.activeWorkout.exercises.at(-1).targetSets, targetDropSets: state.activeWorkout.exercises.at(-1).targetDropSets, rowCount: state.activeWorkout.exercises.at(-1).sets.length })", live.context));
assert.deepEqual(maximumAddition, { targetSets: 10, targetDropSets: 0, rowCount: 10 }, "high/negative counts must clamp to supported bounds");

const travel = makeContext();
vm.runInContext("startWorkout('road-gym-full')", travel.context);
assert.equal(vm.runInContext("activeWorkoutExerciseOptions().every((exercise) => exercise.hotel)", travel.context), true, "Road Gym live suggestions must remain travel-ready");
for (const [id, value] of Object.entries({ activeExerciseToAdd: "barbell-bench", activeExerciseSets: "3", activeExerciseReps: "8-12", activeExerciseRest: "90", activeExerciseDropSets: "0" })) {
  travel.elements.set(id, { value, innerHTML: "", classList: { add() {}, remove() {} } });
}
const travelCount = vm.runInContext("state.activeWorkout.exercises.length", travel.context);
assert.equal(vm.runInContext("addExerciseToActiveWorkout()", travel.context), false, "Road Gym must reject non-travel exercise IDs even when invoked directly");
assert.equal(vm.runInContext("state.activeWorkout.exercises.length", travel.context), travelCount, "a rejected Road Gym exercise must not mutate the workout");

const history = makeContext({
  workoutLogs: [
    {
      id: "recent-workout",
      title: "Recent Chest",
      date: "2026-08-20T12:00:00Z",
      sets: [
        { exerciseId: "barbell-bench", exercise: "Barbell Bench Press", weight: "100", reps: "10" },
        { exerciseId: "barbell-bench", exercise: "Barbell Bench Press", weight: "100", reps: "8", dropSet: true },
        { exerciseId: "barbell-curl", exercise: "Barbell Curl", weight: "40", reps: "12" }
      ]
    },
    {
      id: "legacy-workout",
      title: "Legacy Chest",
      date: "2026-08-10T12:00:00Z",
      sets: [
        { exercise: "Barbell Bench Press", weight: "90", reps: "12" },
        { exercise: "Barbell Bench Press", weight: "bad", reps: "bad" }
      ]
    }
  ]
});
const benchHistory = JSON.parse(vm.runInContext("JSON.stringify(exerciseHistoryData('barbell-bench'))", history.context));
assert.equal(benchHistory.sessionCount, 2, "exercise history must count distinct workout sessions");
assert.equal(benchHistory.setCount, 4, "exercise history must include legacy name-only sets");
assert.equal(benchHistory.totalVolume, 2880, "exercise history must total only finite positive load and rep pairs");
assert.equal(benchHistory.bestWeight, 100, "exercise history must identify the heaviest load");
assert.equal(benchHistory.bestReps, 12, "exercise history must identify the highest rep count");
assert.equal(Math.round(benchHistory.estimatedOneRepMax * 10) / 10, 133.3, "exercise history must calculate Epley estimated one-rep max");
assert.deepEqual(benchHistory.sessionVolumes.map((entry) => entry.volume), [1080, 1800], "exercise volume trend must be chronological");
assert.match(vm.runInContext("renderExerciseHistory()", history.context), /Recent Chest/, "exercise history screen must render recent sessions");
assert.equal(vm.runInContext("setExerciseHistory('missing-exercise')", history.context), false, "exercise history must reject unknown exercise selections");

const emptyHistory = makeContext({ workoutLogs: [] });
assert.match(vm.runInContext("renderExerciseHistory()", emptyHistory.context), /No saved sets for this exercise yet/, "exercise history must provide a useful empty state");

const malformedNestedHistory = makeContext({ workoutLogs: [{ id: "bad-log", date: "2026-08-20T12:00:00Z", sets: { unexpected: true } }] });
assert.match(vm.runInContext("renderExerciseHistory()", malformedNestedHistory.context), /No saved sets for this exercise yet/, "exercise history must ignore malformed nested set collections without crashing");

const historySave = makeContext();
vm.runInContext("startWorkout('chest-density'); state.activeWorkout.exercises[0].sets[0].weight = '100'; state.activeWorkout.exercises[0].sets[0].reps = '10'; state.activeWorkout.exercises[0].sets[0].done = true; finishWorkout()", historySave.context);
assert.equal(vm.runInContext("state.workoutLogs[0].sets[0].exerciseId", historySave.context), vm.runInContext("exerciseLibrary.find((item) => item.name === state.workoutLogs[0].sets[0].exercise).id", historySave.context), "new workout logs must retain stable exercise IDs");

const malformed = makeContext({ profile: { bodyweight: 200 }, customPlans: null, workoutLogs: {}, weightLogs: "bad", measurements: null });
assert.equal(vm.runInContext("Array.isArray(state.customPlans) && Array.isArray(state.workoutLogs) && Array.isArray(state.weightLogs) && Array.isArray(state.measurements)", malformed.context), true, "legacy collection fields must normalize without wiping the profile");
assert.equal(vm.runInContext("state.profile.bodyweight", malformed.context), 200, "normalization must preserve valid profile data");

const timer = makeContext({ timer: { seconds: 90, left: 0, running: false, startedAt: null, endsAt: null } });
assert.equal(vm.runInContext("state.timer.seconds", timer.context), 90, "the selected rest duration must survive reload");

console.log(`Runtime regression checks passed: ${catalog.exerciseIds.length} exercises, ${catalog.planIds.length} plans, state and workout regression checks.`);

// Audit 2026-10: regressions found when app.js and toolkit.js run together.
const audit = makeContext();
for (const [id, value] of Object.entries({ gender: "Male", age: "45", bodyweight: "-5", phase: "offseason" })) {
  audit.elements.set(id, { value, innerHTML: "", classList: { add() {}, remove() {} } });
}
vm.runInContext("saveProfile()", audit.context);
assert.equal(vm.runInContext("state.profile", audit.context), null, "onboarding must reject a negative body weight");
vm.runInContext("startWorkout('chest-density')", audit.context);
const auditFirst = vm.runInContext("state.activeWorkout.exercises[0].id", audit.context);
vm.runInContext("updateSet(0, 0, 'rir', '1'); updateSet(0, 0, 'setType', 'top')", audit.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[0].rir", audit.context), "1", "RIR entries must persist through updateSet");
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[0].setType", audit.context), "top", "set-type entries must persist through updateSet");
vm.runInContext("updateSet(0, 0, 'weight', '100'); updateSet(0, 0, 'reps', '8'); completeSet(0, 0)", audit.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[0].done", audit.context), true, "a valid set must complete");
vm.runInContext("updateSet(0, 0, 'rir', '0')", audit.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[0].done", audit.context), true, "changing RIR must not reopen a completed set");
vm.runInContext("updateSet(0, 1, 'weight', '100'); updateSet(0, 1, 'reps', '8.5'); completeSet(0, 1)", audit.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[1].done", audit.context), false, "fractional reps must not complete a set");
const auditSubstitute = vm.runInContext("liveExerciseCandidates(state.activeWorkout.exercises[0].id)[0].id", audit.context);
vm.runInContext(`substituteActiveExercise(0, '${auditSubstitute}')`, audit.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].id", audit.context), auditFirst, "substituting must not relabel sets that were already entered");
const auditSecond = vm.runInContext("state.activeWorkout.exercises[1].id", audit.context);
audit.elements.set("liveExerciseAdd", { value: auditSecond, innerHTML: "", classList: { add() {}, remove() {} } });
const auditCount = vm.runInContext("state.activeWorkout.exercises.length", audit.context);
vm.runInContext("addLiveExercise()", audit.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises.length", audit.context), auditCount, "the toolkit Add control must reject duplicate exercises");
vm.runInContext("removeLiveExercise(0)", audit.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].id", audit.context), auditFirst, "the toolkit Remove control must protect entered sets");
vm.runInContext("startTimer(90, true, 2); moveLiveExercise(2, -1)", audit.context);
assert.equal(vm.runInContext("state.timer.exerciseIndex", audit.context), 1, "the toolkit reorder control must keep the timer on its exercise");
vm.runInContext("quickStartExercise('barbell-curl')", audit.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].id", audit.context), auditFirst, "Quick Start must not replace a live toolkit workout");
vm.runInContext("finishWorkout()", audit.context);
assert.equal(vm.runInContext("state.workoutLogs[0].sets[0].rir", audit.context), "0", "saved logs must keep RIR");
vm.runInContext("state.workoutLogs[0].sets = [1,2,3,4].map(() => ({ exerciseId: 'barbell-bench', exercise: 'Barbell Bench Press', weight: '100', reps: '12', rir: 'failure' }))", audit.context);
assert.match(vm.runInContext("progressionSuggestion({ id: 'barbell-bench', targetReps: '8-12' })", audit.context), /Try 102.5 lb/, "sets taken to failure must still earn a load increase");
vm.runInContext("handleNativeHealthKit({ status: 'stepsImported', steps: 4000 }); handleNativeHealthKit({ status: 'stepsImported', steps: 6000 })", audit.context);
assert.equal(vm.runInContext("state.prepLogs.filter((entry) => entry.cardioType === 'HealthKit').length", audit.context), 1, "re-importing steps must replace today's HealthKit entry");
assert.equal(vm.runInContext("state.prepLogs[0].steps", audit.context), 6000, "the latest step import must win");

const corrupt = makeContext({ profile: { bodyweight: 200 }, workoutLogs: [null, { id: "keep", date: "2026-09-01T12:00:00Z", sets: [null, { exercise: "Barbell Bench Press", weight: "100", reps: "8" }] }], measurements: [null, { id: "m", date: "2026-09-01T12:00:00Z", waist: 32 }] });
assert.equal(vm.runInContext("state.profile.bodyweight", corrupt.context), 200, "one malformed entry must not wipe the stored profile");
assert.equal(vm.runInContext("state.workoutLogs.length", corrupt.context), 1, "valid workout logs must survive malformed neighbours");
assert.equal(vm.runInContext("state.workoutLogs[0].sets.length", corrupt.context), 1, "malformed sets must be dropped, not crash migration");
assert.equal(vm.runInContext("state.measurements.length", corrupt.context), 1, "valid measurements must survive malformed neighbours");

console.log("Audit regression checks passed: live-workout guards, RIR logging, progression, HealthKit steps, corrupt-state recovery.");

// Units and backup (settings.js).
const units = makeContext({
  profile: { bodyweight: 200, gender: "Male", age: 40 },
  weightLogs: [{ id: "w", date: "2026-09-01T12:00:00Z", bodyweight: 200 }],
  measurements: [{ id: "m", date: "2026-09-01T12:00:00Z", waist: 32, bodyFat: 12 }],
  workoutLogs: [{ id: "l", date: "2026-09-01T12:00:00Z", volume: 1000, sets: [{ exerciseId: "barbell-bench", exercise: "Barbell Bench Press", weight: "100", reps: "10" }] }]
});
vm.runInContext("setUnits('metric')", units.context);
assert.equal(vm.runInContext("state.units", units.context), "metric", "units must switch to metric");
assert.equal(vm.runInContext("state.weightLogs[0].bodyweight", units.context), 90.72, "body weight must convert to kg");
assert.equal(vm.runInContext("state.workoutLogs[0].sets[0].weight", units.context), "45.36", "logged set loads must convert and stay strings");
assert.equal(vm.runInContext("state.measurements[0].waist", units.context), 81.28, "tape measurements must convert to cm");
assert.equal(vm.runInContext("state.measurements[0].bodyFat", units.context), 12, "body fat percentage must not convert");
assert.match(vm.runInContext("getStageTimeline() && weightRangeText(0.5, 1.5, 'down')", units.context), /0\.23-0\.68 kg down per week/, "stage targets must show kg");
assert.equal(vm.runInContext("isPlausibleBodyweight(90)", units.context), true, "metric body weight bounds must use kg");
vm.runInContext("setUnits('imperial')", units.context);
assert.equal(vm.runInContext("state.weightLogs[0].bodyweight", units.context), 200, "converting back must round-trip body weight");
assert.equal(vm.runInContext("state.workoutLogs[0].sets[0].weight", units.context), "100", "converting back must round-trip set loads");
assert.equal(vm.runInContext("handleIncomingFileText('{\"format\":\"something-else\"}')", units.context), false, "unknown files must be rejected");
assert.equal(vm.runInContext("handleIncomingFileText('not json')", units.context), false, "unreadable files must be rejected");
assert.equal(vm.runInContext("isBackupPayload(backupPayload())", units.context), true, "exported backups must be importable");
assert.ok(vm.runInContext("typeof state.athleteId === 'string' && state.athleteId.length > 10", units.context), "athletes need a stable id for coach packages");

console.log("Units and backup checks passed.");

// Progress photos (photos.js).
const photoCtx = makeContext({ profile: { bodyweight: 200 } });
vm.runInContext("setPhotoPose('side-chest'); handleNativePhoto({ status: 'saved', id: 'ABC-123', pose: 'side-chest', date: '2026-09-01T12:00:00Z' })", photoCtx.context);
assert.equal(vm.runInContext("state.progressPhotos.length", photoCtx.context), 1, "native photos must be recorded");
assert.equal(vm.runInContext("photoSrc(state.progressPhotos[0])", photoCtx.context), "massmethod-photo://photo/ABC-123.jpg", "native photos must load through the photo scheme");
vm.runInContext("handleNativePhoto({ status: 'saved', id: '../../etc/passwd', pose: 'side-chest' })", photoCtx.context);
assert.equal(vm.runInContext("state.progressPhotos.length", photoCtx.context), 1, "photo ids must be path-safe");
vm.runInContext("handleNativePhoto({ status: 'saved', id: 'DEF-456', pose: 'side-chest', date: new Date().toISOString() })", photoCtx.context);
assert.equal(vm.runInContext("comparePair('side-chest').before.id + '>' + comparePair('side-chest').after.id", photoCtx.context), "ABC-123>DEF-456", "comparison must default to first vs latest");
assert.ok(vm.runInContext("stageChecklist(getStageTimeline()).some((item) => item.label.includes('Progress photos') && item.done)", photoCtx.context), "a photo this week must tick the checklist");
assert.match(vm.runInContext("renderProgress()", photoCtx.context), /Progress photos[\s\S]*Compare/, "the Progress tab must show the photo section with comparison");
assert.match(fs.readFileSync(path.join(root, "ios/PeakSet/Info.plist"), "utf8"), /NSCameraUsageDescription/, "camera usage description is required");
assert.match(swiftWebView, /setURLSchemeHandler/, "the photo URL scheme must be registered");

console.log("Progress photo checks passed.");

// Weekly volume and training blocks (volume.js).
const volume = makeContext({ profile: { bodyweight: 200 } });
const unmapped = vm.runInContext("exerciseLibrary.filter((exercise) => !exerciseMuscleGroup(exercise)).map((exercise) => exercise.id)", volume.context);
assert.deepEqual(Array.from(unmapped), [], "every exercise must count toward a muscle group");
for (const [id, group] of [["hammer-curl", "biceps"], ["close-grip-bench", "triceps"], ["db-rdl", "hamstrings"], ["nordic-curl", "hamstrings"], ["hip-thrust", "glutes"], ["seated-calf-raise", "calves"], ["face-pull", "rearDelts"], ["db-lateral-raise", "sideDelts"], ["arnold-press", "frontDelts"], ["shrug", "traps"], ["hack-squat", "quads"]]) {
  assert.equal(vm.runInContext(`exerciseMuscleGroup(exerciseById('${id}'))`, volume.context), group, `${id} must count as ${group}`);
}
vm.runInContext(`state.workoutLogs = [{ id: "v", date: new Date().toISOString(), sets: [
  { exerciseId: "barbell-bench", exercise: "Barbell Bench Press", weight: "100", reps: "8" },
  { exerciseId: "barbell-bench", exercise: "Barbell Bench Press", weight: "80", reps: "8", dropSet: true },
  { exercise: "Hammer Curl", weight: "30", reps: "10" }
] }, { id: "old", date: "2020-01-01T12:00:00Z", sets: [{ exerciseId: "barbell-bench", weight: "100", reps: "8" }] }]`, volume.context);
const weekTotals = JSON.parse(vm.runInContext("JSON.stringify(weeklyHardSets())", volume.context));
assert.equal(weekTotals.chest, 1.5, "working sets count 1 and drop sets count half, this week only");
assert.equal(weekTotals.biceps, 1, "legacy name-only sets must count by name");
vm.runInContext("state.blockDraft = { weeks: 4, start: 'this', focus: ['sideDelts'] }; startTrainingBlock()", volume.context);
const blockInfo = JSON.parse(vm.runInContext("JSON.stringify(blockWeekInfo())", volume.context));
assert.equal(blockInfo.status, "active", "a block starting this week must be active");
assert.equal(blockInfo.targetRir, 3, "week 1 must target 3 RIR");
assert.equal(vm.runInContext("blockTargetRir(state.trainingBlock, 3)", volume.context), 0, "the last build week must target 0 RIR");
assert.ok(vm.runInContext("groupWeeklyTarget(MUSCLE_GROUPS.find((g) => g.key === 'sideDelts')).low > groupWeeklyTarget(MUSCLE_GROUPS.find((g) => g.key === 'sideDelts'), null, null).low - 1", volume.context), "weak-point focus must add sets");
vm.runInContext("state.trainingBlock.startDate = dateKey(addDays(startOfWeek(), -28))", volume.context);
assert.equal(vm.runInContext("blockWeekInfo().deload", volume.context), true, "week 5 of a 4+1 block must be the deload");
vm.runInContext("startWorkout('chest-density')", volume.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].targetSets", volume.context), 2, "deload week must halve working sets");
assert.equal(vm.runInContext("state.activeWorkout.exercises.every((exercise) => exercise.targetDropSets === 0)", volume.context), true, "deload week must drop the drop sets");
assert.match(vm.runInContext("renderPlans()", volume.context), /Training block[\s\S]*Weekly volume/, "Plans must show the block and volume cards");

console.log("Weekly volume and training block checks passed.");

// Apple Watch link and Live Activity details (watch.js).
const watchCtx = makeContext({ profile: { bodyweight: 200 } });
assert.equal(vm.runInContext("buildWatchSnapshot().active", watchCtx.context), false, "no workout means an idle watch");
vm.runInContext("startWorkout('chest-density')", watchCtx.context);
const firstSnapshot = JSON.parse(vm.runInContext("JSON.stringify(buildWatchSnapshot())", watchCtx.context));
assert.equal(firstSnapshot.active, true, "a live workout must reach the watch");
assert.equal(firstSnapshot.currentExercise, 0, "the watch starts on the first unfinished exercise");
assert.equal(firstSnapshot.unit, "lb", "the watch uses the athlete's unit");
assert.equal(vm.runInContext("handleWatchCommand({ action: 'completeSet', exIndex: 0, setIndex: 0, weight: '80', reps: '9' })", watchCtx.context), true, "the watch can complete a set");
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[0].weight + 'x' + state.activeWorkout.exercises[0].sets[0].reps", watchCtx.context), "80x9", "watch entries must be saved on the set");
assert.equal(vm.runInContext("state.timer.running", watchCtx.context), true, "completing on the watch starts the rest timer");
assert.equal(vm.runInContext("handleWatchCommand({ action: 'completeSet', exIndex: 0, setIndex: 0, weight: '90', reps: '9' })", watchCtx.context), false, "a repeated command must not toggle a completed set back off");
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[0].done", watchCtx.context), true, "a duplicate watch command must leave the set completed");
assert.equal(vm.runInContext("handleWatchCommand({ action: 'completeSet', exIndex: 0, setIndex: 1, weight: '-5', reps: '9' })", watchCtx.context), false, "watch entries go through the same validation");
const restContext = JSON.parse(vm.runInContext("JSON.stringify(restTimerContext())", watchCtx.context));
assert.equal(restContext.liveActivity, true, "Live Activities are on by default");
assert.match(restContext.nextSetLabel, /^Set 2 of \d+$/, "the Lock Screen names the next set");
assert.equal(vm.runInContext("buildWatchSnapshot().rest.running", watchCtx.context), true, "the watch sees the running rest timer");
vm.runInContext("handleWatchCommand({ action: 'skipRest' })", watchCtx.context);
assert.equal(vm.runInContext("state.timer.running", watchCtx.context), false, "the watch can skip rest");
assert.match(read("ios/MassMethodWidgets/Info.plist"), /com\.apple\.widgetkit-extension/, "the Live Activity widget extension is configured");
assert.match(read("ios/PeakSet/Info.plist"), /NSSupportsLiveActivities/, "the app declares Live Activity support");
assert.match(xcodeProject, /com\.mattbrown\.peakset\.watchkitapp/, "the watch app target is in the project");
assert.match(xcodeProject, /Embed Watch Content/, "the watch app is embedded in the iPhone app");

console.log("Apple Watch and Live Activity checks passed.");

// Coach mode (coach.js): athlete check-in -> coach roster -> program back.
const athleteCtx = makeContext({
  profile: { bodyweight: 200, gender: "Female", age: 31, division: "Wellness", goalDate: "2027-03-01" },
  athleteName: "Jordan Lee",
  weightLogs: [{ id: "w1", date: new Date().toISOString(), bodyweight: 150 }, { id: "w0", date: new Date(Date.now() - 9 * 86400000).toISOString(), bodyweight: 151 }],
  workoutLogs: [{ id: "log1", title: "Glutes <b>A</b>", date: new Date().toISOString(), sets: [{ exerciseId: "hip-thrust", exercise: "Hip Thrust", weight: "185", reps: "10" }] }],
  weeklyCheckIns: [{ id: "c1", date: new Date().toISOString(), sleep: 7, energy: 4, recovery: 3, notes: "Knee fine" }]
});
const pkg = JSON.parse(JSON.stringify(await vm.runInContext("buildCoachPackage(14)", athleteCtx.context)));
assert.equal(pkg.format, "mass-method-coach-package", "check-ins carry their format");
assert.equal(pkg.athlete.name, "Jordan Lee", "check-ins carry the athlete name");
assert.equal(pkg.workoutLogs.length, 1, "check-ins include workouts in range");
assert.equal(pkg.volumeWeeks[0].totals.glutes, 1, "check-ins include weekly volume");

const coachCtx = makeContext({ profile: { bodyweight: 210 } });
await vm.runInContext(`importCoachPackage(${JSON.stringify(pkg)})`, coachCtx.context);
assert.equal(vm.runInContext("state.coach.enabled", coachCtx.context), true, "importing a check-in turns on coach mode");
assert.equal(vm.runInContext("coachAthletes().length", coachCtx.context), 1, "the athlete joins the roster");
await vm.runInContext(`importCoachPackage(${JSON.stringify(pkg)})`, coachCtx.context);
assert.equal(vm.runInContext("coachAthletes()[0].workoutLogs.length", coachCtx.context), 1, "re-importing the same check-in must not duplicate logs");
const detail = vm.runInContext("state.view = 'coach'; renderCoach()", coachCtx.context);
assert.match(detail, /Jordan Lee/, "the coach sees the athlete dashboard");
assert.ok(!detail.includes("<b>A</b>"), "athlete-provided text must be escaped in the coach view");
assert.match(vm.runInContext("state.coach.selectedAthleteId = ''; renderCoach()", coachCtx.context), /workouts\/7d/, "the roster shows compliance");
assert.equal(await vm.runInContext(`importCoachPackage(${JSON.stringify({ ...pkg, athlete: { ...pkg.athlete, id: "../bad" } })})`, coachCtx.context), false, "malformed athlete ids are rejected");

const program = {
  format: "mass-method-program", version: 1, from: "Coach Sam", message: "Glutes first.",
  plans: [
    { title: "Lower A", muscle: "legs", scheduleDay: "Monday", exercises: [["hip-thrust", 4, "8-10", 120, 0, { group: "", setType: "standard" }], ["not-a-real-exercise", 3, "10", 60]] },
    { title: "Empty", exercises: [["nope", 3, "10", 60]] }
  ],
  block: { accumulationWeeks: 5, focus: ["glutes", "hamstrings", "not-real"], start: "next" }
};
assert.equal(vm.runInContext(`handleIncomingFileText(${JSON.stringify(JSON.stringify(program))})`, athleteCtx.context), true, "athletes can import a program");
const imported = JSON.parse(vm.runInContext("JSON.stringify(state.customPlans.filter((plan) => plan.fromCoach))", athleteCtx.context));
assert.equal(imported.length, 1, "plans with no valid exercises are dropped");
assert.deepEqual(imported[0].exercises.map(([id]) => id), ["hip-thrust"], "unknown exercises are dropped from coach plans");
assert.equal(imported[0].scheduleDay, "Monday", "coach schedules carry over");
assert.deepEqual(Array.from(vm.runInContext("state.trainingBlock.focus", athleteCtx.context)), ["glutes", "hamstrings"], "coach blocks keep only valid weak points");
assert.equal(vm.runInContext("state.trainingBlock.accumulationWeeks", athleteCtx.context), 5, "coach blocks set the build length");
assert.match(vm.runInContext("state.view = 'today'; renderToday()", athleteCtx.context), /From Coach Sam[\s\S]*Glutes first\./, "the coach message shows on Today");

console.log("Coach mode checks passed.");
