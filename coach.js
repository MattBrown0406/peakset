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
let coachProgramDraft = { planIds: [], message: "", blockWeeks: 0, focus: [] };

function coachMigrateState() {
  if (!state.coach || typeof state.coach !== "object") state.coach = {};
  if (typeof state.coach.enabled !== "boolean") state.coach.enabled = false;
  if (typeof state.coach.name !== "string") state.coach.name = "";
  if (!state.coach.athletes || typeof state.coach.athletes !== "object" || Array.isArray(state.coach.athletes)) state.coach.athletes = {};
  if (typeof state.coach.selectedAthleteId !== "string") state.coach.selectedAthleteId = "";
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

async function buildCoachPackage(days = Number(state.logbookRange || 7)) {
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
    measurements: state.measurements.slice(0, 6),
    workoutLogs: report.workouts,
    weeklyCheckIns: report.weeklyCheckIns || [],
    prepLogs: report.prepLogs || [],
    volumeWeeks: weeklyVolumeHistory(4),
    trainingBlock: state.trainingBlock ? { ...state.trainingBlock, statusLine: renderBlockStatusLine(info) } : null,
    photos: photoData
  };
}

async function sendCheckInToCoach() {
  if (!state.athleteName) {
    toast("Add your name in More so your coach knows who this is from.");
    setView("more");
    return;
  }
  toast("Preparing your check-in...");
  const pkg = await buildCoachPackage();
  const name = `${fileSafe(state.athleteName)} check-in ${todayStamp()}.massmethod`;
  const result = await shareOrDownload(JSON.stringify(pkg), name, "application/x-massmethod");
  state.lastCoachPackageAt = new Date().toISOString();
  saveState();
  toast(result === "shared" ? "Check-in ready. Send it to your coach by Messages, Mail, or AirDrop." : "Check-in file downloaded. Send it to your coach.");
  render();
}

// ---------- Coach: import check-ins ----------

