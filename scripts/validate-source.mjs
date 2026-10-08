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
// Every <script> tag must match the exact shape above; otherwise a module would
// silently drop out of both this suite and the iOS bundle sync.
assert.equal(webScripts.length, (read("index.html").match(/<script\b/g) || []).length, "Every index.html <script> must be a plain ./module.js tag");
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

const expectedBundleFiles = [...webScripts, "styles.css", "index.html", "assets/physique-lines.svg", "assets/boxing-bell.wav"].sort();
for (const filename of expectedBundleFiles.filter((name) => !name.endsWith(".wav"))) {
  assert.equal(read(filename), read(`ios/PeakSet/Web/${filename}`), `${filename} is not synced into the iOS bundle`);
}
assert.deepEqual(readBuffer("assets/boxing-bell.wav"), readBuffer("ios/PeakSet/Web/assets/boxing-bell.wav"), "Boxing bell audio is not synced into the iOS bundle");
assert.deepEqual(readBuffer("assets/boxing-bell.wav"), readBuffer("ios/PeakSet/boxing-bell.wav"), "Native notification bell is not synced");
// The Web folder is an Xcode folder reference, so every file in it ships.
// Parity must hold in both directions: nothing missing, nothing stale.
const bundledFiles = fs.readdirSync(path.join(root, "ios/PeakSet/Web"), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== ".DS_Store")
  .map((entry) => path.relative(path.join(root, "ios/PeakSet/Web"), path.join(entry.parentPath ?? entry.path, entry.name)))
  .sort();
assert.deepEqual(bundledFiles, expectedBundleFiles, "ios/PeakSet/Web contains files the web app no longer uses (or is missing some)");

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

// Apple Health body data import (health.js).
const healthCtx = makeContext({
  profile: { bodyweight: 200, gender: "Male", age: 40 },
  weightLogs: [{ id: "manual-1", date: "2026-09-02T13:00:00Z", bodyweight: 199, note: "Manual" }],
  measurements: [{ id: "tape-1", date: "2026-08-20T13:00:00Z", chest: 46, waist: 33, leftArm: 17 }]
});
const healthSamples = [
  { type: "weight", id: "a", date: "2026-09-01T15:00:00Z", value: 201.2, source: "Withings" },
  { type: "weight", id: "b", date: "2026-09-01T12:00:00Z", value: 200.4, source: "Withings" },
  { type: "bodyFat", id: "c", date: "2026-09-01T12:00:00Z", value: 14.2, source: "Withings" },
  { type: "leanMass", id: "d", date: "2026-09-01T12:00:00Z", value: 172, source: "Withings" },
  { type: "weight", id: "e", date: "2026-09-02T12:30:00Z", value: 198.8, source: "Withings" },
  { type: "bodyFat", id: "f", date: "2026-09-02T12:30:00Z", value: 14.0, source: "Withings" },
  { type: "bodyFat", id: "g", date: "2026-09-05T12:00:00Z", value: 13.6, source: "DEXA" },
  { type: "waist", id: "h", date: "2026-09-06T12:00:00Z", value: 32.5, source: "Tape" },
  { type: "weight", id: "x", date: "2026-09-07T12:00:00Z", value: -5, source: "Bad" }
];
vm.runInContext("state.healthBody.enabled = true", healthCtx.context);
vm.runInContext(`applyHealthBodySamples(${JSON.stringify(healthSamples)})`, healthCtx.context);
const day1 = JSON.parse(vm.runInContext("JSON.stringify(state.weightLogs.find((entry) => entry.id === 'hk-day-' + dateKey(new Date('2026-09-01T12:00:00Z'))))", healthCtx.context));
assert.equal(day1.bodyweight, 200.4, "the first (morning) weigh-in of the day is imported");
assert.equal(day1.bodyFat, 14.2, "body fat rides along with the weigh-in");
assert.equal(day1.leanMass, 172, "lean mass rides along with the weigh-in");
const manual = JSON.parse(vm.runInContext("JSON.stringify(state.weightLogs.find((entry) => entry.id === 'manual-1'))", healthCtx.context));
assert.equal(manual.bodyweight, 199, "a hand-logged weight always wins over Health");
assert.equal(manual.bodyFat, 14, "Health fills body fat on a hand-logged day");
assert.equal(vm.runInContext("state.weightLogs.filter((entry) => entry.id.startsWith('hk-day-')).length", healthCtx.context), 1, "no Health weight duplicates a hand-logged day; invalid values are ignored");
assert.equal(vm.runInContext("state.measurements.filter((entry) => entry.id.startsWith('hk-m-')).length", healthCtx.context), 2, "body fat without a weigh-in and waist go to measurements");
assert.equal(vm.runInContext("latestMeasurementValue('chest')", healthCtx.context), 46, "a waist-only Health entry must not blank out other measurements");
assert.equal(vm.runInContext("latestMeasurementValue('waist')", healthCtx.context), 32.5, "the newest waist comes from Health");
const before = vm.runInContext("JSON.stringify([state.weightLogs, state.measurements])", healthCtx.context);
assert.equal(vm.runInContext(`applyHealthBodySamples(${JSON.stringify(healthSamples)})`, healthCtx.context), 0, "re-syncing the same samples changes nothing");
assert.equal(vm.runInContext("JSON.stringify([state.weightLogs, state.measurements])", healthCtx.context), before, "re-syncing is idempotent");
assert.ok(vm.runInContext("state.weightLogs.every((entry, index, list) => index === 0 || new Date(list[index - 1].date) >= new Date(entry.date))", healthCtx.context), "weight logs stay newest-first");
assert.equal(vm.runInContext("bodyFatSeries().length", healthCtx.context), 3, "body fat trend combines weigh-ins and measurements");
assert.match(vm.runInContext("buildCoachReportLines(3650).map((line) => line.text).join('\\n')", healthCtx.context), /14% body fat/, "the coach PDF shows body fat next to weight");
vm.runInContext("window.confirm = () => true; removeHealthImports()", healthCtx.context);
assert.equal(vm.runInContext("state.weightLogs.length + ':' + state.measurements.length", healthCtx.context), "1:1", "removing Health data keeps only hand-logged entries");
assert.equal(vm.runInContext("state.weightLogs[0].bodyFat", healthCtx.context), null, "removing Health data clears fields Health filled in");
assert.match(read("ios/PeakSet/PeakSetNativeServices.swift"), /bodyFatPercentage[\s\S]*leanBodyMass[\s\S]*waistCircumference/, "HealthKit reads the body metrics");
assert.match(read("ios/PeakSet/PeakSetNativeServices.swift"), /bundleIdentifier == ownBundle/, "weights this app wrote are not re-imported");

console.log("Apple Health body data checks passed.");

// Audit round 1 regressions.
const r1 = makeContext({ profile: { bodyweight: 200, gender: "Male", age: 40 } });
const run = (code) => vm.runInContext(code, r1.context);
run("window.confirm = () => true; window.location = { reload() { window.__reloaded = true; } }; window.webkit = { messageHandlers: { peaksetHealthKit: { postMessage(m) { (window.__hk = window.__hk || []).push(m); } } } }");
// Untrusted plan text never becomes markup.
run(`handleIncomingFileText(${JSON.stringify(JSON.stringify({ format: "mass-method-program", version: 1, from: "X", plans: [{ title: "P", exercises: [["hip-thrust", 3, "<img src=x onerror=alert(1)>", 90, 0, { group: "<b>", setType: "evil" }], null] }] }))})`);
const evilPlan = JSON.parse(run("JSON.stringify(state.customPlans.find((plan) => plan.fromCoach))"));
assert.equal(evilPlan.exercises[0][2], "8-12", "coach program reps are validated");
assert.equal(evilPlan.exercises[0][5].setType, "standard", "coach program set types are validated");
assert.ok(!run("state.view = 'plans'; renderPlans()").includes("<img src=x"), "plan reps are escaped");
run("state.customPlans.unshift({ id: \"x');alert(1);('\", title: 'T', muscle: 'chest', phase: 'offseason', exercises: [['barbell-bench', 3, '<i>8</i>', 90]] }); toolkitMigrateState()");
assert.ok(/^[A-Za-z0-9_-]+$/.test(run("state.customPlans[0].id")), "unsafe plan ids are replaced on load");
assert.ok(!run("renderPlans()").includes("<i>8</i>"), "hand-made plan reps are escaped");
// Running-rest adjustments do not rewrite the exercise's planned rest.
run("state.activeWorkout = null; startWorkout('chest-density'); updateSet(0,0,'weight','100'); updateSet(0,0,'reps','8'); completeSet(0,0)");
const plannedRest = run("state.activeWorkout.exercises[0].rest");
run("state.timer.endsAt = Date.now() + 20000; state.timer.left = 99; adjustRest(15)");
assert.equal(run("state.activeWorkout.exercises[0].rest"), plannedRest, "+15s during rest keeps the exercise's planned rest");
assert.ok(Math.abs(run("state.timer.left") - 35) <= 1, "+15s uses the real remaining time, not a stale tick value");
run("state.timer.endsAt = Date.now() + 10000; adjustRest(-15)");
assert.ok(run("state.timer.left") <= 1, "-15s near the end shortens the rest instead of clamping up to 15s");
run("stopTimer()");
// Reopened sets are announced and unsaved entries are confirmed before saving.
run("updateSet(0,0,'weight','105')");
assert.equal(run("state.activeWorkout.exercises[0].sets[0].done"), false, "editing a completed set reopens it");
run("window.confirm = () => false; finishWorkout()");
assert.ok(run("state.activeWorkout !== null"), "declining the unlogged-sets warning keeps the session open");
run("window.confirm = () => true");
// Superset partners are matched by set number, not raw index.
run("state.activeWorkout.exercises[0].group = 'A'; state.activeWorkout.exercises[1].group = 'A'; state.activeWorkout.exercises[0].sets.unshift({ set: 0, label: 'D0', dropSet: true, weight: '', reps: '', done: false })");
run("updateSet(1,0,'weight','50'); updateSet(1,0,'reps','10'); completeSet(1,0); stopTimer(); updateSet(0,1,'weight','100'); updateSet(0,1,'reps','8'); completeSet(0,1)");
assert.equal(run("state.timer.running"), true, "superset rest starts once the matching working set of each partner is done");
run("stopTimer(); state.activeWorkout = null");
// Builder exercise follows the active equipment profile.
run("state.equipmentProfiles.push({ id: 'machines', name: 'Machines', equipment: ['Machine'] }); state.activeEquipmentProfileId = 'machines'; state.view = 'builder'; renderBuilder()");
assert.ok(run("toolkitBuilderExerciseRows(state.builderFormDraft.exerciseFocus).some((exercise) => exercise.id === state.builderFormDraft.exerciseId)"), "the builder's remembered exercise is valid for the active profile");
// Coach data is sanitized, bounded, and unit-consistent.
const r1Pkg = { format: "mass-method-coach-package", version: 1, generatedAt: new Date().toISOString(), athlete: { id: "athlete-0001", name: "A", units: "imperial" }, note: "n".repeat(10000),
  weightLogs: [{ id: "w1", date: new Date(Date.now() - 86400000).toISOString(), bodyweight: 200 }], weeklyCheckIns: [{ id: "c", date: new Date().toISOString(), recovery: "<img src=x onerror=alert(1)>" }], workoutLogs: [{ id: "l", date: new Date().toISOString(), title: "<b>x</b>", sets: [1, 2, 3] }] };
await run(`importCoachPackage(${JSON.stringify(r1Pkg)})`);
assert.equal(run("state.coach.athletes['athlete-0001'].lastNote.length"), 2000, "athlete notes are capped");
assert.equal(run("state.coach.athletes['athlete-0001'].weeklyCheckIns[0].recovery"), null, "non-numeric recovery is dropped");
assert.ok(!run("state.view = 'coach'; state.coach.selectedAthleteId = ''; renderCoach()").includes("<img src=x"), "roster never renders athlete markup");
assert.ok(!run("state.coach.selectedAthleteId = 'athlete-0001'; renderCoach()").includes("<b>x</b>"), "athlete workout titles are escaped");
await run(`importCoachPackage(${JSON.stringify({ ...r1Pkg, generatedAt: new Date(Date.now() + 1000).toISOString(), athlete: { ...r1Pkg.athlete, units: "metric" }, weightLogs: [{ id: "w2", date: new Date().toISOString(), bodyweight: 91 }] })})`);
assert.deepEqual(Array.from(run("state.coach.athletes['athlete-0001'].weightLogs.map((entry) => Math.round(entry.bodyweight))")), [91, 91], "an athlete's switch to kg converts their stored history");
run("state.coach.athletes[\"x');alert(1);('\"] = { id: \"x');alert(1);('\" }; coachMigrateState()");
assert.equal(run("Object.keys(state.coach.athletes).length"), 1, "unsafe athlete ids are dropped on load");
// Unit round-trips land back on gym numbers.
run("state.workoutLogs = [{ id: 'u', date: new Date().toISOString(), sets: [{ exerciseId: 'barbell-bench', exercise: 'Barbell Bench Press', weight: '135', reps: '5' }, { exerciseId: 'barbell-bench', exercise: 'Barbell Bench Press', weight: '2.5', reps: '5' }] }]; setUnits('metric'); setUnits('imperial')");
assert.deepEqual(Array.from(run("state.workoutLogs[0].sets.map((set) => set.weight)")), ["135", "2.5"], "lb -> kg -> lb round-trips exactly");
// Health: midnight-aligned windows, tagged replies, stale replies ignored.
run("state.healthBody.enabled = true; state.healthBody.lastSyncAt = new Date(2026, 9, 4, 15, 30).toISOString(); healthSyncInFlight = false; syncHealthBody(true)");
const since = new Date(run("window.__hk.at(-1).since"));
assert.equal(since.getHours() + since.getMinutes(), 0, "Health re-syncs start at local midnight");
run("window.handleNativeHealthKit({ status: 'error', action: 'syncWeight', message: 'nope' })");
assert.ok(!/import failed/i.test(run("state.healthBody.lastResult")), "a failed weight export is not reported as a failed import");
// Swift calls window.handleNativeHealthKit, which health.js wraps; the bare global is toolkit's base.
run("state.healthBody.enabled = false; window.handleNativeHealthKit({ status: 'bodySamples', unit: 'lb', samples: [{ type: 'weight', id: 'z', date: new Date().toISOString(), value: 150 }] })");
assert.ok(!run("state.weightLogs.some((entry) => entry.id.startsWith('hk-'))"), "a read that finishes after Health is turned off is ignored");
// Restore never overwrites today's backup and blocks stray saves while reloading.
run(`restoreBackupPayload({ format: "mass-method-backup", version: 1, state: { profile: { bodyweight: 1 }, backupStatus: { at: "2020-01-01T00:00:00Z" } } })`);
const restoredState = JSON.parse(r1.storage.get("stageforge-v1"));
assert.ok(Date.now() - Date.parse(restoredState.backupStatus.at) < 60000, "restored data does not trigger an immediate snapshot over today's backup");
run("state.profile = { bodyweight: 999 }; saveState()");
assert.equal(JSON.parse(r1.storage.get("stageforge-v1")).profile.bodyweight, 1, "saves are blocked while a restore reloads the page");

