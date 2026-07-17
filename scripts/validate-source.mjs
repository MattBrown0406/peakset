import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readBuffer = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const app = read("app.js");
const toolkit = read("toolkit.js");
const styles = read("styles.css");
const swiftApp = read("ios/PeakSet/PeakSetApp.swift");
const swiftWebView = read("ios/PeakSet/PeakSetWebView.swift");
const nativeServices = read("ios/PeakSet/PeakSetNativeServices.swift");
const xcodeProject = read("ios/PeakSet.xcodeproj/project.pbxproj");
const infoPlist = read("ios/PeakSet/Info.plist");
const entitlements = read("ios/PeakSet/PeakSet.entitlements");

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
assert(xcodeProject.includes("PeakSetNativeServices.swift in Sources"), "Native services are not in the Xcode source phase");
assert(xcodeProject.includes("CODE_SIGN_ENTITLEMENTS = PeakSet/PeakSet.entitlements"), "HealthKit entitlements are not configured for signing");
assert(infoPlist.includes("NSHealthShareUsageDescription") && infoPlist.includes("NSHealthUpdateUsageDescription"), "HealthKit privacy descriptions are missing");
assert(entitlements.includes("com.apple.developer.healthkit"), "HealthKit entitlement is missing");

for (const filename of ["app.js", "toolkit.js", "styles.css", "index.html"]) {
  assert.equal(read(filename), read(`ios/PeakSet/Web/${filename}`), `${filename} is not synced into the iOS bundle`);
}
assert.deepEqual(readBuffer("assets/boxing-bell.wav"), readBuffer("ios/PeakSet/Web/assets/boxing-bell.wav"), "Boxing bell audio is not synced into the iOS bundle");
assert.deepEqual(readBuffer("assets/boxing-bell.wav"), readBuffer("ios/PeakSet/boxing-bell.wav"), "Native notification bell is not synced");

console.log(`Validated ${exercises.length} exercises and ${plans.length} workout templates.`);
console.log(`Incline Y-Raise is present in ${shoulderPlans.length} shoulder workout templates.`);
console.log("Abs session rows are reps-only and shake-to-undo is disabled.");
console.log("Timer bell asset, audio unlock, and iOS audio-session recovery are configured.");
console.log("Bodybuilder toolkit, native background timer, and HealthKit bridges are configured.");
