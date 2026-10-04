"use strict";

// Apple Watch and Lock Screen: publishes the live workout to the watch app,
// applies commands the watch sends back, and supplies the rest-timer Live
// Activity details. Loaded after volume.js.

const WATCH_SNAPSHOT_VERSION = 1;
let lastWatchSnapshot = "";
let watchPublishTimer = null;

function watchMigrateState() {
  if (typeof state.liveActivityEnabled !== "boolean") state.liveActivityEnabled = true;
}

watchMigrateState();

function nativeWatchBridge() {
  return window.webkit?.messageHandlers?.peaksetWatch || null;
}

function firstNumber(text, fallback) {
  const match = String(text || "").match(/\d+/);
  return match ? match[0] : fallback;
}

function suggestedSetValues(exercise, setIndex) {
  const set = exercise.sets[setIndex];
  const doneSets = exercise.sets.filter((item) => item.done);
  const lastDone = doneSets.at(-1);
  const previous = typeof lastExercisePerformance === "function" ? lastExercisePerformance(exercise.id) : null;
  const previousSet = previous?.sets?.filter((item) => Boolean(item.dropSet) === Boolean(set?.dropSet))?.[Math.min(setIndex, (previous?.sets?.length || 1) - 1)];
  return {
    weight: String(set?.weight || lastDone?.weight || previousSet?.weight || ""),
    reps: String(set?.reps || lastDone?.reps || previousSet?.reps || firstNumber(exercise.targetReps, "8"))
  };
}

function currentWatchExerciseIndex(workout) {
  const timerIndex = state.timer.running ? state.timer.exerciseIndex : null;
  if (Number.isInteger(timerIndex) && workout.exercises[timerIndex]?.sets.some((set) => !set.done)) return timerIndex;
  const index = workout.exercises.findIndex((exercise) => exercise.sets.some((set) => !set.done));
  return index === -1 ? Math.max(0, workout.exercises.length - 1) : index;
}

function buildWatchSnapshot() {
  const workout = state.activeWorkout;
  const info = typeof blockWeekInfo === "function" ? blockWeekInfo() : null;
  const blockLine = info?.status === "active" ? (info.deload ? "Deload" : `${info.targetRir} RIR`) : "";
  if (!workout) {
    const next = typeof todaysSelectedPlan === "function" ? todaysSelectedPlan() : null;
    return {
      version: WATCH_SNAPSHOT_VERSION, active: false, workoutId: "", title: "", unit: weightUnit(), blockLine,
      completedSets: 0, totalSets: 0, currentExercise: 0, exercises: [],
      rest: { running: false, startedAt: null, endsAt: null }, nextPlanTitle: next?.title || ""
    };
  }
  const exercises = workout.exercises.map((exercise, index) => {
    const nextSetIndex = Math.max(0, exercise.sets.findIndex((set) => !set.done));
    const suggestion = suggestedSetValues(exercise, nextSetIndex);
    return {
      index,
      id: exercise.id,
      rest: Number(exercise.rest) || DEFAULT_REST_SECONDS,
      name: exercise.name,
      targetReps: String(exercise.targetReps || ""),
      repsOnly: isRepsOnlyExercise(exercise),
      suggestedWeight: suggestion.weight,
      suggestedReps: suggestion.reps,
      sets: exercise.sets.map((set, setIndex) => ({
        index: setIndex,
        label: String(set.label || set.set),
        weight: String(set.weight ?? ""),
        reps: String(set.reps ?? ""),
        done: Boolean(set.done),
        drop: Boolean(set.dropSet)
      }))
    };
  });
  const allSets = workout.exercises.flatMap((exercise) => exercise.sets);
  return {
    version: WATCH_SNAPSHOT_VERSION,
    active: true,
    workoutId: String(workout.id),
    title: workout.title,
    unit: weightUnit(),
    blockLine,
    completedSets: allSets.filter((set) => set.done).length,
    totalSets: allSets.length,
    currentExercise: currentWatchExerciseIndex(workout),
    exercises,
    rest: {
      running: Boolean(state.timer.running),
      startedAt: state.timer.running ? Number(state.timer.startedAt) || null : null,
      endsAt: state.timer.running ? Number(state.timer.endsAt) || null : null
    },
    nextPlanTitle: ""
  };
}

function publishWatchSnapshot() {
  watchPublishTimer = null;
  const bridge = nativeWatchBridge();
  if (!bridge) return;
  const snapshot = JSON.stringify(buildWatchSnapshot());
  if (snapshot === lastWatchSnapshot) return;
  lastWatchSnapshot = snapshot;
  bridge.postMessage({ snapshot });
}

function scheduleWatchSnapshot() {
  if (!nativeWatchBridge() || watchPublishTimer) return;
  watchPublishTimer = setTimeout(publishWatchSnapshot, 150);
}

// Every state change goes through saveState, so the watch follows along.
const baseSaveStateForWatch = saveState;
saveState = function saveStateAndPublish() {
  baseSaveStateForWatch();
  scheduleWatchSnapshot();
};

// Commands are redelivered until the phone acknowledges them, so each one is
// applied at most once; rest adjustments that arrive late are dropped.
const appliedWatchCommandIds = [];