// DST-safe block weeks and deload rules.
const r1b = makeContext({ profile: { bodyweight: 200 } });
const runB = (code) => vm.runInContext(code, r1b.context);
runB("state.trainingBlock = { id: 'b', name: 'B', startDate: '2026-03-02', accumulationWeeks: 4, deload: true, focus: [], createdAt: '' }");
assert.equal(runB("blockWeekInfo(state.trainingBlock, new Date(2026, 2, 10, 12)).weekNumber"), 2, "block weeks survive the spring-forward clock change");
assert.equal(runB("blockWeekInfo(state.trainingBlock, new Date(2026, 3, 6, 12)).status"), "complete", "a block ends when its card says it ends");
runB("state.trainingBlock.startDate = dateKey(addDays(startOfWeek(), -28)); quickStartExercise('barbell-curl')");
assert.equal(runB("state.activeWorkout.exercises[0].targetSets"), 4, "quick logs are not halved in a deload week");
runB("state.activeWorkout = null; startWorkout('chest-density')");
assert.ok(!runB("state.activeWorkout.title").includes("Deload"), "deload does not rename the workout");
runB("saveActiveWorkoutAsTemplate()");
assert.equal(runB("state.customPlans[0].exercises[0][1]"), 4, "a template saved in deload week keeps the full sets");
// Watch commands follow the exercise, not a stale index.
runB("state.trainingBlock = null; state.activeWorkout = null; startWorkout('chest-density')");
const firstExerciseId = runB("state.activeWorkout.exercises[0].id");
runB("moveActiveWorkoutExercise(0, 1)");
runB(`handleWatchCommand({ action: 'completeSet', workoutId: state.activeWorkout.id, exerciseId: '${firstExerciseId}', exIndex: 0, setIndex: 0, setLabel: '1', weight: '70', reps: '9', completedAt: Date.now() - 600000 })`);
assert.equal(runB("state.activeWorkout.exercises[1].sets[0].weight"), "70", "a watch set lands on the exercise it named after a reorder");
assert.equal(runB("state.timer.running"), false, "a queued watch set whose rest already elapsed does not start a new rest");
assert.equal(runB("handleWatchCommand({ action: 'completeSet', workoutId: 'another-workout', exIndex: 0, setIndex: 1, weight: '1', reps: '1' })"), false, "commands for a different workout are rejected");
assert.match(read("ios/PeakSet/PeakSetWebView.swift"), /runJavaScriptConfirmPanelWithMessage/, "the web view must answer confirm() dialogs on iOS");

console.log("Audit round 1 checks passed.");

// Audit round 2 regressions.
const X = "<img src=x onerror=PWN()>";
const crafted = makeContext({
  profile: { bodyweight: 200, gender: "Male", age: 30, createdAt: new Date().toISOString() },
  coachMessage: { from: "C", planCount: X, message: "hi" },
  prepLogs: [{ id: "p", date: new Date().toISOString(), steps: X, cardioMinutes: X }],
  weeklyCheckIns: [{ id: "c", date: new Date().toISOString(), recovery: X, energy: X, sleep: X }],
  weightLogs: [{ id: "w", date: new Date().toISOString(), bodyweight: `"><img src=x onerror=PWN()>` }],
  measurements: [{ id: "m", date: new Date().toISOString(), chest: X, waist: 32 }],
  selectedExerciseId: `"><img src=x onerror=PWN()>`,
  builderFormDraft: { sets: `"><img src=x onerror=PWN()>`, rest: X, dropSets: X },
  trainingBlock: { id: "b", name: "B", startDate: "2026-09-28", accumulationWeeks: 4, deload: true, focus: [X] },
  blockDraft: { weeks: X, focus: [X] },
  activeWorkout: { id: "a", title: "W", startedAt: new Date().toISOString(), exercises: [{ id: "flat-db-press", name: "F", targetSets: X, targetDropSets: X, targetReps: "8", rest: X, sets: [{ set: 1, label: "1", weight: "", reps: "", done: false }, null] }, null, { id: "not-real", sets: [] }] }
});
const runC = (code) => vm.runInContext(code, crafted.context);
for (const view of ["today", "progress", "logbook", "library", "builder", "plans", "session", "more", "history"]) {
  const html = runC(`state.view = '${view}'; renderContent()`);
  assert.ok(!html.includes("onerror=PWN"), `a crafted backup must not inject markup on ${view}`);
}
runC("state.trainingBlock = null; state.view = 'plans'");
assert.ok(!runC("renderContent()").includes("onerror=PWN"), "block draft text is safe");
assert.equal(runC("state.activeWorkout.exercises.length"), 1, "malformed live-workout exercises are dropped, valid ones kept");
assert.equal(runC("state.activeWorkout.exercises[0].sets.length"), 1, "malformed sets are dropped");
const broken = makeContext({ profile: { bodyweight: 200 }, activeWorkout: { exercises: [null] } });
assert.equal(vm.runInContext("state.activeWorkout", broken.context), null, "an unusable live workout is cleared instead of crashing every screen");
// Weight change measures from the profile start, not back-filled Health history.
const startCtx = makeContext({ profile: { bodyweight: 200, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() }, weightLogs: [
  { id: "now", date: new Date().toISOString(), bodyweight: 198 },
  { id: "starting-weight", date: new Date(Date.now() - 2 * 86400000).toISOString(), bodyweight: 200 },
  { id: "hk-day-old", date: new Date(Date.now() - 150 * 86400000).toISOString(), bodyweight: 225 }
] });
assert.equal(vm.runInContext("stats().weightDelta", startCtx.context), "-2.0", "weight change from start ignores back-filled history");
// Display details.
const disp = makeContext({ profile: { bodyweight: 200, division: "NPC Classic Physique Open", goalDate: dateKeyLocal(new Date()) } });
function dateKeyLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
assert.match(vm.runInContext("divisionSelect('x', state.profile.division)", disp.context), /value="NPC Classic Physique Open" selected/, "a custom division stays selected");
assert.match(vm.runInContext("renderStageTimeline()", disp.context), /Show day/, "show day reads correctly (not 1 or -0 days)");
vm.runInContext("state.profile.goalDate = '2020-01-01'", disp.context);
assert.match(vm.runInContext("renderStageTimeline()", disp.context), /Show was [\d,]+ days ago/, "past shows never read as negative days");
assert.equal(vm.runInContext("formatWeight(-0.01)", disp.context), "0", "tiny negative values never render as -0");
assert.equal(vm.runInContext("plural(1, 'set') + '|' + plural(2, 'set')", disp.context), "1 set|2 sets", "counts use correct grammar");
vm.runInContext("state.weightLogs = [{ id: 'w', date: new Date().toISOString(), bodyweight: 210 }]; setUnits('metric'); setUnits('imperial')", disp.context);
assert.equal(vm.runInContext("state.weightLogs[0].bodyweight", disp.context), 210, "body weight round-trips lb -> kg -> lb");
vm.runInContext("state.workoutLogs = [{ id: 'abs', title: 'Abs', date: new Date().toISOString(), sets: [{ exerciseId: 'cable-crunch', exercise: 'Cable Crunch', weight: '', reps: '15', repsOnly: true }] }]; exerciseHistorySelection = 'cable-crunch'", disp.context);
const absHistory = vm.runInContext("renderExerciseHistory()", disp.context);
assert.ok(!absHistory.includes("-- ×") && /15 reps/.test(absHistory), "reps-only history shows reps, not empty weights");
// Coach: failed import keeps photo files; packages carry merged latest measurements.
const coachR2 = makeContext({ profile: { bodyweight: 200 }, measurements: [
  { id: "hk-m-1", date: new Date().toISOString(), waist: 31 },
  { id: "tape", date: new Date(Date.now() - 86400000).toISOString(), chest: 46, waist: 32 }
] });
const pkgR2 = JSON.parse(JSON.stringify(await vm.runInContext("buildCoachPackage(14)", coachR2.context)));
assert.equal(pkgR2.measurements[0].chest, 46, "check-ins send the latest value of every measurement");
assert.equal(pkgR2.measurements[0].waist, 31, "the newest waist wins in the merged measurement");
// Health readings are not re-sent to Health.
vm.runInContext("state.weightLogs = [{ id: 'hk-day-x', date: new Date().toISOString(), bodyweight: 199 }, { id: 'mine', date: new Date(Date.now() - 86400000).toISOString(), bodyweight: 201 }]; window.webkit = { messageHandlers: { peaksetHealthKit: { postMessage(m) { window.__sent = m; } } } }; requestHealthKit('syncWeight')", coachR2.context);
assert.equal(vm.runInContext("window.__sent.weight", coachR2.context), 201, "Send Weight skips readings that came from Apple Health");
// Watch commands are applied once even when redelivered.
const wR2 = makeContext({ profile: { bodyweight: 200 } });
vm.runInContext("startWorkout('chest-density'); handleWatchCommand({ commandId: 'c1', action: 'completeSet', workoutId: state.activeWorkout.id, exIndex: 0, setIndex: 0, weight: '80', reps: '8' }); stopTimer(); updateSet(0, 0, 'reps', '9')", wR2.context);
vm.runInContext("handleWatchCommand({ commandId: 'c1', action: 'completeSet', workoutId: state.activeWorkout.id, exIndex: 0, setIndex: 0, weight: '80', reps: '8' })", wR2.context);
assert.equal(vm.runInContext("state.activeWorkout.exercises[0].sets[0].reps", wR2.context), "9", "a redelivered watch command is not applied twice");
assert.match(read("ios/PeakSet/PeakSetWebView.swift"), /webViewWebContentProcessDidTerminate/, "the app reloads if the web process is killed");
assert.match(read("ios/PeakSet/PeakSetWebView.swift"), /decidePolicyFor navigationAction/, "the web view is restricted to the app's own pages");

console.log("Audit round 2 checks passed.");

// Audit round 3 regressions.
const r3 = makeContext({ profile: { bodyweight: 200, createdAt: new Date().toISOString() } });
const r3run = (code) => vm.runInContext(code, r3.context);
r3run("window.confirm = () => true");
r3run("state.libraryFilter = 'chest'; state.librarySearch = 'curl'");
assert.ok(r3run("libraryRows().some((exercise) => exercise.muscle === 'arms')"), "library search covers every exercise, not just the selected chip");
r3run("state.librarySearch = ''; state.customPlans = [{ id: 'push', title: 'Push A', muscle: 'chest', phase: 'offseason', scheduleDay: new Date().toLocaleDateString('en-US', { weekday: 'long' }), exercises: [['barbell-bench', 3, '8-10', 120]] }]; duplicateScheduledWeek(); duplicateCustomPlan('push')");
assert.equal(r3run("todaysRecommendedPlan().id"), "push", "copies never replace this week's scheduled plan on Today");
assert.equal(r3run("state.customPlans.filter((plan) => plan.scheduleDay).length"), 1, "duplicated templates come out unscheduled");
r3run("window.confirm = () => false; deleteCustomPlan('push'); window.confirm = () => true");
assert.ok(r3run("state.customPlans.some((plan) => plan.id === 'push')"), "deleting a template asks first");
r3run("state.equipmentProfiles.push({ id: 'roadonly', name: 'Road', equipment: ['Dumbbells', 'Cable', 'Bench', 'Bodyweight', 'Bands'] }); state.activeEquipmentProfileId = 'roadonly'; state.substitutionPreferences = { 'machine-row': 'neutral-pulldown' }");
r3run("startWorkout('back-prep-detail')");
assert.equal(r3run("new Set(state.activeWorkout.exercises.map((exercise) => exercise.id)).size === state.activeWorkout.exercises.length"), true, "a saved substitution never puts an exercise in a workout twice");
r3run("state.activeWorkout = null; quickStartExercise('machine-row')");
assert.equal(r3run("state.activeWorkout.exercises[0].id"), "machine-row", "Quick Start uses the exercise the athlete picked");
r3run("state.activeWorkout = null; clearSubstitutionPreference('machine-row')");
assert.equal(r3run("state.substitutionPreferences['machine-row']"), undefined, "substitutions can be cleared");
// Measurements: Health waist-only entries and legacy arm keys.
const meas = makeContext({ profile: { bodyweight: 200 }, measurements: [
  { id: "hk-m-today", date: new Date().toISOString(), waist: 31 },
  { id: "t2", date: new Date(Date.now() - 20 * 86400000).toISOString(), chest: 47, shoulders: 52, leftArm: 17.5, rightArm: 17.4, calf: 16 },
  { id: "t1", date: new Date(Date.now() - 60 * 86400000).toISOString(), chest: 46, shoulders: 51, leftArm: 17, rightArm: 17, calf: 15.8 }
] });
assert.equal(vm.runInContext("weakPointMeasurementStatus().done", meas.context), true, "a Health waist reading does not hide the tape check-ins");
assert.equal(vm.runInContext("stageChecklist({ phase: 'offseason' }).find((item) => item.label.startsWith('Tape')).done", meas.context), false, "only hand-entered tape check-ins count as current");
const armsOnly = makeContext({ profile: { bodyweight: 200 }, measurements: [
  { id: "a2", date: new Date().toISOString(), arm: 17.5 },
  { id: "a1", date: new Date(Date.now() - 30 * 86400000).toISOString(), arm: 17 }
] });
assert.equal(vm.runInContext("weakPointMeasurementStatus().done", armsOnly.context), false, "legacy arm readings count as one body part, not three");
// PDF keeps accents, breaks long words, and stays byte-consistent.
const pdfCtx = makeContext({ profile: { bodyweight: 200, division: "José Séance" } });
const pdfLines = vm.runInContext("buildCoachReportLines(7, 'https://example.com/' + 'x'.repeat(300))", pdfCtx.context);
assert.ok(pdfLines.some((line) => line.text.includes("José Séance")), "accented names survive in the PDF");
assert.ok(vm.runInContext(`wrapPdfText('${"y".repeat(300)}', 82).every((row) => row.length <= 82)`, pdfCtx.context), "long words are broken to fit the page");
const pdfBytes = new Uint8Array(await vm.runInContext("createPdfBlob(buildCoachReportLines(7, 'Café'))", pdfCtx.context).arrayBuffer());
const pdfText = Buffer.from(pdfBytes).toString("latin1");
const xrefAt = Number(pdfText.match(/startxref\n(\d+)/)[1]);
assert.equal(pdfText.slice(xrefAt, xrefAt + 4), "xref", "PDF xref offset points at the xref table");
assert.ok(pdfText.includes("/WinAnsiEncoding") && pdfText.includes("Café"), "PDF text is WinAnsi encoded, one byte per character");
// Builder draft survives a restart; bodyweight progression.
const bd = makeContext({ profile: { bodyweight: 200 } });
vm.runInContext("builderDraft.push({ id: 'barbell-bench', sets: 3, reps: '8-12', rest: 90, dropSets: 0, group: '', setType: 'standard' }); saveState()", bd.context);
const bd2 = makeContext(JSON.parse(bd.storage.get("stageforge-v1")));
assert.equal(vm.runInContext("builderDraft.length", bd2.context), 1, "the builder draft survives closing the app");
vm.runInContext("state.workoutLogs = [{ id: 'pu', date: new Date().toISOString(), sets: [1,2,3].map(() => ({ exerciseId: 'push-up', exercise: 'Deficit Push-Up', weight: '0', reps: '20' })) }]", bd2.context);
assert.match(vm.runInContext("progressionSuggestion({ id: 'push-up', targetReps: '12-20' })", bd2.context), /Beat 20 reps/, "bodyweight sets get rep-based progression");
assert.ok(fs.existsSync(path.join(root, "ios/PeakSet/PrivacyInfo.xcprivacy")) && xcodeProject.includes("PrivacyInfo.xcprivacy in Resources"), "the privacy manifest ships in the app bundle");

console.log("Audit round 3 checks passed.");

// Audit round 3 follow-ups: exact unit round-trips, abs history cards, late watch sets.
const rt = makeContext({ profile: { bodyweight: 83.8 }, weightLogs: [{ id: "w", date: new Date().toISOString(), bodyweight: 83.8 }], measurements: [{ id: "m", date: new Date().toISOString(), waist: 22.75 }],
  workoutLogs: [{ id: "l", date: new Date().toISOString(), volume: 1600, sets: [{ exerciseId: "barbell-bench", exercise: "Barbell Bench Press", weight: "200", reps: "8" }, { exerciseId: "barbell-bench", exercise: "Barbell Bench Press", weight: "182.5", reps: "8" }] }] });
