"use strict";

// Weekly hard sets per muscle and training blocks (accumulation weeks with a
// falling RIR target, then a deload). Loaded after toolkit.js.

// Weekly hard-set landmarks: min = least that still grows most lifters,
// low-high = productive range, max = most most lifters recover from.
const MUSCLE_GROUPS = [
  { key: "chest", label: "Chest", min: 8, low: 12, high: 20, max: 22 },
  { key: "back", label: "Back", min: 10, low: 14, high: 22, max: 25 },
  { key: "traps", label: "Traps", min: 0, low: 4, high: 12, max: 16 },
  { key: "frontDelts", label: "Front delts", min: 0, low: 4, high: 8, max: 12 },
  { key: "sideDelts", label: "Side delts", min: 8, low: 16, high: 22, max: 26 },
  { key: "rearDelts", label: "Rear delts", min: 6, low: 10, high: 18, max: 22 },
  { key: "biceps", label: "Biceps", min: 8, low: 14, high: 20, max: 26 },
  { key: "triceps", label: "Triceps", min: 6, low: 10, high: 14, max: 18 },
  { key: "quads", label: "Quads", min: 8, low: 12, high: 18, max: 20 },
  { key: "hamstrings", label: "Hamstrings", min: 6, low: 10, high: 16, max: 20 },
  { key: "glutes", label: "Glutes", min: 0, low: 4, high: 12, max: 16 },
  { key: "calves", label: "Calves", min: 8, low: 12, high: 16, max: 20 },
  { key: "abs", label: "Abs", min: 0, low: 8, high: 16, max: 25 }
];
const PREP_VOLUME_FACTOR = 0.75;
const WEAK_POINT_BONUS_SETS = 3;

function exerciseMuscleGroup(exercise) {
  if (!exercise) return null;
  const id = exercise.id;
  switch (exercise.muscle) {
    case "chest": return "chest";
    case "abs": return "abs";
    case "back":
      if (/face-pull/.test(id)) return "rearDelts";
      if (/shrug|rack-pull/.test(id)) return "traps";
      return "back";
    case "shoulders":
      if (/lateral|upright|bus-driver/.test(id)) return "sideDelts";
      if (/rear|reverse-pec|y-raise/.test(id)) return "rearDelts";
      return "frontDelts";
    case "arms":
      return /curl/.test(id) ? "biceps" : "triceps";
    case "legs":
      if (/calf/.test(id)) return "calves";
      if (/leg-curl|nordic|rdl/.test(id)) return "hamstrings";
      if (/kickback|thrust|pull-through|abduction|glute/.test(id)) return "glutes";
      return "quads";
    default:
      return null;
  }
}

function muscleGroupLabel(key) {
  return MUSCLE_GROUPS.find((group) => group.key === key)?.label || key;
}

// ---------- Dates ----------

function startOfWeek(date = new Date()) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// ---------- Counting ----------

function setHardSetValue(set) {
  if (!set || typeof set !== "object") return 0;
  return set.dropSet ? 0.5 : 1;
}

function weeklyHardSets(weekStart = startOfWeek(), includeActive = true) {
  const start = weekStart.getTime();
  const end = addDays(weekStart, 7).getTime();
  const totals = Object.fromEntries(MUSCLE_GROUPS.map((group) => [group.key, 0]));
  const add = (exerciseId, set) => {
    const group = exerciseMuscleGroup(exerciseLibrary.find((item) => item.id === exerciseId));
    if (group) totals[group] += setHardSetValue(set);
  };
  state.workoutLogs.forEach((log) => {
    const time = new Date(log.date).getTime();
    if (!(time >= start && time < end)) return;
    workoutLogSets(log).forEach((set) => add(loggedExerciseId(set), set));
  });
  if (includeActive && state.activeWorkout) {
    const time = new Date(state.activeWorkout.startedAt).getTime();
    if (time >= start && time < end) {
      state.activeWorkout.exercises.forEach((exercise) => exercise.sets.filter((set) => set.done).forEach((set) => add(exercise.id, set)));
    }
  }
  return totals;
}

function weeklyTotalsHistory(weeks = 8) {
  const current = startOfWeek();
  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = addDays(current, -7 * (weeks - 1 - index));
    const totals = weeklyHardSets(weekStart, index === weeks - 1);
    return { weekStart, total: Object.values(totals).reduce((sum, value) => sum + value, 0) };
  });
}

// ---------- Training blocks ----------

