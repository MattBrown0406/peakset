#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");

function makeContext(storedState = null) {
  const storage = new Map();
  if (storedState !== null) storage.set("stageforge-v1", JSON.stringify(storedState));
  const elements = new Map();
  const rootElement = { innerHTML: "" };
  const document = {
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
    URL
  });
  vm.runInContext(source, context, { filename: "app.js" });
  return { context, elements, storage };
}

for (const file of ["index.html", "app.js", "styles.css", "assets/physique-lines.svg"]) {
  const canonical = fs.readFileSync(path.join(root, file));
  const bundled = fs.readFileSync(path.join(root, "ios/PeakSet/Web", file));
  assert.deepEqual(bundled, canonical, `${file} is out of sync with the iOS bundle`);
}

const appSwift = fs.readFileSync(path.join(root, "ios/PeakSet/PeakSetApp.swift"), "utf8");
assert.match(appSwift, /applicationSupportsShakeToEdit\s*=\s*false/, "iOS shake-to-undo must stay disabled");

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
assert.deepEqual(Array.from(vm.runInContext("Object.values(state.activeWorkout.exercises.at(-1)).slice(2, 6)", live.context)), [4, 1, "12-15", 75], "live additions must use whole-number sets/drop sets and retain reps/rest");
assert.equal(vm.runInContext("addExerciseToActiveWorkout()", live.context), false, "duplicate live exercises must be rejected");
assert.equal(vm.runInContext("state.activeWorkout.exercises.length", live.context), beforeAdd + 1, "a duplicate exercise must not mutate the workout");
live.elements.get("activeExerciseToAdd").value = "missing-exercise";
assert.equal(vm.runInContext("addExerciseToActiveWorkout()", live.context), false, "unknown exercise IDs must be rejected");
assert.equal(vm.runInContext("state.activeWorkout.exercises.length", live.context), beforeAdd + 1, "a rejected exercise must not mutate the workout");

const travel = makeContext();
vm.runInContext("startWorkout('road-gym-full')", travel.context);
assert.equal(vm.runInContext("activeWorkoutExerciseOptions().every((exercise) => exercise.hotel)", travel.context), true, "Road Gym live suggestions must remain travel-ready");

const malformed = makeContext({ profile: { bodyweight: 200 }, customPlans: null, workoutLogs: {}, weightLogs: "bad", measurements: null });
assert.equal(vm.runInContext("Array.isArray(state.customPlans) && Array.isArray(state.workoutLogs) && Array.isArray(state.weightLogs) && Array.isArray(state.measurements)", malformed.context), true, "legacy collection fields must normalize without wiping the profile");
assert.equal(vm.runInContext("state.profile.bodyweight", malformed.context), 200, "normalization must preserve valid profile data");

const timer = makeContext({ timer: { seconds: 90, left: 0, running: false, startedAt: null, endsAt: null } });
assert.equal(vm.runInContext("state.timer.seconds", timer.context), 90, "the selected rest duration must survive reload");

console.log(`PeakSet validation passed: ${catalog.exerciseIds.length} exercises, ${catalog.planIds.length} plans, state and workout regression checks.`);