vm.runInContext("setUnits('metric'); setUnits('imperial')", rt.context);
assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify([state.weightLogs[0].bodyweight, state.measurements[0].waist, state.workoutLogs[0].sets.map((set) => set.weight), state.workoutLogs[0].volume])", rt.context)), [83.8, 22.75, ["200", "182.5"], 3060], "unedited values round-trip lb -> kg -> lb exactly (volume recomputed from sets)");
vm.runInContext("setUnits('metric'); state.workoutLogs[0].sets[0].weight = '100'; setUnits('imperial')", rt.context);
assert.equal(vm.runInContext("state.workoutLogs[0].sets[0].weight", rt.context), "220.46", "a value edited in kg converts normally");
const kgFirst = makeContext({ profile: { bodyweight: 90 }, units: "metric", workoutLogs: [{ id: "k", date: new Date().toISOString(), sets: [{ exerciseId: "db-curl", exercise: "Alternating Dumbbell Curl", weight: "16.8", reps: "10" }] }] });
vm.runInContext("setUnits('imperial'); setUnits('metric')", kgFirst.context);
assert.equal(vm.runInContext("state.workoutLogs[0].sets[0].weight", kgFirst.context), "16.8", "kg loads round-trip kg -> lb -> kg exactly");
const absCards = makeContext({ profile: { bodyweight: 200 }, workoutLogs: [{ id: "a", title: "Abs", date: new Date().toISOString(), sets: [{ exerciseId: "cable-crunch", exercise: "Cable Crunch", weight: "", reps: "20", repsOnly: true }, { exerciseId: "cable-crunch", exercise: "Cable Crunch", weight: "", reps: "25", repsOnly: true }] }] });
const absHtml = vm.runInContext("exerciseHistorySelection = 'cable-crunch'; renderExerciseHistory()", absCards.context);
assert.ok(/45 reps/.test(absHtml) && !/45 lb/.test(absHtml), "reps-only history cards count reps, not pounds");
const late = makeContext({ profile: { bodyweight: 200 } });
vm.runInContext("startWorkout('chest-density'); state.activeWorkout.exercises[0].group = 'A'; state.activeWorkout.exercises[1].group = 'A'; startTimer(90, true, 3)", late.context);
const beforeEnds = vm.runInContext("state.timer.endsAt", late.context);
vm.runInContext("handleWatchCommand({ commandId: 'late1', action: 'completeSet', workoutId: state.activeWorkout.id, exIndex: 1, setIndex: 0, weight: '50', reps: '10', completedAt: Date.now() - 20000 })", late.context);
assert.equal(vm.runInContext("state.timer.endsAt", late.context), beforeEnds, "a late watch set held for its superset partner does not restart another rest");

console.log("Audit round 3 follow-up checks passed.");

// Audit round 4: Apple Health data never goes to iCloud backups.
const hkBackup = makeContext({ profile: { bodyweight: 200 }, weightLogs: [
  { id: "hk-day-1", date: new Date().toISOString(), bodyweight: 199, bodyFat: 14 },
  { id: "mine", date: new Date(Date.now() - 86400000).toISOString(), bodyweight: 200, bodyFat: 13.5, healthFields: ["bodyFat"] }
], measurements: [{ id: "hk-m-1", date: new Date().toISOString(), waist: 31 }], prepLogs: [{ id: "s", date: new Date().toISOString(), cardioType: "HealthKit", steps: 9000 }] });
const nativeSnapshot = JSON.parse(JSON.stringify(vm.runInContext("nativeBackupPayload()", hkBackup.context)));
assert.deepEqual(nativeSnapshot.state.weightLogs.map((entry) => [entry.id, entry.bodyFat ?? null]), [["mine", null]], "iCloud snapshots exclude Health readings and Health-filled fields");
assert.equal(nativeSnapshot.state.measurements.length + nativeSnapshot.state.prepLogs.length, 0, "iCloud snapshots exclude Health measurements and steps");
assert.equal(vm.runInContext("backupPayload().state.weightLogs.length", hkBackup.context), 2, "the user-exported backup file stays complete");
assert.match(read("ios/PeakSet/Info.plist"), /ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/, "export compliance is declared");

console.log("Audit round 4 checks passed.");

// Sets entered before a unit switch and saved after it still round-trip.
const midSwitch = makeContext({ profile: { bodyweight: 200 } });
vm.runInContext("startWorkout('chest-density'); updateSet(0, 0, 'weight', '135'); updateSet(0, 0, 'reps', '8'); setUnits('metric'); completeSet(0, 0); stopTimer(); finishWorkout(); setUnits('imperial')", midSwitch.context);
assert.equal(vm.runInContext("state.workoutLogs[0].sets[0].weight", midSwitch.context), "135", "a set typed in lb, saved in kg, and viewed in lb again is unchanged");
assert.equal(vm.runInContext("state.workoutLogs[0].volume", midSwitch.context), 1080, "log volume is recomputed from the sets on a unit switch");
console.log("Mid-workout unit switch checks passed.");

// Audit round 4 holistic follow-ups.
const r4 = makeContext({ profile: { bodyweight: 200 } });
const r4run = (code) => vm.runInContext(code, r4.context);
r4run("window.webkit = { messageHandlers: { peaksetBackup: { postMessage(m) { (window.__backups = window.__backups || []).push(m); } } } }; requestAutomaticSnapshot('test', true)");
assert.ok(r4run("window.__backups.at(-1).filename.includes(state.athleteId.slice(0, 8))"), "automatic backups are named per install so a reinstall cannot overwrite them");
const fresh = makeContext({});
assert.match(vm.runInContext("renderOnboarding()", fresh.context), /Restore from a backup/, "onboarding offers restore before creating a profile");
// Builder draft edits persist without an explicit save.
r4run("state.builderFormDraft.exerciseFocus = 'chest'; state.builderFormDraft.exerciseId = 'barbell-bench'; addToolkitBuilderExercise(); state.builderFormDraft.exerciseId = 'pec-deck'; addToolkitBuilderExercise(); removeBuilderExercise(0)");
assert.deepEqual(JSON.parse(r4.storage.get("stageforge-v1")).builderDraft.map((spec) => spec.id ?? spec[0]), ["pec-deck"], "builder add/remove are saved immediately");
// A coach block waits for the current block (and its deload) to finish.
r4run("state.trainingBlock = { id: 'cur', name: 'Current', startDate: dateKey(addDays(startOfWeek(), -28)), accumulationWeeks: 4, deload: true, focus: [], createdAt: '' }; window.confirm = () => true");
r4run(`importProgram(${JSON.stringify({ format: "mass-method-program", version: 1, from: "Coach", plans: [], block: { accumulationWeeks: 5, focus: [], start: "next" } })})`);
assert.equal(r4run("blockWeekInfo().deload"), true, "importing a coach block keeps the current deload running");
assert.ok(r4run("Boolean(state.pendingTrainingBlock)"), "the coach block is queued for its start date");
r4run("state.pendingTrainingBlock.startDate = dateKey(startOfWeek())");
assert.equal(r4run("blockWeekInfo().weekNumber + ':' + state.trainingBlock.accumulationWeeks"), "1:5", "the coach block takes over on its start date");
// Sets saved under an old exercise name keep their history.
const legacyName = makeContext({ profile: { bodyweight: 200 }, workoutLogs: [{ id: "old", date: new Date().toISOString(), sets: [{ exercise: "Seated Calf Raise", weight: "90", reps: "15" }] }] });
assert.equal(vm.runInContext("state.workoutLogs[0].sets[0].exerciseId", legacyName.context), "seated-calf-raise", "renamed exercises still match old logs");
assert.match(read("ios/MassMethodWatch/WatchWorkoutModel.swift"), /unitChanged/, "the watch reloads its draft after a unit switch");
console.log("Audit round 4 holistic checks passed.");

// Audit round 5 follow-ups.
const r5 = makeContext({ profile: { bodyweight: 200 }, weightLogs: [{ id: "mine", date: new Date(Date.now() - 86400000).toISOString(), bodyweight: 200 }], measurements: [{ id: "tape", date: new Date(Date.now() - 86400000).toISOString(), waist: 32 }] });
const r5run = (code) => vm.runInContext(code, r5.context);
r5run("state.healthBody.enabled = true");
r5run(`applyHealthBodySamples(${JSON.stringify([
  { type: "weight", id: "h1", date: new Date().toISOString(), value: 198, source: "Scale" },
  { type: "bodyFat", id: "h2", date: new Date().toISOString(), value: 14.5, source: "Scale" },
  { type: "leanMass", id: "h3", date: new Date(Date.now() - 86400000).toISOString(), value: 170, source: "Scale" },
  { type: "weight", id: "h4", date: new Date(Date.now() - 300 * 86400000).toISOString(), value: 210, source: "Scale" }
])})`);
r5run("setUnits('metric')");
const snap = JSON.stringify(r5run("nativeBackupPayload()"));
assert.ok(!snap.includes("_unitOrigin"), "iCloud snapshots carry no unit-switch memory (it can hold Health values)");
assert.equal(JSON.parse(snap).state.profile.bodyweight, r5run("state.weightLogs.find((entry) => entry.id === 'mine').bodyweight"), "iCloud snapshots never carry a Health-derived profile weight");
assert.ok(Date.now() - Date.parse(JSON.parse(snap).state.healthBody.resyncFrom) > 299 * 86400000, "restores re-import Health history as far back as it went");
// Pending blocks are validated and cleared when superseded.
r5run("state.trainingBlock = null; state.pendingTrainingBlock = { name: 'X', startDate: '2026-01-05', accumulationWeeks: 1e8, focus: 'abc' }; volumeMigrateState()");
assert.equal(r5run("state.pendingTrainingBlock.accumulationWeeks + ':' + Array.isArray(state.pendingTrainingBlock.focus)"), "6:true", "queued blocks are validated");
r5run("state.blockDraft = { weeks: 4, start: 'this', focus: [] }; startTrainingBlock()");
assert.equal(r5run("state.pendingTrainingBlock"), null, "starting your own block clears a queued coach block");
// Today picks expire; coach check-ins cover the gap since the last send.
r5run("state.customPlans = [{ id: 'sched', title: 'Scheduled', muscle: 'chest', phase: 'offseason', scheduleDay: new Date().toLocaleDateString('en-US', { weekday: 'long' }), exercises: [['barbell-bench', 3, '8', 90]] }]; state.todayPlanId = 'chest-density'; state.todayPlanDate = 'Mon Jan 01 2001'");
assert.equal(r5run("todaysSelectedPlan().id"), "sched", "a workout picked on an earlier day no longer overrides today's schedule");
const gapCtx = makeContext({ profile: { bodyweight: 200 }, athleteName: "A", lastCoachPackageAt: new Date(Date.now() - 9 * 86400000).toISOString(), weeklyCheckIns: [{ id: "c8", date: new Date(Date.now() - 8 * 86400000).toISOString(), recovery: 2, notes: "knee" }] });
vm.runInContext("window.webkit = { messageHandlers: { peaksetSharePdf: { postMessage(m) { window.__shared = m; } } } }; FileReader = class { readAsDataURL(blob) { blob.text().then((t) => { this.result = 'data:x;base64,' + Buffer.from(t).toString('base64'); this.onloadend(); }); } }", gapCtx.context);
gapCtx.context.Buffer = Buffer;
await vm.runInContext("sendCheckInToCoach()", gapCtx.context);
const sentPkg = JSON.parse(Buffer.from(vm.runInContext("window.__shared.base64", gapCtx.context), "base64").toString());
assert.equal(sentPkg.weeklyCheckIns.length, 1, "a check-in sent 9 days after the last one covers the whole gap");
const bfCtx = makeContext({ profile: { bodyweight: 200 }, weightLogs: [{ id: "w", date: new Date().toISOString(), bodyweight: 200, bodyFat: 20 }], measurements: [{ id: "t", date: new Date(Date.now() - 5 * 86400000).toISOString(), chest: 40 }] });
assert.equal(vm.runInContext("mergedLatestMeasurement().bodyFat", bfCtx.context), 20, "coach check-ins include smart-scale body fat");
console.log("Audit round 5 checks passed.");

// Audit round 6: Health sentinels never reach any iCloud snapshot (athlete or coach).
const sentinels = ["187.37", "13.71", "161.73", "31.41", "12345"];
const hkAthlete = makeContext({ profile: { bodyweight: 190, createdAt: new Date(Date.now() - 400 * 86400000).toISOString() }, athleteName: "S",
  weightLogs: [{ id: "manual-old", date: new Date(Date.now() - 250 * 86400000).toISOString(), bodyweight: 192 }, { id: "manual", date: new Date(Date.now() - 86400000).toISOString(), bodyweight: 190 }],
  measurements: [{ id: "tape", date: new Date(Date.now() - 86400000).toISOString(), chest: 44 }] });
const hk = (code) => vm.runInContext(code, hkAthlete.context);
hk("state.healthBody.enabled = true");
hk(`applyHealthBodySamples(${JSON.stringify([
  { type: "weight", id: "a", date: new Date().toISOString(), value: 187.37, source: "Scale" },
  { type: "bodyFat", id: "b", date: new Date(Date.now() - 86400000).toISOString(), value: 13.71, source: "Scale" },
  { type: "leanMass", id: "c", date: new Date(Date.now() - 86400000).toISOString(), value: 161.73, source: "Scale" },
  { type: "waist", id: "d", date: new Date().toISOString(), value: 31.41, source: "Tape" },
  { type: "bodyFat", id: "e", date: new Date(Date.now() - 250 * 86400000).toISOString(), value: 15, source: "DEXA" }
])})`);
hk("handleNativeHealthKit({ status: 'stepsImported', steps: 12345 })");
const athleteSnap = JSON.stringify(hk("nativeBackupPayload()"));
for (const value of sentinels) assert.ok(!athleteSnap.includes(value), `athlete iCloud snapshot must not contain Health value ${value}`);
assert.ok(Date.now() - Date.parse(JSON.parse(athleteSnap).state.healthBody.resyncFrom) > 249 * 86400000, "re-sync reaches Health values on old hand-entered entries");
const hkPkg = JSON.parse(JSON.stringify(await hk("buildCoachPackage(400)")));
const hkCoach = makeContext({ profile: { bodyweight: 200 } });
vm.runInContext("window.confirm = () => true", hkCoach.context);
await vm.runInContext(`importCoachPackage(${JSON.stringify(hkPkg)})`, hkCoach.context);
const coachSnap = JSON.stringify(vm.runInContext("nativeBackupPayload()", hkCoach.context));
for (const value of sentinels) assert.ok(!coachSnap.includes(value), `coach iCloud snapshot must not contain the athlete's Health value ${value}`);
assert.ok(vm.runInContext("JSON.stringify(state.coach)", hkCoach.context).includes("13.71"), "the coach still sees the athlete's Health body fat on the device");
hk("window.confirm = () => true; removeHealthImports()");
assert.equal(hk("state.profile.bodyweight"), 190, "removing Health data also restores the hand-entered profile weight");
assert.ok(!JSON.stringify(hk("nativeBackupPayload()")).includes("187.37"), "no Health weight survives removal in snapshots");
console.log("Audit round 6 Health checks passed.");

// Audit round 6 watch timing and background renders.
const w6 = makeContext({ profile: { bodyweight: 200 } });
const w6run = (code) => vm.runInContext(code, w6.context);
w6run("startWorkout('chest-density'); state.view = 'session'");
w6run("handleWatchCommand({ commandId: 'new', action: 'completeSet', workoutId: state.activeWorkout.id, exIndex: 1, setIndex: 0, weight: '60', reps: '10', completedAt: Date.now() })");
const newerEnds = w6run("state.timer.endsAt");
w6run("handleWatchCommand({ commandId: 'old', action: 'completeSet', workoutId: state.activeWorkout.id, exIndex: 0, setIndex: 0, weight: '70', reps: '10', completedAt: Date.now() - 180000 })");
assert.ok(w6run("state.timer.running") && Math.abs(w6run("state.timer.endsAt") - newerEnds) < 1500, "a late watch set never replaces the rest started by a newer set");
assert.equal(w6run("state.activeWorkout.exercises[0].sets[0].done"), true, "the late set itself is still logged");
w6run(`handleWatchCommand({ commandId: 'skip', action: 'skipRest', workoutId: state.activeWorkout.id, sentAt: Date.now() - 70000, restEndsAt: ${newerEnds} })`);
assert.equal(w6run("state.timer.running"), false, "a Skip sent while the phone was locked still applies to the rest it targeted");
w6run("startTimer(120, true, 0)");
w6run(`handleWatchCommand({ commandId: 'stale-skip', action: 'skipRest', workoutId: state.activeWorkout.id, sentAt: Date.now() - 70000, restEndsAt: ${newerEnds} })`);
assert.equal(w6run("state.timer.running"), true, "a Skip aimed at an older rest does not stop a newer one");
const target = w6run("state.timer.endsAt");
w6run(`handleWatchCommand({ commandId: 'plus', action: 'adjustRest', seconds: 15, workoutId: state.activeWorkout.id, sentAt: Date.now() - 60000, restEndsAt: ${target} })`);
assert.ok(Math.abs(w6run("state.timer.endsAt") - (target + 15000)) < 1500, "+15s from the watch lands on the same end time iOS set");
w6run("stopTimer(); state.view = 'progress'; render(); document.getElementById('app').innerHTML += '<!--typing-->'");
w6run("handleWatchCommand({ commandId: 'bg', action: 'completeSet', workoutId: state.activeWorkout.id, exIndex: 0, setIndex: 1, weight: '70', reps: '10', completedAt: Date.now() })");
assert.ok(w6run("document.getElementById('app').innerHTML.includes('<!--typing-->')"), "a watch set does not re-render (and wipe) another tab");
assert.equal(w6run("state.timer.fullscreen"), false, "rests started off the workout screen don't force the full-screen overlay");
console.log("Audit round 6 watch checks passed.");

