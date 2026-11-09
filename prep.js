"use strict";

// Contest-prep tools: the Peak Week and show-day checklist, a guided posing
// practice timer that logs into the prep log, and warm-up / plate helpers on
// the live session's exercise cards. Loaded after health.js.
//
// Peak week here is a checklist, never a protocol: water, sodium and carbs
// are targets the athlete writes in from their coach's plan.

const PEAK_WEEK_DAYS = 7;
const PEAK_WEEK_TEASER_DAYS = 21;
const PEAK_TARGET_FIELDS = [["water", "Water"], ["sodium", "Sodium"], ["carbs", "Carbs"]];
const SHOW_DAY_FIELDS = [["checkIn", "Check-in time"], ["pumpPlan", "Pump-up plan"], ["snacks", "Snacks and drinks"]];
const PEAK_TEXT_MAX = 200;
const PEAK_CUSTOM_MAX = 40;
const PEAK_SHOWS_KEPT = 6;
const PEAK_SAFETY_TEXT = "This is a checklist, not a peak-week protocol. Keep water, sodium and carbs the same as normal unless your coach gives you targets, and write those in. Do not cut water or take diuretics or water pills: they can cause cramps, fainting and dangerous heart rhythms, and they usually make you look flat. Confirm every change with your coach.";
const PEAK_MEDICAL_TEXT = "Dizzy, faint, cramping badly or a racing heart? Stop, drink, and get medical help.";
// Text in a target that reads like a water cut or a diuretic gets a warning.
const PEAK_RISK_PATTERN = /diuretic|water pill|dandelion|lasix|furosemide|hctz|hydrochlorothiazide|spironolactone|aldactone|\bno water\b|\bzero water\b|\bcut(ting)? (the )?water\b|\bstop drinking\b|\bdry out\b|\bdehydrat/i;

const PEAK_WEEK_TEMPLATE = {
  7: [
    ["d7-coach-plan", "Go over peak week with your coach: training, food, water, sodium and carbs", "Write the agreed targets in each day. No coach? Keep everything the same as last week."],
    ["d7-logistics", "Registration, federation card, check-in time and venue confirmed"],
    ["d7-tan-booked", "Tan booked or kit ordered (read the tan company's prep instructions)"],
    ["d7-posing", "Full posing run-through, timed"],
    ["d7-photos", "Check-in photos in your usual lighting"]
  ],
  6: [
    ["d6-training", "Train as planned: no new exercises, no new soreness"],
    ["d6-posing", "Posing practice"],
    ["d6-pack-start", "Start the bag: suit, tan touch-up, oil or glaze, robe, sandals"]
  ],
  5: [
    ["d5-consistent", "Food, water and sodium on your coach's plan, no improvising"],
    ["d5-posing", "Posing practice"],
    ["d5-sleep", "7 to 9 hours of sleep"]
  ],
  4: [
    ["d4-suit", "Suit try-on with a full posing run"],
    ["d4-travel", "Travel, hotel and food near the venue sorted"],
    ["d4-posing", "Posing practice"]
  ],
  3: [
    ["d3-pump", "Rehearse your pump-up: bands or light weights, 10 to 15 minutes", "Know which moves, how many sets, and when you start before walking on."],
    ["d3-grooming", "Grooming done before tanning, on your tan company's timing"],
    ["d3-posing", "Posing practice: transitions and stage walk"]
  ],
  2: [
    ["d2-pack", "Bag packed: suit, tan touch-up kit, oil or glaze, robe or dark loose clothes, sandals, bands, snacks, water bottle, ID and federation card"],
    ["d2-food-ready", "Show-day food and drinks bought, as your coach planned"],
    ["d2-posing", "Light posing only, save your energy"]
  ],
  1: [
    ["d1-tan", "Tan applied on the tan company's timing"],
    ["d1-checkin", "Athlete check-in or meeting time and place confirmed"],
    ["d1-layout", "Show-day food, drinks and bag laid out"],
    ["d1-sleep", "Early night"]
  ],
  0: [
    ["d0-tan", "Tan touch-up done"],
    ["d0-suit", "Suit (and a backup) in the bag"],
    ["d0-oil", "Oil or glaze ready, applied just before stage"],
    ["d0-pump", "Pump-up plan ready", "", "pumpPlan"],
    ["d0-snacks", "Snacks and drinks packed, per your coach's plan", "", "snacks"],
    ["d0-checkin", "Check-in time set", "", "checkIn"]
  ]
};

// Standard mandatory poses (NPC/IFBB style). Federations differ, so the card
// says to check the rulebook.
const QUARTER_TURNS = ["Front stance", "Quarter turn: side", "Back stance", "Quarter turn: other side"];
const POSING_DIVISIONS = [
  { key: "mens-bodybuilding", label: "Men's Bodybuilding", poses: ["Front double biceps", "Front lat spread", "Side chest", "Back double biceps", "Back lat spread", "Side triceps", "Abdominals and thighs", "Most muscular"] },
  { key: "classic-physique", label: "Classic Physique", poses: ["Front double biceps", "Side chest", "Back double biceps", "Abdominals and thighs", "Favorite classic pose"] },
  { key: "mens-physique", label: "Men's Physique", poses: [] },
  { key: "womens-bodybuilding", label: "Women's Bodybuilding", poses: ["Front double biceps", "Side chest", "Back double biceps", "Side triceps", "Abdominals and thighs"] },
  { key: "womens-physique", label: "Women's Physique", poses: ["Front double biceps (open hands)", "Side chest", "Back double biceps (open hands)", "Side triceps", "Abdominals and thighs"] },
  { key: "figure", label: "Figure", poses: [] },
  { key: "wellness", label: "Wellness", poses: [] },
  { key: "bikini", label: "Bikini", poses: ["Model walk and transitions"] },
  { key: "fitness", label: "Fitness", poses: [] }
];
const POSING_LEAD_IN_SECONDS = 5;
const POSING_LIMITS = { hold: [5, 90, 20], rest: [0, 60, 10], rounds: [1, 10, 2] };