function volumeMigrateState() {
  const block = state.trainingBlock;
  if (block && (typeof block !== "object" || !parseDateKey(block.startDate))) state.trainingBlock = null;
  if (state.trainingBlock) {
    state.trainingBlock.accumulationWeeks = Math.max(3, Math.min(6, Math.trunc(Number(state.trainingBlock.accumulationWeeks)) || 4));
    state.trainingBlock.deload = state.trainingBlock.deload !== false;
    if (!Array.isArray(state.trainingBlock.focus)) state.trainingBlock.focus = [];
  }
  if (!Array.isArray(state.blockHistory)) state.blockHistory = [];
  if (!state.blockDraft || typeof state.blockDraft !== "object") state.blockDraft = { weeks: 4, start: "this", focus: [] };
}

volumeMigrateState();

function blockLength(block) {
  return block.accumulationWeeks + (block.deload ? 1 : 0);
}

function blockTargetRir(block, weekIndex) {
  if (weekIndex >= block.accumulationWeeks) return 4;
  const span = Math.max(1, block.accumulationWeeks - 1);
  return Math.round(3 - (3 * weekIndex) / span);
}

function blockWeekInfo(block = state.trainingBlock, date = new Date()) {
  if (!block) return null;
  const start = parseDateKey(block.startDate);
  if (!start) return null;
  // Compare calendar days in UTC: local midnights across a DST change are not
  // a whole number of 24-hour days apart.
  const utcDay = (day) => Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86400000;
  const weekIndex = Math.floor(Math.round(utcDay(startOfWeek(date)) - utcDay(start)) / 7);
  const length = blockLength(block);
  const status = weekIndex < 0 ? "upcoming" : weekIndex >= length ? "complete" : "active";
  const deload = status === "active" && block.deload && weekIndex === block.accumulationWeeks;
  return {
    weekIndex,
    weekNumber: weekIndex + 1,
    length,
    status,
    deload,
    targetRir: status === "active" ? blockTargetRir(block, weekIndex) : null,
    endDate: addDays(start, length * 7 - 1)
  };
}

function groupWeeklyTarget(group, info = blockWeekInfo(), block = state.trainingBlock, phase = state.phase) {
  const prep = phase === "prep";
  const scale = prep ? PREP_VOLUME_FACTOR : 1;
  let low = group.low * scale;
  let high = group.high * scale;
  if (info?.status === "active") {
    if (info.deload) {
      low = high = Math.round(group.min * 0.5);
    } else {
      const span = Math.max(1, block.accumulationWeeks - 1);
      const target = low + ((high - low) * info.weekIndex) / span;
      low = high = Math.round(target);
    }
  }
  const bonus = block?.focus?.includes(group.key) && !info?.deload ? WEAK_POINT_BONUS_SETS : 0;
  return { low: Math.round(low) + bonus, high: Math.round(high) + bonus };
}

function volumeStatus(value, group, target) {
  if (value === 0 && target.low > 0) return { key: "none", label: "Not trained yet" };
  if (value > group.max) return { key: "over", label: "Above recoverable" };
  if (value >= target.low && value <= target.high) return { key: "on", label: "On target" };
  if (value > target.high) return { key: "high", label: "Over target" };
  if (value < group.min) return { key: "low", label: "Below growth range" };
  return { key: "building", label: `${Math.ceil(target.low - value)} to go` };
}

function updateBlockDraft(key, value) {
  state.blockDraft = { ...state.blockDraft, [key]: key === "weeks" ? Math.max(3, Math.min(6, Number(value) || 4)) : value };
  saveState();
}

function toggleBlockFocus(key) {
  const focus = new Set(state.blockDraft.focus || []);
  if (focus.has(key)) focus.delete(key);
  else if (focus.size < 3) focus.add(key);
  else toast("Pick up to three weak points.");
  state.blockDraft = { ...state.blockDraft, focus: [...focus] };
  saveState();
  render();
}

function startTrainingBlock() {
  const draft = state.blockDraft || {};
  const thisWeek = startOfWeek();
  const start = draft.start === "next" ? addDays(thisWeek, 7) : thisWeek;
  const weeks = Math.max(3, Math.min(6, Number(draft.weeks) || 4));
  const block = {
    id: crypto.randomUUID(),
    name: String(draft.name || "").trim().slice(0, 40) || `${phaseLabel(state.phase)} block`,
    startDate: dateKey(start),
    accumulationWeeks: weeks,
    deload: true,
    focus: (draft.focus || []).filter((key) => MUSCLE_GROUPS.some((group) => group.key === key)),
    createdAt: new Date().toISOString()
  };
  if (state.trainingBlock) archiveTrainingBlock("replaced");
  state.trainingBlock = block;
  saveState();
  toast(`${block.name} starts ${formatShortDate(block.startDate)}: ${weeks} build weeks, then a deload.`);
  render();
}