// Coach check-ins count as sent only when the share completes; expired picks.
const shareCtx = makeContext({ profile: { bodyweight: 200 }, athleteName: "A", lastCoachPackageAt: "2026-01-01T00:00:00.000Z" });
shareCtx.context.Buffer = Buffer;
vm.runInContext("window.webkit = { messageHandlers: { peaksetSharePdf: { postMessage(m) { window.__shared = m; } } } }; FileReader = class { readAsDataURL(blob) { blob.text().then((t) => { this.result = 'data:x;base64,' + Buffer.from(t).toString('base64'); this.onloadend(); }); } }", shareCtx.context);
await vm.runInContext("sendCheckInToCoach()", shareCtx.context);
vm.runInContext("window.handleNativeShare({ filename: window.__shared.filename, completed: false })", shareCtx.context);
assert.equal(vm.runInContext("state.lastCoachPackageAt", shareCtx.context), "2026-01-01T00:00:00.000Z", "a cancelled share does not count as a sent check-in");
await vm.runInContext("sendCheckInToCoach()", shareCtx.context);
vm.runInContext("window.handleNativeShare({ filename: window.__shared.filename, completed: true })", shareCtx.context);
assert.ok(Date.now() - Date.parse(vm.runInContext("state.lastCoachPackageAt", shareCtx.context)) < 60000, "a completed share records the send");
vm.runInContext("state.todayWorkoutPick = 'chest'; state.todayPlanDate = 'Mon Jan 01 2001'", shareCtx.context);
assert.match(vm.runInContext("todayWorkoutSelect()", shareCtx.context), /value="recommended" selected/, "an expired pick no longer shows as selected");
assert.match(read("ios/PeakSet/PeakSetNativeServices.swift"), /scheduledFireDate/, "rest notifications shift from their real fire date");
console.log("Share completion and pick checks passed.");

// Audit round 7 rest and coach details.
const r7 = makeContext({ profile: { bodyweight: 200 } });
const r7run = (code) => vm.runInContext(code, r7.context);
r7run("startWorkout('chest-density'); state.view = 'progress'");
r7run("handleWatchCommand({ commandId: 'late', action: 'completeSet', workoutId: state.activeWorkout.id, exIndex: 0, setIndex: 0, weight: '70', reps: '10', completedAt: Date.now() - 10000 })");
assert.equal(r7run("state.timer.fullscreen"), false, "a late watch set off the workout screen does not force the full-screen overlay");
r7run("state.timer.endsAt = Date.now() - 600000; state.timer.running = true; window.__bells = 0; playBoxingBell = () => { window.__bells += 1; }; handleNativeTimerReconcile({ delivered: false })");
assert.equal(r7run("state.timer.running") + ":" + r7run("window.__bells"), "false:0", "returning after a rest ended (notification already handled) never rings again");
r7run("state.activeWorkout.exercises[0].group = 'A'; state.activeWorkout.exercises[1].group = 'A'");
assert.equal(r7run("buildWatchSnapshot().exercises[0].restAfterNext"), false, "the watch skips the rest between superset partners");
const bfDates = makeContext({ profile: { bodyweight: 200 }, weightLogs: [{ id: "w", date: new Date(Date.now() - 86400000).toISOString(), bodyweight: 200, bodyFat: 13.7 }], measurements: [
  { id: "t1", date: new Date().toISOString(), chest: 44 }, { id: "t0", date: new Date(Date.now() - 60 * 86400000).toISOString(), bodyFat: 18 }] });
assert.equal(vm.runInContext("mergedLatestMeasurement().bodyFat", bfDates.context), 13.7, "a newer scale body fat beats an older tape body fat");
console.log("Audit round 7 checks passed.");

// Equipment profiles: "or" means any alternative, commas mean all parts.
const eq = makeContext({ profile: { bodyweight: 200 } });
const eqNames = (equipment) => vm.runInContext(`exerciseLibrary.filter((exercise) => exerciseMatchesEquipmentProfile(exercise, { equipment: ${JSON.stringify(equipment)} })).map((exercise) => exercise.name)`, eq.context);
const dbBench = eqNames(["Dumbbells", "Bench"]);
["Rear Delt Fly", "Hip Thrust", "Weighted Crunch", "Reverse Crunch", "Incline Dumbbell Press"].forEach((name) => {
  if (vm.runInContext(`exerciseLibrary.some((exercise) => exercise.name.includes(${JSON.stringify(name)}))`, eq.context))
    assert.ok(dbBench.some((item) => item.includes(name)), `${name} is available with dumbbells and a bench`);
});
["Leg Extension", "T-Bar Row", "EZ-Bar Curl", "Captain", "Nordic", "Barbell Bench Press", "Low Cable Fly"].forEach((name) => {
  assert.ok(!dbBench.some((item) => item.includes(name)), `${name} needs equipment a dumbbells-and-bench profile lacks`);
});
const roadGym = eqNames(["Dumbbells", "Cable", "Bench", "Bodyweight", "Bands"]);
assert.ok(roadGym.some((item) => item.includes("Plank")), "Road Gym keeps the bodyweight-or-plate plank");
assert.ok(!roadGym.some((item) => /Leg Extension|T-Bar|EZ-Bar/.test(item)), "Road Gym hides machine, T-bar and EZ-bar work");
console.log("Equipment profile checks passed.");

// Progress forms keep typed values when another form saves.
const pd = makeContext({ profile: { bodyweight: 200 } });
const pdField = (id, value) => { const field = { id, value, defaultValue: "", innerHTML: "", classList: { add() {}, remove() {} } }; pd.elements.set(id, field); return field; };
vm.runInContext("state.view = 'progress'", pd.context);
const typedFields = [pdField("logWeight", "199"), pdField("measurechest", "44"), pdField("checkSleep", "7"), pdField("prepPosing", "20")];
pd.context.document.querySelectorAll = (selector) => (selector.includes("input[id]") ? typedFields : []);
// Re-rendering the page recreates every input empty.
Object.defineProperty(pd.context.document.getElementById("app"), "innerHTML", {
  get() { return ""; },
  set() { typedFields.forEach((field) => { field.value = field.defaultValue; }); }
});
vm.runInContext("saveWeight()", pd.context);
assert.equal(vm.runInContext("state.weightLogs[0].bodyweight", pd.context), 199, "the weight saved");
assert.deepEqual(typedFields.map((field) => field.value), ["", "44", "7", "20"], "saving weight keeps the other forms' typed values and clears its own");
console.log("Progress draft checks passed.");

// Prep and bulking checklist items come from saved logs.
const sc = makeContext({ profile: { bodyweight: 200 } });
vm.runInContext(`
  const now = Date.now();
  state.prepLogs = [{ id: "p", date: new Date().toISOString(), cardioType: "Bike", cardioMinutes: 40, steps: 12000, posingMinutes: 20 }];
  state.measurements = [{ id: "m1", date: new Date(now).toISOString(), waist: 32 }, { id: "m2", date: new Date(now - 5 * 86400000).toISOString(), waist: 32.4 }];
  state.weightLogs = [{ id: "w1", date: new Date(now).toISOString(), bodyweight: 200 }, { id: "w2", date: new Date(now - 4 * 86400000).toISOString(), bodyweight: 201 }];
`, sc.context);
const prepItems = vm.runInContext("stageChecklist({ phase: 'prep' })", sc.context);
assert.ok(prepItems.filter((item) => /Posing|Cardio|Waist/.test(item.label)).every((item) => item.done), "logged posing, cardio and waist/scale data check the prep items");
// Blocks start on the first day of a week.
vm.runInContext("state.trainingBlock = { id: 'b', name: 'Block', startDate: ((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(startOfWeek(new Date())), accumulationWeeks: 4, deload: true, focus: ['biceps'] }", sc.context);
const bulkItems = vm.runInContext("stageChecklist({ phase: 'bulking' })", sc.context);
assert.ok(bulkItems.filter((item) => /Weak body part|Progressive overload|Waist gain/.test(item.label)).every((item) => item.done), "a running block with a weak point checks the bulking items");
console.log("Stage checklist checks passed.");

// Audit round 8 (web lows).
const r8 = makeContext({ profile: { bodyweight: 200 } });
const r8run = (code) => vm.runInContext(code, r8.context);
r8run(`
  const day = localDayKey(new Date().toISOString());
  state.measurements = [{ id: "hk-m-" + day, date: new Date().toISOString(), waist: 32, healthFields: ["waist"], source: "healthkit" }];
  state.measurements.unshift({ id: "tape", date: new Date().toISOString(), chest: 44 });
  upsertHealthMeasurement(day, { waist: 32 }, new Date().toISOString());
`);
assert.equal(r8run("state.measurements.filter((entry) => entry.waist).length"), 1, "a Health waist folded into the day's tape check-in is not counted twice");
const nextWeek = new Date(Date.now() + 8 * 86400000);
r8run(`state.trainingBlock = { id: "b", name: "Block", startDate: "${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, "0")}-${String(nextWeek.getDate()).padStart(2, "0")}", accumulationWeeks: 4, deload: true, focus: ["biceps"] }`);
assert.equal(r8run("stageChecklist({ phase: 'bulking' }).find((item) => /Progressive overload/.test(item.label)).done"), false, "a block that hasn't started doesn't count as running");
r8run("window.__toasts = []; toast = (message) => window.__toasts.push(message); state.timer.running = true; state.timer.endsAt = Date.now() - 60000; handleNativeTimerReconcile({ delivered: false })");
assert.equal(r8run("JSON.stringify(window.__toasts)"), JSON.stringify(["Rest complete."]), "a rest that ended while away still says so");
console.log("Audit round 8 checks passed.");
{
  const sg = makeContext({ profile: { bodyweight: 200 } });
  vm.runInContext("startWorkout('chest-density'); state.activeWorkout.exercises[0].group = 'A'", sg.context);
  assert.equal(vm.runInContext("buildWatchSnapshot().exercises[0].group + '|' + buildWatchSnapshot().exercises[2].group", sg.context), "A|", "the watch snapshot carries superset groups so the watch can apply rest rules on its own");
  console.log("Watch superset snapshot checks passed.");
}

// Audit round 9: superset order on the phone matches the watch; toggle off
// ends the between-rests activity; cancels say whether a workout is active.
{
  const r9 = makeContext({ profile: { bodyweight: 200 } });
  const run = (code) => vm.runInContext(code, r9.context);
  run("startWorkout('chest-density'); state.activeWorkout.exercises[0].group = 'A'; state.activeWorkout.exercises[1].group = 'A'");
  run("state.activeWorkout.exercises[0].sets[0].done = true");
  assert.equal(run("currentWatchExerciseIndex(state.activeWorkout)"), 1, "after A1 the partner A2 is next");
  run("state.activeWorkout.exercises[1].sets[0].done = true; state.timer.running = true; state.timer.exerciseIndex = 1");
  assert.equal(run("currentWatchExerciseIndex(state.activeWorkout)"), 0, "after the round the first superset exercise is next, even while resting");
  run("window.__posts = []; window.webkit = { messageHandlers: { peaksetTimer: { postMessage: (message) => window.__posts.push(message) } } }; state.timer.running = false; setLiveActivityEnabled(false)");
  assert.equal(run("JSON.stringify(window.__posts)"), JSON.stringify([{ action: "endActivity" }]), "turning the Lock Screen setting off between rests removes the activity");
  assert.equal(run("buildWatchSnapshot().liveActivity"), false, "the setting reaches native code through the snapshot");
  run("window.__posts = []; stopTimer()");
  assert.ok(run("window.__posts.some((message) => message.action === 'cancel' && message.workoutActive === true)"), "a cancel mid-workout tells native code to keep the activity");
  console.log("Audit round 9 checks passed.");
}