function handleWatchCommand(command) {
  if (!command || typeof command !== "object") return false;
  if (command.commandId) {
    if (appliedWatchCommandIds.includes(command.commandId)) return false;
    appliedWatchCommandIds.push(command.commandId);
    if (appliedWatchCommandIds.length > 300) appliedWatchCommandIds.shift();
  }
  const sentAt = Number(command.sentAt);
  if (["adjustRest", "skipRest"].includes(command.action) && Number.isFinite(sentAt) && Date.now() - sentAt > 30000) return false;
  const workout = state.activeWorkout;
  // Commands can arrive long after they were sent (queued while the phone was
  // locked), so they name the workout, exercise, and set rather than trusting
  // indexes that may have moved.
  if (command.workoutId && workout && String(command.workoutId) !== String(workout.id)) return false;
  if (command.action === "completeSet") {
    let exIndex = Number(command.exIndex);
    if (command.exerciseId && workout?.exercises?.[exIndex]?.id !== command.exerciseId) {
      exIndex = workout?.exercises?.findIndex((item) => item.id === command.exerciseId) ?? -1;
    }
    const exercise = workout?.exercises?.[exIndex];
    let setIndex = Number(command.setIndex);
    if (command.setLabel && String(exercise?.sets?.[setIndex]?.label) !== String(command.setLabel)) {
      setIndex = exercise?.sets?.findIndex((item) => String(item.label) === String(command.setLabel)) ?? -1;
    }
    const set = exercise?.sets?.[setIndex];
    if (!set || set.done) return false;
    if (!isRepsOnlyExercise(exercise)) updateSet(exIndex, setIndex, "weight", String(command.weight ?? ""));
    updateSet(exIndex, setIndex, "reps", String(command.reps ?? ""));
    const timerBefore = state.timer.startedAt;
    completeSet(exIndex, setIndex);
    const startedNewRest = state.timer.running && state.timer.startedAt !== timerBefore && state.timer.exerciseIndex === exIndex;
    // Rest started when the set was finished on the watch, not when the phone
    // caught up.
    const completedAt = Number(command.completedAt);
    if (set.done && startedNewRest && Number.isFinite(completedAt) && Date.now() - completedAt > 3000) {
      const remaining = Math.ceil((completedAt + (Number(exercise.rest) || DEFAULT_REST_SECONDS) * 1000 - Date.now()) / 1000);
      if (remaining > 0) startTimer(remaining, true, exIndex, false);
      else stopTimer();
    }
    return Boolean(set.done);
  }
  if (command.action === "adjustRest") {
    if (!state.timer.running) return false;
    adjustRest(Math.max(-60, Math.min(60, Number(command.seconds) || 0)));
    return true;
  }
  if (command.action === "skipRest") {
    if (!state.timer.running && !state.timer.fullscreen) return false;
    stopTimer();
    return true;
  }
  return false;
}
window.handleWatchCommand = handleWatchCommand;

// Details for the Lock Screen / Dynamic Island rest timer.
function restTimerContext() {
  const workout = state.activeWorkout;
  if (!workout) return { liveActivity: false };
  const index = currentWatchExerciseIndex(workout);
  const exercise = workout.exercises[index];
  const nextSet = exercise?.sets.find((set) => !set.done);
  const allSets = workout.exercises.flatMap((item) => item.sets);
  return {
    liveActivity: state.liveActivityEnabled !== false,
    workoutTitle: workout.title,
    exerciseName: exercise?.name || "Next set",
    nextSetLabel: nextSet ? `Set ${nextSet.label || nextSet.set} of ${exercise.sets.length}` : "Next exercise",
    completedSets: allSets.filter((set) => set.done).length,
    totalSets: allSets.length
  };
}

function setLiveActivityEnabled(enabled) {
  state.liveActivityEnabled = Boolean(enabled);
  saveState();
  if (!state.liveActivityEnabled && window.webkit?.messageHandlers?.peaksetTimer && state.timer.running) {
    // Restart the native timer without the Live Activity; the notification stays.
    window.webkit.messageHandlers.peaksetTimer.postMessage({ action: "start", seconds: state.timer.left, endsAt: state.timer.endsAt, liveActivity: false });
  }
  render();
}

registerMoreSection(30, () => `
  <section class="card pad">
    <p class="eyebrow">Apple Watch and Lock Screen</p>
    <h2>Train without your phone in hand</h2>
    <label class="toggle-row"><input type="checkbox" ${state.liveActivityEnabled !== false ? "checked" : ""} onchange="setLiveActivityEnabled(this.checked)" /> <span>Show the rest timer on the Lock Screen and Dynamic Island</span></label>
    <p class="muted compact-note">On Apple Watch, open Mass Method during a workout to see the current set, adjust weight and reps with the Digital Crown, complete sets, and run the rest timer. Sets you log on the watch appear on your iPhone instantly.</p>
  </section>
`);

const baseResetForWatch = resetDemoData;
resetDemoData = function resetWithWatch() {
  baseResetForWatch();
  watchMigrateState();
  saveState();
  render();
};

saveState();
publishWatchSnapshot();
render();