function archiveTrainingBlock(reason = "ended") {
  const block = state.trainingBlock;
  if (!block) return;
  const info = blockWeekInfo(block);
  state.blockHistory.unshift({ ...block, endedAt: new Date().toISOString(), reason, completedWeeks: Math.max(0, Math.min(info?.weekIndex ?? 0, blockLength(block))) });
  state.blockHistory = state.blockHistory.slice(0, 20);
  state.trainingBlock = null;
}

function endTrainingBlock() {
  if (!state.trainingBlock || !window.confirm("End this training block now?")) return;
  archiveTrainingBlock("ended");
  saveState();
  render();
}

function peakWeekConflict(block = state.trainingBlock) {
  const goal = state.profile?.goalDate ? parseDateKey(state.profile.goalDate) : null;
  if (!block || !goal || !block.deload) return null;
  const start = parseDateKey(block.startDate);
  const deloadStart = addDays(start, block.accumulationWeeks * 7);
  const deloadEnd = addDays(deloadStart, 6);
  const peakStart = addDays(goal, -7);
  if (deloadEnd >= peakStart && deloadStart <= goal) {
    return "This block's deload lands in peak week. Coordinate it with your coach or shorten the block.";
  }
  return null;
}

// ---------- Rendering ----------

function renderBlockStatusLine(info = blockWeekInfo()) {
  if (!info) return "";
  if (info.status === "upcoming") return `Starts ${formatShortDate(state.trainingBlock.startDate)}`;
  if (info.status === "complete") return "Block complete. Start the next one.";
  if (info.deload) return `Week ${info.weekNumber} of ${info.length} · Deload: half the sets, 4+ RIR`;
  return `Week ${info.weekNumber} of ${info.length} · Aim for ${info.targetRir} RIR`;
}

// block/phase default to this athlete; the coach view passes the athlete's own.
function renderVolumeBars(totals, info = blockWeekInfo(), block = state.trainingBlock, phase = state.phase) {
  return MUSCLE_GROUPS.map((group) => {
    const value = totals[group.key] || 0;
    const target = groupWeeklyTarget(group, info, block, phase);
    const scaleMax = Math.max(group.max + 4, value + 2);
    const pct = (number) => `${Math.min(100, (number / scaleMax) * 100).toFixed(1)}%`;
    const status = volumeStatus(value, group, target);
    const focus = block?.focus?.includes(group.key);
    return `
      <div class="volume-row">
        <div class="volume-label"><strong>${escapeHtml(group.label)}${focus ? ' <span class="badge amber">Focus</span>' : ""}</strong><span class="volume-status ${status.key}">${escapeHtml(status.label)}</span></div>
        <div class="volume-track" role="img" aria-label="${escapeHtml(group.label)}: ${value} hard sets this week, target ${target.low}${target.high !== target.low ? ` to ${target.high}` : ""}">
          <span class="volume-target" style="left:${pct(target.low)};width:calc(${pct(Math.max(target.high, target.low + 0.6))} - ${pct(target.low)})"></span>
          <span class="volume-fill ${status.key}" style="width:${pct(value)}"></span>
          <span class="volume-max" style="left:${pct(group.max)}"></span>
        </div>
        <span class="volume-value">${Number(value.toFixed(1))}<small>/${target.low}${target.high !== target.low ? `-${target.high}` : ""}</small></span>
      </div>
    `;
  }).join("");
}

function renderWeeklyTotalsChart() {
  const history = weeklyTotalsHistory(8);
  const max = Math.max(1, ...history.map((week) => week.total));
  return `
    <div class="week-bars" role="img" aria-label="Total hard sets for the last 8 weeks: ${history.map((week) => week.total).join(", ")}">
      ${history.map((week, index) => `<div class="week-bar ${index === history.length - 1 ? "current" : ""}"><span style="height:${Math.max(4, (week.total / max) * 100)}%"></span><small>${week.weekStart.getMonth() + 1}/${week.weekStart.getDate()}</small></div>`).join("")}
    </div>
  `;
}