const PLATE_SETS = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] };
const DEFAULT_BAR_WEIGHT = { imperial: 45, metric: 20 };
const MAX_BAR_WEIGHT = { imperial: 100, metric: 45 };

// ---------- State ----------

function prepClamp(value, [min, max, fallback]) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function prepText(value) {
  return typeof value === "string" ? value.slice(0, PEAK_TEXT_MAX) : "";
}

function isPrepDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key || "")) && Number.isFinite(new Date(`${key}T12:00:00`).getTime());
}

function validBarWeight(value, units) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= MAX_BAR_WEIGHT[units] ? Math.round(number * 100) / 100 : DEFAULT_BAR_WEIGHT[units];
}

function cleanPeakWeekEntry(entry) {
  const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
  const done = {};
  if (source.done && typeof source.done === "object") {
    Object.keys(source.done).forEach((id) => { if (/^[A-Za-z0-9-]{1,64}$/.test(id) && source.done[id] === true) done[id] = true; });
  }
  const targets = {};
  if (source.targets && typeof source.targets === "object") {
    for (let day = 0; day <= PEAK_WEEK_DAYS; day += 1) {
      const target = source.targets[day];
      if (!target || typeof target !== "object") continue;
      const clean = Object.fromEntries(PEAK_TARGET_FIELDS.map(([field]) => [field, prepText(target[field])]).filter(([, value]) => value));
      if (Object.keys(clean).length) targets[day] = clean;
    }
  }
  const seen = new Set();
  const custom = (Array.isArray(source.custom) ? source.custom : []).filter((item) => {
    if (!item || typeof item !== "object" || !/^[A-Za-z0-9-]{1,64}$/.test(String(item.id || "")) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).map((item) => ({ id: item.id, day: prepClamp(item.day, [0, PEAK_WEEK_DAYS, 0]), text: prepText(item.text).trim() })).filter((item) => item.text).slice(0, PEAK_CUSTOM_MAX);
  const showDay = Object.fromEntries(SHOW_DAY_FIELDS.map(([field]) => [field, prepText(source.showDay?.[field])]));
  return { done, targets, custom, showDay };
}

function prepMigrateState() {
  const source = state.prepTools && typeof state.prepTools === "object" && !Array.isArray(state.prepTools) ? state.prepTools : {};
  const peakWeek = {};
  const shows = source.peakWeek && typeof source.peakWeek === "object" ? Object.keys(source.peakWeek).filter(isPrepDateKey).sort().slice(-PEAK_SHOWS_KEPT) : [];
  shows.forEach((key) => { peakWeek[key] = cleanPeakWeekEntry(source.peakWeek[key]); });
  const bar = source.barWeight && typeof source.barWeight === "object" ? source.barWeight : {};
  const barWeight = Object.fromEntries(["barbell", "smith"].map((kind) => [kind, {
    imperial: validBarWeight(bar[kind]?.imperial, "imperial"),
    metric: validBarWeight(bar[kind]?.metric, "metric")
  }]));
  const posing = source.posing && typeof source.posing === "object" ? source.posing : {};
  state.prepTools = {
    peakWeek,
    barWeight,
    posing: {
      division: POSING_DIVISIONS.some((item) => item.key === posing.division) ? posing.division : "",
      hold: prepClamp(posing.hold, POSING_LIMITS.hold),
      rest: prepClamp(posing.rest, POSING_LIMITS.rest),
      rounds: prepClamp(posing.rounds, POSING_LIMITS.rounds),
      quarterTurns: posing.quarterTurns !== false,
      bell: posing.bell !== false
    }
  };
}

prepMigrateState();

// Earlier modules re-render during a reset before this module migrates.
function prepTools() {
  if (!state.prepTools || typeof state.prepTools !== "object" || !state.prepTools.posing || !state.prepTools.barWeight || !state.prepTools.peakWeek) prepMigrateState();
  return state.prepTools;
}

// ---------- Peak week ----------

function prepAddDays(key, days) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// The show date, and whole days until it (show day = 0), from the Stage Timeline.
function peakWeekContext() {
  const timeline = getStageTimeline();
  const showDate = isPrepDateKey(timeline.goalDateRaw) ? timeline.goalDateRaw : "";
  return { showDate, daysOut: showDate ? timeline.daysOut : null };
}

function inPeakWeek(daysOut) {
  return Number.isInteger(daysOut) && daysOut >= 0 && daysOut <= PEAK_WEEK_DAYS;
}

function peakWeekEntry(showDate, create = false) {
  const tools = prepTools();
  if (!isPrepDateKey(showDate)) return cleanPeakWeekEntry(null);
  if (!tools.peakWeek[showDate] && create) {
    tools.peakWeek[showDate] = cleanPeakWeekEntry(null);
    const keys = Object.keys(tools.peakWeek).sort();
    keys.slice(0, Math.max(0, keys.length - PEAK_SHOWS_KEPT)).forEach((key) => { delete tools.peakWeek[key]; });
  }
  return tools.peakWeek[showDate] || cleanPeakWeekEntry(null);
}

function peakWeekItemsFor(day) {
  return (PEAK_WEEK_TEMPLATE[day] || []).map(([id, text, detail = "", field = ""]) => ({ id, text, detail, field, custom: false }));
}

// Day-by-day checklist from 7 days out to show day, with the athlete's own
// items and check-offs for this show date.
function peakWeekChecklist(showDate = "", daysOut = null) {
  const entry = peakWeekEntry(showDate);
  const days = [];
  for (let day = PEAK_WEEK_DAYS; day >= 0; day -= 1) {
    const items = [
      ...peakWeekItemsFor(day),
      ...entry.custom.filter((item) => item.day === day).map((item) => ({ id: item.id, text: item.text, detail: "", field: "", custom: true }))
    ].map((item) => ({ ...item, done: entry.done[item.id] === true }));
    days.push({
      day,
      date: showDate ? prepAddDays(showDate, -day) : "",
      label: day === 0 ? "Show day" : `${day} ${day === 1 ? "day" : "days"} out`,
      isToday: daysOut === day,
      past: Number.isInteger(daysOut) && day > daysOut,
      targets: entry.targets[day] || {},
      items
    });
  }
  return days;
}

function peakWeekProgress(showDate) {
  const items = peakWeekChecklist(showDate).flatMap((day) => day.items);
  return { done: items.filter((item) => item.done).length, total: items.length };
}

function peakTargetRisky(text) {
  const value = String(text || "").trim();
  return PEAK_RISK_PATTERN.test(value) || /^0+(\.0+)?\s*(l|liters?|litres?|ml|oz|gal|cups?)?$/i.test(value);
}

function togglePeakWeekItem(showDate, id) {
  if (!isPrepDateKey(showDate) || !/^[A-Za-z0-9-]{1,64}$/.test(String(id))) return;
  const entry = peakWeekEntry(showDate, true);
  if (entry.done[id]) delete entry.done[id];
  else entry.done[id] = true;
  saveState();
  render();
}

function setPeakWeekTarget(showDate, day, field, value) {
  const index = Number(day);
  if (!isPrepDateKey(showDate) || !Number.isInteger(index) || index < 0 || index > PEAK_WEEK_DAYS || !PEAK_TARGET_FIELDS.some(([key]) => key === field)) return;
  const entry = peakWeekEntry(showDate, true);
  const text = prepText(String(value ?? "")).trim();
  const target = { ...(entry.targets[index] || {}) };
  if (text) target[field] = text;
  else delete target[field];
  if (Object.keys(target).length) entry.targets[index] = target;
  else delete entry.targets[index];
  saveState();
  const warning = document.querySelector?.(`[data-peak-risk="${index}"]`);
  if (warning) warning.hidden = !PEAK_TARGET_FIELDS.some(([key]) => peakTargetRisky(entry.targets[index]?.[key]));
  if (peakTargetRisky(text)) toast("That looks like a water cut or diuretic. Please confirm with your coach or doctor.");
}

function setShowDayField(showDate, field, value) {
  if (!isPrepDateKey(showDate) || !SHOW_DAY_FIELDS.some(([key]) => key === field)) return;
  peakWeekEntry(showDate, true).showDay[field] = prepText(String(value ?? "")).trim();
  saveState();
}

function addPeakWeekItem(showDate, day) {
  const index = Number(day);
  if (!isPrepDateKey(showDate) || !Number.isInteger(index) || index < 0 || index > PEAK_WEEK_DAYS) return;
  const input = document.getElementById(`peakCustom-${index}`);
  const text = prepText(String(input?.value || "")).trim();
  if (!text) return toast("Type the item first.");
  const entry = peakWeekEntry(showDate, true);
  if (entry.custom.length >= PEAK_CUSTOM_MAX) return toast(`Up to ${PEAK_CUSTOM_MAX} of your own items.`);
  entry.custom.push({ id: `c-${crypto.randomUUID()}`, day: index, text });
  if (input) input.value = "";
  saveState();
  render();
}

function removePeakWeekItem(showDate, id) {
  if (!isPrepDateKey(showDate)) return;
  const entry = peakWeekEntry(showDate, true);
  entry.custom = entry.custom.filter((item) => item.id !== id);
  delete entry.done[id];
  saveState();
  render();
}

function renderPeakItem(showDate, item, interactive) {
  const entry = peakWeekEntry(showDate);
  const fieldValue = item.field ? entry.showDay[item.field] || "" : "";
  const fieldLabel = SHOW_DAY_FIELDS.find(([key]) => key === item.field)?.[1] || "";
  const placeholder = { checkIn: "e.g. 8:00 AM, venue side door", pumpPlan: "e.g. bands, push-ups, start 20 min before", snacks: "e.g. what your coach planned" }[item.field] || "";
  const check = interactive
    ? `<button type="button" class="check-item prep-check ${item.done ? "done" : ""}" aria-pressed="${item.done}" onclick="togglePeakWeekItem('${showDate}','${item.id}')"><span>${item.done ? "OK" : ""}</span><p>${escapeHtml(item.text)}${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</p></button>`
    : `<div class="check-item"><span></span><p>${escapeHtml(item.text)}${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</p></div>`;
  const field = item.field ? `<div class="field prep-inline-field"><label for="showDay-${item.field}">${fieldLabel}</label><input id="showDay-${item.field}" maxlength="${PEAK_TEXT_MAX}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(fieldValue)}" ${interactive ? `onchange="setShowDayField('${showDate}','${item.field}',this.value)"` : "disabled"} /></div>` : "";
  const remove = item.custom && interactive ? `<button class="ghost-btn danger compact-btn" aria-label="Remove ${escapeHtml(item.text)}" onclick="removePeakWeekItem('${showDate}','${item.id}')">Remove</button>` : "";
  return `<div class="prep-item">${check}${remove}${field}</div>`;
}

function renderPeakTargets(showDate, day, interactive) {
  const risky = PEAK_TARGET_FIELDS.some(([field]) => peakTargetRisky(day.targets[field]));
  return `<div class="prep-targets"><p class="muted compact-note">Targets from your coach's plan. Leave blank to keep them the same as normal.</p>${PEAK_TARGET_FIELDS.map(([field, label]) => `<div class="prep-target-row"><label for="peakTarget-${day.day}-${field}">${label}</label><input id="peakTarget-${day.day}-${field}" maxlength="${PEAK_TEXT_MAX}" placeholder="Keep consistent, or your coach's target" value="${escapeHtml(day.targets[field] || "")}" ${interactive ? `onchange="setPeakWeekTarget('${showDate}',${day.day},'${field}',this.value)"` : "disabled"} /></div>`).join("")}<p class="prep-warning" data-peak-risk="${day.day}" ${risky ? "" : "hidden"}>Water cuts and diuretics are dangerous. Confirm this with your coach or a doctor.</p></div>`;
}

function renderPeakDay(showDate, day, interactive, open) {
  const doneCount = day.items.filter((item) => item.done).length;
  const body = `${day.items.map((item) => renderPeakItem(showDate, item, interactive)).join("")}${renderPeakTargets(showDate, day, interactive)}${interactive ? `<div class="prep-add"><input id="peakCustom-${day.day}" maxlength="${PEAK_TEXT_MAX}" placeholder="Add your own item" aria-label="Add your own item for ${escapeHtml(day.label)}" /><button class="secondary-btn" onclick="addPeakWeekItem('${showDate}',${day.day})">Add</button></div>` : ""}${day.day === 0 ? `<p class="prep-warning">${escapeHtml(PEAK_MEDICAL_TEXT)}</p>` : ""}`;
  return `<details class="prep-day ${day.isToday ? "today" : ""} ${day.past ? "past" : ""}" ${open ? "open" : ""}><summary><strong>${escapeHtml(day.label)}</strong><span class="muted">${day.date ? formatPrepDate(day.date) : ""}${day.isToday ? " · Today" : ""}</span><span class="badge">${doneCount}/${day.items.length}</span></summary><div class="checklist">${body}</div></details>`;
}

function formatPrepDate(key) {
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function renderPeakWeekCard() {
  const { showDate, daysOut } = peakWeekContext();
  if (!showDate || !inPeakWeek(daysOut)) return "";
  const today = peakWeekChecklist(showDate, daysOut).find((day) => day.isToday);
  const progress = peakWeekProgress(showDate);
  return `<section class="card pad peak-week-card"><div class="card-head"><div><p class="eyebrow">${daysOut === 0 ? "Show day" : "Peak week"}</p><h2>${daysOut === 0 ? "Today is the show" : `${daysOut} ${daysOut === 1 ? "day" : "days"} out`}</h2><p class="muted">Today&#039;s checklist and targets.</p></div><span class="badge amber">${progress.done}/${progress.total} done</span></div><p class="prep-safety">${escapeHtml(PEAK_SAFETY_TEXT)}</p>${renderPeakDay(showDate, today, true, true)}<div class="actions" style="margin-top:10px"><button class="secondary-btn" onclick="setView('prep')">Full Peak Week</button><button class="secondary-btn" onclick="openPosingPractice()">Posing Practice</button></div></section>`;
}

function renderPeakWeekTeaser() {
  const { showDate, daysOut } = peakWeekContext();
  if (!showDate || !Number.isInteger(daysOut) || daysOut <= PEAK_WEEK_DAYS || daysOut > PEAK_WEEK_TEASER_DAYS) return "";
  const starts = daysOut - PEAK_WEEK_DAYS;
  return `<section class="card pad peak-week-card"><div class="card-head"><div><p class="eyebrow">Peak week</p><h2>Starts in ${starts} ${starts === 1 ? "day" : "days"}</h2><p class="muted">Preview the checklist and agree the targets with your coach now.</p></div><button class="ghost-btn" onclick="setView('prep')">Preview</button></div></section>`;
}

function renderPeakWeekSection() {
  const { showDate, daysOut } = peakWeekContext();
  const interactive = Boolean(showDate) && Number.isInteger(daysOut) && daysOut >= 0;
  const days = peakWeekChecklist(interactive ? showDate : "", interactive ? daysOut : null);
  const status = !showDate
    ? "Preview. Set a show date in the Stage Timeline on Today to check items off."
    : daysOut < 0
      ? "Your show date has passed. Set the next one in the Stage Timeline on Today."
      : inPeakWeek(daysOut)
        ? `${daysOut === 0 ? "Show day" : `${daysOut} ${daysOut === 1 ? "day" : "days"} out`}. Today's list is open.`
        : `Preview: peak week starts ${formatPrepDate(prepAddDays(showDate, -PEAK_WEEK_DAYS))}. You can fill in targets and items now.`;
  const progress = interactive ? peakWeekProgress(showDate) : null;
  return `<section class="card pad" id="peak-week"><div class="card-head"><div><p class="eyebrow">Peak week and show day</p><h2>Day-by-day checklist</h2><p class="muted">${escapeHtml(status)}</p></div>${progress ? `<span class="badge amber">${progress.done}/${progress.total} done</span>` : ""}</div><p class="prep-safety">${escapeHtml(PEAK_SAFETY_TEXT)}</p><div class="prep-days">${days.map((day) => renderPeakDay(showDate, day, interactive, day.isToday)).join("")}</div></section>`;
}

// ---------- Posing practice ----------

function posingDivisionKey(value) {
  const text = String(value || "").toLowerCase().replace(/[’']/g, "");
  if (/womens? physique/.test(text)) return "womens-physique";
  if (/womens? bodybuilding/.test(text)) return "womens-bodybuilding";
  if (/classic/.test(text)) return "classic-physique";
  if (/mens? physique|physique/.test(text)) return "mens-physique";
  if (/figure/.test(text)) return "figure";
  if (/wellness/.test(text)) return "wellness";
  if (/bikini/.test(text)) return "bikini";
  if (/fitness/.test(text)) return "fitness";
  if (/bodybuilding/.test(text)) return "mens-bodybuilding";
  return "";
}

// The athlete's pick in the posing card, else their profile division, else
// a default by gender for non-competitive goals.
function profilePosingDivision() {
  const key = posingDivisionKey(state.profile?.division) || (/female|woman/i.test(String(state.profile?.gender || "")) ? "figure" : "mens-bodybuilding");
  return POSING_DIVISIONS.find((item) => item.key === key) || POSING_DIVISIONS[0];
}

function posingDivision() {
  const chosen = prepTools().posing.division;
  return POSING_DIVISIONS.find((item) => item.key === chosen) || profilePosingDivision();
}

function posingPoses(division = posingDivision(), quarterTurns = prepTools().posing.quarterTurns) {
  const mandatory = division.poses.filter((pose) => !/walk/i.test(pose));
  const extras = division.poses.filter((pose) => /walk/i.test(pose));
  // Quarter-turn divisions are judged only on the turns, so they always run.
  const turns = quarterTurns || !mandatory.length ? QUARTER_TURNS : [];
  return [...turns, ...mandatory, ...extras];
}

function posingSteps(config = prepTools().posing, poses = posingPoses()) {
  const hold = prepClamp(config.hold, POSING_LIMITS.hold);
  const rest = prepClamp(config.rest, POSING_LIMITS.rest);
  const rounds = prepClamp(config.rounds, POSING_LIMITS.rounds);
  const steps = [{ type: "ready", label: "Get ready", seconds: POSING_LEAD_IN_SECONDS, round: 1 }];
  for (let round = 1; round <= rounds; round += 1) {
    poses.forEach((pose, index) => {
      steps.push({ type: "pose", label: pose, seconds: hold, round });
      const last = round === rounds && index === poses.length - 1;
      if (!last && rest > 0) steps.push({ type: "rest", label: index === poses.length - 1 ? `Round ${round + 1} next` : "Rest", seconds: rest, round });
    });
  }
  let start = 0;
  return steps.map((step) => {
    const timed = { ...step, start };
    start += step.seconds;
    return timed;
  });
}

function posingTotalSeconds(steps) {
  const last = steps.at(-1);
  return last ? last.start + last.seconds : 0;
}

function posingPositionAt(steps, elapsedSeconds) {
  const total = posingTotalSeconds(steps);
  if (elapsedSeconds >= total) return { index: steps.length, remaining: 0, done: true };
  const index = Math.max(0, steps.findIndex((step) => elapsedSeconds < step.start + step.seconds));
  return { index, remaining: Math.ceil(steps[index].start + steps[index].seconds - elapsedSeconds), done: false };
}

// Practice minutes, 1 decimal, without the get-ready lead-in.
function posingMinutesFor(elapsedSeconds, steps) {
  const lead = steps[0]?.type === "ready" ? steps[0].seconds : 0;
  const seconds = Math.max(0, Math.min(elapsedSeconds, posingTotalSeconds(steps)) - lead);
  return Math.round(seconds / 6) / 10;
}

let posingSession = null;
let posingTickHandle = null;

function posingElapsedSeconds(now = Date.now()) {
  if (!posingSession) return 0;
  const running = posingSession.startedAt ? now - posingSession.startedAt : 0;
  return (posingSession.elapsedMs + running) / 1000;
}

function openPosingPractice() {
  setView("prep");
  setTimeout(() => document.getElementById?.("posing-practice")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
}

function setPosingOption(field, value) {
  const posing = prepTools().posing;
  if (field === "division") posing.division = POSING_DIVISIONS.some((item) => item.key === value) ? value : "";
  else if (field === "quarterTurns" || field === "bell") posing[field] = Boolean(value);
  else if (POSING_LIMITS[field]) posing[field] = prepClamp(value, POSING_LIMITS[field]);
  else return;
  saveState();
  render();
}

function posingCue() {
  if (prepTools().posing.bell && typeof playBoxingBell === "function") playBoxingBell();
  try { navigator?.vibrate?.(200); } catch {}
}

function startPosingRoutine() {
  const poses = posingPoses();
  if (!poses.length) return toast("No poses for this division.");
  const division = posingDivision();
  posingSession = { steps: posingSteps(prepTools().posing, poses), division: division.label, rounds: prepTools().posing.rounds, startedAt: Date.now(), elapsedMs: 0, lastIndex: 0 };
  if (typeof primeTimerAudio === "function") primeTimerAudio();
  ensurePosingTick();
  render();
}

function ensurePosingTick() {
  if (posingTickHandle || !posingSession?.startedAt) return;
  posingTickHandle = setInterval(() => posingTick(), 250);
}

function clearPosingTick() {
  if (posingTickHandle) clearInterval(posingTickHandle);
  posingTickHandle = null;
}

function posingTick(now = Date.now()) {
  if (!posingSession) return clearPosingTick();
  const elapsed = posingElapsedSeconds(now);
  const position = posingPositionAt(posingSession.steps, elapsed);
  if (position.done) return finishPosingRoutine(elapsed);
  if (position.index !== posingSession.lastIndex) {
    posingSession.lastIndex = position.index;
    if (posingSession.steps[position.index].type === "pose") posingCue();
    render();
    return;
  }
  const time = document.querySelector?.("[data-posing-time]");
  if (time) time.textContent = formatTime(position.remaining);
  const step = posingSession.steps[position.index];
  document.querySelector?.("[data-posing-face]")?.style?.setProperty("--progress", `${Math.min(360, ((elapsed - step.start) / step.seconds) * 360)}deg`);
}

function pausePosingRoutine() {
  if (!posingSession) return;
  if (posingSession.startedAt) {
    posingSession.elapsedMs += Date.now() - posingSession.startedAt;
    posingSession.startedAt = null;
    clearPosingTick();
  } else {
    posingSession.startedAt = Date.now();
    ensurePosingTick();
  }
  render();
}

function logPosingMinutes(minutes, note) {
  if (!(minutes > 0)) return false;
  // Same shape savePrepLog writes, so lists, reports and coach check-ins read it.
  state.prepLogs.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), cardioType: "", cardioMinutes: 0, steps: 0, posingMinutes: minutes, notes: note });
  saveState();
  return true;
}

function finishPosingRoutine(elapsed = posingElapsedSeconds()) {
  if (!posingSession) return;
  const session = posingSession;
  posingSession = null;
  clearPosingTick();
  const minutes = posingMinutesFor(elapsed, session.steps);
  const complete = elapsed >= posingTotalSeconds(session.steps);
  if (complete) posingCue();
  const logged = logPosingMinutes(minutes, `Posing practice: ${session.division}, ${complete ? `${session.rounds} ${session.rounds === 1 ? "round" : "rounds"}` : "stopped early"}`);
  toast(logged ? `${minutes} posing ${minutes === 1 ? "minute" : "minutes"} saved to prep activity.` : "Posing practice ended.");
  render();
}

function stopPosingRoutine() {
  if (!posingSession) return;
  const elapsed = posingElapsedSeconds();
  const minutes = posingMinutesFor(elapsed, posingSession.steps);
  if (minutes >= 0.5 && window.confirm(`Save ${minutes} posing minutes to your prep activity?`)) return finishPosingRoutine(elapsed);
  posingSession = null;
  clearPosingTick();
  toast("Posing practice stopped.");
  render();
}

function renderPosingOverlay() {
  if (!posingSession) return "";
  const elapsed = posingElapsedSeconds();
  const { steps } = posingSession;
  const position = posingPositionAt(steps, elapsed);
  const step = steps[Math.min(position.index, steps.length - 1)];
  const next = steps.slice(position.index + 1).find((item) => item.type === "pose");
  const progress = step ? Math.min(360, ((elapsed - step.start) / step.seconds) * 360) : 360;
  const paused = !posingSession.startedAt;
  if (!paused) setTimeout(ensurePosingTick, 0);
  return `<div class="rest-overlay posing-overlay" role="dialog" aria-modal="true" aria-labelledby="posingTitle"><div class="rest-overlay-inner"><div class="rest-overlay-head"><p class="eyebrow" id="posingTitle">Posing practice · ${escapeHtml(posingSession.division)}</p><span class="badge">Round ${step.round} of ${posingSession.rounds}</span></div><h2 class="posing-pose">${escapeHtml(step.label)}</h2><p class="muted" style="margin:0">${step.type === "pose" ? "Hold, breathe, stay tight." : next ? `Next: ${escapeHtml(next.label)}` : "Last pose next."}</p><div class="timer-face timer-face-large" data-posing-face style="--progress:${progress}deg"><div style="text-align:center"><strong data-posing-time>${formatTime(position.remaining)}</strong><p class="muted">${paused ? "Paused" : step.type === "pose" ? "Hold" : "Relax"}</p></div></div><div class="rest-overlay-controls"><div class="actions"><button class="secondary-btn" onclick="pausePosingRoutine()">${paused ? "Resume" : "Pause"}</button><button class="ghost-btn danger" onclick="stopPosingRoutine()">Stop</button></div></div></div></div>`;
}

function renderPosingCard() {
  const posing = prepTools().posing;
  const division = posingDivision();
  const poses = posingPoses(division, posing.quarterTurns);
  const steps = posingSteps(posing, poses);
  const minutes = Math.round((posingTotalSeconds(steps) - POSING_LEAD_IN_SECONDS) / 6) / 10;
  const hasMandatories = division.poses.some((pose) => !/walk/i.test(pose));
  const number = (field, label, step = 1) => `<div class="field"><label for="posing-${field}">${label}</label><input id="posing-${field}" type="number" inputmode="numeric" min="${POSING_LIMITS[field][0]}" max="${POSING_LIMITS[field][1]}" step="${step}" value="${posing[field]}" onchange="setPosingOption('${field}', this.value)" /></div>`;
  const weekMinutes = state.prepLogs.filter((entry) => isWithinDays(entry.date, 7)).reduce((sum, entry) => sum + (Number(entry.posingMinutes) || 0), 0);
  return `<section class="card pad" id="posing-practice"><div class="card-head"><div><p class="eyebrow">Posing practice</p><h2>${escapeHtml(division.label)} routine</h2><p class="muted">About ${minutes} min · ${weekMinutes ? `${Math.round(weekMinutes * 10) / 10} posing min logged this week` : "nothing logged this week yet"}</p></div></div><div class="grid two"><div class="field"><label for="posing-division">Division</label><select id="posing-division" onchange="setPosingOption('division', this.value)"><option value="" ${posing.division ? "" : "selected"}>From my profile (${escapeHtml(profilePosingDivision().label)})</option>${POSING_DIVISIONS.map((item) => `<option value="${item.key}" ${posing.division === item.key ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></div>${number("hold", "Hold per pose (s)")}${number("rest", "Rest between poses (s)")}${number("rounds", "Rounds")}</div>${hasMandatories ? `<label class="toggle-row"><input type="checkbox" ${posing.quarterTurns ? "checked" : ""} onchange="setPosingOption('quarterTurns', this.checked)" /> <span>Include quarter turns</span></label>` : ""}<label class="toggle-row"><input type="checkbox" ${posing.bell ? "checked" : ""} onchange="setPosingOption('bell', this.checked)" /> <span>Bell at each new pose</span></label><ol class="posing-list">${poses.map((pose) => `<li>${escapeHtml(pose)}</li>`).join("")}</ol><p class="muted compact-note">Common NPC/IFBB-style mandatories. Check your federation's rules. Finished minutes are saved to prep activity.</p><button class="primary-btn" onclick="startPosingRoutine()">Start Posing Practice</button></section>`;
}

function renderPrepTools() {
  return `<div class="compact-page-header"><p class="eyebrow">Contest prep</p><h1>Peak week, show day, and posing.</h1></div><div class="grid prep-stack">${renderPeakWeekSection()}${renderPosingCard()}</div>`;
}

// ---------- Warm-up and plate math ----------

function prepWeightUnits() {
  return weightUnit() === "kg" ? "metric" : "imperial";
}

function prepFix(value) {
  return Math.round(value * 100) / 100;
}

function barKind(equipment) {
  const text = String(equipment || "");
  if (/smith/i.test(text)) return "smith";
  if (/barbell/i.test(text)) return "barbell";
  return "";
}

function barWeightFor(kind, units = prepWeightUnits()) {
  return prepTools().barWeight[kind === "smith" ? "smith" : "barbell"][units];
}

// Plates per side for a total load. Works in hundredths so 2.5 and 1.25
// never drift; every plate is a multiple of the smallest, so greedy is exact.
function platesPerSide(total, { unit = weightUnit(), bar = DEFAULT_BAR_WEIGHT[unit === "kg" ? "metric" : "imperial"] } = {}) {
  const plates = PLATE_SETS[unit === "kg" ? "kg" : "lb"];
  const load = Number(total);
  if (!Number.isFinite(load) || load <= 0) return { ok: false, reason: "empty", bar, plates: [] };
  if (load < bar - 1e-9) return { ok: false, reason: "below-bar", bar, plates: [] };
  const perSideCents = Math.round(((load - bar) / 2) * 100);
  let left = perSideCents;
  const used = [];
  plates.forEach((plate) => {
    const cents = Math.round(plate * 100);
    const count = Math.floor(left / cents);
    if (count > 0) {
      used.push({ plate, count });
      left -= count * cents;
    }
  });
  const smallest = plates.at(-1);
  const below = prepFix(bar + ((perSideCents - left) / 100) * 2);
  return {
    ok: left === 0,
    reason: left === 0 ? "" : "not-loadable",
    bar,
    perSide: prepFix(perSideCents / 100),
    plates: used,
    nearestBelow: below,
    nearestAbove: left === 0 ? below : prepFix(below + smallest * 2)
  };
}

function formatPlates(result) {
  if (!result.plates.length) return "bar only";
  return `${result.plates.flatMap(({ plate, count }) => Array(count).fill(formatWeight(plate, 2))).join(" + ")} per side`;
}

// Loadable weight: bar plus pairs of the smallest plate for barbells,
// 5 lb / 2.5 kg steps for dumbbells and machines.
function roundLoad(value, { unit = weightUnit(), bar = 0 } = {}) {
  const step = unit === "kg" ? 2.5 : 5;
  if (bar > 0) return Math.max(bar, prepFix(bar + Math.round((value - bar) / step) * step));
  return prepFix(Math.round(value / step) * step);
}

// 2-4 ramp sets up to the first working set; lighter loads need fewer.
function warmupSets(workingWeight, { unit = weightUnit(), bar = 0 } = {}) {
  const working = Number(workingWeight);
  if (!Number.isFinite(working) || working <= 0) return { ok: false, reason: "empty", sets: [] };
  if (bar > 0 && working < bar - 1e-9) return { ok: false, reason: "below-bar", bar, sets: [] };
  const kg = unit === "kg";
  const heavy = working >= (bar > 0 ? (kg ? 85 : 185) : (kg ? 45 : 100));
  const medium = working >= (bar > 0 ? (kg ? 40 : 95) : (kg ? 20 : 40));
  const scheme = bar > 0
    ? (heavy ? [[0.5, 8], [0.7, 5], [0.85, 2]] : medium ? [[0.6, 6], [0.8, 3]] : [[0.75, 5]])
    : (heavy ? [[0.5, 10], [0.7, 6], [0.85, 3]] : medium ? [[0.5, 10], [0.75, 5]] : [[0.6, 8]]);
  const sets = [];
  if (bar > 0 && working > bar) sets.push({ weight: bar, reps: 10, label: "Bar" });
  scheme.forEach(([percent, reps]) => {
    const weight = roundLoad(working * percent, { unit, bar });
    const previous = sets.at(-1)?.weight ?? 0;
    if (weight > previous && weight < working && weight > 0) sets.push({ weight, reps, label: `${Math.round(percent * 100)}%` });
  });
  return { ok: true, reason: "", sets: sets.slice(0, 4), working };
}

function liveExerciseEquipment(exercise) {
  return exercise?.equipment || exerciseLibrary.find((item) => item.id === exercise?.id)?.equipment || "";
}

function isLoadedExercise(exercise) {
  if (!exercise || isRepsOnlyExercise(exercise)) return false;
  return !/^(bodyweight|pull-up bar|dip|stability ball)/i.test(liveExerciseEquipment(exercise));
}

const loadHelperWeights = new Map();
const openLoadHelpers = new Set();

function loadHelperKey(exercise, exIndex) {
  return `${exIndex}:${exercise?.id || ""}`;
}

// The first working set's weight, else the last session's first working set.
function defaultWorkingWeight(exercise) {
  const fromSession = (exercise.sets || []).find((set) => !set.dropSet && Number(set.weight) > 0);
  if (fromSession) return Number(fromSession.weight);
  const previous = typeof lastExercisePerformance === "function" ? lastExercisePerformance(exercise.id) : null;
  const last = previous?.sets?.find((set) => !set.dropSet && Number(set.weight) > 0);
  return last ? Number(last.weight) : "";
}

function renderLoadHelperOutput(exercise, exIndex) {
  const unit = weightUnit();
  const kind = barKind(liveExerciseEquipment(exercise));
  const bar = kind ? barWeightFor(kind) : 0;
  const key = loadHelperKey(exercise, exIndex);
  const working = loadHelperWeights.has(key) ? loadHelperWeights.get(key) : defaultWorkingWeight(exercise);
  const warm = warmupSets(working, { unit, bar });
  if (warm.reason === "empty") return '<p class="muted compact-note">Enter your first working weight to see warm-ups.</p>';
  if (warm.reason === "below-bar") return `<p class="prep-warning">${formatWeight(working, 2)} ${unit} is lighter than the ${formatWeight(bar, 2)} ${unit} bar, so it can't be loaded. Check the weight or the bar setting.</p>`;
  const plateText = (weight) => {
    if (!kind) return "";
    const plates = platesPerSide(weight, { unit, bar });
    return plates.ok ? ` · ${escapeHtml(formatPlates(plates))}` : "";
  };
  const workingLoad = platesPerSide(warm.working, { unit, bar });
  const workingPlates = kind
    ? workingLoad.ok
      ? `<p class="compact-note"><strong>Working ${formatWeight(warm.working, 2)} ${unit}:</strong> ${escapeHtml(formatPlates(workingLoad))}</p>`
      : `<p class="prep-warning">${formatWeight(warm.working, 2)} ${unit} can't be loaded exactly with standard plates. Nearest: ${formatWeight(workingLoad.nearestBelow, 2)} or ${formatWeight(workingLoad.nearestAbove, 2)} ${unit}.</p>`
    : "";
  const rows = warm.sets.length
    ? `<ol class="warmup-list">${warm.sets.map((set) => `<li><strong>${set.label === "Bar" ? `Empty bar (${formatWeight(set.weight, 2)} ${unit})` : `${formatWeight(set.weight, 2)} ${unit}`}</strong> × ${set.reps}${set.label === "Bar" ? "" : plateText(set.weight)}</li>`).join("")}</ol>`
    : '<p class="muted compact-note">Light enough to start with your working sets.</p>';
  return `<p class="eyebrow" style="margin-top:8px">Warm-up</p>${rows}${workingPlates}<p class="muted compact-note">Suggestions only. Nothing is logged.</p>`;
}

function renderLoadHelpers(exercise, exIndex) {
  if (!isLoadedExercise(exercise)) return "";
  const unit = weightUnit();
  const kind = barKind(liveExerciseEquipment(exercise));
  const key = loadHelperKey(exercise, exIndex);
  const working = loadHelperWeights.has(key) ? loadHelperWeights.get(key) : defaultWorkingWeight(exercise);
  const barField = kind ? `<div class="field"><label for="barWeight-${exIndex}">${kind === "smith" ? "Smith bar" : "Bar"} (${unit})</label><input id="barWeight-${exIndex}" type="number" inputmode="decimal" min="0" step="0.5" value="${escapeHtml(barWeightFor(kind))}" onchange="setBarWeight('${kind}', this.value)" /></div>` : "";
  return `<details class="exercise-options prep-load-helper" ${openLoadHelpers.has(key) ? "open" : ""} ontoggle="rememberLoadHelper(${exIndex}, this.open)"><summary class="ghost-btn">${kind ? "Warm-up and plates" : "Warm-up"}</summary><div class="prep-load-body"><div class="grid two"><div class="field"><label for="workingWeight-${exIndex}">First working set (${unit})</label><input id="workingWeight-${exIndex}" type="number" inputmode="decimal" min="0" value="${escapeHtml(working)}" oninput="setLoadHelperWeight(${exIndex}, this.value)" /></div>${barField}</div>${kind === "smith" ? '<p class="muted compact-note">Smith bars vary by machine. Set yours once and it is saved.</p>' : ""}<div data-load-output="${exIndex}">${renderLoadHelperOutput(exercise, exIndex)}</div></div></details>`;
}

function rememberLoadHelper(exIndex, open) {
  const exercise = state.activeWorkout?.exercises?.[exIndex];
  const key = loadHelperKey(exercise, exIndex);
  if (open) openLoadHelpers.add(key);
  else openLoadHelpers.delete(key);
}

function setLoadHelperWeight(exIndex, value) {
  const exercise = state.activeWorkout?.exercises?.[exIndex];
  if (!exercise) return;
  loadHelperWeights.set(loadHelperKey(exercise, exIndex), String(value ?? ""));
  const output = document.querySelector?.(`[data-load-output="${exIndex}"]`);
  if (output) output.innerHTML = renderLoadHelperOutput(exercise, exIndex);
}

function setBarWeight(kind, value) {
  const units = prepWeightUnits();
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > MAX_BAR_WEIGHT[units]) {
    toast(`Bar weight must be between 0 and ${MAX_BAR_WEIGHT[units]} ${weightUnit()}.`);
    return render();
  }
  prepTools().barWeight[kind === "smith" ? "smith" : "barbell"][units] = prepFix(number);
  saveState();
  render();
}

// ---------- Wiring ----------

const baseRenderToolkitExerciseControlsForPrep = renderToolkitExerciseControls;
renderToolkitExerciseControls = function renderExerciseControlsWithLoadHelpers(exercise, exIndex) {
  return `${baseRenderToolkitExerciseControlsForPrep(exercise, exIndex)}${renderLoadHelpers(exercise, exIndex)}`;
};

const baseRenderTodayForPrep = renderToday;
renderToday = function renderTodayWithPeakWeek() {
  const html = baseRenderTodayForPrep();
  const card = renderPeakWeekCard() || renderPeakWeekTeaser();
  if (!card) return html;
  const anchor = html.indexOf('<div style="margin-top: 16px;">');
  if (anchor === -1) return `${html}<div style="margin-top: 16px;">${card}</div>`;
  return `${html.slice(0, anchor)}<div style="margin-top: 16px;">${card}</div>${html.slice(anchor)}`;
};

const baseRenderContentForPrep = renderContent;
renderContent = function renderContentWithPrep() {
  const content = state.view === "prep" ? renderPrepTools() : baseRenderContentForPrep();
  return `${renderPosingOverlay()}${content}`;
};

registerMoreSection(22, () => {
  const { showDate, daysOut } = peakWeekContext();
  const status = !showDate ? "Preview the checklist any time. Add a show date on Today to use it." : inPeakWeek(daysOut) ? "You're in peak week." : daysOut < 0 ? "Show complete. Set the next date on Today." : `${daysOut} days to your show.`;
  return `<section class="card pad"><p class="eyebrow">Contest prep</p><h2>Peak week and posing</h2><p class="muted">${escapeHtml(status)}</p><div class="actions"><button class="secondary-btn" onclick="setView('prep')">Peak Week</button><button class="secondary-btn" onclick="openPosingPractice()">Posing Practice</button></div></section>`;
});

const baseResetForPrep = resetDemoData;
resetDemoData = function resetWithPrep() {
  posingSession = null;
  clearPosingTick();
  loadHelperWeights.clear();
  openLoadHelpers.clear();
  baseResetForPrep();
  prepMigrateState();
  saveState();
  render();
};

saveState();
render();