function mergeById(existing, incoming, limitDays = COACH_HISTORY_DAYS) {
  const byId = new Map();
  [...safeArray(existing), ...safeArray(incoming)].forEach((entry) => {
    const key = entry.id || `${entry.date}-${JSON.stringify(entry).length}`;
    byId.set(key, entry);
  });
  return [...byId.values()]
    .filter((entry) => !entry.date || isWithinDays(entry.date, limitDays))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function importCoachPackage(pkg) {
  const athleteId = String(pkg?.athlete?.id || "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(athleteId)) {
    toast("That check-in is missing an athlete id.");
    return false;
  }
  if (athleteId === state.athleteId) {
    toast("This is your own check-in. Open it on your coach's phone.");
    return false;
  }
  if (!state.coach.enabled) {
    if (!window.confirm(`Turn on coach mode and add ${pkg.athlete.name || "this athlete"} to your roster?`)) return false;
    state.coach.enabled = true;
  }
  const existing = state.coach.athletes[athleteId] || { id: athleteId, notes: "", photos: [], packages: [] };
  const newer = !existing.updatedAt || new Date(pkg.generatedAt) >= new Date(existing.updatedAt);
  const storedPhotos = [];
  for (const photo of safeArray(pkg.photos).slice(0, COACH_PHOTOS_PER_PACKAGE)) {
    if (safeArray(existing.photos).some((item) => item.pose === photo.pose && item.date === photo.date)) continue;
    const stored = await storeImportedPhoto(photo.dataUrl);
    if (stored) storedPhotos.push({ ...stored, pose: String(photo.pose || ""), date: String(photo.date || "") });
  }
  const photos = [...storedPhotos, ...safeArray(existing.photos)].sort((a, b) => new Date(b.date) - new Date(a.date));
  photos.slice(COACH_PHOTOS_PER_ATHLETE).forEach(deletePhotoFile);
  const athlete = {
    ...existing,
    id: athleteId,
    name: newer ? String(pkg.athlete.name || existing.name || "").slice(0, 60) : existing.name,
    profile: newer ? { ...pkg.athlete } : existing.profile,
    updatedAt: newer ? pkg.generatedAt : existing.updatedAt,
    weightLogs: mergeById(existing.weightLogs, pkg.weightLogs),
    measurements: mergeById(existing.measurements, pkg.measurements, 365),
    workoutLogs: mergeById(existing.workoutLogs, pkg.workoutLogs).slice(0, 60),
    weeklyCheckIns: mergeById(existing.weeklyCheckIns, pkg.weeklyCheckIns),
    prepLogs: mergeById(existing.prepLogs, pkg.prepLogs),
    volumeWeeks: newer ? safeArray(pkg.volumeWeeks) : safeArray(existing.volumeWeeks),
    trainingBlock: newer ? pkg.trainingBlock || null : existing.trainingBlock,
    lastNote: newer ? String(pkg.note || "") : existing.lastNote,
    photos: photos.slice(0, COACH_PHOTOS_PER_ATHLETE),
    packages: [{ generatedAt: pkg.generatedAt, rangeDays: pkg.rangeDays }, ...safeArray(existing.packages)].slice(0, 30)
  };
  state.coach.athletes[athleteId] = athlete;
  state.coach.selectedAthleteId = athleteId;
  state.view = "coach";
  saveState();
  toast(`Check-in from ${athleteDisplayName(athlete)} imported.`);
  render();
  return true;
}

registerIncomingFileHandler(COACH_PACKAGE_FORMAT, (payload) => {
  importCoachPackage(payload);
  return true;
});

// ---------- Athlete: import a program from the coach ----------

function sanitizePlan(plan, from) {
  const exercises = (Array.isArray(plan?.exercises) ? plan.exercises : [])
    .map((spec) => normalizePlanExercise(spec))
    .filter((spec) => exerciseLibrary.some((exercise) => exercise.id === spec.id))
    .map((spec) => [spec.id, spec.sets, spec.reps, spec.rest, spec.dropSets, { group: spec.group, setType: spec.setType }]);
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
  const plans = (Array.isArray(program?.plans) ? program.plans : []).map((plan) => sanitizePlan(plan, from)).filter(Boolean);
  const block = program?.block && typeof program.block === "object" ? program.block : null;
  if (!plans.length && !block) {
    toast("That program has no workouts this app can load.");
    return false;
  }
  const summary = [plans.length ? `${plans.length} workout${plans.length === 1 ? "" : "s"}` : "", block ? `a ${Number(block.accumulationWeeks) || 4}-week training block` : ""].filter(Boolean).join(" and ");
  if (!window.confirm(`Add ${summary} from ${from}?`)) return false;
  state.customPlans.unshift(...plans);
  if (block) {
    if (state.trainingBlock) archiveTrainingBlock("replaced by coach");
    state.trainingBlock = {
      id: crypto.randomUUID(),
      name: String(block.name || `${from}'s block`).slice(0, 40),
      startDate: dateKey(block.start === "next" ? addDays(startOfWeek(), 7) : startOfWeek()),
      accumulationWeeks: Math.max(3, Math.min(6, Number(block.accumulationWeeks) || 4)),
      deload: true,
      focus: (Array.isArray(block.focus) ? block.focus : []).filter((key) => MUSCLE_GROUPS.some((group) => group.key === key)).slice(0, 3),
      createdAt: new Date().toISOString()
    };
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

function toggleProgramPlan(id) {
  const ids = new Set(coachProgramDraft.planIds);
  if (ids.has(id)) ids.delete(id);
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
  const athlete = state.coach.athletes[athleteId];
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
  state.coach.selectedAthleteId = state.coach.athletes[id] ? id : "";
  coachProgramDraft = { planIds: [], message: "", blockWeeks: 0, focus: [] };
  state.view = "coach";
  saveState();
  render();
  window.scrollTo?.(0, 0);
}

function saveAthleteNotes(id, value) {
  if (!state.coach.athletes[id]) return;
  state.coach.athletes[id].notes = String(value || "").slice(0, 5000);
  saveState();
}

function removeAthlete(id) {
  const athlete = state.coach.athletes[id];
  if (!athlete || !window.confirm(`Remove ${athleteDisplayName(athlete)} and their check-ins from your roster?`)) return;
  safeArray(athlete.photos).forEach(deletePhotoFile);
  delete state.coach.athletes[id];
  state.coach.selectedAthleteId = "";
  saveState();
  render();
}

function athleteSummary(athlete) {
  const weights = safeArray(athlete.weightLogs).map((entry) => ({ date: entry.date, value: Number(entry.bodyweight) })).filter((entry) => entry.value > 0);
  const recent = weights.filter((entry) => isWithinDays(entry.date, 7));
  const avg = recent.length ? recent.reduce((sum, entry) => sum + entry.value, 0) / recent.length : null;
  const prior = weights.filter((entry) => !isWithinDays(entry.date, 7) && isWithinDays(entry.date, 14));
  const priorAvg = prior.length ? prior.reduce((sum, entry) => sum + entry.value, 0) / prior.length : null;
  const workouts7 = safeArray(athlete.workoutLogs).filter((log) => isWithinDays(log.date, 7)).length;
  const checkIn = safeArray(athlete.weeklyCheckIns)[0];
  const days = athlete.updatedAt ? Math.floor((Date.now() - new Date(athlete.updatedAt)) / 86400000) : null;
  return {
    unit: athlete.profile?.units === "metric" ? "kg" : "lb",
    avg,
    change: avg !== null && priorAvg !== null ? avg - priorAvg : null,
    workouts7,
    recovery: checkIn?.recovery ?? null,
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
              <span><strong>${summary.recovery ?? "--"}</strong> recovery/5</span>
            </div>
          </button>
        `;
      }).join("") || '<div class="empty"><p class="muted">No athletes yet. Import a check-in file to add one.</p></div>'}
    </div>
  `;
}

function renderAthleteVolume(athlete) {
  const week = safeArray(athlete.volumeWeeks)[0];
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
      <article class="card stat"><p class="value">${summary.recovery ?? "--"}</p><p class="label">Latest recovery / 5</p></article>
    </div>
    <div class="grid two" style="margin-top:12px">
      <section class="card pad"><h2>Body weight</h2>${weights.length > 1 ? sparkline(weights) : '<p class="muted">Needs two weigh-ins.</p>'}</section>
      <section class="card pad"><h2>Latest measurements</h2>${latestMeasurement ? `<p class="muted">${formatShortDate(latestMeasurement.date)}</p><div class="measurement-grid">${measurementDefinitions.filter(([key]) => latestMeasurement[key] !== null && latestMeasurement[key] !== undefined).map(([key, label]) => `<div class="stat card"><p class="value">${escapeHtml(latestMeasurement[key])}</p><p class="label">${escapeHtml(label)} ${key === "bodyFat" ? "%" : lengthLabel}</p></div>`).join("")}</div>` : '<p class="muted">No measurements yet.</p>'}</section>
    </div>
    <section class="card pad" style="margin-top:12px"><div class="card-head"><div><p class="eyebrow">Weekly volume</p><h2>Hard sets this week</h2></div>${athlete.trainingBlock ? `<span class="badge blue">${escapeHtml(athlete.trainingBlock.statusLine || athlete.trainingBlock.name || "")}</span>` : ""}</div><div class="volume-list">${renderAthleteVolume(athlete)}</div></section>
    ${safeArray(athlete.photos).length ? `<section class="card pad" style="margin-top:12px"><p class="eyebrow">Progress photos</p><div class="photo-strip">${safeArray(athlete.photos).map((photo) => `<figure class="photo-thumb">${photoImg(photo)}<figcaption>${escapeHtml(poseLabel(photo.pose))}<br />${formatShortDate(photo.date)}</figcaption></figure>`).join("")}</div></section>` : ""}
    <div class="grid two" style="margin-top:12px">
      <section class="card pad"><h2>Recent workouts</h2><div class="exercise-list">${safeArray(athlete.workoutLogs).slice(0, 8).map((log) => `<div class="exercise-row"><div><strong>${escapeHtml(log.title || "Workout")}</strong><p class="muted" style="margin:2px 0 0">${formatShortDate(log.date)} · ${workoutLogSets(log).length} sets</p></div></div>`).join("") || '<p class="muted">No workouts in range.</p>'}</div></section>
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
      <div class="program-plans">${plans.map((plan) => `<label class="toggle-row"><input type="checkbox" ${coachProgramDraft.planIds.includes(plan.id) ? "checked" : ""} onchange="toggleProgramPlan('${escapeHtml(plan.id)}')" /> <span>${escapeHtml(plan.title)} <small class="muted">${plan.exercises.length} exercises${plan.scheduleDay ? ` · ${escapeHtml(plan.scheduleDay)}` : ""}</small></span></label>`).join("") || '<p class="muted">No saved templates yet. Save some from the Builder tab.</p>'}</div>
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
  const selected = state.coach.athletes[state.coach.selectedAthleteId];
  return selected ? renderAthleteDetail(selected) : renderRoster();
}

registerMoreSection(25, () => `
  <section class="card pad">
    <p class="eyebrow">Coaching</p>
    <h2>Work with a coach</h2>
    <p class="muted">Send your coach a check-in with weight, measurements, workouts, recovery, volume, and your latest photos. ${state.lastCoachPackageAt ? `Last sent ${formatShortDate(state.lastCoachPackageAt)}.` : ""}</p>
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
