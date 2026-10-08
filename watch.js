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
  // Working sets and drop sets are suggested from their own kind: a drop must
  // not be pre-filled with the working weight.
  const sameKind = (item) => Boolean(item.dropSet) === Boolean(set?.dropSet);
  const lastDone = exercise.sets.filter((item) => item.done && sameKind(item)).at(-1);
  const ordinal = exercise.sets.slice(0, setIndex).filter(sameKind).length;
  const previous = typeof lastExercisePerformance === "function" ? lastExercisePerformance(exercise.id) : null;
  const previousKind = (previous?.sets || []).filter(sameKind);
  const previousSet = previousKind[Math.min(ordinal, previousKind.length - 1)];
  // A first-ever drop set has no drop history: start from the working weight.
  const lastWorking = exercise.sets.filter((item) => item.done && !item.dropSet).at(-1);
  const order = set?.dropSet ? [previousSet, lastDone, lastWorking] : [lastDone, previousSet];
  return {
    weight: String(set?.weight || order.find((item) => item?.weight)?.weight || ""),
    reps: String(set?.reps || order.find((item) => item?.reps)?.reps || firstNumber(exercise.targetReps, "8"))
  };
}

function currentWatchExerciseIndex(workout) {
  const timerIndex = state.timer.running ? state.timer.exerciseIndex : null;
  const open = (exercise) => exercise?.sets.some((set) => !set.done);
  const anchor = workout.lastExerciseIndex;
  let index = Number.isInteger(timerIndex) && open(workout.exercises[timerIndex])
    ? timerIndex
    : Number.isInteger(anchor) && open(workout.exercises[anchor])
      ? anchor
      : workout.exercises.findIndex(open);
  if (index === -1) return Math.max(0, workout.exercises.length - 1);
  // Supersets alternate A1, B1, A2, B2: the group exercise with the fewest
  // completed sets goes next (ties go to the first), as on the watch.
  const group = workout.exercises[index].group;
  if (group) {
    const doneCount = (exercise) => exercise.sets.filter((set) => set.done).length;
    workout.exercises.forEach((exercise, candidate) => {
      if (exercise.group === group && open(exercise) && doneCount(exercise) < doneCount(workout.exercises[index])) index = candidate;
    });
    const first = workout.exercises.findIndex((exercise) => exercise.group === group && open(exercise) && doneCount(exercise) === doneCount(workout.exercises[index]));
    if (first !== -1) index = first;
  }
  return index;
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
    // In a superset no rest follows a set while a partner's matching set is open.
    const nextSet = exercise.sets[nextSetIndex];
    const ordinal = nextSet ? exercise.sets.slice(0, nextSetIndex + 1).filter((item) => Boolean(item.dropSet) === Boolean(nextSet.dropSet)).length : 0;
    const partnerPending = Boolean(exercise.group) && workout.exercises.some((partner, partnerIndex) => partnerIndex !== index && partner.group === exercise.group
      && partner.sets.filter((item) => Boolean(item.dropSet) === Boolean(nextSet?.dropSet))[ordinal - 1]?.done === false);
    return {
      index,
      id: exercise.id,
      restAfterNext: !partnerPending,
      group: String(exercise.group || ""),
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
    liveActivity: state.liveActivityEnabled !== false,
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
  const saved = baseSaveStateForWatch();
  scheduleWatchSnapshot();
  return saved;
};

// Commands are redelivered until the phone acknowledges them, so each one is
// applied at most once; rest adjustments that arrive late are dropped.
const appliedWatchCommandIds = [];

// Watch commands arrive while the athlete may be on another tab (often typing
// a weigh-in or measurements); only the live workout screen re-renders.
let watchCommandInProgress = false;
const baseRenderForWatchCommands = render;
render = function renderUnlessBackgroundWatchCommand() {
  if (watchCommandInProgress && state.view !== "session") {
    updateTimerDom();
    return;
  }
  baseRenderForWatchCommands();
};

function handleWatchCommand(command) {
  watchCommandInProgress = true;
  try {
    return applyWatchCommand(command);
  } finally {
    watchCommandInProgress = false;
  }
}

// A rest command names the rest it was aimed at (its end time), so it is
// applied whenever it arrives (e.g. after the phone is unlocked) and ignored
// if a newer rest has started since.
function restCommandTargetsCurrentRest(command) {
  const target = Number(command.restEndsAt);
  if (!Number.isFinite(target) || target <= 0) {
    const sentAt = Number(command.sentAt);
    return !(Number.isFinite(sentAt) && Date.now() - sentAt > 30000);
  }
  return Number.isFinite(Number(state.timer.endsAt)) && Math.abs(Number(state.timer.endsAt) - target) <= 5000;
}

function applyWatchCommand(command) {
  if (!command || typeof command !== "object") return false;
  if (command.commandId) {
    if (appliedWatchCommandIds.includes(command.commandId)) return false;
    appliedWatchCommandIds.push(command.commandId);
    if (appliedWatchCommandIds.length > 300) appliedWatchCommandIds.shift();
  }
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
    // The watch sends plain numbers (older builds can send "100."); anything
    // else is ignored rather than written over the value already on the phone.
    const numericText = (value) => {
      const text = String(value ?? "").trim();
      return /^\d{1,6}(\.\d{0,3})?$/.test(text) ? text.replace(/\.$/, "") : null;
    };
    let weight = numericText(command.weight);
    // Sent in the other unit (the phone switched units mid-workout): convert.
    if (weight !== null && weight !== "" && (command.unit === "lb" || command.unit === "kg") && command.unit !== weightUnit()) {
      const converted = command.unit === "lb" ? Number(weight) * KG_PER_LB : Number(weight) / KG_PER_LB;
      weight = String(Math.round(converted * 100) / 100);
    }
    const reps = numericText(command.reps);
    if (!isRepsOnlyExercise(exercise) && weight !== null) updateSet(exIndex, setIndex, "weight", weight);
    if (reps !== null) updateSet(exIndex, setIndex, "reps", reps);
    // startTimer replaces the timer object, so identity tells whether this
    // completion started a new rest (start times can match to the millisecond).
    const timerObjectBefore = state.timer;
    const timerBefore = { ...state.timer };
    const anchorBefore = state.activeWorkout.lastExerciseIndex;
    const lastSetBefore = Number(state.activeWorkout.lastSetAt) || 0;
    completeSet(exIndex, setIndex);
    // Date the set by when it was done on the watch, not when it arrived.
    const doneAt = Number(command.completedAt);
    if (state.activeWorkout?.exercises?.[exIndex]?.sets?.[setIndex]?.done && Number.isFinite(doneAt) && doneAt <= Date.now()) {
      state.activeWorkout.lastSetAt = Math.max(lastSetBefore, doneAt);
      saveState();
    }
    const startedNewRest = state.timer !== timerObjectBefore && state.timer.running && state.timer.exerciseIndex === exIndex;
    const completedAt = Number(command.completedAt);
    // A set that arrives late must not replace a rest started by a newer set.
    if (startedNewRest && timerBefore.running && Number.isFinite(completedAt) && Number(timerBefore.startedAt) >= completedAt) {
      const remaining = Math.ceil((Number(timerBefore.endsAt) - Date.now()) / 1000);
      if (remaining > 0) startTimer(remaining, Boolean(timerBefore.fullscreen), timerBefore.exerciseIndex, false);
      else stopTimer();
      // The athlete is still on the newer set's exercise.
      if (state.activeWorkout) state.activeWorkout.lastExerciseIndex = anchorBefore;
      saveState();
      return Boolean(set.done);
    }
    // Rest started when the set was finished on the watch, not when the phone
    // caught up.
    if (set.done && startedNewRest && Number.isFinite(completedAt) && Date.now() - completedAt > 3000) {
      const remaining = Math.ceil((completedAt + (Number(exercise.rest) || DEFAULT_REST_SECONDS) * 1000 - Date.now()) / 1000);
      if (remaining > 0) startTimer(remaining, state.view === "session", exIndex, false);
      else stopTimer();
    }
    return Boolean(set.done);
  }
  if (command.action === "adjustRest") {
    if (!state.timer.running || !restCommandTargetsCurrentRest(command)) return false;
    const seconds = Math.max(-60, Math.min(60, Number(command.seconds) || 0));
    const target = Number(command.restEndsAt);
    if (Number.isFinite(target) && target > 0) {
      // Absolute: the same end time iOS already set while the phone was locked.
      const remaining = Math.ceil((target + seconds * 1000 - Date.now()) / 1000);
      if (remaining > 0) startTimer(remaining, Boolean(state.timer.fullscreen), state.timer.exerciseIndex ?? null, false);
      else stopTimer();
    } else {
      adjustRest(seconds);
    }
    return true;
  }
  if (command.action === "skipRest") {
    if (!state.timer.running && !state.timer.fullscreen) return false;
    if (state.timer.running && !restCommandTargetsCurrentRest(command)) return false;
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
  if (!state.liveActivityEnabled && window.webkit?.messageHandlers?.peaksetTimer) {
    if (state.timer.running) {
      // Restart the native timer without the Live Activity; the notification stays.
      window.webkit.messageHandlers.peaksetTimer.postMessage({ action: "start", seconds: state.timer.left, endsAt: state.timer.endsAt, liveActivity: false });
    } else {
      // Between rests the workout's "Next set ready" activity is still up.
      window.webkit.messageHandlers.peaksetTimer.postMessage({ action: "endActivity" });
    }
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