function renderTrainingBlockCard() {
  const block = state.trainingBlock;
  const info = blockWeekInfo(block);
  if (block) {
    const conflict = peakWeekConflict(block);
    const weeks = Array.from({ length: blockLength(block) }, (_, index) => {
      const deload = block.deload && index === block.accumulationWeeks;
      const state_ = info.status === "complete" || index < info.weekIndex ? "done" : index === info.weekIndex && info.status === "active" ? "current" : "";
      return `<div class="block-week ${state_} ${deload ? "deload" : ""}"><strong>${deload ? "DL" : `W${index + 1}`}</strong><small>${deload ? "4+ RIR" : `${blockTargetRir(block, index)} RIR`}</small></div>`;
    }).join("");
    return `
      <section class="card pad training-block">
        <div class="card-head">
          <div><p class="eyebrow">Training block</p><h2>${escapeHtml(block.name)}</h2><p class="muted">${escapeHtml(renderBlockStatusLine(info))}</p></div>
          <span class="badge ${info.deload ? "amber" : "green"}">${info.status === "active" ? (info.deload ? "Deload" : "Build") : info.status === "upcoming" ? "Upcoming" : "Complete"}</span>
        </div>
        <div class="block-weeks">${weeks}</div>
        ${block.focus.length ? `<p class="muted compact-note">Weak-point focus: ${block.focus.map(muscleGroupLabel).join(", ")} (+${WEAK_POINT_BONUS_SETS} sets/week).</p>` : ""}
        ${conflict ? `<p class="warning-note">${escapeHtml(conflict)}</p>` : ""}
        <p class="muted compact-note">${formatShortDate(block.startDate)} to ${formatShortDate(dateKey(info.endDate))}. Set targets climb each week; deload week halves your planned sets automatically.</p>
        <button class="ghost-btn danger" onclick="endTrainingBlock()">${info.status === "complete" ? "Archive Block" : "End Block"}</button>
      </section>
    `;
  }
  const draft = state.blockDraft || { weeks: 4, start: "this", focus: [] };
  return `
    <section class="card pad training-block">
      <p class="eyebrow">Training block</p>
      <h2>Plan the next ${draft.weeks + 1} weeks</h2>
      <p class="muted">Build weeks push effort from 3 RIR down to 0 while weekly sets climb through the productive range, then a deload resets fatigue.</p>
      <div class="grid two">
        <div class="field"><label for="blockName">Name</label><input id="blockName" value="${escapeHtml(draft.name || "")}" placeholder="${escapeHtml(phaseLabel(state.phase))} block" maxlength="40" oninput="updateBlockDraft('name', this.value)" /></div>
        <div class="field"><label for="blockWeeks">Build weeks</label><select id="blockWeeks" onchange="updateBlockDraft('weeks', this.value); render()">${[3, 4, 5, 6].map((weeks) => `<option value="${weeks}" ${draft.weeks === weeks ? "selected" : ""}>${weeks} + deload</option>`).join("")}</select></div>
      </div>
      <div class="field" style="margin-top:10px"><label for="blockStart">Start</label><select id="blockStart" onchange="updateBlockDraft('start', this.value)"><option value="this" ${draft.start !== "next" ? "selected" : ""}>This week (${formatShortDate(dateKey(startOfWeek()))})</option><option value="next" ${draft.start === "next" ? "selected" : ""}>Next week (${formatShortDate(dateKey(addDays(startOfWeek(), 7)))})</option></select></div>
      <p class="muted compact-note" style="margin-top:12px">Weak points (up to 3) get +${WEAK_POINT_BONUS_SETS} sets a week:</p>
      <div class="filters">${MUSCLE_GROUPS.map((group) => `<button class="chip ${draft.focus.includes(group.key) ? "active" : ""}" aria-pressed="${draft.focus.includes(group.key)}" onclick="toggleBlockFocus('${group.key}')">${escapeHtml(group.label)}</button>`).join("")}</div>
      <button class="primary-btn" style="margin-top:14px" onclick="startTrainingBlock()">Start Block</button>
    </section>
  `;
}

function renderVolumeCard() {
  const info = blockWeekInfo();
  const totals = weeklyHardSets();
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  return `
    <section class="card pad weekly-volume">
      <div class="card-head">
        <div><p class="eyebrow">Weekly volume</p><h2>${Number(total.toFixed(1))} hard ${total === 1 ? "set" : "sets"} this week</h2><p class="muted">${state.phase === "prep" ? "Contest prep: targets trimmed to hold muscle while recovery is limited." : "Working sets count 1, drop sets count half."}</p></div>
      </div>
      <div class="volume-legend"><span><i class="legend-target"></i>Target</span><span><i class="legend-max"></i>Recovery limit</span></div>
      <div class="volume-list">${renderVolumeBars(totals, info)}</div>
      <h3 style="margin-top:16px">Last 8 weeks</h3>
      ${renderWeeklyTotalsChart()}
    </section>
  `;
}