// Audit round 10: the watch stays on the exercise being worked after a rest,
// even out of order; Health-derived profile weight never reaches a backup.
{
  const r10 = makeContext({ profile: { bodyweight: 200 } });
  const run = (code) => vm.runInContext(code, r10.context);
  run("startWorkout('chest-density'); const ex = state.activeWorkout.exercises[1]; ex.sets[0].weight = '60'; ex.sets[0].reps = '10'; completeSet(1, 0)");
  assert.equal(run("currentWatchExerciseIndex(state.activeWorkout)"), 1, "during the rest the worked exercise is current");
  run("stopTimer()");
  assert.equal(run("currentWatchExerciseIndex(state.activeWorkout)"), 1, "after the rest the watch stays on the exercise done out of order");
  run("moveActiveWorkoutExercise(1, -1)");
  assert.equal(run("state.activeWorkout.lastExerciseIndex"), 0, "moving exercises keeps the anchor on the same exercise");
  run("state.healthBody = { ...state.healthBody, enabled: false, lastSyncAt: null, everUsed: true }; state.weightLogs = []; state.profile.bodyweight = 201.4");
  assert.equal(run("nativeBackupPayload().state.profile.bodyweight ?? null"), null, "a profile weight that came from Health stays out of iCloud after its entries are removed");
  console.log("Audit round 10 checks passed.");
}
{
  const r11 = makeContext({ profile: { bodyweight: 200 } });
  const run = (code) => vm.runInContext(code, r11.context);
  run("startWorkout('chest-density'); const ex = state.activeWorkout.exercises[2]; ex.sets[0].weight = '60'; ex.sets[0].reps = '10'; completeSet(2, 0); completeSet(2, 0); stopTimer()");
  assert.equal(run("currentWatchExerciseIndex(state.activeWorkout)"), 0, "undoing a mis-tapped set sends the watch back to the first open exercise");
  console.log("Audit round 11 checks passed.");

// ---- Audit round 12 (2026-10-07 fresh pass) ----
{
  const watchJs = read("watch.js");
  const backupService = read("ios/PeakSet/PeakSetBackupService.swift");
  const watchPrivacy = read("ios/MassMethodWatch/PrivacyInfo.xcprivacy");
  // App Store upload rejects a watch binary that uses UserDefaults without a privacy manifest.
  assert(watchPrivacy.includes("NSPrivacyAccessedAPICategoryUserDefaults"), "Watch privacy manifest must declare UserDefaults");
  assert(/2B3C4D5E6F7A80000000F004 \/\* PrivacyInfo.xcprivacy in Resources \*\/,/.test(xcodeProject), "Watch PrivacyInfo.xcprivacy is not in the watch Resources phase");
  // The phone notification follows the real end time (a +15 s rest is not the preset length), and
  // the phone always schedules it: the watch drops its own alert once a watch-logged set is confirmed.
  assert(swiftWebView.includes("let fireIn = endsAtMs.map { $0 / 1000 - Date().timeIntervalSince1970 } ?? seconds"), "Native rest notification must be scheduled from endsAt");
  assert(!swiftWebView.includes("restStartedOnWatch") && !watchJs.includes("restStartedOnWatch"), "Phone must always schedule its rest notification (watch drops its own on confirmation)");
  assert(toolkit.includes('postMessage({ action: "start", seconds: timerTotalSeconds(), endsAt: state.timer.endsAt,'), "Native timer start must carry the real rest length");
  // Watch: absurd phone input must clamp, never trap in Int().
  const watchModel = read("ios/MassMethodWatch/WatchWorkoutModel.swift");
  assert(watchModel.includes("static func clampWeight(_ value: Double) -> Double") && watchModel.includes("weight = Self.clampWeight(") && watchModel.includes("reps = Self.clampReps("), "Watch draft values must be clamped");
  assert(!watchModel.includes("String(Int(reps.rounded()))") && !read("ios/MassMethodWatch/WatchWorkoutView.swift").includes("String(Int(model.reps.rounded()))"), "Watch reps formatting must go through clampReps");
  // iCloud: poll a fresh URL (cached resource values never refresh off the run loop); skip undownloaded photos.
  assert(backupService.includes("let probe = URL(fileURLWithPath: url.path)"), "iCloud download polling must probe a fresh URL");
  assert(backupService.includes("if !Self.isDownloaded(realSource, placeholder: sourcePlaceholder) {"), "Photo restore must skip photos still downloading");
  assert(backupService.includes("let logical = directory.appendingPathComponent(name)"), "Backup list must read metadata through the logical iCloud name");
  // No main-frame blob:/data: navigation.
  assert(swiftWebView.includes("decisionHandler(navigationAction.targetFrame?.isMainFrame == true ? .cancel : .allow)"), "Main-frame blob:/data: navigations must be refused");
  // iCloud restores must not block the snapshot queue or hang offline.
  assert(backupService.includes("let worker = location == .iCloud ? restoreQueue : queue"), "iCloud restores must run on their own queue");
  assert(backupService.includes("case downloadPending"), "iCloud restore needs a bounded download wait");
  assert(backupService.includes("self.photoQueue.async { self.mirrorPhotosToICloud() }"), "Photo mirroring must not delay the backup completion");
  // Incoming files are read off the main thread.
  assert(backupService.includes("DispatchQueue.global(qos: .userInitiated).async {\n            let scoped = url.startAccessingSecurityScopedResource()"), "Incoming backup files must be read off the main thread");
  // Watch commands are acknowledged only when the JS handler actually exists.
  assert(swiftWebView.includes("typeof window.\\(function) === 'function' ? (window.\\(function)(...\\(array)), true) : false;"), "Watch commands must not be acknowledged when the JS handler is missing");
  // Core JS: adjusting a running rest keeps the preset; the ring uses `total`.
  assert(app.includes("seconds: persistRest ? duration : clampRestSeconds(state.timer.seconds),"), "Running-rest adjustments must not rewrite the rest preset");
  assert(app.includes("function timerTotalSeconds()") && toolkit.includes("const totalTimer = timerTotalSeconds();"), "Timer ring must use the rest total, not the preset");
  assert(app.includes("if (state.timer.running) setTimeout(ensureTimerTick, 0);") && toolkit.includes("if (state.timer.running) setTimeout(ensureTimerTick, 0);"), "Session render must not arm the timer tick while idle");
  assert(app.includes("function clearTimerTick()"), "Timer tick must be cleared when the rest completes");
  assert(app.includes('if (value === null || value === undefined || value === "") return "--";'), "formatWeight(null) must read --");
  assert(app.includes("if (!Array.isArray(stored.weightLogs)) {"), "Weight-log migration must only run for the pre-weightLogs schema");
  assert(app.includes("function knownPlanExercises(plan)") && !app.includes("${plan.exercises.map(([id, sets, reps]) => `"), "Plan previews must skip unknown exercise ids");
  assert(app.includes("Math.abs(delta) < fromPounds(0.2)"), "Scale-trend threshold must be unit-aware");
  assert(read("settings.js").includes("function todayStamp() {\n  return localDateStamp();\n}") && app.includes("function localDateStamp(date = new Date()) {"), "Snapshot day stamp must use the local date");
  assert(read("volume.js").includes("function renderTrainingBlockCard() {\n  // A queued coach block whose start week has arrived becomes the active\n  // block here too, so this card and the volume bars below agree.\n  promotePendingBlock();"), "Training block card must promote a due pending block before rendering");
  // Bridge timing: no second bell after a hidden-page watch command, no stale reconcile kill, no double watch haptic.
  assert(app.includes('if (typeof document !== "undefined" && document.hidden) {\n    timerTick = null;\n    return;\n  }'), "Timer tick must not arm while the page is hidden");
  assert(toolkit.includes("if (state.timer.running && Number(state.timer.endsAt) - Date.now() > 1500) {\n      ensureTimerTick();\n      return;\n    }"), "Reconcile must not kill a rest started after the reconcile request");
  assert(read("ios/MassMethodWatch/WatchWorkoutModel.swift").includes("guard endsAt.timeIntervalSinceNow > -2 else {"), "Watch must not replay the rest haptic after waking late");
  // Journey-harness findings: junk logbook range, untitled logs, junk native lists, corrupt-storage boot, photo redelivery.
  assert(app.includes("function logbookDays()") && !app.includes("Number(state.logbookRange || 7)") && !toolkit.includes("Number(state.logbookRange || 7)") && !read("coach.js").includes("Number(state.logbookRange || 7)"), "Logbook range must go through logbookDays()");
  assert(app.includes('next.logbookRange = LOGBOOK_RANGES.includes(Number(next.logbookRange)) ? String(Number(next.logbookRange)) : "7";'), "Stored logbook range must be sanitized");
  assert(app.includes('${log.title || "Workout"}'), "PDF must not print undefined for an untitled log");
  assert(app.includes("  weeklyCheckIns: [],\n  prepLogs: [],"), "Fresh state must include toolkit arrays so the corrupt-storage boot render does not throw");
  assert(read("settings.js").includes('.filter((backup) => backup && typeof backup === "object")'), "Native backup list must drop non-object entries");
  assert(read("photos.js").includes("if (state.progressPhotos.some((photo) => photo.id === record.id)) return;"), "Redelivered photo saves must not duplicate records");
  assert(toolkit.includes('return state.exerciseSettings[id] || { note: "", pain: "none" };'), "exerciseSetting must be read-only");
  assert(app.includes("const filename = `mass-method-coach-log-${localDateStamp()}.pdf`;"), "PDF filename must use the local day");
  // Verification follow-ups.
  assert(app.includes("    weeklyCheckIns: [],\n    prepLogs: [],\n    timer: { ...defaultState.timer }"), "freshDefaultState must not alias defaultState arrays");
  assert(toolkit.includes("const cutoff = Date.now() - Number(report.days) * 86400000;"), "Toolkit report cutoff must reuse the coerced day count");
  assert(backupService.includes("if self.photoRestorePending {"), "Backup list must not pull iCloud photos before a restore happened");
  assert(read("ios/MassMethodWatch/WatchWorkoutModel.swift").includes("if let previous = lastScheduledRestEnd, previous != endsAt {"), "Watch must not dismiss a just-delivered alert on a same-rest snapshot");
  // Adversarial inputs: bounded plans, bounded depth, own-property lookups, O(1) name resolution.
  // UI/import cap (40) is enforced where exercises are added; the load-time cap (150) sits above
  // anything the UI can reach so a reload never truncates a real workout (round 15 regression).
  assert(app.includes("const MAX_PLAN_EXERCISES = 40;") && app.includes("const MAX_STORED_PLAN_EXERCISES = 150;"), "Plan caps must separate the UI limit from the load-time safety net");
  assert(!/slice\(0, MAX_PLAN_EXERCISES\)/.test(app) && !/slice\(0, MAX_PLAN_EXERCISES\)/.test(toolkit), "Load-time paths must use the stored-plan cap, not the UI cap");
  assert(read("coach.js").includes(".slice(0, MAX_PLAN_EXERCISES)") && read("coach.js").includes("offered.slice(0, MAX_PROGRAM_PLANS)"), "Imported programs must be capped");
  assert(toolkit.includes("if (builderDraft.length >= MAX_PLAN_EXERCISES)") && toolkit.includes("if (state.activeWorkout.exercises.length >= MAX_PLAN_EXERCISES)"), "UI add paths must stop at the exercise cap");
  assert(app.includes("function pruneDeepObjects(root, maxDepth = MAX_STATE_DEPTH)") && app.includes("pruneDeepObjects(parsed)") && read("settings.js").includes("...pruneDeepObjects(payload.state)"), "Loaded and restored state must be depth-pruned");
  assert(read("settings.js").includes("const stack = [rootValue];"), "dropOrigins must be iterative");
  assert(read("settings.js").includes("Object.hasOwn(incomingFileHandlers, format)"), "File dispatcher must not resolve formats through Object.prototype");
  assert(read("coach.js").includes("function athleteById(id)") && !/state\.coach\.athletes\[(?!athleteId\] = athlete|id\]\.notes|athleteId\] = previous|athleteId\];\n    else|key\])/.test(read("coach.js").replace(/delete state\.coach\.athletes\[[a-zA-Z]+\];/g, "")), "Coach roster reads must go through athleteById");
  assert(app.includes("}, Object.create(null));"), "PDF exercise grouping must use a null-prototype object");
  assert(app.includes("function exerciseIndexes()") && toolkit.includes("loggedNameIndex = new Map("), "Logged-set exercise resolution must use an index, not a library scan");
  assert(app.includes('next.workoutLogs = next.workoutLogs.map((log) => ("volume" in log ? { ...log, volume: finiteOrNull(log.volume) ?? 0 } : log));'), "Stored workout volume must be finite");
  assert(toolkit.includes("function planRepsText(value)") && !toolkit.includes("[0-9A-Za-z .\\-–]{1,20}"), "Plan reps must stay free text (round 15: '10/side' was rewritten to 8-12)");
  {
    // Runtime: a 5k-exercise program is capped and the session still renders; prototype-key names are safe.
    const r12 = makeContext({ profile: { gender: "Male", age: 30, bodyweight: 200, createdAt: new Date().toISOString() } });
    const run12 = (code) => vm.runInContext(code, r12.context);
    run12("window.confirm = () => true; handleIncomingFileText(JSON.stringify({ format: 'mass-method-program', version: 1, from: 'X', plans: [{ title: 'Huge', exercises: Array.from({ length: 5000 }, () => ['barbell-bench', 10, '8', 90, 4]) }] }))");
    assert.equal(run12("state.customPlans[0].exercises.length"), 40, "imported program capped at 40 exercises");
    run12("startWorkout(state.customPlans[0].id)");
    assert.equal(run12("state.activeWorkout.exercises.length"), 40, "started workout keeps the 40 imported exercises");
    assert.ok(run12("renderContent().length") > 1000, "capped session renders");
    run12("cancelWorkout(); state.workoutLogs.unshift({ id: 'c', title: 'T', date: new Date().toISOString(), sets: [{ exercise: 'constructor', exerciseId: '', weight: '100', reps: '5' }] })");
    assert.ok(run12("buildCoachReportLines(7, '').some((line) => line.text.startsWith('constructor:'))"), "PDF groups a set named constructor");
    assert.equal(run12("handleIncomingFileText('{\"format\":\"constructor\"}')"), false, "prototype-key format is not a Mass Method file");
    let deep = { a: 1 }; for (let i = 0; i < 2000; i += 1) deep = { a: deep };
    const stored12 = JSON.parse(r12.storage.get("stageforge-v1"));
    stored12.junk = deep;
    const r12b = makeContext(stored12);
    assert.ok(vm.runInContext("JSON.stringify(nativeBackupPayload()).length", r12b.context) > 0, "snapshot survives a deeply nested stored value");
    assert.ok(vm.runInContext("JSON.stringify(state.junk).length", r12b.context) < 400, "deeply nested stored values are pruned on load");
  }
  // Round 15: free-text reps survive save + reload; a live workout above the UI cap survives reload;
  // the watch's "100." weight is accepted; an invalid watch value never wipes the phone's value.
  {
    const r15 = makeContext({ profile: { gender: "Male", age: 30, bodyweight: 200, createdAt: new Date().toISOString() } });
    const run15 = (code) => vm.runInContext(code, r15.context);
    run15("window.confirm = () => true");
    run15("builderDraft = ['10/side', '12, 10, 8', '8-10 (pause)', '10+10', '1:00'].map((reps) => ({ id: 'barbell-bench', sets: 3, reps, rest: 90, dropSets: 0, group: '', setType: 'standard' })); saveBuilderTemplate()");
    const savedReps = run15("JSON.stringify(state.customPlans[0].exercises.map((row) => row[2]))");
    assert.equal(savedReps, JSON.stringify(["10/side", "12, 10, 8", "8-10 (pause)", "10+10", "1:00"]), "builder reps are kept verbatim");
    const reloaded15 = makeContext(JSON.parse(r15.storage.get("stageforge-v1")));
    assert.equal(vm.runInContext("JSON.stringify(state.customPlans[0].exercises.map((row) => row[2]))", reloaded15.context), savedReps, "builder reps survive reload");
    // A live workout beyond the UI cap (built by an older version) keeps every exercise and logged set on reload.
    run15("startWorkout('chest-density'); const ids = exerciseLibrary.map((item) => item.id).filter((id) => !state.activeWorkout.exercises.some((exercise) => exercise.id === id)).slice(0, 40); ids.forEach((id) => state.activeWorkout.exercises.push({ id, originalId: id, name: exerciseById(id).name, repsOnly: false, targetSets: 1, targetDropSets: 0, targetReps: '8-12', rest: 90, group: '', defaultSetType: 'standard', sets: [{ set: 1, label: '1', dropSet: false, setType: 'standard', weight: '50', reps: '10', rir: '', done: true }] })); saveState()");
    const liveCount = run15("state.activeWorkout.exercises.length");
    assert.ok(liveCount > 40, "test workout exceeds the UI cap");
    const reloadedLive = makeContext(JSON.parse(r15.storage.get("stageforge-v1")));
    assert.equal(vm.runInContext("state.activeWorkout.exercises.length", reloadedLive.context), liveCount, "reload never truncates a live workout");
    assert.equal(vm.runInContext("state.activeWorkout.exercises.at(-1).sets[0].done", reloadedLive.context), true, "logged set on the last exercise survives reload");
    // Watch "100." is accepted; garbage keeps the phone's typed value.
    run15("cancelWorkout(); startWorkout('chest-density'); updateSet(0, 0, 'weight', '100.004'); updateSet(0, 0, 'reps', '8')");
    assert.equal(run15("handleWatchCommand({ action: 'completeSet', exIndex: 0, setIndex: 0, weight: '100.', reps: '8', commandId: 'w-100' })"), true, "watch weight '100.' completes the set");
    assert.equal(run15("state.activeWorkout.exercises[0].sets[0].weight"), "100", "trailing dot is normalized");
    run15("updateSet(0, 1, 'weight', '95'); updateSet(0, 1, 'reps', '8')");
    run15("handleWatchCommand({ action: 'completeSet', exIndex: 0, setIndex: 1, weight: {}, reps: '8', commandId: 'w-bad' })");
    assert.equal(run15("state.activeWorkout.exercises[0].sets[1].weight"), "95", "an invalid watch weight never wipes the phone's value");
  }
  assert(read("ios/MassMethodWatch/WatchWorkoutModel.swift").includes('#"\\.?0+$"#'), "Watch weight formatting must not leave a trailing decimal point");
  assert(backupService.includes("private static let photoRestorePendingKey") && !backupService.includes("PeakSetAtomicFlag"), "Pending iCloud photo restores must persist across launches");
  // Round 15 domain logic: what the app tells the athlete.
  {
    const volumeJs = read("volume.js");
    const coachJs = read("coach.js");
    const watchJs15 = read("watch.js");
    assert(volumeJs.includes("low = high = Math.round(high * 0.5);"), "Deload target must be half the last build week, not half the minimum");
    assert(toolkit.includes("function progressionRirLimit()") && volumeJs.includes("progressionRirLimit = function blockProgressionRirLimit()"), "Progression must use the block's weekly RIR target");
    assert(coachJs.includes("const anchor = Number.isFinite(Date.parse(athlete.updatedAt))") && coachJs.includes("function athleteVolumeWeek(athlete)"), "Coach stats must anchor at the check-in and show a week with training");
    assert(app.includes('<p class="label">${s.workouts === 1 ? "Workout" : "Workouts"}, last 7 days</p>') && app.includes('<p class="label">Measurement check-ins</p>') && app.includes("addReportSection(lines, `Summary (last ${days} days)`);"), "Stat labels must match what they count");
    assert(app.includes("That weigh-in is already saved.") && toolkit.includes("workout.savedTemplateId"), "Double taps must not duplicate weigh-ins or templates");
    assert(watchJs15.includes("const order = set?.dropSet ? [previousSet, lastDone, lastWorking] : [lastDone, previousSet];"), "Watch drop sets must be suggested from previous drops, then the working weight");
    assert(read("health.js").includes("gapDays(point) >= 21 && gapDays(point) <= 35"), "Body composition must compare against a reading about four weeks before the latest");
    assert(app.includes("const checklist = stageChecklist({ ...timeline, phase: timeline.goalDateRaw && timeline.phase === \"prep\" ? \"prep\" : chosenPhase });"), "Checklist must follow the athlete's chosen phase");
    const r16 = makeContext({ profile: { gender: "Male", age: 30, bodyweight: 200, createdAt: new Date().toISOString() } });
    const run16 = (code) => vm.runInContext(code, r16.context);
    assert.equal(run16("estimateOneRepMax(315, 1)"), 315, "a single's estimated 1RM is the weight lifted");
    assert.equal(run16("estimateOneRepMax(400, 40)"), 0, "sets above 30 reps are not 1RM tests");
    assert.equal(run16("estimatedOneRepMax(225, 10)"), run16("estimateOneRepMax(225, 10)"), "Library and History use one 1RM estimate");
    assert.equal(run16("nextLoadableWeight('flat-db-press', 60)"), 65, "dumbbell progression jumps to the next 5 lb dumbbell");
    run16("setUnits('metric')");
    assert.equal(run16("nextLoadableWeight('barbell-bench', 124.74)"), 126.25, "kg progression adds one step and lands on a loadable 1.25 kg weight");
    assert.equal(run16("nextLoadableWeight('barbell-bench', 100)"), 101.25, "on-grid kg weights add exactly one step");
  }
  // Round 15 native: camera rests ring, denied notifications explained, Health de-dup, Live Activity at workout start.
  {
    const appSwift = read("ios/PeakSet/PeakSetApp.swift");
    const servicesSwift = read("ios/PeakSet/PeakSetNativeServices.swift");
    const bridgeSwift = read("ios/PeakSet/PeakSetWatchBridge.swift");
    const liveSwift = read("ios/PeakSet/PeakSetLiveActivity.swift");
    assert(appSwift.includes("completionHandler(Self.webViewCoveredByFullScreenController() ? [.banner, .list, .sound] : [])"), "A rest ending under the full-screen camera must still ring");
    assert(servicesSwift.includes("self.onAuthorizationDenied?()") && toolkit.includes("window.handleNativeTimerAuth = handleNativeTimerAuth;"), "Denied notifications must be reported to the athlete");
    assert(servicesSwift.includes("metadata[HKMetadataKeySyncIdentifier]") && toolkit.includes("id: latestWeight?.id || null"), "Send Weight must replace, not duplicate, Health samples");
    assert(servicesSwift.includes("(error as? HKError)?.code == .errorNoData"), "No step data must read as zero steps");
    assert(liveSwift.includes("nonisolated func showReady(") && bridgeSwift.includes("if started { ensureLiveActivity() }") && appSwift.includes("PeakSetWatchBridge.shared.ensureLiveActivity()"), "The Lock Screen activity must start with the workout");
    assert(bridgeSwift.includes("private let acknowledgedKey") && liveSwift.includes("if let target, abs(state.endsAt.timeIntervalSince(target)) > 5 { continue }"), "Late watch commands must not move or cancel a newer rest");
    assert(bridgeSwift.includes("guard Thread.isMainThread else {\n            DispatchQueue.main.async { self.flushSnapshot() }"), "Snapshot flushes must be serialized");
    assert(backupService.includes("private static let pendingMirrorDeletesKey") && backupService.includes('folder.appendingPathComponent(".\\(name).icloud")'), "Deleted photos must be removed from the iCloud mirror, including evicted copies");
    assert(swiftWebView.includes("PeakSetIncomingFiles.shared.detach()\n        PeakSetWatchBridge.shared.detach()") && swiftWebView.includes("private var pendingPhotoReplies"), "Native replies must survive a page reload");
    assert(read("ios/MassMethodWatch/WatchWorkoutView.swift").includes("WatchWorkoutModel.maxReps : WatchWorkoutModel.maxWeight"), "Watch crown range must match the clamps");
  }
  // Round 16: UX flows and the round-15 verification findings.
  {
    const r17 = makeContext({ profile: { gender: "Male", age: 30, bodyweight: 200, createdAt: new Date().toISOString() } });
    const run17 = (code) => vm.runInContext(code, r17.context);
    run17("window.confirm = () => true; window.__scrolls = 0; window.scrollTo = () => { window.__scrolls += 1; }");
    // Switching views and starting workouts open at the top.
    run17("setView('plans')");
    assert.ok(run17("window.__scrolls") >= 1, "changing view scrolls to the top");
    run17("window.__scrolls = 0; startWorkout('chest-density')");
    assert.ok(run17("window.__scrolls") >= 1, "starting a workout opens it at the top");
    // Session header leads with Finish/Cancel; tools and a second Finish sit after the exercises.
    const sessionHtml = run17("renderContent()");
    assert.ok(sessionHtml.indexOf("Finish Workout") < sessionHtml.indexOf('id="exercise-card-0"'), "Finish Workout is in the header");
    assert.ok(sessionHtml.indexOf('id="liveExerciseAdd"') > sessionHtml.indexOf('id="exercise-card-0"'), "Add exercise moved below the exercises");
    assert.ok(!sessionHtml.includes("Save Session"), "the end-workout button says Finish Workout");
    // Finishing with sets left asks first and says how many.
    run17("updateSet(0, 0, 'weight', '100'); updateSet(0, 0, 'reps', '8'); completeSet(0, 0); stopTimer(); window.__confirmText = ''; window.confirm = (text) => { window.__confirmText = text; return false; }; finishWorkout()");
    assert.match(run17("window.__confirmText"), /aren't marked Complete/, "finishing early asks for confirmation");
    assert.ok(run17("Boolean(state.activeWorkout)"), "declining keeps the workout");
    // The final set starts no rest and points at Finish.
    run17("window.confirm = () => true; state.activeWorkout.exercises.forEach((exercise, e) => exercise.sets.forEach((set, i) => { if (!set.done && !(e === 0 && i === 1)) { set.weight = exercise.repsOnly ? '' : '50'; set.reps = '10'; set.done = true; } })); state.activeWorkout.exercises[0].sets[1].weight = '100'; state.activeWorkout.exercises[0].sets[1].reps = '8'; stopTimer(); completeSet(0, 1)");
    assert.equal(run17("state.timer.running"), false, "no rest timer after the final set");
    assert.ok(run17("renderContent()").includes("finish-banner"), "all sets logged shows the Finish banner");
    // Implausible weight asks first.
    run17("finishWorkout(); startWorkout('chest-density'); updateSet(0, 0, 'weight', '1000'); updateSet(0, 0, 'reps', '8'); window.__asked = false; window.confirm = () => { window.__asked = true; return false; }; completeSet(0, 0)");
    assert.ok(run17("window.__asked") && !run17("state.activeWorkout.exercises[0].sets[0].done"), "a weight over double the best asks before logging");
    // Logged entries can be deleted; profile weight follows.
    run17("window.confirm = () => true; cancelWorkout(); state.weightLogs.unshift({ id: 'w-typo', date: new Date().toISOString(), bodyweight: 2000, note: '' }); state.profile.bodyweight = 2000; deleteLogEntry('weight', 'w-typo')");
    assert.ok(!run17("state.weightLogs.some((entry) => entry.id === 'w-typo')") && run17("state.profile.bodyweight") !== 2000, "a mistyped weigh-in can be deleted");
    run17("const id = state.workoutLogs[0].id; deleteLogEntry('workout', id)");
    assert.equal(run17("state.workoutLogs.length"), 0, "a workout can be deleted");
    // Verification findings.
    assert.equal(run17("setUnits('imperial'); nextLoadableWeight('db-lateral-raise', 12.5)"), 15, "12.5 lb dumbbells progress to 15, not 20");
    assert.equal(run17("nextLoadableWeight('barbell-squat', 137.5)"), 140, "137.5 lb squat progresses to 140");
    assert.match(read("health.js"), /point !== latest && gapDays\(point\) >= 21/, "body-fat change never compares the latest reading with itself");
    assert.match(read("coach.js"), /sinceDate: cleanDate\(e\.sinceDate\)/, "coach import keeps the merged-measurement date range");
    assert.equal(run17("planRepsText('10/side')"), "10/side", "coach and builder reps stay free text");
    assert.equal(run17("planRepsText(\"8-10 (don't lock out)\")"), "8-10 (don't lock out)", "apostrophes in reps are kept");
    assert.equal(run17("nextLoadableWeight('chest-supported-row', 25)"), 30, "dumbbell-only movements listed after a bench use dumbbell jumps");
    assert.equal(run17("plainReportText('\\u0966\\u0967 \\u09E9\\u09EF')"), "01 39", "Devanagari and Bengali digits map correctly");
    assert.equal(run17("planRepsText('<b>8</b>')"), "8-12", "markup in reps is replaced");
  }
  // Round 16 storage: stored state stays 1 byte per character; typing saves after a pause; PDFs use Western digits.
  {
    const r18 = makeContext({ profile: { gender: "Male", age: 30, bodyweight: 200, createdAt: new Date().toISOString() } });
    const run18 = (code) => vm.runInContext(code, r18.context);
    run18("state.weightLogs.unshift({ id: 'w-q', date: new Date().toISOString(), bodyweight: 200, note: 'Didn’t sleep 💤' }); saveState()");
    const stored18 = r18.storage.get("stageforge-v1");
    assert.ok(![...stored18].some((character) => character.charCodeAt(0) > 0x7f), "stored state is pure ASCII (WebKit keeps it 1 byte per character)");
    assert.ok(app.includes("new TextDecoder().decode(new TextEncoder().encode(ascii))"), "stored string is rebuilt as an 8-bit string");
    assert.equal(JSON.parse(stored18).weightLogs[0].note, "Didn’t sleep 💤", "escaped characters read back unchanged");
    run18("startWorkout('chest-density'); saveState(); updateSet(0, 0, 'weight', '123')");
    assert.notEqual(JSON.parse(r18.storage.get("stageforge-v1")).activeWorkout.exercises[0].sets[0].weight, "123", "typing does not rewrite storage on every keystroke");
    run18("flushPendingSave()");
    assert.equal(JSON.parse(r18.storage.get("stageforge-v1")).activeWorkout.exercises[0].sets[0].weight, "123", "a pending keystroke save is flushed");
    assert.equal(run18("plainReportText('\u0661\u0662\u0663\u066B\u0665')"), "123.5", "native digits survive in the PDF");
    assert.ok(read("health.js").includes("reportFormatting = true;") && app.includes("toLocaleDateString(reportLocale())") && app.includes('new Intl.Locale(base, { calendar: "gregory", numberingSystem: "latn" })'), "PDF lines keep the device date order with Western digits");
    assert.ok(read("settings.js").includes("if (result === \"shared\") pendingBackupShare = filename;"), "a cancelled share sheet never unlocks archiving");
    assert.ok(read("settings.js").includes("function archiveOldHistory()") && read("settings.js").includes("serializeForStorage(restored)"), "storage has a way out and restores use the compact form");
  }
  // Round 17: recommendation rotates; templates are editable, findable and pickable; every workout is reachable; coaches see loads.
  {
    const r19 = makeContext({ profile: { gender: "Male", age: 30, bodyweight: 200, createdAt: new Date().toISOString() } });
    const run19 = (code) => vm.runInContext(code, r19.context);
    run19("window.confirm = () => true; window.scrollTo = () => {}");
    const first = run19("todaysRecommendedPlan().muscle");
    run19("startWorkout(todaysRecommendedPlan().id); state.activeWorkout.exercises.forEach((exercise) => exercise.sets.forEach((set) => { set.weight = exercise.repsOnly ? '' : '50'; set.reps = '10'; set.done = true; })); stopTimer(); finishWorkout()");
    assert.notEqual(run19("todaysRecommendedPlan().muscle"), first, "the recommendation moves on after a workout");
    run19("builderDraft = [{ id: 'barbell-bench', sets: 3, reps: '8', rest: 90, dropSets: 0, group: '', setType: 'standard' }]; state.builderFormDraft.title = 'Pusg A'; saveBuilderTemplate()");
    const templateId = run19("state.customPlans[0].id");
    run19(`editCustomPlan('${templateId}'); state.builderFormDraft.title = 'Push A'; builderDraft.push({ id: 'pec-deck', sets: 3, reps: '12', rest: 60, dropSets: 0, group: '', setType: 'standard' }); saveBuilderTemplate()`);
    assert.equal(run19("state.customPlans.length"), 1, "editing a template replaces it");
    assert.equal(run19("state.customPlans[0].id"), templateId, "an edited template keeps its id");
    assert.equal(run19("state.customPlans[0].title + '|' + state.customPlans[0].exercises.length"), "Push A|2", "edits are saved");
    assert.ok(run19("renderPlans()").indexOf("Push A") < run19("renderPlans()").indexOf("Chest: Density + Shape"), "saved templates come first in Plans");
    run19(`chooseTodayWorkout('plan:${templateId}')`);
    assert.equal(run19("todaysSelectedPlan().id"), templateId, "Today can pick a saved template");
    run19("for (let i = 0; i < 40; i += 1) state.workoutLogs.push({ id: 'old-' + i, title: 'Old ' + i, date: new Date(Date.now() - (60 + i) * 86400000).toISOString(), sets: [{ exercise: 'Barbell Bench Press', exerciseId: 'barbell-bench', weight: '100', reps: '5' }], volume: 500 }); setView('history')");
    assert.ok(run19("renderContent()").includes("All workouts") && run19("renderContent()").includes("Show 15 more"), "every workout is reachable from History, 15 at a time");
    run19("showMoreWorkouts(); showMoreWorkouts()");
    assert.ok(run19("renderContent()").includes("Old 39") && !run19("renderContent()").includes("Show 15 more"), "paging reaches the oldest workout");
    run19("deleteLogEntry('workout', 'old-39')");
    assert.ok(!run19("state.workoutLogs.some((log) => log.id === 'old-39')"), "an old workout can be deleted from History");
    const summary = run19("JSON.stringify(workoutExerciseSummary({ sets: [{ exercise: 'Bench', weight: '225', reps: '5' }, { exercise: 'Bench', weight: '245', reps: '3' }, { exercise: 'Plank', weight: '', reps: '60' }] }))");
    assert.equal(summary, JSON.stringify([{ name: "Bench", sets: 2, weight: 245, reps: 3 }, { name: "Plank", sets: 1, weight: null, reps: 60 }]), "coach workout summary keeps the best set per exercise");
    assert.ok(!app.includes("report.workouts.slice(0, 8)"), "Logbook lists every workout in range");
    // Round 18 verification.
    assert.ok(app.includes("toLocaleString(reportNumberLocale())") && !/toLocaleString\(reportLocale\(\)\)/.test(app + toolkit), "PDF numbers use one format; only dates follow the device locale");
    run19("builderDraft = [{ id: 'barbell-bench', sets: 3, reps: '8', rest: 90, dropSets: 0, group: '', setType: 'standard' }]; state.builderFormDraft.title = 'Keep Me'; saveBuilderTemplate()");
    const keepId = run19("state.customPlans[0].id");
    run19(`state.customPlans[0].phase = 'prep'; state.customPlans[0].rest = 150; editCustomPlan('${keepId}'); cancelWorkout(); startCustomWorkout(); cancelWorkout()`);
    assert.equal(run19("state.builderEditingPlanId"), null, "starting a workout from the Builder ends template editing");
    run19(`editCustomPlan('${keepId}'); saveBuilderTemplate()`);
    assert.equal(run19("state.customPlans.find((plan) => plan.id === '" + keepId + "').phase + '|' + state.customPlans.find((plan) => plan.id === '" + keepId + "').rest"), "prep|150", "editing keeps the template's phase and rest");
    run19("state.phase = 'prep'; state.workoutLogs = []; state.customPlans = []");
    const prepSeen = new Set();
    for (let i = 0; i < 12; i += 1) {
      prepSeen.add(run19(`(() => { const plan = todaysRecommendedPlan(); state.workoutLogs.unshift({ id: 'rot-${i}', title: plan.title, date: new Date(Date.now() + ${i} * 60000).toISOString(), sets: plan.exercises.map(([id]) => ({ exercise: exerciseById(id).name, exerciseId: id, weight: '50', reps: '10' })) }); return plan.id; })()`));
    }
    assert.ok(prepSeen.size >= 5, `prep rotation reaches the prep plans (saw ${[...prepSeen].join(", ")})`);
    // Round 18 simulation findings.
    run19("state.phase = 'offseason'; state.workoutLogs = []; const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-US', { weekday: 'long' }); state.customPlans = [{ id: 'custom-legs', title: 'Legs DS', muscle: 'legs', phase: 'offseason', rest: 120, note: '', scheduleDay: tomorrow, exercises: [['barbell-squat', 3, '8', 120, 0, {}]] }]");
    assert.notEqual(run19("todaysRecommendedPlan().muscle"), "legs", "today avoids the muscle tomorrow's scheduled template trains");
    assert.ok(read("coach.js").includes("const pruneMissing = (list, incoming, apply = true, key = \"\") =>"), "coach copies mirror deletions inside each check-in's range");
    assert.ok(read("coach.js").includes("item.sourceId === plan.sourceId"), "re-opening a program doesn't duplicate templates");
    assert.ok(read("health.js").includes("saveWeight = function saveWeightReplacingHealthDay"), "a hand weigh-in replaces the day's Health reading");
    assert.ok(read("watch.js").includes("command.unit !== weightUnit()") && read("ios/MassMethodWatch/WatchWorkoutModel.swift").includes('"unit": current.unit'), "watch weights carry their unit");
    run19("state.workoutLogs = [{ id: 'gone-1', title: 'Old', date: new Date().toISOString(), sets: [] }]; deleteLogEntry('workout', 'gone-1')");
    assert.ok(run19("state.deletedLogs.some((item) => item.kind === 'workout' && item.id === 'gone-1')"), "deletions are remembered for the coach");
    assert.ok(read("coach.js").includes("deleted: (Array.isArray(state.deletedLogs) ? state.deletedLogs : []).filter(") && read("coach.js").includes("const tombstones = deletedByKind[kindOf[key]];"), "coach check-ins carry and apply deletions");
    // A re-sent program: identical templates are skipped, edited ones update in place.
    run19("window.confirm = () => true; state.customPlans = []");
    const program = (reps) => JSON.stringify({ format: "mass-method-program", version: 1, from: "Coach Kim", plans: [{ id: "custom-coach-1", title: "Push A", muscle: "chest", phase: "offseason", rest: 120, note: "x", scheduleDay: "Monday", exercises: [["barbell-bench", 3, reps, 120, 0, {}]] }] });
    run19(`handleIncomingFileText(${JSON.stringify(program("8"))})`);
    run19(`handleIncomingFileText(${JSON.stringify(program("8"))})`);
    assert.equal(run19("state.customPlans.length"), 1, "the same program opened twice doesn't duplicate");
    const firstId = run19("state.customPlans[0].id");
    run19(`handleIncomingFileText(${JSON.stringify(program("6-8"))})`);
    assert.equal(run19("state.customPlans.length + '|' + state.customPlans[0].exercises[0][2] + '|' + (state.customPlans[0].id === '" + firstId + "')"), "1|6-8|true", "an edited, re-sent template updates in place");
    // Round 19: weekly re-sends carry messages and schedule changes; legacy coach templates match.
    const program19 = (extra = {}, plan = {}) => JSON.stringify({ format: "mass-method-program", version: 1, from: "Coach Kim", ...extra, plans: [{ id: "custom-coach-1", title: "Push A", muscle: "chest", phase: "offseason", rest: 120, note: "x", scheduleDay: "Monday", exercises: [["barbell-bench", 3, "6-8", 120, 0, {}]], ...plan }] });
    run19(`handleIncomingFileText(${JSON.stringify(program19({ message: "Week 2: push the top sets." }))})`);
    assert.equal(run19("state.customPlans.length + '|' + (state.coachMessage && state.coachMessage.message)"), "1|Week 2: push the top sets.", "a re-send with only a new message still delivers it");
    run19(`handleIncomingFileText(${JSON.stringify(program19({}, { scheduleDay: "Tuesday" }))})`);
    assert.equal(run19("state.customPlans.length + '|' + state.customPlans[0].scheduleDay"), "1|Tuesday", "a schedule-only change arrives");
    run19("state.customPlans.push({ id: 'coach-legacy', title: 'Pull B', muscle: 'back', phase: 'offseason', rest: 120, note: '', scheduleDay: '', fromCoach: 'Coach Kim', exercises: [['lat-pulldown', 3, '10', 90, 0, {}]] })");
    run19(`handleIncomingFileText(${JSON.stringify(JSON.stringify({ format: "mass-method-program", version: 1, from: "Coach Kim", plans: [{ id: "custom-coach-2", title: "Pull B", muscle: "back", phase: "offseason", rest: 120, note: "", exercises: [["lat-pulldown", 3, "10", 90, 0, {}]] }] }))})`);
    assert.equal(run19("state.customPlans.filter((plan) => plan.title === 'Pull B').length + '|' + state.customPlans.find((plan) => plan.title === 'Pull B').sourceId"), "1|custom-coach-2", "coach templates from before source ids are matched, not duplicated");
    assert.ok(run19("renderToday()").includes("1 updated workout in Plans"), "the coach note says a workout was updated, not added");
    // Editing a template to or from Road Gym changes its phase.
    run19("state.customPlans = []; builderDraft = [{ id: 'incline-db-press', sets: 3, reps: '12', rest: 60, dropSets: 0, group: '', setType: 'standard' }]; state.builderFormDraft.title = 'Hotel'; state.builderFormDraft.muscle = 'chest'; saveBuilderTemplate()");
    const hotelId = run19("state.customPlans[0].id");
    run19(`editCustomPlan('${hotelId}'); state.builderFormDraft.muscle = 'travel'; saveBuilderTemplate()`);
    assert.equal(run19("state.customPlans[0].phase"), "travel", "a template edited to Road Gym becomes a Road Gym template");
    run19(`editCustomPlan('${hotelId}'); state.builderFormDraft.muscle = 'chest'; saveBuilderTemplate()`);
    assert.notEqual(run19("state.customPlans[0].phase"), "travel", "a template edited away from Road Gym leaves the travel phase");
    // Removing an exercise keeps the open Edit panel on its own card.
    run19("startWorkout('chest-density'); openExerciseOptions = 2; removeLiveExercise(0)");
    assert.equal(run19("openExerciseOptions"), 1, "the open Edit panel follows its exercise after a removal");
    run19("state.activeWorkout.exercises[0].sets[0].weight = '100'; state.activeWorkout.exercises[0].sets[0].reps = '8'; window.confirm = () => false; openExerciseOptions = 2; removeLiveExercise(0); window.confirm = () => true");
    assert.equal(run19("openExerciseOptions"), 2, "a cancelled removal leaves the panel alone");
    run19("cancelWorkout()");
    // Road Gym: Today recommends a plan the profile can run.
    run19("state.customPlans = []; state.workoutLogs = []; state.phase = 'offseason'; state.activeEquipmentProfileId = 'road-gym'");
    assert.ok(run19("(() => { const profile = activeEquipmentProfile(); return todaysRecommendedPlan().exercises.every(([id]) => exerciseMatchesEquipmentProfile(exerciseById(id), profile)); })()"), "Today's pick fits the active equipment profile");
    run19("state.activeEquipmentProfileId = 'all-equipment'");
    // Overnight workouts are logged when the sets were done.
    run19("startWorkout('chest-density'); const ex19 = state.activeWorkout.exercises[0]; ex19.sets[0].weight = '100'; ex19.sets[0].reps = '8'; completeSet(0, 0); stopTimer(); state.activeWorkout.startedAt = new Date(Date.now() - 20 * 3600000).toISOString(); state.activeWorkout.lastSetAt = Date.now() - 19 * 3600000; finishWorkout()");
    assert.ok(Math.abs(run19("Date.parse(state.workoutLogs[0].date)") - (Date.now() - 19 * 3600000)) < 5 * 60000, "a workout finished the next morning is dated by its last set");
    // Archiving keeps the start weigh-in.
    run19("state.profile.createdAt = new Date(Date.now() - 500 * 86400000).toISOString(); state.weightLogs = [{ id: 'now', date: new Date().toISOString(), bodyweight: 205 }, { id: 'mid', date: new Date(Date.now() - 400 * 86400000).toISOString(), bodyweight: 202 }, { id: 'start', date: new Date(Date.now() - 499 * 86400000).toISOString(), bodyweight: 195, note: 'Starting profile' }]; lastBackupExportAt = Date.now(); archiveOldHistory()");
    assert.equal(run19("state.weightLogs.map((entry) => entry.id).join(',') + '|' + stats().weightDelta"), "now,start|10.0", "archiving keeps the start weigh-in and the change from start");
  // Round 19: a day-old rest screen is not shown again; coach copies never resurrect deletions.
  {
    const stale = makeContext({ profile: { bodyweight: 200 }, timer: { seconds: 90, running: true, fullscreen: true, startedAt: Date.now() - 86400000 - 90000, endsAt: Date.now() - 86400000 } });
    assert.equal(vm.runInContext("state.timer.fullscreen", stale.context), false, "a rest that ended a day ago doesn't reopen its overlay");
    const recent = makeContext({ profile: { bodyweight: 200 }, timer: { seconds: 90, running: true, fullscreen: true, startedAt: Date.now() - 120000, endsAt: Date.now() - 30000 } });
    assert.equal(vm.runInContext("state.timer.fullscreen", recent.context), true, "a rest that just ended still shows Rest complete");
    const day = 86400000;
    const base19 = { ...pkg, rangeDays: 14, weightLogs: [], weeklyCheckIns: [], prepLogs: [], photos: [] };
    const keepLog = { id: "keep-1", title: "Kept", date: new Date(Date.now() - 2 * day).toISOString(), sets: [] };
    const goneLog = { id: "gone-19", title: "Mistake", date: new Date(Date.now() - 6 * day).toISOString(), sets: [] };
    const older = { ...base19, generatedAt: new Date(Date.now() - 5 * day).toISOString(), workoutLogs: [goneLog], deleted: [] };
    const newerPkg = { ...base19, generatedAt: new Date().toISOString(), workoutLogs: [keepLog], deleted: [{ kind: "workout", id: "gone-19" }] };
    const coachA = makeContext({ profile: { bodyweight: 210 }, coach: { enabled: true, name: "Kim", athletes: {} } });
    await vm.runInContext(`importCoachPackage(${JSON.stringify({ ...newerPkg, deleted: [] })})`, coachA.context);
    await vm.runInContext(`importCoachPackage(${JSON.stringify(older)})`, coachA.context);
    assert.equal(vm.runInContext("coachAthletes()[0].workoutLogs.map((log) => log.id).join(',')", coachA.context), "keep-1", "an older check-in opened after a newer one doesn't bring back a deleted workout");
    const coachB = makeContext({ profile: { bodyweight: 210 }, coach: { enabled: true, name: "Kim", athletes: {} } });
    await vm.runInContext(`importCoachPackage(${JSON.stringify(older)})`, coachB.context);
    await vm.runInContext(`importCoachPackage(${JSON.stringify(newerPkg)})`, coachB.context);
    await vm.runInContext(`importCoachPackage(${JSON.stringify(older)})`, coachB.context);
    assert.equal(vm.runInContext("coachAthletes()[0].workoutLogs.map((log) => log.id).join(',')", coachB.context), "keep-1", "re-opening an old check-in doesn't bring back a deleted workout");
    const reload = makeContext(JSON.parse(coachB.storage.get("stageforge-v1")));
    assert.equal(vm.runInContext("coachAthletes()[0].deleted.length", reload.context), 1, "the coach keeps the athlete's deletions across reloads");
    // Round 20: rotation still covers every muscle on a limited profile; packages' own lists beat stale deletions.
    {
      const rot = makeContext({ profile: { gender: "Male", age: 30, bodyweight: 200, createdAt: new Date().toISOString() }, activeEquipmentProfileId: "road-gym" });
      const runRot = (code) => vm.runInContext(code, rot.context);
      runRot("window.confirm = () => true; state.activeEquipmentProfileId = 'road-gym'; state.workoutLogs = []");
      const seen = new Set();
      for (let i = 0; i < 10; i += 1) {
        seen.add(runRot(`(() => { const plan = todaysRecommendedPlan(); state.workoutLogs.unshift({ id: 'rg-${i}', title: plan.title, date: new Date(Date.now() - (20 - ${i}) * 86400000).toISOString(), sets: plan.exercises.map(([id]) => ({ exercise: exerciseById(id).name, exerciseId: id, weight: '50', reps: '10' })) }); return plan.title; })()`));
      }
      assert.ok(seen.size >= 4, `Road Gym recommendations rotate (saw ${[...seen].join(", ")})`);
      const hkPkg = { ...base19, generatedAt: new Date().toISOString(), workoutLogs: [], weightLogs: [{ id: "hk-day-2026-10-05", date: new Date(Date.now() - day).toISOString(), bodyweight: 180 }], deleted: [{ kind: "weight", id: "hk-day-2026-10-05" }] };
      const coachC = makeContext({ profile: { bodyweight: 210 }, coach: { enabled: true, name: "Kim", athletes: {} } });
      await vm.runInContext(`importCoachPackage(${JSON.stringify(hkPkg)})`, coachC.context);
      assert.equal(vm.runInContext("coachAthletes()[0].weightLogs.length", coachC.context), 1, "a package's own entries beat its stale deletion records");
      const athlete20 = makeContext({ profile: { bodyweight: 200 }, weightLogs: [{ id: "hk-day-x", date: new Date().toISOString(), bodyweight: 180 }], deletedLogs: [{ kind: "weight", id: "hk-day-x", at: new Date().toISOString() }] });
      const msg = makeContext({ profile: { bodyweight: 200 } });
      const runMsg = (code) => vm.runInContext(code, msg.context);
      let asked = 0;
      msg.context.window.confirm = () => { asked += 1; return true; };
      const prog20 = (message) => JSON.stringify(JSON.stringify({ format: "mass-method-program", version: 1, from: "Coach Kim", message, plans: [{ id: "p1", title: "Push A", muscle: "chest", phase: "offseason", rest: 120, note: "x", exercises: [["barbell-bench", 3, "8", 120, 0, {}]] }] }));
      runMsg(`handleIncomingFileText(${prog20("Week 1")})`);
      runMsg(`handleIncomingFileText(${prog20("Week 2")})`);
      assert.equal(runMsg("state.view + '|' + state.coachMessage.message"), "today|Week 2", "a message-only re-send opens Today, where the note is shown");
      runMsg("dismissCoachMessage()");
      const before = asked;
      runMsg(`handleIncomingFileText(${prog20("Week 2")})`);
      assert.equal(asked, before, "a dismissed note is not offered again as new");
      assert.equal(JSON.parse(JSON.stringify(await vm.runInContext("buildCoachPackage(14)", athlete20.context))).deleted.length, 0, "check-ins don't list entries the athlete still has as deleted");
    }
    // Round 20 simulations: restore errors are visible; file restores bring photos back; deload preview.
    {
      const nb = makeContext({ profile: { bodyweight: 200 }, backupStatus: { message: "Backed up to iCloud.", at: new Date().toISOString() } });
      const runNb = (code) => vm.runInContext(code, nb.context);
      runNb("var posts20 = []; var toasts20 = []; window.webkit = { messageHandlers: { peaksetBackup: { postMessage(m) { posts20.push(m); } } } }; window.location = { reload() {} }; toast = (m) => toasts20.push(m)");
      runNb("handleNativeBackup({ status: 'error', kind: 'restore', message: 'The backup is still downloading.' })");
      assert.ok(runNb("toasts20.some((m) => m.startsWith('Restore failed'))") && runNb("state.backupStatus.message") === "Backed up to iCloud.", "a failed restore is shown and leaves the backup status alone");
      runNb("restoreBackupPayload({ format: BACKUP_FORMAT, state: { profile: { bodyweight: 200 }, progressPhotos: [{ id: 'p1', pose: 'front-relaxed', date: new Date().toISOString(), storage: 'native' }] } })");
      assert.ok(runNb("posts20.some((m) => m.action === 'restorePhotos')"), "restoring a backup file asks iOS to bring the photos back from iCloud Drive");
      assert.ok(read("photos.js").includes('onerror="photoMissing(this)"') && read("ios/PeakSet/PeakSetWebView.swift").includes('case "restorePhotos":'), "missing photo files show a placeholder, and native handles restorePhotos");
      const dl = makeContext({ profile: { bodyweight: 200 } });
      vm.runInContext("state.trainingBlock = { id: 'b', name: 'B', startDate: dateKey(addDays(startOfWeek(), -21)), accumulationWeeks: 3, deload: true, focus: [], createdAt: new Date().toISOString() }", dl.context);
      assert.equal(vm.runInContext("blockWeekInfo().deload && todayPreviewPlan(planTemplates.find((plan) => plan.id === 'chest-density')).exercises[0][1] === Math.ceil(normalizePlanExercise(planTemplates.find((plan) => plan.id === 'chest-density').exercises[0]).sets / 2)", dl.context), true, "Today shows the halved deload sets that Start will load");
    }
    // Round 21: garage profiles rotate; quarter-step loads stay exact; legacy matching is order-independent.
    {
      const g = makeContext({ profile: { gender: "Male", age: 30, bodyweight: 200, createdAt: new Date().toISOString() } });
      const runG = (code) => vm.runInContext(code, g.context);
      runG("state.equipmentProfiles.push({ id: 'garage', name: 'Garage', equipment: ['Barbell', 'Dumbbells', 'Bench', 'Rack', 'Plates', 'Pull-up bar', 'Bodyweight'] }); state.activeEquipmentProfileId = 'garage'; state.workoutLogs = []; state.phase = 'offseason'");
      const garageSeen = new Set();
      for (let i = 0; i < 10; i += 1) {
        garageSeen.add(runG(`(() => { const plan = todaysRecommendedPlan(); state.workoutLogs.unshift({ id: 'g-${i}', title: plan.title, date: new Date(Date.now() - (20 - ${i}) * 86400000).toISOString(), sets: plan.exercises.map(([id]) => ({ exercise: exerciseById(id).name, exerciseId: id, weight: '50', reps: '10' })) }); return plan.muscle; })()`));
      }
      assert.ok(garageSeen.size >= 4, `a garage profile rotates muscles (saw ${[...garageSeen].join(", ")})`);
      assert.ok(read("toolkit.js").includes("Number.isInteger(Math.round(bestWeight * 400) / 100) ? 2 : 1"), "progression copy keeps quarter-step loads like 61.25 exact");
      const lg = makeContext({ profile: { bodyweight: 200 } });
      const runLg = (code) => vm.runInContext(code, lg.context);
      runLg("window.confirm = () => true; state.customPlans = [{ id: 'mon', title: 'Push', muscle: 'chest', phase: 'offseason', rest: 120, note: 'From Coach Kim', scheduleDay: 'Monday', fromCoach: 'Coach Kim', exercises: [['barbell-bench', 4, '8', 120, 0, { group: '', setType: 'standard' }]] }, { id: 'thu', title: 'Push', muscle: 'chest', phase: 'offseason', rest: 120, note: 'From Coach Kim', scheduleDay: 'Thursday', fromCoach: 'Coach Kim', exercises: [['barbell-bench', 3, '8', 120, 0, { group: '', setType: 'standard' }]] }]");
      const legacyPlan = (id, sets, day) => ({ id, title: "Push", muscle: "chest", phase: "offseason", rest: 120, note: "", scheduleDay: day, exercises: [["barbell-bench", sets, "8", 120, 0, {}]] });
      runLg(`handleIncomingFileText(${JSON.stringify(JSON.stringify({ format: "mass-method-program", version: 1, from: "Coach Kim", plans: [legacyPlan("c-thu", 5, "Thursday"), legacyPlan("c-mon", 4, "Monday")] }))})`);
      assert.equal(runLg("state.customPlans.map((plan) => plan.id + ':' + plan.exercises[0][1]).join(',')"), "mon:4,thu:5", "an unchanged legacy template keeps its slot when another same-titled one changes");
    }
    // Round 22: storage failures outrank "saved" toasts; restore screen says when nothing is found; clock skew.
    {
      const sf = makeContext({ profile: { bodyweight: 200 } });
      const runSf = (code) => vm.runInContext(code, sf.context);
      runSf("var shown22 = []; document.querySelector = (sel) => (sel === '.toast' ? shown22[shown22.length - 1] || null : null); document.createElement = () => { const el = { dataset: {}, className: '', textContent: '', setAttribute() {}, remove() { shown22 = shown22.filter((item) => item !== el); } }; return el; }; document.body.appendChild = (el) => shown22.push(el); localStorage.setItem = () => { throw new Error('QuotaExceededError'); }");
      assert.equal(runSf("saveState()"), false, "saveState reports a failed write");
      runSf("toast('Workout saved.')");
      assert.ok(runSf("shown22[shown22.length - 1].textContent").startsWith("Storage is full"), "a storage-full warning is not replaced by a success toast");
      runSf("shown22.forEach((el) => el.remove()); toast('Workout saved.')");
      assert.equal(runSf("shown22.length"), 0, "no 'saved' message is shown while saves are failing");
      const rs = makeContext(null);
      const runRs = (code) => vm.runInContext(code, rs.context);
      runRs("window.webkit = { messageHandlers: { peaksetBackup: { postMessage() {} } } }; openOnboardingRestore(true); handleNativeBackup({ status: 'list', backups: [] })");
      assert.ok(runRs("renderOnboarding()").includes("No backups found") && !runRs("renderOnboarding()").includes("Back Up Now"), "a new phone with no backups is told so, without backup-only buttons");
      const sk = makeContext({ profile: { bodyweight: 200 }, timer: { seconds: 90, total: 90, running: true, fullscreen: false, startedAt: Date.now(), endsAt: Date.now() + 86400000 } });
      const sk2 = makeContext({ profile: { bodyweight: 200 }, timer: { seconds: 90, total: 90, left: 30, running: true, fullscreen: false, startedAt: Date.now(), endsAt: Date.now() + 86400000 } });
      assert.ok(vm.runInContext("state.timer.left", sk2.context) <= 30, "the clock-skew clamp keeps the time that was left");
      assert.ok(vm.runInContext("state.timer.left", sk.context) <= 90, "a rest saved before the clock moved back stays within its length");
    }
    // Round 23: a "Drop set" typed working row is a drop; finished picks give way; undo cancels its rest.
    {
      const d = makeContext({ profile: { bodyweight: 200 } });
      const runD = (code) => vm.runInContext(code, d.context);
      runD("window.confirm = () => true; window.scrollTo = () => {}; state.workoutLogs = [{ id: 'b1', title: 'Bench', date: new Date(Date.now() - 2 * 86400000).toISOString(), sets: [1, 2, 3].map((n) => ({ exercise: 'Barbell Bench Press', exerciseId: 'barbell-bench', weight: '225', reps: '12', rir: '1', setType: 'standard', label: String(n), targetReps: '8-12' })).concat([{ exercise: 'Barbell Bench Press', exerciseId: 'barbell-bench', weight: '165', reps: '7', rir: '', setType: 'drop', label: '4', targetReps: '8-12' }]) }]");
      assert.ok(runD("progressionSuggestion({ id: 'barbell-bench', name: 'Barbell Bench Press', targetReps: '8-12', sets: [] })").includes("Try "), "a working row typed as a drop set doesn't block progression");
      runD("state.workoutLogs = [{ id: 'b2', title: 'Bench', date: new Date(Date.now() - 2 * 86400000).toISOString(), sets: [1, 2, 3].map((n) => ({ exercise: 'Barbell Bench Press', exerciseId: 'barbell-bench', weight: '225', reps: '12', rir: '1', setType: 'drop', label: String(n), targetReps: '8-12' })) }]");
      assert.ok(runD("progressionSuggestion({ id: 'barbell-bench', name: 'Barbell Bench Press', targetReps: '8-12', sets: [] })").includes("Try "), "a template whose rows are all typed Drop set still progresses");
      assert.equal(runD("setHardSetValue({ setType: 'drop' })"), 1, "a working row typed Drop set is a full hard set (only D rows count half)");
      runD("chooseTodayWorkout('plan:chest-density'); startWorkout(todaysSelectedPlan().id); state.activeWorkout.exercises.forEach((exercise) => exercise.sets.forEach((set) => { set.weight = exercise.repsOnly ? '' : '50'; set.reps = '10'; set.done = true; })); stopTimer(); finishWorkout()");
      assert.equal(runD("state.todayWorkoutPick + '|' + (state.todayPlanId === null) + '|' + (todaysSelectedPlan().id !== 'chest-density')"), "recommended|true|true", "after a picked workout is finished, Today's picker and card both move on");
      runD("chooseTodayWorkout('plan:chest-density')");
      assert.equal(runD("todaysSelectedPlan().id"), "chest-density", "the same workout can be picked again for a second session");
      runD("startWorkout('back-thickness'); const ex23 = state.activeWorkout.exercises[0]; ex23.sets[0].weight = '100'; ex23.sets[0].reps = '8'; completeSet(0, 0)");
      assert.equal(runD("state.timer.running"), true, "completing a set starts its rest");
      runD("completeSet(0, 0)");
      assert.equal(runD("state.timer.running"), false, "undoing that set cancels its rest");
      runD("const exB = state.activeWorkout.exercises[0]; exB.sets[0].weight = '100'; exB.sets[0].reps = '8'; completeSet(0, 0); var firstEnd = state.timer.endsAt; exB.sets[1].weight = '100'; exB.sets[1].reps = '8'; completeSet(0, 1); completeSet(0, 1)");
      assert.ok(runD("state.timer.running && Math.abs(state.timer.endsAt - firstEnd) < 1500"), "undoing a mis-tapped set brings back the rest it replaced");
    }
    // Round 24: same-day templates, body fat from weigh-ins, every entry deletable.
    {
      const sd = makeContext({ profile: { bodyweight: 200, createdAt: new Date().toISOString() } });
      const runSd = (code) => vm.runInContext(code, sd.context);
      runSd("window.confirm = () => true; var today24 = new Date().toLocaleDateString('en-US', { weekday: 'long' }); state.customPlans = [{ id: 'pull', title: 'Pull', muscle: 'back', phase: 'offseason', rest: 90, note: '', scheduleDay: today24, scheduledAt: Date.now() - 60000, exercises: [['lat-pulldown', 3, '10', 90, 0, {}]] }, { id: 'push', title: 'Push', muscle: 'chest', phase: 'offseason', rest: 90, note: '', scheduleDay: '', exercises: [['barbell-bench', 3, '8', 120, 0, {}]] }]; updateCustomPlanSchedule('push', today24)");
      assert.equal(runSd("todaysRecommendedPlan().id"), "push", "the template just scheduled for today is the one Today shows");
      runSd("state.workoutLogs.unshift({ id: 'done-push', title: 'Push', date: new Date().toISOString(), sets: [] })");
      assert.equal(runSd("todaysRecommendedPlan().id"), "pull", "after it is done, the other template scheduled today is offered");
      runSd("state.measurements = [{ id: 'm1', date: new Date(Date.now() - 30 * 86400000).toISOString(), bodyFat: 16 }]; state.weightLogs = [{ id: 'hk-day-x', date: new Date().toISOString(), bodyweight: 190, bodyFat: 12.4, source: 'healthkit' }]");
      assert.equal(runSd("latestMeasurementValue('bodyFat')"), 12.4, "the Body Fat % tile uses the newest reading, including smart-scale weigh-ins");
      runSd("state.weightLogs = Array.from({ length: 12 }, (_, i) => ({ id: 'w' + i, date: new Date(Date.now() - i * 86400000).toISOString(), bodyweight: 200 - i })); toggleAllRecentEntries(); setView('progress')");
      assert.ok(runSd("renderContent()").includes("deleteLogEntry('weight', 'w11')") || runSd("renderContent()").includes("'w11'"), "Show all entries reaches the oldest weigh-in's Delete");
    }
    // Round 25: a coach-scheduled workout for today wins over an older athlete schedule; failure toasts still show.
    {
      const cs = makeContext({ profile: { bodyweight: 200, createdAt: new Date().toISOString() } });
      const runCs = (code) => vm.runInContext(code, cs.context);
      runCs("window.confirm = () => true; var day25 = new Date().toLocaleDateString('en-US', { weekday: 'long' }); state.customPlans = [{ id: 'mine', title: 'My Push', muscle: 'chest', phase: 'offseason', rest: 90, note: '', scheduleDay: '', exercises: [['barbell-bench', 3, '8', 120, 0, {}]] }]; updateCustomPlanSchedule('mine', day25)");
      runCs(`handleIncomingFileText(JSON.stringify({ format: 'mass-method-program', version: 1, from: 'Coach Kim', plans: [{ id: 'c-legs', title: 'Coach Legs', muscle: 'legs', phase: 'offseason', rest: 120, note: '', scheduleDay: day25, exercises: [['barbell-squat', 3, '8', 120, 0, {}]] }] }))`);
      assert.equal(runCs("todaysRecommendedPlan().title"), "Coach Legs", "the coach's newly scheduled workout is today's workout");
      runCs("var shown25 = []; document.querySelector = (sel) => null; document.createElement = () => ({ dataset: {}, setAttribute() {}, remove() {} }); document.body.appendChild = (el) => shown25.push(el.textContent); localStorage.setItem = () => { throw new Error('full'); }; saveState(); shown25 = []; toast('The photo could not be saved.'); toast('That weigh-in is already saved.'); toast('Workout saved.')");
      assert.equal(runCs("shown25.join('|')"), "The photo could not be saved.|That weigh-in is already saved.", "failure and guard messages still show while saves fail; success claims don't");
    }
    // Round 27: a deleted tape measurement leaves the coach's "latest"; a re-opened program doesn't re-queue its block.
    {
      const at = makeContext({ profile: { bodyweight: 200, gender: "Female", age: 30 }, athleteName: "Ana", measurements: [{ id: "m-good", date: new Date(Date.now() - 8 * 86400000).toISOString(), waist: 27 }] });
      const runAt = (code) => vm.runInContext(code, at.context);
      const coach27 = makeContext({ profile: { bodyweight: 210 }, coach: { enabled: true, name: "Kim", athletes: {} } });
      const send = async () => vm.runInContext(`importCoachPackage(${JSON.stringify(JSON.parse(JSON.stringify(await vm.runInContext("buildCoachPackage(14)", at.context))))})`, coach27.context);
      await send();
      runAt("window.confirm = () => true; state.measurements.unshift({ id: 'm-typo', date: new Date(Date.now() - 86400000).toISOString(), waist: 2.65 })");
      await send();
      assert.equal(vm.runInContext("coachAthletes()[0].measurements[0].waist", coach27.context), 2.65, "the coach first sees the newest measurement");
      runAt("deleteLogEntry('measurement', 'm-typo')");
      await send();
      assert.equal(vm.runInContext("coachAthletes()[0].measurements[0].waist", coach27.context), 27, "a deleted tape measurement is no longer the coach's latest");
      const pb = makeContext({ profile: { bodyweight: 200 } });
      let asks = 0;
      pb.context.window.confirm = () => { asks += 1; return true; };
      const prog27 = JSON.stringify(JSON.stringify({ format: "mass-method-program", version: 1, from: "Coach Kim", block: { name: "Kim block", accumulationWeeks: 4, focus: ["chest"], start: "now" }, plans: [{ id: "p27", title: "Push", muscle: "chest", phase: "offseason", rest: 120, note: "x", exercises: [["barbell-bench", 3, "8", 120, 0, {}]] }] }));
      vm.runInContext(`handleIncomingFileText(${prog27})`, pb.context);
      const blockId = vm.runInContext("state.trainingBlock && state.trainingBlock.id", pb.context);
      const before27 = asks;
      vm.runInContext(`handleIncomingFileText(${prog27})`, pb.context);
      assert.equal(vm.runInContext("state.trainingBlock.id", pb.context) + "|" + (asks - before27), blockId + "|0", "re-opening the same program doesn't replace or re-queue its block");
    }
    console.log("Audit round 19 checks passed.");
  }
  }
  // Round 17 App Store readiness.
  assert(read("settings.js").includes("<h2>Privacy policy</h2>"), "A privacy policy must be reachable in the app (5.1.1)");
  assert(read("index.html").includes("maximum-scale=1.0, user-scalable=no"), "The app must not pinch-zoom like a web page");
  assert(styles.includes("-webkit-touch-callout: none;") && styles.includes("-webkit-tap-highlight-color: transparent;"), "No text-selection callouts or tap flash on UI chrome");
  assert(infoPlist.includes("<key>UIUserInterfaceStyle</key>\n\t<string>Dark</string>"), "System dialogs must match the dark app");
  assert(!/cardioType \|\| "Activity"\)/.test(toolkit.replace(/cardioType === "HealthKit" \? "Apple Health steps" : entry\.cardioType \|\| "Activity"/g, "")), "Users see Apple Health, not HealthKit");
  console.log("Audit round 12 checks passed.");
}
}