function renderTodayVolumeSummary() {
  const info = blockWeekInfo();
  const totals = weeklyHardSets();
  const behind = MUSCLE_GROUPS
    .map((group) => ({ group, value: totals[group.key], target: groupWeeklyTarget(group, info) }))
    .filter(({ value, target }) => value < target.low)
    .sort((a, b) => (b.target.low - b.value) - (a.target.low - a.value))
    .slice(0, 4);
  return `
    <section class="card pad today-volume">
      <div class="card-head">
        <div><p class="eyebrow">This week</p><h2>${state.trainingBlock ? escapeHtml(renderBlockStatusLine(info)) : "Volume check"}</h2></div>
        <button class="ghost-btn" onclick="setView('plans')">Details</button>
      </div>
      ${behind.length ? `<div class="filters">${behind.map(({ group, value, target }) => `<span class="badge">${escapeHtml(group.label)} ${Number(value.toFixed(1))}/${target.low}</span>`).join("")}</div>` : '<p class="muted">Every muscle is at or above this week\'s target.</p>'}
    </section>
  `;
}

const baseRenderPlansForVolume = renderPlans;
renderPlans = function renderPlansWithVolume() {
  const html = baseRenderPlansForVolume();
  const headerStart = html.indexOf("compact-page-header");
  const insertAt = headerStart === -1 ? 0 : html.indexOf("</div>", headerStart) + "</div>".length;
  return `${html.slice(0, insertAt)}<div class="grid volume-stack">${renderTrainingBlockCard()}${renderVolumeCard()}</div>${html.slice(insertAt)}`;
};

const baseRenderTodayForVolume = renderToday;
renderToday = function renderTodayWithVolume() {
  const html = baseRenderTodayForVolume();
  const anchor = html.indexOf('<div style="margin-top: 16px;">');
  if (anchor === -1) return `${html}${renderTodayVolumeSummary()}`;
  return `${html.slice(0, anchor)}<div style="margin-top: 16px;">${renderTodayVolumeSummary()}</div>${html.slice(anchor)}`;
};

// Deload week: halve working sets and drop the drop sets when a workout starts.
function deloadPlan(plan) {
  return {
    ...plan,
    exercises: (Array.isArray(plan.exercises) ? plan.exercises : []).map((spec) => {
      const normalized = normalizePlanExercise(spec);
      return [normalized.id, Math.max(1, Math.ceil(normalized.sets / 2)), normalized.reps, normalized.rest, 0, { group: normalized.group, setType: "standard" }];
    })
  };
}

const baseBeginWorkoutForVolume = beginWorkoutFromPlan;
beginWorkoutFromPlan = function beginWorkoutWithBlock(plan) {
  const info = blockWeekInfo();
  // Quick logs and ad-hoc Builder sessions are exactly what the athlete asked for.
  const exempt = String(plan?.id || "").startsWith("quick-") || plan?.adHoc;
  if (!info?.deload || state.activeWorkout || exempt) return baseBeginWorkoutForVolume(plan);
  const started = baseBeginWorkoutForVolume(deloadPlan(plan));
  if (started && state.activeWorkout) {
    // Remember the full plan so "Save Template" never stores halved sets.
    const full = (Array.isArray(plan.exercises) ? plan.exercises : []).map(normalizePlanExercise).filter((spec) => exerciseLibrary.some((item) => item.id === spec.id));
    state.activeWorkout.deload = true;
    state.activeWorkout.exercises.forEach((exercise, index) => {
      exercise.fullSets = full[index]?.sets ?? exercise.targetSets;
      exercise.fullDropSets = full[index]?.dropSets ?? exercise.targetDropSets;
    });
    saveState();
    toast("Deload week: sets halved, stop 4+ reps short of failure.");
  }
  return started;
};

const baseRenderSessionForVolume = renderSession;
renderSession = function renderSessionWithBlock() {
  const html = baseRenderSessionForVolume();
  const info = blockWeekInfo();
  if (!state.activeWorkout || info?.status !== "active") return html;
  return `<div class="block-banner ${info.deload ? "deload" : ""}">${escapeHtml(renderBlockStatusLine(info))}</div>${html}`;
};

const baseProgressionForVolume = progressionSuggestion;
progressionSuggestion = function progressionWithBlock(exercise) {
  const text = baseProgressionForVolume(exercise);
  const info = blockWeekInfo();
  if (info?.status !== "active") return text;
  if (info.deload) return "Deload week: use about the same load for fewer sets and stop 4+ reps short of failure.";
  return `${text} Block week ${info.weekNumber}: finish working sets at ${info.targetRir} RIR.`;
};

const baseResetForVolume = resetDemoData;
resetDemoData = function resetWithVolume() {
  baseResetForVolume();
  volumeMigrateState();
  saveState();
  render();
};

saveState();
render();
