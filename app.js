const STORE_KEY = "stageforge-v1";
const APP_NAME = "Mass Method";
const DEFAULT_REST_SECONDS = 180;
// Declared before loadState() runs: sanitizeStoredState reads it at script load.
const LOGBOOK_RANGES = [7, 14, 30];
// WebKit's localStorage quota is 5 MiB per origin, counted in bytes.
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
let pendingSaveTimer = null;
let lastStoredBytes = 0;
let storageNearlyFullWarned = false;
// While a coach PDF is built, numbers and dates use Western digits and the
// Gregorian calendar: the PDF only carries Latin-1 text, so Arabic-Indic or
// Bengali digits (and Hijri dates) would print as blanks.
let reportFormatting = false;
// Numbers in a coach PDF: one format throughout (en-US), so a German PDF
// never mixes "201,4" with "201.4" or prints 1.025 for 1,025.
function reportNumberLocale() {
  return reportFormatting ? "en-US" : undefined;
}

function reportLocale() {
  if (!reportFormatting) return undefined;
  // The athlete's own date order (UK coaches read 07/10/2026 as 7 October),
  // with Latin digits and the Gregorian calendar the PDF can print.
  try {
    const base = new Intl.DateTimeFormat().resolvedOptions().locale.split("-u-")[0];
    return new Intl.Locale(base, { calendar: "gregory", numberingSystem: "latn" }).toString();
  } catch {
    return "en-US";
  }
}

// WebKit charges localStorage 2 bytes per character whenever the string is
// held internally as 16-bit, which depends on how it was built, not on what
// it contains: one curly apostrophe (Smart Punctuation) makes JSON.stringify
// return a 16-bit string, and .replace() keeps it 16-bit. So escape every
// non-ASCII character as \uXXXX (JSON.parse reads them back unchanged) and
// rebuild the result through TextDecoder, which returns an 8-bit string for
// ASCII input. Measured in WKWebView: the logbook then fits twice as much.
function serializeForStorage(value) {
  const ascii = JSON.stringify(value).replace(/[\u0080-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  try {
    if (typeof TextEncoder === "function" && typeof TextDecoder === "function") return new TextDecoder().decode(new TextEncoder().encode(ascii));
  } catch {}
  return ascii;
}
// A plan or live workout from an imported program/backup must stay renderable:
// 50k exercises froze the session view and persisted across launches.
// What the builder, live workout, and coach imports allow.
const MAX_PLAN_EXERCISES = 40;
// Load-time safety net only: above anything the UI can reach (the library has
// ~120 distinct exercises), so it never truncates a real workout or template.
const MAX_STORED_PLAN_EXERCISES = 150;
const MAX_PLAN_SETS = 14;
const MAX_STATE_DEPTH = 16;

// Replaces objects nested deeper than `maxDepth` with null, iteratively (no
// recursion), so a crafted backup with thousands of nested levels cannot blow
// the stack in the snapshot/restore paths that walk the whole state.
function pruneDeepObjects(root, maxDepth = MAX_STATE_DEPTH) {
  if (!root || typeof root !== "object") return root;
  const stack = [[root, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    const keys = Array.isArray(node) ? node.keys() : Object.keys(node);
    for (const key of keys) {
      const child = node[key];
      if (!child || typeof child !== "object") continue;
      if (depth + 1 >= maxDepth) node[key] = null;
      else stack.push([child, depth + 1]);
    }
  }
  return root;
}

const muscles = ["chest", "back", "shoulders", "arms", "legs"];
const divisionOptions = [
  "Men's Bodybuilding",
  "Classic Physique",
  "Men's Physique",
  "Women's Bodybuilding",
  "Women's Physique",
  "Figure",
  "Wellness",
  "Bikini",
  "Fitness",
  "Transformation Goal",
  "Off-season Size Goal",
  "Contest Prep Goal"
];

const exerciseLibrary = [
  { id: "incline-db-press", name: "Incline Dumbbell Press", muscle: "chest", equipment: "Dumbbells, bench", hotel: true, cue: "Upper chest stretch, controlled deep reps." },
  { id: "flat-db-press", name: "Flat Dumbbell Press", muscle: "chest", equipment: "Dumbbells, bench", hotel: true, cue: "Press slightly inward and keep shoulder blades pinned." },
  { id: "barbell-bench", name: "Barbell Bench Press", muscle: "chest", equipment: "Barbell, bench", hotel: false, cue: "Heavy mechanical tension for off-season pressing." },
  { id: "low-cable-fly", name: "Low Cable Fly", muscle: "chest", equipment: "Cable crossover", hotel: true, cue: "Low-to-high path for upper chest finish." },
  { id: "weighted-dip", name: "Weighted Chest Dip", muscle: "chest", equipment: "Dip station", hotel: false, cue: "Forward lean, deep stretch, no shoulder pain." },

  { id: "lat-pulldown", name: "Lat Pulldown", muscle: "back", equipment: "Cable station", hotel: true, cue: "Drive elbows down toward the hips." },
  { id: "one-arm-db-row", name: "One-Arm Dumbbell Row", muscle: "back", equipment: "Dumbbell, bench", hotel: true, cue: "Stretch the lat, then row to the pocket." },
  { id: "cable-row", name: "Seated Cable Row", muscle: "back", equipment: "Cable row", hotel: false, cue: "Lead with elbows and hold the squeeze." },
  { id: "barbell-row", name: "Barbell Row", muscle: "back", equipment: "Barbell", hotel: false, cue: "Rigid torso, row to lower ribs." },
  { id: "rope-pullover", name: "Rope Cable Pullover", muscle: "back", equipment: "Cable, rope", hotel: true, cue: "Great lat isolation when dumbbells are light." },

  { id: "db-shoulder-press", name: "Dumbbell Shoulder Press", muscle: "shoulders", equipment: "Dumbbells, bench", hotel: true, cue: "Press in a slight arc, ribs down." },
  { id: "db-lateral-raise", name: "Dumbbell Lateral Raise", muscle: "shoulders", equipment: "Dumbbells", hotel: true, cue: "Raise out, not up. Stop before traps take over." },
  { id: "cable-lateral-raise", name: "Cable Lateral Raise", muscle: "shoulders", equipment: "Cable handle", hotel: true, cue: "Constant tension for capped delts." },
  { id: "rear-delt-fly", name: "Rear Delt Fly", muscle: "shoulders", equipment: "Dumbbells or cable", hotel: true, cue: "Sweep wide, pause, keep neck relaxed." },
  { id: "machine-press", name: "Machine Shoulder Press", muscle: "shoulders", equipment: "Machine", hotel: false, cue: "Stable overload for heavy top sets." },

  { id: "ez-curl", name: "EZ-Bar Curl", muscle: "arms", equipment: "EZ bar", hotel: false, cue: "No swing, elbows slightly forward." },
  { id: "db-curl", name: "Alternating Dumbbell Curl", muscle: "arms", equipment: "Dumbbells", hotel: true, cue: "Supinate hard at the top." },
  { id: "hammer-curl", name: "Hammer Curl", muscle: "arms", equipment: "Dumbbells", hotel: true, cue: "Neutral grip for brachialis and forearms." },
  { id: "rope-pushdown", name: "Rope Triceps Pushdown", muscle: "arms", equipment: "Cable, rope", hotel: true, cue: "Spread the rope and lock the triceps." },
  { id: "overhead-rope-extension", name: "Overhead Rope Extension", muscle: "arms", equipment: "Cable, rope", hotel: true, cue: "Long-head triceps stretch." },

  { id: "barbell-squat", name: "Barbell Back Squat", muscle: "legs", equipment: "Barbell, rack", hotel: false, cue: "Heavy quad and glute base builder." },
  { id: "db-bulgarian-split-squat", name: "DB Bulgarian Split Squat", muscle: "legs", equipment: "Dumbbells, bench", hotel: true, cue: "Hotel-gym leg destroyer with limited load." },
  { id: "db-rdl", name: "Dumbbell Romanian Deadlift", muscle: "legs", equipment: "Dumbbells", hotel: true, cue: "Hips back, hamstrings loaded." },
  { id: "cable-kickback", name: "Cable Glute Kickback", muscle: "legs", equipment: "Cable, ankle cuff", hotel: true, cue: "Pause in hip extension." },
  { id: "standing-calf-raise", name: "Standing Dumbbell Calf Raise", muscle: "legs", equipment: "Dumbbells, step", hotel: true, cue: "Full stretch, hard top contraction." },

  { id: "incline-barbell-press", name: "Incline Barbell Press", muscle: "chest", equipment: "Barbell, incline bench", hotel: false, cue: "Upper chest overload with a stable bar path." },
  { id: "decline-barbell-press", name: "Decline Barbell Press", muscle: "chest", equipment: "Barbell, decline bench", hotel: false, cue: "Lower chest pressing with less shoulder demand." },
  { id: "smith-incline-press", name: "Smith Machine Incline Press", muscle: "chest", equipment: "Smith machine", hotel: false, cue: "Lock in the path and push close to failure." },
  { id: "machine-chest-press", name: "Machine Chest Press", muscle: "chest", equipment: "Chest press machine", hotel: false, cue: "Stable pressing for hard top sets and drop sets." },
  { id: "machine-decline-chest-press", name: "Machine Decline Chest Press", muscle: "chest", equipment: "Decline chest press machine", hotel: false, cue: "Keep shoulder blades pinned and press through the lower-chest line." },
  { id: "machine-incline-chest-press", name: "Machine Incline Chest Press", muscle: "chest", equipment: "Incline chest press machine", hotel: false, cue: "Set the seat for an upper-chest path and keep the shoulders down." },
  { id: "pec-deck", name: "Pec Deck Fly", muscle: "chest", equipment: "Pec deck", hotel: false, cue: "Drive elbows together and pause the squeeze." },
  { id: "high-cable-fly", name: "High Cable Fly", muscle: "chest", equipment: "Cable crossover", hotel: true, cue: "High-to-low path for lower chest finish." },
  { id: "mid-cable-fly", name: "Mid Cable Fly", muscle: "chest", equipment: "Cable crossover", hotel: true, cue: "Keep tension even through the midline." },
  { id: "db-fly", name: "Dumbbell Fly", muscle: "chest", equipment: "Dumbbells, bench", hotel: true, cue: "Long stretch, soft elbows, controlled arc." },
  { id: "machine-fly-press", name: "Machine Fly-Press", muscle: "chest", equipment: "Converging machine", hotel: false, cue: "Blend press and fly for chest-first reps." },
  { id: "push-up", name: "Deficit Push-Up", muscle: "chest", equipment: "Handles or dumbbells", hotel: true, cue: "Use depth and tempo when load is limited." },
  { id: "squeeze-press", name: "Dumbbell Squeeze Press", muscle: "chest", equipment: "Dumbbells, bench", hotel: true, cue: "Crush dumbbells together for constant pec tension." },
  { id: "single-arm-cable-press", name: "Single-Arm Cable Press", muscle: "chest", equipment: "Cable handle", hotel: true, cue: "Press across the body and finish with pec squeeze." },
  { id: "landmine-press-chest", name: "Landmine Chest Press", muscle: "chest", equipment: "Landmine", hotel: false, cue: "Angled press for upper chest and serratus." },
  { id: "chest-press-drop", name: "Machine Chest Press Drop Set", muscle: "chest", equipment: "Chest press machine", hotel: false, cue: "Safe high-intensity work after free weights." },
  { id: "cable-pressaround", name: "Cable Press-Around", muscle: "chest", equipment: "Cable handle", hotel: true, cue: "Press around the torso for a strong adduction finish." },

  { id: "pull-up", name: "Pull-Up", muscle: "back", equipment: "Pull-up bar", hotel: false, cue: "Chest up, elbows down, no swinging." },
  { id: "neutral-pulldown", name: "Neutral-Grip Pulldown", muscle: "back", equipment: "Cable station", hotel: true, cue: "Neutral grip keeps tension in the lower lats." },
  { id: "wide-pulldown", name: "Wide-Grip Pulldown", muscle: "back", equipment: "Cable station", hotel: true, cue: "Pull to upper chest with controlled scapular motion." },
  { id: "tbar-row", name: "T-Bar Row", muscle: "back", equipment: "T-bar row", hotel: false, cue: "Heavy mid-back thickness with braced torso." },
  { id: "chest-supported-row", name: "Chest-Supported Row", muscle: "back", equipment: "Incline bench, dumbbells", hotel: true, cue: "Remove lower-back fatigue and row strictly." },
  { id: "machine-row", name: "Machine Row", muscle: "back", equipment: "Row machine", hotel: false, cue: "Load the mid-back and hold the contraction." },
  { id: "meadows-row", name: "Meadows Row", muscle: "back", equipment: "Landmine", hotel: false, cue: "Great lat and upper-back angle from the hip." },
  { id: "rack-pull", name: "Rack Pull", muscle: "back", equipment: "Barbell, rack", hotel: false, cue: "Heavy trap and erector overload." },
  { id: "db-pullover", name: "Dumbbell Pullover", muscle: "back", equipment: "Dumbbell, bench", hotel: true, cue: "Stretch lats over the bench and pull with elbows." },
  { id: "straight-arm-pulldown", name: "Straight-Arm Pulldown", muscle: "back", equipment: "Cable bar or rope", hotel: true, cue: "Keep arms long and drive from the lats." },
  { id: "face-pull", name: "Face Pull", muscle: "back", equipment: "Cable, rope", hotel: true, cue: "Rear delt and upper-back health work." },
  { id: "shrug", name: "Dumbbell Shrug", muscle: "back", equipment: "Dumbbells", hotel: true, cue: "Lift traps up and slightly back, no rolling." },
  { id: "single-arm-lat-pulldown", name: "Single-Arm Lat Pulldown", muscle: "back", equipment: "Cable handle", hotel: true, cue: "Pull elbow into the back pocket." },
  { id: "seal-row", name: "Seal Row", muscle: "back", equipment: "Bench, barbell or dumbbells", hotel: false, cue: "Strict upper-back row with no body English." },
  { id: "inverted-row", name: "Inverted Row", muscle: "back", equipment: "Bar or Smith machine", hotel: false, cue: "Bodyweight row for mid-back volume." },

  { id: "barbell-overhead-press", name: "Barbell Overhead Press", muscle: "shoulders", equipment: "Barbell", hotel: false, cue: "Heavy delt and triceps compound." },
  { id: "smith-shoulder-press", name: "Smith Machine Shoulder Press", muscle: "shoulders", equipment: "Smith machine", hotel: false, cue: "Stable overload without cleaning dumbbells up." },
  { id: "arnold-press", name: "Arnold Press", muscle: "shoulders", equipment: "Dumbbells", hotel: true, cue: "Rotate smoothly and control the eccentric." },
  { id: "machine-lateral-raise", name: "Machine Lateral Raise", muscle: "shoulders", equipment: "Lateral raise machine", hotel: false, cue: "Pure side-delt tension with minimal cheating." },
  { id: "lean-away-lateral-raise", name: "Lean-Away Cable Lateral Raise", muscle: "shoulders", equipment: "Cable handle", hotel: true, cue: "Bias the lengthened side delt." },
  { id: "seated-lateral-raise", name: "Seated Dumbbell Lateral Raise", muscle: "shoulders", equipment: "Dumbbells, bench", hotel: true, cue: "Strict reps with no leg drive." },
  { id: "front-raise", name: "Dumbbell Front Raise", muscle: "shoulders", equipment: "Dumbbells", hotel: true, cue: "Use sparingly after heavy pressing." },
  { id: "cable-front-raise", name: "Cable Front Raise", muscle: "shoulders", equipment: "Cable handle", hotel: true, cue: "Constant anterior delt tension." },
  { id: "reverse-pec-deck", name: "Reverse Pec Deck", muscle: "shoulders", equipment: "Reverse pec deck", hotel: false, cue: "Rear delt isolation with a strong pause." },
  { id: "cable-rear-delt-fly", name: "Cable Rear Delt Fly", muscle: "shoulders", equipment: "Cable handles", hotel: true, cue: "Cross cables and sweep wide." },
  { id: "upright-row", name: "Cable Upright Row", muscle: "shoulders", equipment: "Cable bar or rope", hotel: true, cue: "Pull wide and stop before shoulder pinch." },
  { id: "y-raise", name: "Incline Y-Raise", muscle: "shoulders", equipment: "Dumbbells, incline bench", hotel: true, cue: "Lower-trap and rear-delt detail work." },
  { id: "bus-driver", name: "Plate Bus Driver", muscle: "shoulders", equipment: "Plate", hotel: false, cue: "High-rep delt burn finisher." },
  { id: "behind-neck-press", name: "Behind-Neck Press", muscle: "shoulders", equipment: "Barbell or Smith", hotel: false, cue: "Advanced only, use pain-free range." },
  { id: "cable-shoulder-press", name: "Standing Cable Shoulder Press", muscle: "shoulders", equipment: "Cable handles", hotel: true, cue: "Press up and in with constant tension." },

  { id: "barbell-curl", name: "Barbell Curl", muscle: "arms", equipment: "Barbell", hotel: false, cue: "Classic heavy biceps overload." },
  { id: "preacher-curl", name: "Preacher Curl", muscle: "arms", equipment: "Preacher bench", hotel: false, cue: "Lock elbows and own the stretch." },
  { id: "machine-preacher-curl", name: "Machine Preacher Curl", muscle: "arms", equipment: "Preacher curl machine", hotel: false, cue: "Keep the upper arms planted and control the lengthened position." },
  { id: "incline-db-curl", name: "Incline Dumbbell Curl", muscle: "arms", equipment: "Dumbbells, incline bench", hotel: true, cue: "Long-head biceps stretch." },
  { id: "spider-curl", name: "Spider Curl", muscle: "arms", equipment: "Incline bench, dumbbells", hotel: true, cue: "Chest down, strict biceps squeeze." },
  { id: "cable-curl", name: "Cable Curl", muscle: "arms", equipment: "Cable bar or handles", hotel: true, cue: "Constant tension through the full rep." },
  { id: "single-arm-cable-curl", name: "Single-Arm Cable Curl", muscle: "arms", equipment: "Cable handle", hotel: true, cue: "Line wrist, elbow, and shoulder with the cable." },
  { id: "bayesian-curl", name: "Bayesian Cable Curl", muscle: "arms", equipment: "Cable handle", hotel: true, cue: "Curl with the arm behind the body." },
  { id: "concentration-curl", name: "Concentration Curl", muscle: "arms", equipment: "Dumbbell", hotel: true, cue: "Slow squeeze, no shoulder movement." },
  { id: "close-grip-bench", name: "Close-Grip Bench Press", muscle: "arms", equipment: "Barbell, bench", hotel: false, cue: "Heavy triceps compound." },
  { id: "skull-crusher", name: "Skull Crusher", muscle: "arms", equipment: "EZ bar or dumbbells", hotel: true, cue: "Let elbows travel slightly back for stretch." },
  { id: "decline-skull-crusher", name: "Decline Skull Crusher", muscle: "arms", equipment: "EZ bar or dumbbells, decline bench", hotel: false, cue: "Keep the upper arms stable and lower behind the forehead under control." },
  { id: "crossbody-triceps-extension", name: "Crossbody Cable Triceps Extension", muscle: "arms", equipment: "Cable handle", hotel: true, cue: "Finish across the body for lateral-head work." },
  { id: "single-arm-pushdown", name: "Single-Arm Cable Pushdown", muscle: "arms", equipment: "Cable handle", hotel: true, cue: "Lock down the elbow and extend hard." },
  { id: "dip-triceps", name: "Triceps Dip", muscle: "arms", equipment: "Dip bars", hotel: false, cue: "Upright torso to bias triceps." },
  { id: "bench-dip", name: "Bench Dip", muscle: "arms", equipment: "Bench", hotel: true, cue: "Use a pain-free shoulder range." },
  { id: "reverse-curl", name: "Reverse Curl", muscle: "arms", equipment: "EZ bar or dumbbells", hotel: true, cue: "Brachialis and forearm thickness." },

  { id: "front-squat", name: "Front Squat", muscle: "legs", equipment: "Barbell, rack", hotel: false, cue: "Quad-dominant squat with upright torso." },
  { id: "hack-squat", name: "Hack Squat", muscle: "legs", equipment: "Hack squat machine", hotel: false, cue: "Load quads hard without balance demands." },
  { id: "leg-press", name: "Leg Press", muscle: "legs", equipment: "Leg press", hotel: false, cue: "Control depth and keep hips down." },
  { id: "leg-extension", name: "Leg Extension", muscle: "legs", equipment: "Leg extension", hotel: false, cue: "Pause at lockout for quad detail." },
  { id: "walking-lunge", name: "Walking Lunge", muscle: "legs", equipment: "Dumbbells", hotel: true, cue: "Long stride for glutes, shorter for quads." },
  { id: "goblet-squat", name: "Goblet Squat", muscle: "legs", equipment: "Dumbbell", hotel: true, cue: "Slow tempo makes a light dumbbell feel heavy." },
  { id: "db-step-up", name: "Dumbbell Step-Up", muscle: "legs", equipment: "Dumbbells, bench", hotel: true, cue: "Drive through the front leg, no bounce." },
  { id: "lying-leg-curl", name: "Lying Leg Curl", muscle: "legs", equipment: "Leg curl machine", hotel: false, cue: "Hamstring squeeze without hip lift." },
  { id: "seated-leg-curl", name: "Seated Leg Curl", muscle: "legs", equipment: "Leg curl machine", hotel: false, cue: "Great lengthened hamstring tension." },
  { id: "nordic-curl", name: "Nordic Curl", muscle: "legs", equipment: "Anchor or partner", hotel: false, cue: "Advanced eccentric hamstring work." },
  { id: "hip-thrust", name: "Hip Thrust", muscle: "legs", equipment: "Barbell or dumbbell, bench", hotel: true, cue: "Posterior pelvic tilt and hard glute lockout." },
  { id: "machine-hip-thrust", name: "Machine Hip Thrust", muscle: "legs", equipment: "Hip thrust machine", hotel: false, cue: "Brace the torso and finish with a controlled glute contraction." },
  { id: "cable-pull-through", name: "Cable Pull-Through", muscle: "legs", equipment: "Cable, rope", hotel: true, cue: "Hinge through the hips and squeeze glutes." },
  { id: "seated-calf-raise", name: "Seated Calf Raises", muscle: "legs", equipment: "Seated calf machine", hotel: false, cue: "Soleus-focused calf work with a full stretch and controlled top position." },
  { id: "standing-machine-calf-raise", name: "Standing Machine Calf Raises", muscle: "legs", equipment: "Standing calf raise machine", hotel: false, cue: "Keep the knees softly extended and use a full ankle range without bouncing." },
  { id: "leg-press-calf-raise", name: "Leg Press Calf Raise", muscle: "legs", equipment: "Leg press", hotel: false, cue: "Deep stretch and full plantar flexion." },
  { id: "cable-hip-abduction", name: "Cable Hip Abduction", muscle: "legs", equipment: "Cable, ankle cuff", hotel: true, cue: "Glute medius shape and hip stability." },

  { id: "cable-crunch", name: "Cable Crunch", muscle: "abs", equipment: "Cable, rope", hotel: true, cue: "Round the spine down and squeeze the abs, not the hips." },
  { id: "stability-ball-crunch", name: "Stability Ball Crunches", muscle: "abs", equipment: "Stability ball", hotel: false, cue: "Let the torso extend over the ball, then shorten the ribs toward the pelvis." },
  { id: "hanging-leg-raise", name: "Hanging Leg Raise", muscle: "abs", equipment: "Pull-up bar or captain chair", hotel: false, cue: "Posteriorly tilt the pelvis before lifting the legs." },
  { id: "captains-chair-knee-raise", name: "Captain's Chair Knee Raise", muscle: "abs", equipment: "Captain chair", hotel: false, cue: "Curl knees up toward the ribs without swinging." },
  { id: "decline-sit-up", name: "Decline Sit-Up", muscle: "abs", equipment: "Decline bench", hotel: false, cue: "Control the lowering phase and avoid yanking the neck." },
  { id: "weighted-crunch", name: "Weighted Crunch", muscle: "abs", equipment: "Plate or dumbbell", hotel: true, cue: "Small range, hard abdominal contraction." },
  { id: "reverse-crunch", name: "Reverse Crunch", muscle: "abs", equipment: "Bench or floor", hotel: true, cue: "Curl hips off the bench, do not kick with momentum." },
  { id: "bench-leg-raise", name: "Bench Leg Raise", muscle: "abs", equipment: "Flat bench", hotel: true, cue: "Keep low back controlled as legs lower." },
  { id: "rope-woodchop", name: "Cable Woodchop", muscle: "abs", equipment: "Cable handle or rope", hotel: true, cue: "Rotate through the torso while hips stay braced." },
  { id: "pallof-press", name: "Pallof Press", muscle: "abs", equipment: "Cable handle", hotel: true, cue: "Resist rotation and keep ribs stacked over hips." },
  { id: "ab-wheel-rollout", name: "Ab Wheel Rollout", muscle: "abs", equipment: "Ab wheel", hotel: false, cue: "Brace hard and stop before the lower back arches." },
  { id: "plank", name: "Weighted Plank", muscle: "abs", equipment: "Bodyweight or plate", hotel: true, cue: "Squeeze glutes, tuck ribs, and hold a clean brace." },
  { id: "side-plank", name: "Side Plank", muscle: "abs", equipment: "Bodyweight", hotel: true, cue: "Stack hips and drive the bottom elbow into the floor." },
  { id: "dead-bug", name: "Dead Bug", muscle: "abs", equipment: "Bodyweight", hotel: true, cue: "Keep low back down while opposite limbs extend." },
  { id: "stomach-vacuum", name: "Stomach Vacuum", muscle: "abs", equipment: "Bodyweight", hotel: true, cue: "Exhale fully, pull waist in, and hold control." },
  { id: "mountain-climber", name: "Slow Mountain Climber", muscle: "abs", equipment: "Bodyweight", hotel: true, cue: "Drive knees under control while keeping hips quiet." }
];

const planTemplates = [
  {
    id: "chest-density",
    title: "Chest: Density + Shape",
    muscle: "chest",
    phase: "offseason",
    rest: 90,
    note: "A high-quality chest day with enough pressing to grow and enough cable work to finish.",
    exercises: [
      ["incline-db-press", 4, "8-10", 120],
      ["flat-db-press", 4, "8-12", 105],
      ["low-cable-fly", 4, "12-15", 60],
      ["weighted-dip", 3, "8-12", 90]
    ]
  },
  {
    id: "back-width",
    title: "Back: Width + Detail",
    muscle: "back",
    phase: "bulking",
    rest: 105,
    note: "Vertical pull, row, pullover. Built for lats that show from the front.",
    exercises: [
      ["lat-pulldown", 4, "8-12", 90],
      ["barbell-row", 4, "6-10", 120],
      ["one-arm-db-row", 3, "10-12", 90],
      ["rope-pullover", 3, "12-15", 60]
    ]
  },
  {
    id: "shoulder-caps",
    title: "Shoulders: Cap Builder",
    muscle: "shoulders",
    phase: "offseason",
    rest: 75,
    note: "Lateral delt priority with enough pressing to keep the look powerful.",
    exercises: [
      ["db-shoulder-press", 4, "8-10", 105],
      ["db-lateral-raise", 5, "12-20", 45],
      ["cable-lateral-raise", 3, "15-20", 45],
      ["rear-delt-fly", 4, "12-20", 60],
      ["y-raise", 3, "12-15", 45]
    ]
  },
  {
    id: "arms-pump",
    title: "Arms: Sleeve Splitter",
    muscle: "arms",
    phase: "bulking",
    rest: 60,
    note: "Alternates biceps and triceps so the session moves fast without getting sloppy.",
    exercises: [
      ["ez-curl", 4, "8-10", 75],
      ["rope-pushdown", 4, "10-12", 60],
      ["hammer-curl", 3, "10-12", 60],
      ["overhead-rope-extension", 3, "12-15", 60],
      ["db-curl", 2, "15-20", 45]
    ]
  },
  {
    id: "legs-thick",
    title: "Legs: Thick + Balanced",
    muscle: "legs",
    phase: "offseason",
    rest: 120,
    note: "Heavy base work plus unilateral volume that bodybuilders actually feel.",
    exercises: [
      ["barbell-squat", 5, "5-8", 150],
      ["db-rdl", 4, "8-12", 120],
      ["db-bulgarian-split-squat", 3, "10 each", 90],
      ["standing-calf-raise", 5, "12-20", 45]
    ]
  },
  {
    id: "prep-upper-pump",
    title: "Contest Prep: Upper Pump",
    muscle: "chest",
    phase: "prep",
    rest: 45,
    note: "Lower joint stress, high tension, short rest. Best when calories are lower.",
    exercises: [
      ["incline-db-press", 3, "10-12", 75],
      ["lat-pulldown", 3, "10-15", 60],
      ["low-cable-fly", 3, "15-20", 45],
      ["db-lateral-raise", 4, "15-25", 35],
      ["rope-pushdown", 3, "12-20", 45]
    ]
  },
  {
    id: "road-gym-full",
    title: "Road Gym: Full Body Pump",
    muscle: "travel",
    phase: "travel",
    rest: 45,
    note: "Built around a hotel bench, light-to-moderate dumbbells (up to about 50 lb / 22.5 kg), cables, rope, handles, and ankle cuffs.",
    exercises: [
      ["db-bulgarian-split-squat", 4, "10-15 each", 60],
      ["incline-db-press", 4, "10-15", 60],
      ["lat-pulldown", 4, "10-15", 60],
      ["db-lateral-raise", 4, "15-25", 35],
      ["rope-pushdown", 3, "12-20", 45],
      ["cable-kickback", 3, "15-20 each", 35]
    ]
  },
  {
    id: "chest-heavy-press",
    title: "Chest: Heavy Press Priority",
    muscle: "chest",
    phase: "offseason",
    rest: 120,
    note: "A load-first chest session built around heavy barbell and machine pressing.",
    exercises: [
      ["barbell-bench", 5, "4-6", 180],
      ["incline-barbell-press", 4, "6-8", 150],
      ["machine-chest-press", 3, "8-10", 105],
      ["pec-deck", 3, "12-15", 60]
    ]
  },
  {
    id: "chest-upper-focus",
    title: "Chest: Upper Shelf",
    muscle: "chest",
    phase: "bulking",
    rest: 90,
    note: "Upper-chest emphasis for a thicker side chest and better front relaxed look.",
    exercises: [
      ["smith-incline-press", 4, "8-10", 120],
      ["incline-db-press", 4, "10-12", 90],
      ["low-cable-fly", 4, "12-15", 60],
      ["cable-pressaround", 3, "12-15 each", 45]
    ]
  },
  {
    id: "chest-cable-detail",
    title: "Chest: Cable Detail Pump",
    muscle: "chest",
    phase: "prep",
    rest: 45,
    note: "A joint-friendly prep chest day with constant tension and minimal setup time.",
    exercises: [
      ["single-arm-cable-press", 3, "12-15 each", 45],
      ["mid-cable-fly", 4, "15-20", 40],
      ["high-cable-fly", 3, "15-20", 40],
      ["push-up", 3, "AMRAP", 45]
    ]
  },
  {
    id: "chest-road-gym",
    title: "Road Gym: Chest",
    muscle: "travel",
    phase: "travel",
    rest: 60,
    note: "A hotel-gym chest session using dumbbells, bench angles, and cables.",
    exercises: [
      ["incline-db-press", 4, "10-15", 60],
      ["flat-db-press", 4, "10-15", 60],
      ["squeeze-press", 3, "12-15", 45],
      ["low-cable-fly", 3, "15-20", 40]
    ]
  },
  {
    id: "back-thickness",
    title: "Back: Thickness Builder",
    muscle: "back",
    phase: "offseason",
    rest: 120,
    note: "Rows, rack pulls, and supported work for dense mid-back development.",
    exercises: [
      ["rack-pull", 4, "4-6", 180],
      ["tbar-row", 4, "6-10", 135],
      ["chest-supported-row", 4, "8-12", 90],
      ["shrug", 4, "10-15", 60]
    ]
  },
  {
    id: "back-lat-sweep",
    title: "Back: Lat Sweep",
    muscle: "back",
    phase: "bulking",
    rest: 75,
    note: "Designed to build width and front-lat presence with pulldown angles.",
    exercises: [
      ["wide-pulldown", 4, "8-12", 90],
      ["single-arm-lat-pulldown", 4, "10-12 each", 60],
      ["straight-arm-pulldown", 4, "12-15", 45],
      ["db-pullover", 3, "12-15", 60]
    ]
  },
  {
    id: "back-prep-detail",
    title: "Back: Prep Detail",
    muscle: "back",
    phase: "prep",
    rest: 50,
    note: "Shorter-rest back work to keep detail, posture, and rear shots sharp.",
    exercises: [
      ["neutral-pulldown", 3, "10-15", 60],
      ["machine-row", 3, "10-15", 60],
      ["face-pull", 4, "15-25", 35],
      ["straight-arm-pulldown", 3, "15-20", 35]
    ]
  },
  {
    id: "back-road-gym",
    title: "Road Gym: Back",
    muscle: "travel",
    phase: "travel",
    rest: 60,
    note: "Hotel-gym back work using cables, dumbbells, and bench-supported rows.",
    exercises: [
      ["lat-pulldown", 4, "10-15", 60],
      ["chest-supported-row", 4, "10-15", 60],
      ["one-arm-db-row", 3, "12 each", 60],
      ["rope-pullover", 3, "15-20", 40]
    ]
  },
  {
    id: "shoulders-heavy",
    title: "Shoulders: Heavy Press + Caps",
    muscle: "shoulders",
    phase: "offseason",
    rest: 100,
    note: "A heavier delt session that still keeps side-delt volume high.",
    exercises: [
      ["barbell-overhead-press", 4, "5-8", 150],
      ["machine-press", 4, "8-10", 105],
      ["machine-lateral-raise", 4, "12-15", 60],
      ["reverse-pec-deck", 4, "12-20", 60],
      ["y-raise", 3, "12-15", 45]
    ]
  },
  {
    id: "shoulders-width",
    title: "Shoulders: Width Specialization",
    muscle: "shoulders",
    phase: "bulking",
    rest: 50,
    note: "High side-delt frequency in one session for rounder shoulder caps.",
    exercises: [
      ["seated-lateral-raise", 4, "12-20", 45],
      ["lean-away-lateral-raise", 4, "12-20 each", 40],
      ["cable-lateral-raise", 3, "15-25", 35],
      ["upright-row", 3, "12-15", 50],
      ["y-raise", 3, "12-15", 45]
    ]
  },
  {
    id: "shoulders-rear-detail",
    title: "Shoulders: Rear Delt Detail",
    muscle: "shoulders",
    phase: "prep",
    rest: 45,
    note: "Rear-delt and posture work for back shots and stage presentation.",
    exercises: [
      ["reverse-pec-deck", 4, "15-20", 45],
      ["cable-rear-delt-fly", 4, "15-20", 40],
      ["face-pull", 3, "15-25", 35],
      ["y-raise", 3, "12-15", 45]
    ]
  },
  {
    id: "shoulders-road-gym",
    title: "Road Gym: Shoulders",
    muscle: "travel",
    phase: "travel",
    rest: 45,
    note: "Dumbbell and cable delt session for hotel gyms with limited loads.",
    exercises: [
      ["arnold-press", 4, "10-12", 60],
      ["db-lateral-raise", 5, "15-25", 35],
      ["cable-lateral-raise", 4, "15-25", 35],
      ["rear-delt-fly", 4, "15-20", 40],
      ["y-raise", 3, "12-15", 45]
    ]
  },
  {
    id: "arms-heavy",
    title: "Arms: Heavy Superset Day",
    muscle: "arms",
    phase: "offseason",
    rest: 75,
    note: "Heavier biceps and triceps compounds with enough isolation to finish.",
    exercises: [
      ["barbell-curl", 4, "6-8", 90],
      ["close-grip-bench", 4, "6-8", 120],
      ["preacher-curl", 3, "8-10", 75],
      ["skull-crusher", 3, "8-10", 75]
    ]
  },
  {
    id: "arms-stretch",
    title: "Arms: Stretch Position Growth",
    muscle: "arms",
    phase: "bulking",
    rest: 55,
    note: "Long-head biceps and triceps work from stretched positions.",
    exercises: [
      ["incline-db-curl", 4, "10-12", 60],
      ["overhead-rope-extension", 4, "10-15", 60],
      ["bayesian-curl", 3, "12-15 each", 45],
      ["skull-crusher", 3, "10-12", 60]
    ]
  },
  {
    id: "arms-cable-pump",
    title: "Arms: Cable Pump",
    muscle: "arms",
    phase: "prep",
    rest: 35,
    note: "Fast cable-only arm session for a big pump with low joint stress.",
    exercises: [
      ["cable-curl", 4, "12-20", 35],
      ["rope-pushdown", 4, "12-20", 35],
      ["single-arm-cable-curl", 3, "15 each", 30],
      ["single-arm-pushdown", 3, "15 each", 30]
    ]
  },
  {
    id: "arms-road-gym",
    title: "Road Gym: Arms",
    muscle: "travel",
    phase: "travel",
    rest: 40,
    note: "Hotel-friendly arm day with dumbbells, rope, and cable handles.",
    exercises: [
      ["db-curl", 4, "10-15", 45],
      ["rope-pushdown", 4, "12-20", 40],
      ["hammer-curl", 3, "12-15", 40],
      ["overhead-rope-extension", 3, "12-20", 40]
    ]
  },
  {
    id: "legs-quad-priority",
    title: "Legs: Quad Priority",
    muscle: "legs",
    phase: "offseason",
    rest: 130,
    note: "Quad-first leg day with heavy squatting and machine overload.",
    exercises: [
      ["front-squat", 4, "5-8", 150],
      ["hack-squat", 4, "8-12", 120],
      ["leg-press", 4, "10-15", 90],
      ["leg-extension", 4, "12-20", 45]
    ]
  },
  {
    id: "legs-posterior",
    title: "Legs: Posterior Chain",
    muscle: "legs",
    phase: "bulking",
    rest: 110,
    note: "Hamstring and glute-focused training for side and rear poses.",
    exercises: [
      ["db-rdl", 4, "8-12", 120],
      ["seated-leg-curl", 4, "10-15", 75],
      ["hip-thrust", 4, "8-12", 90],
      ["cable-pull-through", 3, "12-15", 60]
    ]
  },
  {
    id: "legs-prep-detail",
    title: "Legs: Prep Detail",
    muscle: "legs",
    phase: "prep",
    rest: 55,
    note: "Lower-stress leg day that keeps quads, hamstrings, and calves active during prep.",
    exercises: [
      ["leg-extension", 4, "15-20", 40],
      ["lying-leg-curl", 4, "12-20", 45],
      ["walking-lunge", 3, "12 each", 60],
      ["leg-press-calf-raise", 4, "15-25", 35]
    ]
  },
  {
    id: "legs-road-gym",
    title: "Road Gym: Legs",
    muscle: "travel",
    phase: "travel",
    rest: 60,
    note: "A brutal hotel leg day using unilateral work, dumbbells, cables, and tempo.",
    exercises: [
      ["db-bulgarian-split-squat", 4, "10-15 each", 60],
      ["goblet-squat", 4, "15-20", 60],
      ["db-rdl", 4, "10-15", 60],
      ["cable-kickback", 3, "15-20 each", 40],
      ["standing-calf-raise", 4, "15-25", 35]
    ]
  },
  {
    id: "prep-push-detail",
    title: "Contest Prep: Push Detail",
    muscle: "chest",
    phase: "prep",
    rest: 45,
    note: "Chest, delts, and triceps with pump work and predictable fatigue.",
    exercises: [
      ["machine-chest-press", 3, "10-12", 60],
      ["mid-cable-fly", 3, "15-20", 40],
      ["machine-lateral-raise", 4, "15-20", 35],
      ["rope-pushdown", 3, "12-20", 35]
    ]
  },
  {
    id: "prep-pull-detail",
    title: "Contest Prep: Pull Detail",
    muscle: "back",
    phase: "prep",
    rest: 45,
    note: "Back width, rear delts, and biceps for stage detail without crushing recovery.",
    exercises: [
      ["single-arm-lat-pulldown", 3, "12 each", 45],
      ["machine-row", 3, "12-15", 55],
      ["reverse-pec-deck", 3, "15-20", 35],
      ["cable-curl", 3, "12-20", 35]
    ]
  },
  {
    id: "prep-legs-pump",
    title: "Contest Prep: Legs Pump",
    muscle: "legs",
    phase: "prep",
    rest: 45,
    note: "A lower-body pump day for prep when soreness and inflammation need to stay controlled.",
    exercises: [
      ["leg-extension", 3, "15-25", 35],
      ["seated-leg-curl", 3, "15-20", 40],
      ["cable-hip-abduction", 3, "15-20 each", 35],
      ["standing-calf-raise", 4, "15-25", 35]
    ]
  },
  {
    id: "weak-point-v-taper",
    title: "Weak Point: V-Taper",
    muscle: "shoulders",
    phase: "bulking",
    rest: 50,
    note: "Side delts, lats, and waist-friendly work for a stronger V-taper.",
    exercises: [
      ["wide-pulldown", 4, "10-12", 60],
      ["lean-away-lateral-raise", 4, "12-20 each", 40],
      ["straight-arm-pulldown", 3, "12-15", 40],
      ["cable-lateral-raise", 3, "15-25", 35],
      ["y-raise", 3, "12-15", 45]
    ]
  },
  {
    id: "weak-point-arms",
    title: "Weak Point: Arms Add-On",
    muscle: "arms",
    phase: "bulking",
    rest: 35,
    note: "A shorter arm specialization session to add after a smaller training day.",
    exercises: [
      ["bayesian-curl", 3, "12-15 each", 35],
      ["crossbody-triceps-extension", 3, "12-15 each", 35],
      ["concentration-curl", 2, "15 each", 30],
      ["single-arm-pushdown", 2, "15 each", 30]
    ]
  },
  {
    id: "weak-point-glutes-hams",
    title: "Weak Point: Glutes + Hams",
    muscle: "legs",
    phase: "bulking",
    rest: 75,
    note: "Focused posterior-chain volume for side glutes, tie-ins, and hamstring sweep.",
    exercises: [
      ["hip-thrust", 4, "8-12", 90],
      ["seated-leg-curl", 4, "10-15", 75],
      ["db-rdl", 3, "10-12", 75],
      ["cable-hip-abduction", 3, "15-20 each", 35]
    ]
  }
];

const abFinishersByPlan = {
  "chest-density": ["cable-crunch", 3, "12-20", 45],
  "back-width": ["hanging-leg-raise", 3, "8-15", 50],
  "legs-thick": ["weighted-crunch", 3, "12-15", 45],
  "prep-upper-pump": ["stomach-vacuum", 4, "20 sec", 30],
  "road-gym-full": ["bench-leg-raise", 3, "12-20", 35],
  "chest-heavy-press": ["decline-sit-up", 3, "10-15", 45],
  "chest-road-gym": ["pallof-press", 3, "12 each", 35],
  "back-thickness": ["cable-crunch", 3, "12-20", 45],
  "back-prep-detail": ["stomach-vacuum", 4, "20 sec", 30],
  "back-road-gym": ["rope-woodchop", 3, "12 each", 35],
  "shoulders-heavy": ["plank", 3, "45 sec", 35],
  "shoulders-road-gym": ["dead-bug", 3, "10 each", 30],
  "arms-heavy": ["cable-crunch", 3, "12-20", 45],
  "arms-road-gym": ["side-plank", 3, "30 sec each", 30],
  "legs-quad-priority": ["captains-chair-knee-raise", 3, "10-15", 45],
  "legs-posterior": ["ab-wheel-rollout", 3, "8-12", 45],
  "legs-prep-detail": ["reverse-crunch", 3, "12-20", 35],
  "legs-road-gym": ["bench-leg-raise", 3, "12-20", 35],
  "prep-push-detail": ["stomach-vacuum", 4, "20 sec", 30],
  "prep-pull-detail": ["pallof-press", 3, "12 each", 35],
  "prep-legs-pump": ["reverse-crunch", 3, "12-20", 35],
  "weak-point-v-taper": ["stomach-vacuum", 4, "20 sec", 30],
  "weak-point-glutes-hams": ["side-plank", 3, "30 sec each", 30]
};

for (const plan of planTemplates) {
  const finisher = abFinishersByPlan[plan.id];
  if (finisher && !plan.exercises.some(([exerciseId]) => exerciseId === finisher[0])) {
    plan.exercises.push(finisher);
  }
}

const defaultState = {
  view: "today",
  phase: "offseason",
  profile: null,
  customPlans: [],
  workoutLogs: [],
  weightLogs: [],
  measurements: [],
  activeWorkout: null,
  activeFilter: "all",
  libraryFilter: "chest",
  logbookRange: "7",
  weeklyCheckIns: [],
  prepLogs: [],
  todayPlanId: null,
  todayWorkoutPick: "recommended",
  units: "imperial",
  timer: { seconds: DEFAULT_REST_SECONDS, left: 0, running: false, startedAt: null, endsAt: null, fullscreen: false, exerciseIndex: null }
};

function freshDefaultState() {
  return {
    ...defaultState,
    customPlans: [],
    workoutLogs: [],
    weightLogs: [],
    measurements: [],
    weeklyCheckIns: [],
    prepLogs: [],
    timer: { ...defaultState.timer }
  };
}

let state = loadState();
let timerTick = null;
let audioContext = null;
let bellAudio = null;
let bellPlaybackStatus = { mode: "idle", error: "" };
let coachNoteDraft = "";
let liveCustomizerOpen = false;
let exerciseHistorySelection = "";

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

function isMetric() {
  return state?.units === "metric";
}

function weightUnit() {
  return isMetric() ? "kg" : "lb";
}

function lengthUnit() {
  return isMetric() ? "cm" : "in";
}

// Pound-based thresholds and copy are written once in lb and shown in the
// athlete's unit.
function fromPounds(pounds) {
  return isMetric() ? pounds * KG_PER_LB : pounds;
}

function formatWeight(value, digits = 1) {
  // null is Number(null) === 0; a cleared weight (e.g. after an iCloud
  // restore stripped a Health-derived value) must read "--", not "0".
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  // `+ 0` turns -0 into 0 so tiny negative changes never read "-0".
  return (Number(number.toFixed(digits)) + 0).toLocaleString(reportNumberLocale());
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${Number(count) === 1 ? singular : pluralForm}`;
}

function formatSignedChange(value, digits = 1) {
  const rounded = Number(Number(value).toFixed(digits)) + 0;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function measurementValueText(value, unit) {
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

function weightRangeText(lowLb, highLb, direction) {
  const low = formatWeight(fromPounds(lowLb), 2);
  const high = formatWeight(fromPounds(highLb), 2);
  return `${low}-${high} ${weightUnit()} ${direction} per week`;
}

function clampRestSeconds(value) {
  return Math.max(15, Math.min(300, Number(value) || DEFAULT_REST_SECONDS));
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    const stored = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? pruneDeepObjects(parsed) : {};
    const next = { ...freshDefaultState(), ...stored };
    ["customPlans", "workoutLogs", "weightLogs", "measurements"].forEach((key) => {
      // Drop malformed entries instead of throwing: a throw here falls back to
      // an empty state, and the next save would overwrite the user's history.
      next[key] = Array.isArray(next[key]) ? next[key].filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) : [];
    });
    // Only the pre-weightLogs schema needs this migration. Re-running it on
    // an emptied list would re-seed a (possibly Health-derived) profile weight
    // as a hand-entered log that then leaks into iCloud snapshots.
    if (!Array.isArray(stored.weightLogs)) {
      const migratedWeights = next.measurements
        .filter((entry) => entry.bodyweight)
        .map((entry) => ({
          id: `migrated-${entry.id || entry.date}`,
          date: entry.date,
          bodyweight: entry.bodyweight,
          note: entry.note || "Migrated from combined check-in"
        }));
      if (migratedWeights.length > 0) {
        next.weightLogs = migratedWeights;
      } else if (next.profile?.bodyweight) {
        next.weightLogs = [{
          id: "starting-weight",
          date: next.profile.createdAt || new Date().toISOString(),
          bodyweight: next.profile.bodyweight,
          note: "Starting profile"
        }];
      }
    }
    const savedTimer = next.timer && typeof next.timer === "object" ? next.timer : {};
    const seconds = clampRestSeconds(savedTimer.seconds);
    const endsAt = Number(savedTimer.endsAt);
    if (savedTimer.running && Number.isFinite(endsAt) && endsAt > Date.now()) {
      next.timer = {
        seconds,
        total: Math.max(1, Math.round(Number(savedTimer.total)) || seconds),
        left: Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)),
        running: true,
        startedAt: Number(savedTimer.startedAt) || null,
        endsAt,
        fullscreen: Boolean(savedTimer.fullscreen),
        exerciseIndex: Number.isInteger(savedTimer.exerciseIndex) ? savedTimer.exerciseIndex : null
      };
    } else {
      next.timer = {
        seconds,
        left: 0,
        running: false,
        startedAt: null,
        endsAt: null,
        // A rest that ended while the app was closed shows "Rest complete"
        // only if it ended recently, not a day-old overlay on the next visit.
        fullscreen: Boolean(savedTimer.running && savedTimer.fullscreen && Number.isFinite(endsAt) && Date.now() - endsAt < 10 * 60000),
        exerciseIndex: Number.isInteger(savedTimer.exerciseIndex) ? savedTimer.exerciseIndex : null
      };
    }
    next.measurements = next.measurements.map(({ bodyweight, ...entry }) => entry);
    sanitizeStoredState(next);
    return next;
  } catch {
    // Keep an untouched copy of unreadable data before the fresh state is saved over it.
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        // Keep the two newest unreadable copies; more would fill the quota.
        Object.keys(localStorage).filter((key) => key.startsWith(`${STORE_KEY}-recovery-`)).sort().slice(0, -1).forEach((key) => localStorage.removeItem(key));
        localStorage.setItem(`${STORE_KEY}-recovery-${Date.now()}`, raw);
      }
    } catch {}
    return freshDefaultState();
  }
}

let storageWarningShown = false;
// Set while a restore reloads the page so a timer tick cannot overwrite it.
let restoringState = false;

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Stored state can come from a restored backup file, so every field a screen
// prints is coerced to its real type here; numbers must be numbers.
function logbookDays() {
  const days = Number(state.logbookRange);
  return LOGBOOK_RANGES.includes(days) ? days : 7;
}

// Local calendar day for file names (the UTC date names an evening US export
// after tomorrow).
function localDateStamp(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sanitizeStoredState(next) {
  const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
  // A restored or corrupted value here renders "Last NaN days" everywhere.
  next.logbookRange = LOGBOOK_RANGES.includes(Number(next.logbookRange)) ? String(Number(next.logbookRange)) : "7";
  const objects = (value) => (Array.isArray(value) ? value.filter(isObject) : []);
  const textFields = ["id", "date", "note", "source", "cardioType", "notes", "title"];
  next.weightLogs = next.weightLogs.map((entry) => ({
    ...entry,
    bodyweight: finiteOrNull(entry.bodyweight),
    ...("bodyFat" in entry ? { bodyFat: finiteOrNull(entry.bodyFat) } : {}),
    ...("leanMass" in entry ? { leanMass: finiteOrNull(entry.leanMass) } : {})
  }));
  next.measurements = next.measurements.map((entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [
    key,
    key === "healthFields" ? (Array.isArray(value) ? value.map(String) : [])
      : key === "_unitOrigin" ? (value && typeof value === "object" ? value : undefined)
      : textFields.includes(key) ? String(value ?? "") : finiteOrNull(value)
  ])));
  next.customPlans = next.customPlans.map((plan) => ({ ...plan, title: String(plan.title ?? "Workout"), exercises: Array.isArray(plan.exercises) ? plan.exercises.filter((spec) => Array.isArray(spec) || isObject(spec)) : [] }));
  next.weeklyCheckIns = objects(next.weeklyCheckIns).map((entry) => ({
    ...entry,
    ...Object.fromEntries(["sleep", "energy", "hunger", "digestion", "recovery"].map((key) => [key, finiteOrNull(entry[key])])),
    notes: String(entry.notes ?? "")
  }));
  next.prepLogs = objects(next.prepLogs).map((entry) => ({
    ...entry,
    cardioType: String(entry.cardioType ?? ""),
    cardioMinutes: finiteOrNull(entry.cardioMinutes) ?? 0,
    steps: finiteOrNull(entry.steps) ?? 0,
    posingMinutes: finiteOrNull(entry.posingMinutes) ?? 0,
    notes: String(entry.notes ?? "")
  }));
  if (next.coachMessage !== null && next.coachMessage !== undefined) {
    const message = next.coachMessage;
    next.coachMessage = isObject(message)
      ? { from: String(message.from ?? "your coach").slice(0, 60), message: String(message.message ?? "").slice(0, 2000), planCount: Math.max(0, Math.min(100, Math.trunc(finiteOrNull(message.planCount) ?? 0))), ...(Number.isFinite(message.newCount) && Number.isFinite(message.updatedCount) ? { newCount: Math.max(0, Math.min(100, Math.trunc(message.newCount))), updatedCount: Math.max(0, Math.min(100, Math.trunc(message.updatedCount))) } : {}), ...(message.block === true ? { block: true } : {}), receivedAt: String(message.receivedAt ?? "") }
      : null;
  }
  const seenNote = next.lastCoachMessageSeen;
  next.lastCoachMessageSeen = isObject(seenNote) ? { from: String(seenNote.from ?? "").slice(0, 60), message: String(seenNote.message ?? "").slice(0, 2000) } : null;
  next.deletedLogs = (Array.isArray(next.deletedLogs) ? next.deletedLogs : []).filter((item) => isObject(item) && typeof item.id === "string" && typeof item.kind === "string").slice(-300);
  // A stored volume of "1e400" rendered as ∞; 0 makes readers recompute it.
  next.workoutLogs = next.workoutLogs.map((log) => ("volume" in log ? { ...log, volume: finiteOrNull(log.volume) ?? 0 } : log));
  // A malformed live workout would crash every screen, including the one
  // used to restore a good backup; rebuild it from known-good parts.
  const workout = next.activeWorkout;
  if (workout !== null && workout !== undefined) {
    const exercises = isObject(workout) && Array.isArray(workout.exercises)
      ? workout.exercises.filter((exercise) => isObject(exercise) && Array.isArray(exercise.sets) && exerciseLibrary.some((item) => item.id === exercise.id)).slice(0, MAX_STORED_PLAN_EXERCISES).map((exercise) => ({
          ...exercise,
          name: String(exercise.name ?? exerciseById(exercise.id).name),
          targetSets: Math.max(1, Math.min(12, Math.trunc(finiteOrNull(exercise.targetSets) ?? 3))),
          targetDropSets: Math.max(0, Math.min(4, Math.trunc(finiteOrNull(exercise.targetDropSets) ?? 0))),
          targetReps: String(exercise.targetReps ?? "8-12"),
          rest: clampRestSeconds(exercise.rest),
          group: String(exercise.group ?? ""),
          sets: exercise.sets.filter(isObject).slice(0, MAX_PLAN_SETS + 4).map((set) => ({
            ...set,
            set: Math.trunc(finiteOrNull(set.set) ?? 1),
            label: String(set.label ?? set.set ?? ""),
            weight: String(set.weight ?? ""),
            reps: String(set.reps ?? ""),
            rir: String(set.rir ?? ""),
            done: Boolean(set.done),
            dropSet: Boolean(set.dropSet)
          }))
        }))
      : [];
    next.activeWorkout = exercises.length && exercises.every((exercise) => exercise.sets.length)
      ? { ...workout, id: String(workout.id ?? crypto.randomUUID()), title: String(workout.title ?? "Workout"), exercises }
      : null;
  }
}

function saveState() {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  if (restoringState) return;
  try {
    if (typeof builderDraft !== "undefined") state.builderDraft = builderDraft;
    const serialized = serializeForStorage(state);
    localStorage.setItem(STORE_KEY, serialized);
    lastStoredBytes = serialized.length;
    storageWarningShown = false;
    if (lastStoredBytes > STORAGE_LIMIT_BYTES * 0.8 && !storageNearlyFullWarned) {
      storageNearlyFullWarned = true;
      toast("On-device storage is nearly full. Export a backup in More, then archive history older than a year.");
    }
  } catch {
    // A full or blocked store must not crash the live workout. Keep the
    // in-memory session and warn once so the user can export or clear space.
    if (!storageWarningShown) {
      storageWarningShown = true;
      toast("Storage is full: new entries won't survive closing the app. Export a backup in More, then archive older history.");
    }
  }
}

// Typing into a set field saves once the athlete pauses, not on every
// keystroke (each save rewrites the whole logbook). Any other save, hiding
// the app, or a page unload flushes it.
function scheduleStateSave(delay = 400) {
  if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    saveState();
  }, delay);
}

function flushPendingSave() {
  if (pendingSaveTimer) saveState();
}

try {
  document.addEventListener?.("visibilitychange", () => { if (document.hidden) flushPendingSave(); });
  window.addEventListener?.("pagehide", flushPendingSave);
} catch {}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Plan rows whose exercise id is unknown (restored from a build that renamed
// it) are skipped when the workout starts, so previews skip them too instead
// of showing the library's first exercise.
function knownPlanExercises(plan) {
  return (plan?.exercises || []).filter((row) => Array.isArray(row) && exerciseLibrary.some((item) => item.id === row[0]));
}

function exerciseById(id) {
  return exerciseLibrary.find((item) => item.id === id) || exerciseLibrary[0];
}

function isRepsOnlyExercise(exercise) {
  return Boolean(exercise?.repsOnly || exerciseById(exercise?.id).muscle === "abs");
}

function divisionSelect(id, selected = "") {
  const normalizedSelected = selected || "";
  const customOption = normalizedSelected && !divisionOptions.includes(normalizedSelected)
    ? `<option value="${escapeHtml(normalizedSelected)}" selected>${escapeHtml(normalizedSelected)}</option>`
    : "";
  return `
    <select id="${id}">
      <option value="">Select division or goal</option>
      ${customOption}
      ${divisionOptions.map((option) => `
        <option value="${escapeHtml(option)}" ${option === normalizedSelected ? "selected" : ""}>${escapeHtml(option)}</option>
      `).join("")}
    </select>
  `;
}

// Views share one scrolling page; a new view must open at its top, not at
// the previous view's scroll offset.
function scrollToTop() {
  try { window.scrollTo?.(0, 0); } catch {}
}

function scrollIntoViewIfPresent(selector, block = "center") {
  try { document.querySelector?.(selector)?.scrollIntoView?.({ block }); } catch {}
}

// Ids interpolated into inline handlers must be plain tokens.
function isSafeRowId(id) {
  return /^[A-Za-z0-9-]{1,80}$/.test(String(id || ""));
}

function setView(view) {
  const changed = state.view !== view;
  state.view = view;
  saveState();
  render();
  if (changed) scrollToTop();
}

// A mistyped weigh-in, measurement, check-in or workout must be removable,
// or it corrupts trends, PRs and progression for good.
const deletableLogs = {
  workout: { key: "workoutLogs", label: "workout" },
  weight: { key: "weightLogs", label: "weigh-in" },
  measurement: { key: "measurements", label: "measurement check-in" },
  checkIn: { key: "weeklyCheckIns", label: "weekly check-in" },
  prep: { key: "prepLogs", label: "prep activity entry" }
};

// Deletions are remembered (180 days) so the next coach check-in can remove
// the same entries from the coach's copy, even ones sent in an earlier check-in.
function recordDeletedLog(kind, id) {
  if (!id) return;
  const cutoff = Date.now() - 180 * 86400000;
  const list = (Array.isArray(state.deletedLogs) ? state.deletedLogs : []).filter((item) => Date.parse(item?.at) > cutoff && !(item.kind === kind && item.id === id));
  list.push({ kind, id: String(id).slice(0, 80), at: new Date().toISOString() });
  state.deletedLogs = list.slice(-300);
}

function deleteLogEntry(kind, id) {
  const config = deletableLogs[kind];
  if (!config || !Array.isArray(state[config.key])) return;
  const entry = state[config.key].find((item) => item?.id === id);
  if (!entry) return;
  if (!window.confirm(`Delete this ${config.label} from ${formatShortDate(entry.date)}? This can't be undone.`)) return;
  state[config.key] = state[config.key].filter((item) => item?.id !== id);
  recordDeletedLog(kind, id);
  if (kind === "weight" && state.profile) {
    const newest = state.weightLogs.find((item) => Number(item.bodyweight) > 0);
    if (newest) state.profile.bodyweight = newest.bodyweight;
  }
  saveState();
  toast(`${config.label[0].toUpperCase()}${config.label.slice(1)} deleted.`);
  render();
}

function setPhase(phase) {
  state.phase = phase;
  saveState();
  render();
}

function setPlanFilter(filter) {
  state.activeFilter = filter;
  render();
}

function setLibraryFilter(filter) {
  state.libraryFilter = filter;
  render();
}

function setLogbookRange(days) {
  state.logbookRange = days;
  saveState();
  render();
}

function randomItem(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function planMatchesTodayPick(plan, pick) {
  if (pick === "any") return true;
  if (pick === "prep") return plan.phase === "prep";
  if (pick === "travel") return plan.phase === "travel" || plan.muscle === "travel";
  return plan.muscle === pick;
}

function chooseTodayWorkout(pick) {
  state.todayWorkoutPick = pick;
  if (pick === "recommended") {
    state.todayPlanId = null;
    saveState();
    render();
    return;
  }

  const chosenId = String(pick).startsWith("plan:") ? String(pick).slice(5) : null;
  const candidates = chosenId ? allPlans().filter((plan) => plan.id === chosenId) : allPlans().filter((plan) => planMatchesTodayPick(plan, pick));
  const selected = chosenId ? candidates[0] : randomItem(candidates);
  if (!selected) {
    toast("No workouts found for that pick.");
    return;
  }

  state.todayPlanId = selected.id;
  // A pick is for today only; tomorrow Today follows the schedule again.
  state.todayPlanDate = new Date().toDateString();
  saveState();
  render();
}

function setChoice(inputId, value, button) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = value;
  document.querySelectorAll(`[data-choice="${inputId}"]`).forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(`[data-choice="${inputId}"]`).forEach((item) => item.setAttribute("aria-pressed", "false"));
  button.classList.add("active");
  button.setAttribute("aria-pressed", "true");
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function getBellAudio() {
  if (typeof Audio === "undefined") return null;
  if (!bellAudio) {
    bellAudio = new Audio("assets/boxing-bell.wav");
    bellAudio.preload = "auto";
    bellAudio.volume = 1;
    bellAudio.load();
  }
  return bellAudio;
}

async function awaitWithTimeout(promise, timeoutMs, label) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error(`${label} timed out`);
          error.name = "TimeoutError";
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function primeTimerAudio() {
  const context = getAudioContext();
  if (context?.state === "suspended") context.resume().catch(() => {});

  const audio = getBellAudio();
  if (!audio || !audio.paused) return;
  audio.muted = true;
  audio.currentTime = 0;
  const playAttempt = audio.play();
  if (playAttempt?.then) {
    let reset = false;
    const resetPrime = () => {
      if (reset) return;
      reset = true;
      audio.pause();
      try { audio.currentTime = 0; } catch (_) {}
      audio.muted = false;
    };
    setTimeout(resetPrime, 800);
    playAttempt
      .then(resetPrime)
      .catch(resetPrime);
  }
}

function playBellStrike(context, startTime, duration = 1.35) {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, startTime);
  compressor.knee.setValueAtTime(12, startTime);
  compressor.ratio.setValueAtTime(4, startTime);
  compressor.attack.setValueAtTime(0.003, startTime);
  compressor.release.setValueAtTime(0.25, startTime);
  compressor.connect(context.destination);

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, startTime);
  master.gain.exponentialRampToValueAtTime(1.55, startTime + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  master.connect(compressor);

  const partials = [
    { frequency: 620, gain: 1 },
    { frequency: 835, gain: 0.58 },
    { frequency: 1180, gain: 0.36 },
    { frequency: 1510, gain: 0.22 }
  ];

  partials.forEach((partial) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(partial.frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(partial.frequency * 0.985, startTime + duration);
    gain.gain.setValueAtTime(partial.gain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.05);
  });
}

async function playBoxingBell() {
  const nativeBell = window.webkit?.messageHandlers?.peaksetPlayBell;
  if (nativeBell) {
    nativeBell.postMessage({});
    bellPlaybackStatus = { mode: "native", error: "" };
    return;
  }

  const audio = getBellAudio();
  if (audio) {
    try {
      if (!audio.paused) audio.pause();
      try { audio.currentTime = 0; } catch (_) {}
      audio.muted = false;
      audio.volume = 1;
      await awaitWithTimeout(audio.play(), 800, "Bell audio playback");
      if (audio.paused) throw new Error("Bell audio did not start");
      bellPlaybackStatus = { mode: "asset", error: "" };
      return;
    } catch (error) {
      audio.pause();
      bellPlaybackStatus = { mode: "fallback", error: error?.name || "media-playback-failed" };
      // Fall through to synthesized audio if media playback was interrupted.
    }
  }

  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    try {
      await awaitWithTimeout(context.resume(), 800, "Audio context resume");
    } catch (_) {
      return;
    }
  }
  if (context.state !== "running") return;
  bellPlaybackStatus = { mode: "synthesized", error: bellPlaybackStatus.error };
  const now = context.currentTime + 0.02;
  playBellStrike(context, now);
  playBellStrike(context, now + 0.38, 1.2);
}

function measurementFields(prefix = "") {
  const names = ["chest", "waist", "shoulders", "arm", "thigh", "calf", "bodyFat"];
  const labels = ["Chest", "Waist", "Shoulders", "Arm", "Thigh", "Calf", "Body Fat %"];
  return names.map((name, index) => `
    <div class="field">
      <label for="${prefix}${name}">${labels[index]}</label>
      <input id="${prefix}${name}" inputmode="decimal" type="number" step="0.1" placeholder="${name === "bodyFat" ? "12.5" : "0.0"}" />
    </div>
  `).join("");
}

// Units are chosen during onboarding, before any data exists to convert.
function setOnboardingUnits(units, button) {
  setChoice("onboardingUnits", units, button);
  state.units = units === "metric" ? "metric" : "imperial";
  document.querySelectorAll("[data-weight-unit]").forEach((el) => { el.textContent = weightUnit(); });
  document.querySelectorAll("[data-length-unit]").forEach((el) => { el.textContent = lengthUnit(); });
}

function saveProfile() {
  const get = (id) => document.getElementById(id)?.value.trim() || "";
  const chosenUnits = get("onboardingUnits");
  if (chosenUnits === "metric" || chosenUnits === "imperial") state.units = chosenUnits;
  const profile = {
    gender: get("gender"),
    age: Number(get("age")),
    bodyweight: Number(get("bodyweight")),
    division: get("division"),
    goalDate: get("goalDate"),
    createdAt: new Date().toISOString()
  };

  if (!profile.gender || !profile.age || !profile.bodyweight) {
    toast("Add gender, age, and starting body weight.");
    return;
  }
  if (!Number.isInteger(profile.age) || profile.age < 13 || profile.age > 100) {
    toast("Enter an age between 13 and 100.");
    return;
  }
  if (!isPlausibleBodyweight(profile.bodyweight)) {
    toast(bodyweightRangeMessage());
    return;
  }

  const measurements = collectMeasurementInputs("");
  if (hasInvalidMeasurement(measurements)) {
    toast("Measurements must be positive numbers.");
    return;
  }
  state.profile = profile;
  state.phase = get("phase") || "offseason";
  state.weightLogs.unshift({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    bodyweight: profile.bodyweight,
    note: "Starting profile"
  });
  const hasMeasurements = Object.values(measurements).some((value) => value !== null && Number.isFinite(value));
  if (hasMeasurements) {
    state.measurements.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      ...measurements,
      note: "Starting profile"
    });
  }
  saveState();
  toast("Profile created. Time to train.");
  render();
}

function isPlausibleBodyweight(value) {
  return Number.isFinite(value) && value >= fromPounds(50) && value <= fromPounds(700);
}

function bodyweightRangeMessage() {
  return `Enter a body weight between ${formatWeight(fromPounds(50), 0)} and ${formatWeight(fromPounds(700), 0)} ${weightUnit()}.`;
}

function hasInvalidMeasurement(measurements) {
  const maxLength = isMetric() ? 150 * CM_PER_IN : 150;
  return Object.entries(measurements).some(([key, value]) => value !== null && (!Number.isFinite(value) || value <= 0 || value > (key === "bodyFat" ? 75 : maxLength)));
}

function collectMeasurementInputs(prefix) {
  const keys = ["chest", "waist", "shoulders", "arm", "thigh", "calf", "bodyFat"];
  return keys.reduce((acc, key) => {
    const raw = document.getElementById(`${prefix}${key}`)?.value;
    acc[key] = raw ? Number(raw) : null;
    return acc;
  }, {});
}

function renderOnboarding() {
  if (state.profile) return "";
  return `
    <div class="modal-screen">
      <section class="modal card pad">
        <div class="grid two">
          <div>
            <p class="eyebrow">Build the starting point</p>
            <h1>Bodybuilding begins with a baseline.</h1>
            <p class="muted">${APP_NAME} starts with your body weight, measurements, training phase, and target. No AI, no clutter, just the data bodybuilders check every week.</p>
            <div class="sidebar-card">
              <strong>Included from day one</strong>
              <p class="muted">Body-part splits, hotel gym mode, adjustable rest timer, custom workouts, set-by-set logging, body weight, and measurements.</p>
            </div>
          </div>
          <div class="grid">
            <div class="grid two">
              <div class="field">
                <label>Gender</label>
                <input id="gender" type="hidden" value="" />
                <div class="choice-grid">
                  ${["Male", "Female"].map((label) => `
                    <button class="choice-btn" data-choice="gender" onclick="setChoice('gender', '${escapeHtml(label)}', this)">${escapeHtml(label)}</button>
                  `).join("")}
                </div>
              </div>
              <div class="field">
                <label for="age">Age</label>
                <input id="age" type="number" inputmode="decimal" min="13" max="100" placeholder="34" />
              </div>
            </div>
            <div class="grid two">
              <div class="field">
                <label for="bodyweight">Starting Body Weight (<span data-weight-unit>${weightUnit()}</span>)</label>
                <input id="bodyweight" type="number" inputmode="decimal" step="0.1" placeholder="218.4" />
              </div>
              <div class="field">
                <label>Training Phase</label>
                <input id="phase" type="hidden" value="offseason" />
                <div class="choice-grid">
                  <button class="choice-btn active" data-choice="phase" onclick="setChoice('phase', 'offseason', this)">Off-season</button>
                  <button class="choice-btn" data-choice="phase" onclick="setChoice('phase', 'bulking', this)">Bulking</button>
                  <button class="choice-btn" data-choice="phase" onclick="setChoice('phase', 'prep', this)">Contest Prep</button>
                </div>
              </div>
            </div>
            <div class="grid two">
              <div class="field">
                <label for="division">Division or Goal</label>
                ${divisionSelect("division")}
              </div>
              <div class="field">
                <label for="goalDate">Show or Goal Date</label>
                <input id="goalDate" type="date" />
              </div>
            </div>
            <div>
              <div class="field">
                <label>Units</label>
                <input id="onboardingUnits" type="hidden" value="${state.units === "metric" ? "metric" : "imperial"}" />
                <div class="choice-grid">
                  <button class="choice-btn ${state.units === "metric" ? "" : "active"}" data-choice="onboardingUnits" onclick="setOnboardingUnits('imperial', this)">lb · inches</button>
                  <button class="choice-btn ${state.units === "metric" ? "active" : ""}" data-choice="onboardingUnits" onclick="setOnboardingUnits('metric', this)">kg · cm</button>
                </div>
              </div>
              <h3>Starting Measurements (<span data-length-unit>${lengthUnit()}</span>)</h3>
              <div class="measurement-grid">${measurementFields("")}</div>
            </div>
            <button class="primary-btn" onclick="saveProfile()">Enter ${APP_NAME}</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function navHtml() {
  const items = [
    ["today", "Today"],
    ["plans", "Plans"],
    ["library", "Library"],
    ["builder", "Builder"],
    ["progress", "Progress"],
    ["history", "History"],
    ["logbook", "Logbook"],
    ["more", "More"]
  ];
  return items.map(([id, label]) => `
    <button class="${state.view === id ? "active" : ""}" ${state.view === id ? 'aria-current="page"' : ""} onclick="setView('${id}')">${label}</button>
  `).join("");
}

function phaseLabel(phase) {
  return {
    offseason: "Off-season",
    bulking: "Bulking",
    prep: "Contest Prep",
    travel: "Road Gym"
  }[phase] || "Off-season";
}

function muscleLabel(muscle) {
  if (muscle === "travel") return "Road Gym";
  if (!muscle) return "Custom";
  return muscle[0].toUpperCase() + muscle.slice(1);
}

// Rotate through the phase's body-part plans: suggest the muscle group trained
// least recently (never trained counts as oldest), and never the plan just
// finished. A fixed plan per phase had a new athlete training chest every day.
function todaysRecommendedPlan(avoidMuscles = [], planFits = null) {
  const phase = ["prep", "bulking"].includes(state.phase) ? state.phase : "offseason";
  const fullRotation = ["chest", "back", "legs", "shoulders", "arms"];
  // Tomorrow's scheduled template already covers its muscles.
  const rotation = fullRotation.filter((muscle) => !avoidMuscles.includes(muscle)).length ? fullRotation.filter((muscle) => !avoidMuscles.includes(muscle)) : fullRotation;
  const { byId } = exerciseIndexes();
  // Road Gym templates are tagged "travel"; rank them by the muscle most of
  // their exercises train.
  const planMuscle = (plan) => {
    if (fullRotation.includes(plan.muscle)) return plan.muscle;
    const counts = {};
    (plan.exercises || []).forEach((row) => {
      const muscle = byId.get(Array.isArray(row) ? row[0] : row?.id)?.muscle;
      if (muscle) counts[muscle] = (counts[muscle] || 0) + 1;
    });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || plan.muscle;
  };
  let candidates = planTemplates.filter((plan) => plan.phase === phase && rotation.includes(plan.muscle) && !plan.id.startsWith("weak-point"));
  let fallback = planTemplates.find((plan) => plan.id === (phase === "prep" ? "prep-upper-pump" : phase === "bulking" ? "back-width" : "chest-density"));
  // A limited equipment profile (Road Gym, garage) gets, for each muscle, a
  // phase plan it can run, else a Road Gym template for that muscle, else the
  // usual plans (exercises can be swapped), so the rotation never sticks.
  if (typeof planFits === "function") {
    const travel = planTemplates.filter((plan) => plan.phase === "travel" && planFits(plan));
    const perMuscle = rotation.flatMap((muscle) => {
      const phasePlans = candidates.filter((plan) => plan.muscle === muscle);
      const fitting = phasePlans.filter(planFits);
      if (fitting.length) return fitting;
      const travelFitting = travel.filter((plan) => planMuscle(plan) === muscle);
      return travelFitting.length ? travelFitting : phasePlans;
    });
    if (perMuscle.length) candidates = perMuscle;
    if (!candidates.some(planFits) && travel.length) fallback = travel[0];
  }
  if (!candidates.length) return fallback;
  const lastTrained = Object.fromEntries([...new Set([...rotation, ...candidates.map(planMuscle)])].map((muscle) => [muscle, -Infinity]));
  const lastByTitle = {};
  (state.workoutLogs || []).forEach((log) => {
    const time = Date.parse(log?.date);
    if (!Number.isFinite(time)) return;
    if (log.title) lastByTitle[log.title] = Math.max(lastByTitle[log.title] ?? -Infinity, time);
    new Set(workoutLogSets(log).map((set) => byId.get(loggedExerciseId(set))?.muscle)).forEach((muscle) => {
      if (muscle in lastTrained) lastTrained[muscle] = Math.max(lastTrained[muscle], time);
    });
  });
  const order = (muscle) => (rotation.includes(muscle) ? rotation.indexOf(muscle) : rotation.length);
  const muscle = [...new Set(candidates.map(planMuscle))].sort((a, b) => lastTrained[a] - lastTrained[b] || order(a) - order(b))[0];
  // Within the muscle group, the plan done least recently (each plan gets its turn).
  const forMuscle = candidates.filter((plan) => planMuscle(plan) === muscle).sort((a, b) => (lastByTitle[a.title] ?? -Infinity) - (lastByTitle[b.title] ?? -Infinity));
  return forMuscle[0] || fallback;
}

// What Start will actually load (volume.js halves sets in a deload week).
function todayPreviewPlan(plan) {
  return plan;
}

function todaysSelectedPlan() {
  const pickedToday = state.todayPlanId && state.todayPlanDate === new Date().toDateString();
  const selected = pickedToday ? allPlans().find((plan) => plan.id === state.todayPlanId) : null;
  return selected || todaysRecommendedPlan();
}

function todayWorkoutSelect() {
  // An earlier day's pick has expired; show the schedule-driven default.
  const activePick = state.todayPlanDate === new Date().toDateString() ? state.todayWorkoutPick : "recommended";
  const options = [
    ["recommended", "Recommended"],
    ["any", "Random Any"],
    ["chest", "Random Chest"],
    ["back", "Random Back"],
    ["shoulders", "Random Shoulders"],
    ["arms", "Random Arms"],
    ["legs", "Random Legs"],
    ["prep", "Random Prep"],
    ["travel", "Random Road Gym"]
  ];
  const saved = (state.customPlans || []).filter((plan) => isSafeRowId(plan.id));
  return `
    <select id="todayWorkoutPick" onchange="chooseTodayWorkout(this.value)">
      ${options.map(([value, label]) => `<option value="${value}" ${activePick === value ? "selected" : ""}>${label}</option>`).join("")}
      ${saved.length ? `<optgroup label="My templates">${saved.map((plan) => `<option value="plan:${plan.id}" ${activePick === `plan:${plan.id}` ? "selected" : ""}>${escapeHtml(plan.title)}</option>`).join("")}</optgroup>` : ""}
    </select>
  `;
}

function totalVolume(log) {
  return (log.sets || []).reduce((sum, set) => sum + ((Number(set.weight) || 0) * (Number(set.reps) || 0)), 0);
}

// The weigh-in "change from start" is measured from (archiving keeps it).
function startingWeighIn() {
  const startedAt = Date.parse(state.profile?.createdAt || "");
  const sinceStart = Number.isFinite(startedAt)
    ? state.weightLogs.filter((entry) => Date.parse(entry.date) >= startedAt - 86400000)
    : state.weightLogs;
  return sinceStart[sinceStart.length - 1] || state.weightLogs[state.weightLogs.length - 1];
}

function stats() {
  const lastWeight = state.weightLogs[0];
  const firstWeight = startingWeighIn();
  const lastSeven = state.workoutLogs.filter((log) => Date.now() - new Date(log.date).getTime() < 7 * 86400000);
  const weeklyVolume = lastSeven.reduce((sum, log) => sum + (Number(log.volume) || totalVolume(log)), 0);
  const weightDelta = lastWeight && firstWeight
    ? (Number((Number(lastWeight.bodyweight || 0) - Number(firstWeight.bodyweight || 0)).toFixed(1)) + 0).toFixed(1)
    : "0.0";
  return { lastWeight, weeklyVolume, weightDelta, workouts: lastSeven.length };
}

function normalizedExerciseName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// One estimate everywhere (History tab, Library panel, sparklines): a
// single is the weight actually lifted, and sets above 30 reps are not used.
function estimateOneRepMax(weight, reps) {
  const load = Number(weight);
  const count = Number(reps);
  if (!Number.isFinite(load) || !Number.isFinite(count) || load <= 0 || count <= 0 || count > 30) return 0;
  return count === 1 ? load : load * (1 + count / 30);
}

let exerciseIdIndex = null;
let exerciseNameIndex = null;

function exerciseIndexes() {
  if (!exerciseIdIndex) {
    exerciseIdIndex = new Map(exerciseLibrary.map((exercise) => [exercise.id, exercise]));
    exerciseNameIndex = new Map(exerciseLibrary.map((exercise) => [normalizedExerciseName(exercise.name), exercise]));
  }
  return { byId: exerciseIdIndex, byName: exerciseNameIndex };
}

// Called per logged set on every launch and History render; a per-set scan of
// the library made a 40k-set backup freeze for seconds.
function loggedExerciseId(set) {
  const { byId, byName } = exerciseIndexes();
  if (byId.has(set?.exerciseId)) return set.exerciseId;
  return byName.get(normalizedExerciseName(set?.exercise))?.id || null;
}

function workoutLogSets(log) {
  return Array.isArray(log?.sets) ? log.sets : [];
}

function selectedExerciseHistoryId() {
  if (exerciseLibrary.some((exercise) => exercise.id === exerciseHistorySelection)) return exerciseHistorySelection;
  const recentId = [...state.workoutLogs]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .flatMap(workoutLogSets)
    .map(loggedExerciseId)
    .find(Boolean);
  exerciseHistorySelection = recentId || exerciseLibrary[0]?.id || "";
  return exerciseHistorySelection;
}

function setExerciseHistory(id) {
  if (!exerciseLibrary.some((exercise) => exercise.id === id)) return false;
  exerciseHistorySelection = id;
  render();
  return true;
}

function exerciseHistoryData(exerciseId) {
  const exercise = exerciseLibrary.find((item) => item.id === exerciseId);
  if (!exercise) return null;

  const sessions = state.workoutLogs.map((log) => {
    const sets = workoutLogSets(log)
      .filter((set) => loggedExerciseId(set) === exerciseId)
      .map((set) => {
        const rawWeight = Number(set.weight);
        const rawReps = Number(set.reps);
        const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : null;
        const reps = Number.isFinite(rawReps) && rawReps > 0 ? rawReps : null;
        const repsOnly = Boolean(set.repsOnly) || exercise.muscle === "abs";
        // Reps-only (abs) work tracks total reps instead of load x reps.
        const volume = repsOnly ? reps || 0 : weight !== null && reps !== null ? weight * reps : 0;
        const estimatedOneRepMax = weight !== null && reps !== null ? estimateOneRepMax(weight, reps) : 0;
        return {
          weight,
          reps,
          volume,
          estimatedOneRepMax,
          dropSet: Boolean(set.dropSet),
          repsOnly,
          label: set.label || ""
        };
      });
    return {
      id: log.id,
      title: log.title || "Workout",
      date: log.date,
      sets,
      volume: sets.reduce((sum, set) => sum + set.volume, 0)
    };
  })
    .filter((session) => session.sets.length)
    .sort((a, b) => {
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });

  const sets = sessions.flatMap((session) => session.sets.map((set) => ({ ...set, date: session.date, title: session.title })));
  const bestSet = sets.reduce((best, set) => set.estimatedOneRepMax > (best?.estimatedOneRepMax || 0) ? set : best, null);
  const sessionVolumes = sessions.slice(0, 12).reverse().map((session) => ({
    date: session.date,
    title: session.title,
    volume: session.volume
  }));
  return {
    exercise,
    sessionCount: sessions.length,
    setCount: sets.length,
    totalVolume: sets.reduce((sum, set) => sum + set.volume, 0),
    bestWeight: sets.reduce((best, set) => Math.max(best, set.weight || 0), 0),
    bestReps: sets.reduce((best, set) => Math.max(best, set.reps || 0), 0),
    estimatedOneRepMax: bestSet?.estimatedOneRepMax || 0,
    bestSet,
    bestSessionVolume: sessions.reduce((best, session) => Math.max(best, session.volume), 0),
    sessionVolumes,
    recentSessions: sessions.slice(0, 8)
  };
}

function historyMetric(value, suffix = "") {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return `${Number(value.toFixed(1)).toLocaleString()}${suffix}`;
}

function exerciseVolumeSparkline(entries, exerciseName, unitLabel = weightUnit()) {
  if (!entries.length) return '<div class="empty"><p class="muted">Complete this exercise in at least one saved workout to start the trend.</p></div>';
  const width = 620;
  const height = 104;
  const values = entries.map((entry) => entry.volume);
  const max = Math.max(1, ...values);
  const coordinates = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - (value / max) * (height - 20) - 10;
    return { x, y };
  });
  const points = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const summary = entries.map((entry) => `${formatShortDate(entry.date)}: ${Math.round(entry.volume).toLocaleString()} ${unitLabel}`).join(", ");
  return `
    <svg class="sparkline exercise-history-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(exerciseName)} session volume trend. ${escapeHtml(summary)}">
      <line x1="0" y1="${height - 8}" x2="${width}" y2="${height - 8}" stroke="rgba(255,255,255,0.12)" />
      <polyline points="${points}" fill="none" stroke="#2DD4BF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      ${coordinates.map(({ x, y }) => `<circle cx="${x}" cy="${y}" r="5" fill="#2DD4BF" />`).join("")}
    </svg>
  `;
}

function historySetSummary(set) {
  if (set.repsOnly) return `${set.dropSet ? "Drop · " : ""}${set.reps === null ? "--" : Number(set.reps.toFixed(1)).toLocaleString()} reps`;
  const weight = set.weight === null ? "--" : `${Number(set.weight.toFixed(1)).toLocaleString()} ${weightUnit()}`;
  const reps = set.reps === null ? "-- reps" : `${Number(set.reps.toFixed(1)).toLocaleString()} reps`;
  return `${set.dropSet ? "Drop · " : ""}${weight} × ${reps}`;
}

function renderExerciseHistory() {
  const selectedId = selectedExerciseHistoryId();
  const history = exerciseHistoryData(selectedId);
  if (!history) return '<div class="empty"><p class="muted">No exercises are available.</p></div>';
  const trainedIds = new Set(state.workoutLogs.flatMap((log) => workoutLogSets(log).map(loggedExerciseId).filter(Boolean)));
  const options = [...exerciseLibrary].sort((a, b) => {
    const trainedDifference = Number(trainedIds.has(b.id)) - Number(trainedIds.has(a.id));
    return trainedDifference || a.name.localeCompare(b.name);
  });
  return `
    <div class="topbar exercise-history-header">
      <div>
        <p class="eyebrow">Exercise history</p>
        <h1>See what is actually moving.</h1>
        <p class="muted">Personal records, recent sets, estimated strength, and session volume.</p>
      </div>
    </div>
    <section class="card pad">
      <div class="field">
        <label for="exerciseHistorySelect">Exercise</label>
        <select id="exerciseHistorySelect" onchange="setExerciseHistory(this.value)">
          ${options.map((exercise) => `<option value="${exercise.id}" ${exercise.id === selectedId ? "selected" : ""}>${escapeHtml(exercise.name)}${trainedIds.has(exercise.id) ? "" : " · No history"}</option>`).join("")}
        </select>
      </div>
    </section>
    <div class="grid today-stats history-stats">
      <article class="card stat"><p class="value">${history.sessionCount}</p><p class="label">Sessions</p></article>
      <article class="card stat"><p class="value">${history.setCount}</p><p class="label">Logged sets</p></article>
      <article class="card stat"><p class="value">${historyMetric(history.bestWeight)}</p><p class="label">Heaviest ${weightUnit()}</p></article>
      <article class="card stat"><p class="value">${historyMetric(history.estimatedOneRepMax)}</p><p class="label">Estimated 1RM ${weightUnit()}</p></article>
    </div>
    <section class="card pad history-panel history-trend-card">
      <div class="card-head">
        <div><p class="eyebrow">Volume trend</p><h2>${escapeHtml(history.exercise.name)}</h2></div>
        <span class="badge blue">Last ${plural(history.sessionVolumes.length || 0, "session")}</span>
      </div>
      ${exerciseVolumeSparkline(history.sessionVolumes, history.exercise.name, history.exercise.muscle === "abs" ? "reps" : weightUnit())}
      <div class="history-trend-labels">
        <span>${history.sessionVolumes.length ? formatShortDate(history.sessionVolumes[0].date) : "First session"}</span>
        <span>${history.sessionVolumes.length ? formatShortDate(history.sessionVolumes.at(-1).date) : "Latest session"}</span>
      </div>
    </section>
    <section class="card pad history-panel">
      <div class="card-head"><div><p class="eyebrow">Personal records</p><h2>Best performances</h2></div></div>
      <div class="grid two history-records">
        <article class="log-card card"><strong>Estimated 1RM</strong><p class="history-record-value">${historyMetric(history.estimatedOneRepMax, ` ${weightUnit()}`)}</p><p class="muted">${history.bestSet ? `${historyMetric(history.bestSet.weight, ` ${weightUnit()}`)} × ${historyMetric(history.bestSet.reps, " reps")} · ${formatShortDate(history.bestSet.date)}` : "No weighted sets yet."}</p></article>
        <article class="log-card card"><strong>Best session volume</strong><p class="history-record-value">${history.exercise.muscle === "abs" ? plural(Math.round(history.bestSessionVolume), "rep") : historyMetric(history.bestSessionVolume, ` ${weightUnit()}`)}</p><p class="muted">Total work for this exercise in one saved workout.</p></article>
        <article class="log-card card"><strong>Highest reps</strong><p class="history-record-value">${historyMetric(history.bestReps)}</p><p class="muted">Highest recorded reps in one set.</p></article>
        <article class="log-card card"><strong>Total volume</strong><p class="history-record-value">${history.exercise.muscle === "abs" ? plural(Math.round(history.totalVolume), "rep") : historyMetric(history.totalVolume, ` ${weightUnit()}`)}</p><p class="muted">Across all saved ${escapeHtml(history.exercise.name)} sets.</p></article>
      </div>
    </section>
    <section class="card pad history-panel">
      <div class="card-head"><div><p class="eyebrow">Recent work</p><h2>Sets by session</h2></div></div>
      <div class="history-session-list">
        ${history.recentSessions.map((session) => `
          <article class="log-card card history-session">
            <div class="card-head"><strong>${escapeHtml(session.title)}</strong><span class="badge">${formatShortDate(session.date)}</span></div>
            <p class="muted">${plural(session.sets.length, "set")} · ${history.exercise.muscle === "abs" ? plural(Math.round(session.volume), "rep") : `${Math.round(session.volume).toLocaleString()} ${weightUnit()} volume`}</p>
            <div class="history-set-list">${session.sets.map((set) => `<span class="history-set">${escapeHtml(historySetSummary(set))}</span>`).join("")}</div>
          </article>
        `).join("") || '<div class="empty"><p class="muted">No saved sets for this exercise yet. Complete a workout and they will appear here.</p></div>'}
      </div>
    </section>
  `;
}

function isWithinDays(dateString, days) {
  const timestamp = new Date(dateString).getTime();
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age < days * 86400000;
}

function formatShortDate(dateString) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ""));
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(dateString);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(reportLocale()) : "No date";
}

function measurementRows(entry) {
  if (!entry) return [];
  return [
    ["Chest", entry.chest, lengthUnit()],
    ["Waist", entry.waist, lengthUnit()],
    ["Shoulders", entry.shoulders, lengthUnit()],
    ["Arm", entry.arm, lengthUnit()],
    ["Thigh", entry.thigh, lengthUnit()],
    ["Calf", entry.calf, lengthUnit()],
    ["Body Fat", entry.bodyFat, "%"]
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function coachReportData(days) {
  days = Number.isFinite(Number(days)) && Number(days) > 0 ? Math.max(1, Math.round(Number(days))) : logbookDays();
  const workouts = state.workoutLogs.filter((log) => isWithinDays(log.date, days));
  const weights = state.weightLogs.filter((log) => isWithinDays(log.date, days));
  const measurements = state.measurements.filter((log) => isWithinDays(log.date, days));
  const volume = workouts.reduce((sum, log) => sum + (Number(log.volume) || totalVolume(log)), 0);
  const sortedWeights = [...weights].sort((a, b) => new Date(a.date) - new Date(b.date));
  const weightDelta = sortedWeights.length > 1
    ? (Number(sortedWeights[sortedWeights.length - 1].bodyweight) - Number(sortedWeights[0].bodyweight)).toFixed(1)
    : null;
  return {
    days,
    workouts,
    weights,
    measurements,
    volume,
    weightDelta,
    latestWeight: weights[0],
    latestMeasurement: measurements[0]
  };
}

// The PDF uses WinAnsiEncoding (Latin-1 for these code points): keep accented
// Latin letters, map typographic punctuation to ASCII, drop anything else.
function plainReportText(value) {
  return String(value ?? "")
    .normalize("NFC")
    // Backstop for any locale-formatted number: map native digits (Arabic-Indic,
    // Persian, Devanagari, Bengali, Myanmar) to 0-9 instead of blanking them.
    .replace(/[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF\u1040-\u1049]/g, (digit) => {
      const code = digit.charCodeAt(0);
      const zero = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x1040].find((start) => code >= start && code <= start + 9);
      return String(code - zero);
    })
    .replace(/\u066B/g, ".")
    .replace(/\u066C/g, ",")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00B7/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addReportSection(lines, title) {
  lines.push({ text: "", size: 8 });
  lines.push({ text: title, size: 13, bold: true });
}

function buildCoachReportLines(days, coachNote = "") {
  days = Number.isFinite(Number(days)) && Number(days) > 0 ? Math.max(1, Math.round(Number(days))) : logbookDays();
  const report = coachReportData(days);
  const profile = state.profile || {};
  const lines = [
    { text: `${APP_NAME} Coach Logbook`, size: 20, bold: true },
    { text: `${days}-day report generated ${new Date().toLocaleDateString(reportLocale())}`, size: 10 },
    { text: `Athlete: ${profile.gender || "Not set"} - Age ${profile.age || "--"} - ${profile.division || "No division/goal set"}`, size: 10 },
    { text: `Phase: ${phaseLabel(state.phase)} - Current body weight: ${report.latestWeight?.bodyweight || profile.bodyweight || "--"} ${weightUnit()}`, size: 10 }
  ];

  if (coachNote.trim()) {
    addReportSection(lines, "Coach Note");
    lines.push({ text: coachNote, size: 10 });
  }

  addReportSection(lines, `Summary (last ${days} days)`);
  lines.push({ text: `Workouts: ${report.workouts.length}`, size: 10 });
  lines.push({ text: `Training volume: ${Math.round(report.volume).toLocaleString(reportNumberLocale())} ${weightUnit()}`, size: 10 });
  lines.push({ text: `Body weight logs: ${report.weights.length}`, size: 10 });
  lines.push({ text: `Weight change in range: ${report.weightDelta === null ? "Needs 2 weigh-ins" : `${report.weightDelta} ${weightUnit()}`}`, size: 10 });
  lines.push({ text: `Measurement check-ins: ${report.measurements.filter((entry) => !String(entry.id || "").startsWith("hk-")).length}`, size: 10 });

  addReportSection(lines, "Body Weight");
  if (report.weights.length) {
    report.weights.forEach((entry) => {
      lines.push({ text: `${formatShortDate(entry.date)} - ${formatWeight(entry.bodyweight)} ${weightUnit()}${Number(entry.bodyFat) > 0 ? ` - ${formatWeight(entry.bodyFat)}% body fat` : ""}${entry.note ? ` - ${entry.note}` : ""}`, size: 10 });
    });
  } else {
    lines.push({ text: "No body weight logs in this range.", size: 10 });
  }

  addReportSection(lines, "Measurements");
  if (report.latestMeasurement) {
    lines.push({ text: `Latest: ${formatShortDate(report.latestMeasurement.date)}${report.latestMeasurement.note ? ` - ${report.latestMeasurement.note}` : ""}`, size: 10 });
    measurementRows(report.latestMeasurement).forEach(([label, value, unit]) => {
      lines.push({ text: `${String(label).replace(/ %$/, "")}: ${measurementValueText(value, unit)}`, size: 10 });
    });
  } else {
    lines.push({ text: "No measurements logged yet.", size: 10 });
  }

  addReportSection(lines, "Workout Logs");
  if (report.workouts.length) {
    report.workouts.forEach((log) => {
      lines.push({ text: `${formatShortDate(log.date)} - ${log.title || "Workout"}`, size: 11, bold: true });
      lines.push({ text: `${plural((log.sets || []).length, "set")} - ${Math.round(Number(log.volume) || totalVolume(log)).toLocaleString(reportNumberLocale())} ${weightUnit()} volume`, size: 10 });
      // Null-prototype: an exercise named "constructor" must not hit Object.prototype.
      const grouped = (log.sets || []).reduce((groups, set) => {
        const key = String(set.exercise ?? "Exercise");
        if (!groups[key]) groups[key] = [];
        groups[key].push(setLogSummary(set));
        return groups;
      }, Object.create(null));
      Object.entries(grouped).forEach(([exercise, sets]) => {
        lines.push({ text: `${exercise}: ${sets.join(", ")}`, size: 9 });
      });
    });
  } else {
    lines.push({ text: "No workouts logged in this range.", size: 10 });
  }

  return lines.map((line) => ({ ...line, text: plainReportText(line.text) }));
}

function wrapPdfText(text, maxChars) {
  const words = plainReportText(text).split(" ");
  const rows = [];
  let row = "";
  // Hard-break words longer than a line (URLs, hashtags) so nothing runs off
  // the page.
  const pieces = words.flatMap((word) => word.length > maxChars ? word.match(new RegExp(`.{1,${maxChars}}`, "g")) : [word]);
  pieces.forEach((word) => {
    const next = row ? `${row} ${word}` : word;
    if (next.length > maxChars && row) {
      rows.push(row);
      row = word;
    } else {
      row = next;
    }
  });
  if (row) rows.push(row);
  return rows.length ? rows : [""];
}

function escapePdfText(text) {
  return plainReportText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function paginateReport(lines) {
  const pages = [[]];
  let y = 744;
  lines.forEach((line) => {
    const wrapped = wrapPdfText(line.text, line.size >= 13 ? 62 : 82);
    wrapped.forEach((text, index) => {
      const size = line.size || 10;
      const height = size + 5;
      if (y < 52) {
        pages.push([]);
        y = 744;
      }
      pages[pages.length - 1].push({ ...line, text, bold: index === 0 && line.bold });
      y -= height;
    });
  });
  return pages;
}

function createPdfBlob(lines) {
  const pages = paginateReport(lines);
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const pageIds = [];

  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(`${pageId} 0 R`);
    let y = 744;
    const stream = page.map((line) => {
      const size = line.size || 10;
      const font = line.bold ? "F2" : "F1";
      const command = `BT /${font} ${size} Tf 48 ${y} Td (${escapePdfText(line.text)}) Tj ET`;
      y -= size + 5;
      return command;
    }).join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  objects[2] = `<< /Type /Pages /Kids [${pageIds.join(" ")}] /Count ${pages.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  // One byte per character (all text is within Latin-1), so string offsets in
  // the xref equal byte offsets. A plain string Blob would be UTF-8 encoded.
  const bytes = new Uint8Array(pdf.length);
  for (let index = 0; index < pdf.length; index += 1) bytes[index] = pdf.charCodeAt(index) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function shareNativePdf(blob, filename) {
  const handler = window.webkit?.messageHandlers?.peaksetSharePdf;
  if (!handler) return false;
  const base64 = await blobToBase64(blob);
  handler.postMessage({ filename, base64 });
  return true;
}

async function exportLogbookPdf() {
  const days = logbookDays();
  const note = document.getElementById("coachNote")?.value ?? coachNoteDraft;
  coachNoteDraft = note;
  const lines = buildCoachReportLines(days, note);
  const blob = createPdfBlob(lines);
  const filename = `mass-method-coach-log-${localDateStamp()}.pdf`;

  if (await shareNativePdf(blob, filename)) {
    toast("PDF ready to send.");
    return;
  }

  if (typeof File !== "undefined" && navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${APP_NAME} Coach Logbook`,
          text: "Weekly bodybuilding logbook attached."
        });
        toast("PDF ready to send.");
        return;
      } catch {
        downloadBlob(blob, filename);
        toast("PDF downloaded.");
        return;
      }
    }
  }

  downloadBlob(blob, filename);
  toast("PDF downloaded.");
}

function getStageTimeline() {
  const goalDateRaw = state.profile?.goalDate;
  const targetDate = goalDateRaw ? new Date(`${goalDateRaw}T12:00:00`) : null;
  const validTarget = targetDate && Number.isFinite(targetDate.getTime());
  const today = new Date();
  // Whole calendar days between local dates (show day = 0), DST-safe.
  const calendarDay = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const daysOut = validTarget ? Math.round(calendarDay(targetDate) - calendarDay(today)) : null;
  const weeksOut = daysOut === null ? null : Math.max(0, Math.ceil(daysOut / 7));

  const stage = weeksOut === null
    ? {
        label: "Set your show date",
        badge: "Timeline needed",
        phase: "offseason",
        focus: "Add a goal date to turn the app into a weeks-out command center.",
        target: "No weight target yet",
        progress: 0
      }
    : daysOut < 0
      ? {
          label: "Show complete",
          badge: "Rebound",
          phase: "offseason",
          focus: "Move into a controlled rebound: restore performance, monitor body weight, and keep digestion stable.",
          target: "Hold the first 2 weeks disciplined",
          progress: 100
        }
      : weeksOut <= 1
        ? {
            label: "Peak week",
            badge: "Final checks",
            phase: "prep",
            focus: "Do not chase new stimulus. Keep sessions short, pump-focused, and predictable.",
            target: "Keep weight readings consistent",
            progress: 96
          }
        : weeksOut <= 4
          ? {
              label: "Peak approach",
              badge: `${weeksOut} weeks out`,
              phase: "prep",
              focus: "Maintain fullness, posing quality, sleep, and digestion while avoiding soreness spikes.",
              target: "Small controlled drops only",
              progress: 86
            }
          : weeksOut <= 8
            ? {
                label: "Detail phase",
                badge: `${weeksOut} weeks out`,
                phase: "prep",
                focus: "Hold strength, tighten execution, increase posing consistency, and watch waist trend closely.",
                target: weightRangeText(0.5, 1.25, "down"),
                progress: 70
              }
            : weeksOut <= 16
              ? {
                  label: "Contest prep",
                  badge: `${weeksOut} weeks out`,
                  phase: "prep",
                  focus: "Create the weekly deficit while protecting heavy compounds and key body-part volume.",
                  target: weightRangeText(0.5, 1.5, "down"),
                  progress: 52
                }
              : weeksOut <= 24
                ? {
                    label: "Prep runway",
                    badge: `${weeksOut} weeks out`,
                    phase: "bulking",
                    focus: "Audit weak points, set starting photos and measurements, and clean up habits before the cut.",
                    target: "Stable or slight down trend",
                    progress: 28
                  }
                : {
                    label: "Off-season build",
                    badge: `${weeksOut} weeks out`,
                    phase: "offseason",
                    focus: "Push progressive overload and weak-point volume while keeping waist gain under control.",
                    target: weightRangeText(0.25, 0.75, "up"),
                    progress: 12
                  };

  return { ...stage, daysOut, weeksOut, goalDateRaw };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightTrendSummary() {
  const logs = [...state.weightLogs]
    .filter((entry) => entry.bodyweight)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (logs.length < 2) {
    return { label: "Need 2 weigh-ins", detail: "Log body weight twice to read the trend.", delta: null };
  }

  const recent = logs.slice(-7);
  const midpoint = Math.max(1, Math.floor(recent.length / 2));
  const early = average(recent.slice(0, midpoint).map((entry) => Number(entry.bodyweight)));
  const late = average(recent.slice(midpoint).map((entry) => Number(entry.bodyweight)));
  const delta = late - early;
  // 0.2 lb is the "flat" band; in kg the same physical change is smaller.
  const label = Math.abs(delta) < fromPounds(0.2) ? "Flat" : delta > 0 ? "Trending up" : "Trending down";
  return {
    label,
    delta,
    detail: `${formatSignedChange(delta)} ${weightUnit()} over recent logs`
  };
}

function daysSince(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

const measurementMetrics = [
  { key: "chest", label: "Chest", direction: "up" },
  { key: "shoulders", label: "Shoulders", direction: "up" },
  { key: "arm", label: "Arm", direction: "up" },
  { key: "thigh", label: "Thigh", direction: "up" },
  { key: "calf", label: "Calf", direction: "up" },
  { key: "waist", label: "Waist", direction: "down" },
  { key: "bodyFat", label: "Body Fat", direction: "down" }
];

const growthMeasurementKeys = ["chest", "shoulders", "arm", "thigh", "calf"];

function sortedMeasurementLogs() {
  return [...state.measurements]
    .filter((entry) => entry?.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function numericMeasurement(entry, key) {
  const value = Number(entry?.[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function comparableMeasurementChanges(current, baseline, keys) {
  return keys.flatMap((key) => {
    const currentValue = numericMeasurement(current, key);
    const baselineValue = numericMeasurement(baseline, key);
    if (currentValue === null || baselineValue === null) return [];
    const metric = measurementMetrics.find((item) => item.key === key);
    return [{ key, label: metric?.label || key, change: currentValue - baselineValue }];
  });
}

// Per-metric series: entries without a value (e.g. a waist-only Apple Health
// reading) never hide the other measurements.
function measurementSeries(key) {
  return sortedMeasurementLogs().map((entry) => ({ date: entry.date, value: numericMeasurement(entry, key) })).filter((point) => point.value !== null);
}

// Left/right/legacy arm and thigh keys describe one body part each.
const MEASUREMENT_PART_FAMILIES = { arm: ["leftArm", "rightArm", "arm"], thigh: ["leftThigh", "rightThigh", "thigh"] };

function measurementPartKey(key) {
  const family = MEASUREMENT_PART_FAMILIES[key];
  return family ? family.find((member) => measurementSeries(member).length >= 2) || null : key;
}

function measurementPartChanges(keys, compareTo) {
  const seen = new Set();
  return keys.flatMap((key) => {
    const familyName = Object.keys(MEASUREMENT_PART_FAMILIES).find((name) => MEASUREMENT_PART_FAMILIES[name].includes(key));
    const part = familyName || key;
    if (seen.has(part)) return [];
    const seriesKey = familyName ? measurementPartKey(familyName) : key;
    const series = seriesKey ? measurementSeries(seriesKey) : [];
    if (series.length < 2) return [];
    seen.add(part);
    const metric = measurementMetrics.find((item) => item.key === seriesKey);
    const label = familyName ? (familyName === "arm" ? "Arms" : "Thighs") : metric?.label || seriesKey;
    const baseline = compareTo === "first" ? series[0] : series[series.length - 2];
    return [{ key: seriesKey, label, change: series[series.length - 1].value - baseline.value, direction: metric?.direction || "up" }];
  });
}

function weakPointMeasurementStatus() {
  const logs = sortedMeasurementLogs();
  if (logs.length < 2) {
    return {
      done: false,
      label: "Weak-point measurements reviewed",
      detail: `Needs 2 measurement check-ins to compare body-part trends. ${logs.length}/2 logged.`
    };
  }

  const changes = measurementPartChanges(growthMeasurementKeys, "first");

  if (changes.length < 3) {
    return {
      done: false,
      label: "Weak-point measurements reviewed",
      detail: `Needs 3+ comparable body-part measurements. ${changes.length}/3 found.`
    };
  }

  const weakest = changes.sort((a, b) => a.change - b.change)[0];
  return {
    done: true,
    label: "Weak-point measurements reviewed",
    detail: `Lowest change since baseline: ${weakest.label} ${formatSignedChange(weakest.change)} ${lengthUnit()}.`
  };
}

function physiqueMeasurementProgressStatus() {
  const logs = sortedMeasurementLogs();
  if (logs.length < 2) {
    return {
      done: false,
      label: "Body measurements progressing",
      detail: `Needs 2 measurement check-ins to compare progress. ${logs.length}/2 logged.`
    };
  }

  const changes = measurementPartChanges(measurementMetrics.map((metric) => metric.key), "previous");

  if (!changes.length) {
    return {
      done: false,
      label: "Body measurements progressing",
      detail: "Needs matching measurements across two check-ins."
    };
  }

  const ranked = changes.map((change) => ({ ...change, progress: change.direction === "down" ? -change.change : change.change })).sort((a, b) => b.progress - a.progress);

  const best = ranked[0];
  // 0.1 in (or 0.1 % body fat) counts as progress; convert for cm.
  const threshold = best.key === "bodyFat" || !isMetric() ? 0.1 : 0.1 * CM_PER_IN;
  if (best.progress >= threshold) {
    const unit = best.key === "bodyFat" ? "%" : lengthUnit();
    return {
      done: true,
      label: "Body measurements progressing",
      detail: `${best.label} ${formatSignedChange(best.change)} ${unit} since last check-in.`
    };
  }

  return {
    done: false,
    label: "Body measurements progressing",
    detail: "Progress means a target measurement improves by 0.1+ since the prior check-in."
  };
}

function stageChecklist(timeline) {
  // Only hand-entered tape check-ins count as "current"; Health adds daily
  // single-metric readings.
  const lastMeasurementDays = daysSince(state.measurements.find((entry) => !String(entry.id || "").startsWith("hk-"))?.date);
  const lastWeightDays = daysSince(state.weightLogs[0]?.date);
  const lastWorkoutDays = daysSince(state.workoutLogs[0]?.date);
  const measurementDue = lastMeasurementDays === null || lastMeasurementDays >= 7;
  const weightDue = lastWeightDays === null || lastWeightDays >= 2;
  const workoutDue = lastWorkoutDays === null || lastWorkoutDays >= 2;
  const base = [
    { done: !weightDue, label: "Body weight logged in the last 48 hours" },
    { done: !measurementDue, label: "Tape measurements current this week" },
    { done: !workoutDue, label: "Training log is current" }
  ];

  // Waist vs scale needs two waist readings (tape or Health) and two weigh-ins
  // in the last two weeks to compare the trends.
  const recentWaist = state.measurements.filter((entry) => entry.waist && isWithinDays(entry.date, 14)).length;
  const recentWeighIns = state.weightLogs.filter((entry) => entry.bodyweight && isWithinDays(entry.date, 14)).length;
  const waistReady = recentWaist >= 2 && recentWeighIns >= 2;
  const waistItem = (label) => ({
    done: waistReady,
    label,
    detail: waistReady ? "" : `Needs 2 waist readings and 2 weigh-ins in the last 14 days. ${Math.min(recentWaist, 2)}/2 waist · ${Math.min(recentWeighIns, 2)}/2 weigh-ins.`
  });
  const weekPrep = state.prepLogs.filter((entry) => isWithinDays(entry.date, 7));

  if (timeline.phase === "prep") {
    return [
      ...base,
      { done: weekPrep.some((entry) => Number(entry.posingMinutes) > 0), label: "Posing practice logged this week" },
      { done: weekPrep.some((entry) => Number(entry.cardioMinutes) > 0), label: "Cardio logged this week" },
      waistItem("Waist trend checked against scale trend")
    ];
  }

  if (timeline.phase === "bulking") {
    // Only a block in progress counts (not one queued or already finished).
    const running = typeof blockWeekInfo === "function" && blockWeekInfo()?.status === "active";
    const block = running && typeof validTrainingBlock === "function" ? validTrainingBlock(state.trainingBlock) : null;
    return [
      ...base,
      { done: Boolean(block?.focus.length), label: "Weak body part priority selected", detail: block?.focus.length ? "" : "Pick weak points when you start a training block in Plans." },
      { done: Boolean(block), label: "Progressive overload block running", detail: block ? "" : "Start a training block in Plans for weekly progression targets." },
      waistItem("Waist gain checked before adding food")
    ];
  }

  return [
    ...base,
    weakPointMeasurementStatus(),
    physiqueMeasurementProgressStatus()
  ];
}

function saveStageGoal() {
  const goalDate = document.getElementById("timelineGoalDate")?.value || "";
  const division = document.getElementById("timelineDivision")?.value.trim() || "";
  if (!state.profile) state.profile = {};
  state.profile.goalDate = goalDate;
  state.profile.division = division;
  saveState();
  toast(goalDate ? "Stage timeline updated." : "Goal date cleared.");
  render();
}

function renderStageTimeline() {
  const timeline = getStageTimeline();
  const trend = weightTrendSummary();
  // Without a show date the timeline's phase is only a placeholder, so the
  // checklist follows the phase the athlete picked; within 16 weeks of a show
  // it is contest prep whatever the picker says.
  const chosenPhase = ["offseason", "bulking", "prep"].includes(state.phase) ? state.phase : timeline.phase;
  const checklist = stageChecklist({ ...timeline, phase: timeline.goalDateRaw && timeline.phase === "prep" ? "prep" : chosenPhase });
  const profile = state.profile || {};
  return `
    <section class="card pad stage-timeline">
      <div class="card-head">
        <div>
          <p class="eyebrow">Stage timeline</p>
          <h2>${escapeHtml(timeline.label)}</h2>
          <p class="muted">${escapeHtml(timeline.focus)}</p>
        </div>
        <span class="badge ${timeline.phase === "prep" ? "amber" : timeline.phase === "bulking" ? "green" : "blue"}">${escapeHtml(timeline.badge)}</span>
      </div>
      <div class="timeline-track" aria-label="Stage timeline progress">
        <div class="timeline-fill" style="width: ${timeline.progress}%"></div>
      </div>
      <div class="timeline-labels">
        <span>Build</span>
        <span>Prep</span>
        <span>Peak</span>
        <span>Stage</span>
      </div>
      <div class="grid two" style="margin-top: 14px;">
        <div class="signal-card">
          <span class="badge">Target</span>
          <strong>${escapeHtml(timeline.target)}</strong>
          <p class="muted">${timeline.weeksOut === null ? "Add a date below." : timeline.daysOut > 0 ? `${plural(timeline.daysOut, "day")} until goal date.` : timeline.daysOut === 0 ? "Show day. Trust the process." : `Show was ${plural(-timeline.daysOut, "day")} ago.`}</p>
        </div>
        <div class="signal-card">
          <span class="badge">Scale trend</span>
          <strong>${escapeHtml(trend.label)}</strong>
          <p class="muted">${escapeHtml(trend.detail)}</p>
        </div>
      </div>
      <div class="timeline-form">
        <div class="field">
          <label for="timelineGoalDate">Show or Goal Date</label>
          <input id="timelineGoalDate" type="date" value="${escapeHtml(profile.goalDate || "")}" />
        </div>
        <div class="field">
          <label for="timelineDivision">Division or Goal</label>
          ${divisionSelect("timelineDivision", profile.division || "")}
        </div>
        <button class="secondary-btn" onclick="saveStageGoal()">Update Timeline</button>
      </div>
      <div class="checklist">
        <p class="muted" style="margin: 0 0 4px; font-size: 12px;">OK items are calculated from your saved logs. Details show what the app needs next.</p>
        ${checklist.map((item) => `
          <div class="check-item ${item.done ? "done" : ""}">
            <span>${item.done ? "OK" : ""}</span>
            <p>${escapeHtml(item.label)}${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderToday() {
  const profile = state.profile || {};
  const s = stats();
  const plan = todaysSelectedPlan();
  return `
    <section class="hero-card today-hero card">
      <div>
        <p class="eyebrow">${APP_NAME}</p>
        <h1>Bodybuilding logbook</h1>
        <p class="soft">${phaseLabel(state.phase)} training with set logging, rest timing, body weight, and physique measurements in one place.</p>
        <div class="stage-pills">
          ${["offseason", "bulking", "prep"].map((phase) => `
            <button class="phase-btn ${state.phase === phase ? "active" : ""}" onclick="setPhase('${phase}')">${phaseLabel(phase)}</button>
          `).join("")}
        </div>
        <div class="actions">
          <button class="primary-btn" onclick="startWorkout('${plan.id}')">Start ${escapeHtml(Array.from(plan.title).length > 32 ? `${Array.from(plan.title).slice(0, 31).join("").trimEnd()}…` : plan.title)}</button>
          <button class="secondary-btn" onclick="startWorkout('road-gym-full')">Start Road Gym</button>
          <button class="secondary-btn" onclick="setView('plans')">Browse Plans</button>
        </div>
      </div>
    </section>

    <div class="grid today-stats">
      <article class="card stat">
        <p class="value">${s.workouts}</p>
        <p class="label">Workouts, last 7 days</p>
      </article>
      <article class="card stat">
        <p class="value">${Math.round(s.weeklyVolume).toLocaleString()}</p>
        <p class="label">Volume ${weightUnit()}, last 7 days</p>
      </article>
      <article class="card stat">
        <p class="value">${formatWeight(s.lastWeight?.bodyweight || profile.bodyweight)}</p>
        <p class="label">Current body weight</p>
      </article>
      <article class="card stat">
        <p class="value">${s.weightDelta}</p>
        <p class="label">Weight change from start</p>
      </article>
    </div>

    <div style="margin-top: 16px;">
      ${renderStageTimeline()}
    </div>

    <div style="margin-top: 16px;">
      <section class="card pad">
        <div class="card-head">
          <div>
            <p class="eyebrow">Next workout</p>
            <h2>${escapeHtml(plan.title)}</h2>
            <p class="muted">${escapeHtml(plan.note)}</p>
          </div>
          <span class="badge blue">${phaseLabel(plan.phase)}</span>
        </div>
        <div class="field" style="margin-bottom: 12px;">
          <label for="todayWorkoutPick">Pick today's workout</label>
          ${todayWorkoutSelect()}
        </div>
        <div class="exercise-list">
          ${knownPlanExercises(todayPreviewPlan(plan)).map(([id, sets, reps]) => `
            <div class="exercise-row">
              <strong>${escapeHtml(exerciseById(id).name)}</strong>
              <span class="badge">${escapeHtml(sets)} x ${escapeHtml(reps)}</span>
            </div>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function allPlans() {
  return [...planTemplates, ...state.customPlans];
}

function renderPlans() {
  const filters = ["all", "chest", "back", "shoulders", "arms", "legs", "prep", "travel"];
  // Saved and coach-sent templates first: they are what the athlete is looking for.
  const plans = [...(state.customPlans || []), ...planTemplates].filter((plan) => {
    if (state.activeFilter === "all") return true;
    if (state.activeFilter === "prep") return plan.phase === "prep";
    if (state.activeFilter === "travel") return plan.phase === "travel" || plan.muscle === "travel";
    return plan.muscle === state.activeFilter;
  });

  return `
    <div class="compact-page-header">
      <p class="eyebrow">Pre-planned body-part training</p>
    </div>
    <div class="filters" style="margin-bottom: 16px;">
      ${filters.map((filter) => `
        <button class="chip ${state.activeFilter === filter ? "active" : ""}" onclick="setPlanFilter('${filter}')">${filter === "all" ? "All" : phaseLabel(filter) === "Off-season" ? filter[0].toUpperCase() + filter.slice(1) : phaseLabel(filter)}</button>
      `).join("")}
    </div>
    <div class="grid three">
      ${plans.map(renderPlanCard).join("")}
    </div>
  `;
}

function renderPlanCard(plan) {
  return `
    <article class="card plan-card">
      <div class="card-head">
        <div>
          <span class="badge ${plan.phase === "travel" ? "green" : plan.phase === "prep" ? "amber" : "blue"}">${phaseLabel(plan.phase || plan.muscle)}</span>
          <h3 style="margin-top: 10px;">${escapeHtml(plan.title)}</h3>
        </div>
      </div>
      <p class="muted">${escapeHtml(plan.note)}</p>
      <div class="exercise-list">
        ${knownPlanExercises(plan).slice(0, 5).map(([id, sets, reps]) => `
          <div class="exercise-row">
            <span class="truncate">${escapeHtml(exerciseById(id).name)}</span>
            <span class="badge">${escapeHtml(sets)} x ${escapeHtml(reps)}</span>
          </div>
        `).join("")}
      </div>
      <button class="primary-btn" onclick="startWorkout('${plan.id}')">Start Workout</button>
    </article>
  `;
}

function renderLibrary() {
  const rows = exerciseLibrary.filter((ex) => ex.muscle === state.libraryFilter || (state.libraryFilter === "travel" && ex.hotel));
  return `
    <div class="compact-page-header">
      <p class="eyebrow">Exercise library</p>
    </div>
    <div class="filters" style="margin-bottom: 16px;">
      ${[...muscles, "abs", "travel"].map((filter) => `
        <button class="chip ${state.libraryFilter === filter ? "active" : ""}" onclick="setLibraryFilter('${filter}')">${filter === "travel" ? "Road Gym" : filter[0].toUpperCase() + filter.slice(1)}</button>
      `).join("")}
    </div>
    <div class="grid three">
      ${rows.map((ex) => `
        <article class="card exercise-card">
          <div class="card-head">
            <h3>${escapeHtml(ex.name)}</h3>
            ${ex.hotel ? '<span class="badge green">Road Gym</span>' : '<span class="badge">Gym</span>'}
          </div>
          <p class="muted">${escapeHtml(ex.cue)}</p>
          <span class="badge blue">${escapeHtml(ex.equipment)}</span>
          <button class="secondary-btn" onclick="quickStartExercise('${ex.id}')">Quick Start</button>
        </article>
      `).join("")}
    </div>
  `;
}

function builderFocusOptions(workoutFocus) {
  const label = workoutFocus === "travel" ? "Road Gym" : workoutFocus[0].toUpperCase() + workoutFocus.slice(1);
  return [
    { value: workoutFocus, label },
    { value: "abs", label: "Abs" }
  ];
}

function builderExerciseRows(focus) {
  if (focus === "travel") return exerciseLibrary.filter((exercise) => exercise.hotel);
  return exerciseLibrary.filter((exercise) => exercise.muscle === focus);
}

function renderBuilderExerciseOptions(focus) {
  return builderExerciseRows(focus)
    .map((exercise) => `<option value="${exercise.id}">${escapeHtml(exercise.name)}</option>`)
    .join("");
}

function renderBuilderFocusOptions(workoutFocus, selected = workoutFocus) {
  return builderFocusOptions(workoutFocus)
    .map((option) => `<option value="${option.value}" ${option.value === selected ? "selected" : ""}>${option.label}</option>`)
    .join("");
}

function updateBuilderExerciseOptions() {
  const exerciseFocus = document.getElementById("customExerciseFocus")?.value || document.getElementById("customMuscle")?.value || "chest";
  const exerciseSelect = document.getElementById("customExercise");
  if (!exerciseSelect) return;
  exerciseSelect.innerHTML = renderBuilderExerciseOptions(exerciseFocus);
}

function updateBuilderFocus() {
  const workoutFocus = document.getElementById("customMuscle")?.value || "chest";
  const focusSelect = document.getElementById("customExerciseFocus");
  if (!focusSelect) return;
  focusSelect.innerHTML = renderBuilderFocusOptions(workoutFocus);
  updateBuilderExerciseOptions();
}

function renderBuilder() {
  return `
    <div class="builder-header">
      <div>
        <p class="eyebrow">Custom workout builder</p>
        <h1>Build the exact session you want.</h1>
      </div>
    </div>
    <div class="grid two">
      <section class="card pad">
        <div class="grid two">
          <div class="field">
            <label for="customMuscle">Focus</label>
            <select id="customMuscle" onchange="updateBuilderFocus()">
              ${muscles.map((m) => `<option value="${m}">${m[0].toUpperCase() + m.slice(1)}</option>`).join("")}
              <option value="travel">Road Gym</option>
            </select>
          </div>
        </div>
        <div class="grid two" style="margin-top: 12px;">
          <div class="field">
            <label for="customSets">Sets</label>
            <input id="customSets" type="number" inputmode="decimal" value="3" min="1" max="10" />
          </div>
          <div class="field">
            <label for="customReps">Reps</label>
            <input id="customReps" value="8-12" />
          </div>
        </div>
        <div class="grid two" style="margin-top: 12px;">
          <div class="field">
            <label for="customExerciseFocus">Exercise Focus</label>
            <select id="customExerciseFocus" onchange="updateBuilderExerciseOptions()">
              ${renderBuilderFocusOptions("chest")}
            </select>
          </div>
          <div class="field">
            <label for="customDropSets">Drop Sets</label>
            <input id="customDropSets" type="number" inputmode="decimal" value="0" min="0" max="4" />
          </div>
        </div>
        <div class="grid two" style="margin-top: 12px;">
          <div class="field">
            <label for="customRest">Rest Seconds</label>
            <input id="customRest" type="number" inputmode="decimal" value="${DEFAULT_REST_SECONDS}" min="15" max="300" step="15" />
          </div>
          <div class="field">
            <label for="customExercise">Exercise</label>
            <select id="customExercise">
              ${renderBuilderExerciseOptions("chest")}
            </select>
          </div>
        </div>
        <div class="actions" style="margin-top: 14px;">
          <button class="secondary-btn" onclick="addBuilderExercise()">Add Exercise</button>
          <button class="primary-btn" onclick="startCustomWorkout()">Start Workout</button>
        </div>
      </section>
      <section class="card pad">
        <h2>Draft</h2>
        <div id="builderDraft" class="exercise-list">${renderBuilderDraft()}</div>
      </section>
    </div>
  `;
}

// The draft survives the app being closed; entries are re-validated on load.
var builderDraft = Array.isArray(state.builderDraft)
  ? state.builderDraft.filter((spec) => {
      const id = Array.isArray(spec) ? spec[0] : spec?.id;
      return exerciseLibrary.some((exercise) => exercise.id === id);
    })
  : [];

function addBuilderExercise() {
  const id = document.getElementById("customExercise").value;
  const sets = Math.max(1, Math.min(10, Math.trunc(Number(document.getElementById("customSets").value) || 3)));
  const reps = document.getElementById("customReps").value.trim() || "8-12";
  const rest = clampRestSeconds(document.getElementById("customRest").value);
  const dropSets = Math.max(0, Math.min(4, Math.trunc(Number(document.getElementById("customDropSets").value) || 0)));
  builderDraft.push([id, sets, reps, rest, dropSets]);
  document.getElementById("builderDraft").innerHTML = renderBuilderDraft();
}

function removeBuilderExercise(index) {
  builderDraft.splice(index, 1);
  const node = document.getElementById("builderDraft");
  if (node) node.innerHTML = renderBuilderDraft();
}

function renderBuilderDraft() {
  if (builderDraft.length === 0) {
    return '<div class="empty"><p class="muted">No exercises added yet.</p></div>';
  }
  return builderDraft.map(([id, sets, reps, rest, dropSets = 0], index) => `
    <div class="exercise-row">
      <div>
        <strong>${escapeHtml(exerciseById(id).name)}</strong>
        <p class="muted" style="margin: 4px 0 0;">${sets} sets x ${reps}${dropSets ? ` + ${dropSets} drop ${dropSets === 1 ? "set" : "sets"}` : ""}</p>
      </div>
      <button class="ghost-btn danger" onclick="removeBuilderExercise(${index})">Remove</button>
    </div>
  `).join("");
}

function startCustomWorkout() {
  const muscle = document.getElementById("customMuscle").value;
  if (builderDraft.length === 0) {
    toast("Add at least one exercise.");
    return;
  }
  const title = `${muscleLabel(muscle)} Custom Session`;

  const plan = {
    id: `builder-${Date.now()}`,
    title,
    muscle,
    phase: muscle === "travel" ? "travel" : state.phase,
    rest: Number(document.getElementById("customRest").value) || DEFAULT_REST_SECONDS,
    note: "Custom bodybuilding session launched from Builder.",
    exercises: builderDraft
  };

  if (beginWorkoutFromPlan(plan)) {
    builderDraft = [];
    toast("Workout started.");
  }
}

function workoutSetRows(sets, dropSets = 0) {
  const workingSets = Math.max(1, Number(sets) || 1);
  const drops = Math.max(0, Math.min(4, Number(dropSets) || 0));
  return [
    ...Array.from({ length: workingSets }, (_, index) => ({
      set: index + 1,
      label: String(index + 1),
      dropSet: false,
      weight: "",
      reps: "",
      done: false
    })),
    ...Array.from({ length: drops }, (_, index) => ({
      set: workingSets + index + 1,
      label: `D${index + 1}`,
      dropSet: true,
      weight: "",
      reps: "",
      done: false
    }))
  ];
}

function beginWorkoutFromPlan(plan) {
  if (state.activeWorkout) {
    state.view = "session";
    saveState();
    render();
    toast("Finish or cancel your current workout before starting another.");
    return false;
  }
  state.activeWorkout = {
    id: crypto.randomUUID(),
    planId: plan.id,
    title: plan.title,
    phase: plan.phase,
    startedAt: new Date().toISOString(),
    exercises: plan.exercises.map(([id, sets, reps, rest, dropSets = 0]) => {
      const drops = Math.max(0, Math.min(4, Number(dropSets) || 0));
      const libraryExercise = exerciseById(id);
      return {
        id,
        name: libraryExercise.name,
        repsOnly: libraryExercise.muscle === "abs",
        targetSets: Number(sets),
        targetDropSets: drops,
        targetReps: String(reps),
        rest: clampRestSeconds(rest ?? plan.rest ?? DEFAULT_REST_SECONDS),
        sets: workoutSetRows(sets, drops)
      };
    })
  };
  state.view = "session";
  state.timer = { seconds: DEFAULT_REST_SECONDS, left: 0, running: false, startedAt: null, endsAt: null, fullscreen: false, exerciseIndex: null };
  saveState();
  render();
  return true;
}

function startWorkout(planId) {
  const plan = allPlans().find((item) => item.id === planId);
  if (!plan) return false;
  return beginWorkoutFromPlan(plan);
}

function quickStartExercise(id) {
  const ex = exerciseById(id);
  // Quick sessions are transient. Start them directly instead of saving a
  // throwaway template into customPlans, which cluttered Plans and Builder.
  return beginWorkoutFromPlan({
    id: `quick-${Date.now()}`,
    title: `${ex.name} Quick Log`,
    muscle: ex.muscle,
    phase: state.phase,
    rest: DEFAULT_REST_SECONDS,
    note: "Single-exercise quick session.",
    exercises: [[id, 4, "8-12", DEFAULT_REST_SECONDS]]
  });
}

function activeWorkoutExerciseOptions(currentExerciseId = null) {
  const current = currentExerciseId ? exerciseLibrary.find((exercise) => exercise.id === currentExerciseId) : null;
  const existingIds = new Set((state.activeWorkout?.exercises || []).map((exercise) => exercise.id));
  return exerciseLibrary.filter((exercise) => {
    if (exercise.id === currentExerciseId) return false;
    if (existingIds.has(exercise.id)) return false;
    if (state.activeWorkout?.phase === "travel" && !exercise.hotel) return false;
    return !current || exercise.muscle === current.muscle;
  });
}

function renderActiveExerciseOptions(currentExerciseId = null) {
  return activeWorkoutExerciseOptions(currentExerciseId).map((exercise) => `
    <option value="${exercise.id}">${escapeHtml(exercise.name)} — ${escapeHtml(exercise.muscle)} — ${escapeHtml(exercise.equipment)}</option>
  `).join("");
}

function exerciseHasProgress(exercise) {
  return exercise.sets.some((set) => set.done || set.weight !== "" || set.reps !== "");
}

function addExerciseToActiveWorkout() {
  if (!state.activeWorkout) return false;
  if (state.activeWorkout.exercises.length >= MAX_PLAN_EXERCISES) {
    toast(`A workout can hold up to ${MAX_PLAN_EXERCISES} exercises.`);
    return false;
  }
  const id = document.getElementById("activeExerciseToAdd")?.value;
  const exercise = exerciseLibrary.find((item) => item.id === id);
  if (!exercise) return false;
  if (state.activeWorkout.exercises.some((item) => item.id === exercise.id)) {
    toast(`${exercise.name} is already in this workout.`);
    return false;
  }
  if (state.activeWorkout.phase === "travel" && !exercise.hotel) {
    toast(`${exercise.name} is not available for a Road Gym workout.`);
    return false;
  }
  const sets = Math.max(1, Math.min(10, Math.trunc(Number(document.getElementById("activeExerciseSets")?.value) || 3)));
  const reps = document.getElementById("activeExerciseReps")?.value.trim() || "8-12";
  const rest = clampRestSeconds(document.getElementById("activeExerciseRest")?.value);
  const dropSets = Math.max(0, Math.min(4, Math.trunc(Number(document.getElementById("activeExerciseDropSets")?.value) || 0)));
  state.activeWorkout.exercises.push({
    id: exercise.id,
    name: exercise.name,
    targetSets: sets,
    targetDropSets: dropSets,
    targetReps: reps,
    rest,
    sets: workoutSetRows(sets, dropSets)
  });
  saveState();
  render();
  toast(`${exercise.name} added to this workout.`);
  return true;
}

function moveActiveWorkoutExercise(index, direction) {
  const exercises = state.activeWorkout?.exercises;
  const target = index + direction;
  if (!exercises || target < 0 || target >= exercises.length) return false;
  [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
  if (state.timer.exerciseIndex === index) state.timer.exerciseIndex = target;
  else if (state.timer.exerciseIndex === target) state.timer.exerciseIndex = index;
  const anchor = state.activeWorkout.lastExerciseIndex;
  if (anchor === index) state.activeWorkout.lastExerciseIndex = target;
  else if (anchor === target) state.activeWorkout.lastExerciseIndex = index;
  saveState();
  render();
  return true;
}

function removeActiveWorkoutExercise(index) {
  const exercises = state.activeWorkout?.exercises;
  const exercise = exercises?.[index];
  if (!exercise) return false;
  if (exercises.length === 1) {
    toast("A workout must keep at least one exercise.");
    return false;
  }
  if (exerciseHasProgress(exercise)) {
    toast("This exercise has entered sets. Clear them first so no workout data is lost.");
    return false;
  }
  exercises.splice(index, 1);
  if (state.timer.exerciseIndex === index) {
    clearInterval(timerTick);
    timerTick = null;
    stopTimer();
  } else if (state.timer.exerciseIndex > index) {
    state.timer.exerciseIndex -= 1;
  }
  const anchor = state.activeWorkout.lastExerciseIndex;
  if (anchor === index) state.activeWorkout.lastExerciseIndex = null;
  else if (Number.isInteger(anchor) && anchor > index) state.activeWorkout.lastExerciseIndex = anchor - 1;
  saveState();
  render();
  toast(`${exercise.name} removed.`);
  return true;
}

function substituteActiveWorkoutExercise(index) {
  const exercises = state.activeWorkout?.exercises;
  const current = exercises?.[index];
  if (!current) return false;
  if (exerciseHasProgress(current)) {
    toast("Completed or entered sets are protected. Add a replacement exercise instead.");
    return false;
  }
  const replacementId = document.getElementById(`activeSubstitute-${index}`)?.value;
  const replacement = activeWorkoutExerciseOptions(current.id).find((exercise) => exercise.id === replacementId);
  if (!replacement) return false;
  exercises[index] = {
    ...current,
    id: replacement.id,
    name: replacement.name,
    sets: workoutSetRows(current.targetSets, current.targetDropSets)
  };
  saveState();
  render();
  toast(`${current.name} substituted with ${replacement.name}.`);
  return true;
}

function updateSet(exIndex, setIndex, field, value) {
  const set = state.activeWorkout?.exercises?.[exIndex]?.sets?.[setIndex];
  if (!set || !["weight", "reps", "rir", "setType"].includes(field)) return;
  // Changing the load or reps of a completed set reopens it; RIR and set-type
  // annotations do not change what was lifted.
  const reopened = set.done && ["weight", "reps"].includes(field) && set[field] !== value;
  if (reopened) set.done = false;
  set[field] = value;
  if (reopened || field === "rir" || field === "setType") saveState();
  else scheduleStateSave();
  if (reopened) reflectReopenedSet(exIndex, setIndex);
}

function reflectReopenedSet(exIndex, setIndex) {
  const button = document.querySelector?.(`[data-set-button="${exIndex}-${setIndex}"]`);
  if (button) {
    button.className = "primary-btn";
    button.textContent = "Complete";
  }
  const counter = document.querySelector?.("[data-sets-completed]");
  const workout = state.activeWorkout;
  if (counter && workout) {
    const completed = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((item) => item.done).length, 0);
    const total = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    counter.textContent = `${completed} of ${total} sets completed`;
  }
  toast("Set reopened. Tap Complete again to log the change.");
}

function completeSet(exIndex, setIndex) {
  const ex = state.activeWorkout?.exercises?.[exIndex];
  const set = ex?.sets?.[setIndex];
  if (!ex || !set) return;
  const repsOnly = isRepsOnlyExercise(ex);
  const weight = Number(set.weight);
  const reps = Number(set.reps);
  const weightValid = repsOnly || (set.weight !== "" && Number.isFinite(weight) && weight >= 0);
  if (set.reps === "" || !Number.isInteger(reps) || reps <= 0 || !weightValid) {
    toast(repsOnly ? "Enter reps before completing the set." : "Enter a non-negative weight and whole-number reps before completing the set.");
    return;
  }
  set.done = !set.done;
  saveState();
  if (set.done) startTimer(ex.rest, true, exIndex);
  render();
}

function adjustRest(seconds) {
  const timer = state.timer;
  if (timer.running) {
    // The tick pauses while the page is hidden; read the real remaining time.
    const remaining = Math.ceil((Number(timer.endsAt) - Date.now()) / 1000);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      stopTimer();
      return;
    }
    timer.left = remaining;
    // Adjusting a running rest changes only this rest, never the exercise's
    // planned rest, and -15 near the end shortens instead of clamping up.
    startTimer(Math.max(1, Math.min(600, timer.left + seconds)), Boolean(timer.fullscreen), timer.exerciseIndex ?? null, false);
    return;
  }
  const next = Math.max(15, Math.min(300, timer.seconds + seconds));
  {
    state.timer.seconds = next;
    saveState();
    render();
  }
}

function startTimer(seconds = state.timer.seconds, fullscreen = false, exerciseIndex = state.timer.exerciseIndex ?? null, persistRest = true) {
  primeTimerAudio();
  const now = Date.now();
  const duration = persistRest ? clampRestSeconds(seconds) : Math.max(1, Math.min(600, Math.round(Number(seconds)) || 1));
  if (persistRest && state.activeWorkout && exerciseIndex !== null && state.activeWorkout.exercises[exerciseIndex]) {
    state.activeWorkout.exercises[exerciseIndex].rest = duration;
  }
  // A one-off adjustment (+15s, watch catch-up) changes only this rest: the
  // remembered preset `seconds` stays, and `total` drives the progress ring.
  state.timer = {
    seconds: persistRest ? duration : clampRestSeconds(state.timer.seconds),
    total: duration,
    left: duration,
    running: true,
    startedAt: now,
    endsAt: now + duration * 1000,
    fullscreen,
    exerciseIndex
  };
  saveState();
  ensureTimerTick();
}

function clearTimerTick() {
  if (timerTick) clearInterval(timerTick);
  timerTick = null;
}

function stopTimer() {
  clearTimerTick();
  state.timer.running = false;
  state.timer.left = 0;
  state.timer.startedAt = null;
  state.timer.endsAt = null;
  state.timer.fullscreen = false;
  state.timer.exerciseIndex = null;
  saveState();
  render();
}

function closeRestOverlay() {
  state.timer.fullscreen = false;
  state.timer.exerciseIndex = null;
  saveState();
  render();
}

function ensureTimerTick() {
  if (timerTick) clearInterval(timerTick);
  // Hidden page (locked phone): the native notification rings on time and the
  // visible branch of visibilitychange re-arms the tick via reconcile. A tick
  // armed here by a late watch command would ring a second bell on return.
  if (typeof document !== "undefined" && document.hidden) {
    timerTick = null;
    return;
  }
  timerTick = setInterval(() => {
    if (!state.timer.running) return;
    const left = Math.max(0, Math.ceil((state.timer.endsAt - Date.now()) / 1000));
    if (left === state.timer.left && left > 0) return;
    state.timer.left = left;
    if (left <= 0) {
      clearTimerTick();
      state.timer.running = false;
      state.timer.left = 0;
      if (window.webkit?.messageHandlers?.peaksetTimer) window.webkit.messageHandlers.peaksetTimer.postMessage({ action: "cancel", workoutActive: Boolean(state.activeWorkout) });
      playBoxingBell();
      if (state.timer.fullscreen) {
        saveState();
        render();
        return;
      }
      toast("Rest complete. Next set.");
    }
    saveState();
    updateTimerDom();
  }, 250);
}

function timerTotalSeconds() {
  return Math.max(1, Number(state.timer.total) || Number(state.timer.seconds) || 1);
}

function updateTimerDom() {
  const total = timerTotalSeconds();
  const left = timerDisplaySeconds();
  // Idle: the face shows the preset, which may exceed the last rest's total.
  const elapsed = state.timer.running || state.timer.fullscreen ? total - left : 0;
  document.querySelectorAll(".timer-face").forEach((face) => {
    face.style.setProperty("--progress", `${Math.min(360, (elapsed / total) * 360)}deg`);
  });
  document.querySelectorAll("[data-timer-time]").forEach((time) => {
    time.textContent = formatTime(left);
  });
  document.querySelectorAll("[data-timer-status]").forEach((status) => {
    status.textContent = timerStatusText();
  });
}

function timerDisplaySeconds() {
  if (state.timer.running) return state.timer.left;
  if (state.timer.fullscreen && state.timer.left === 0) return 0;
  return state.timer.seconds;
}

function timerStatusText() {
  if (state.timer.running) return "Resting";
  if (state.timer.fullscreen && state.timer.left === 0) return "Rest complete";
  return "Ready";
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function setLogSummary(set) {
  if (set.repsOnly || !set.weight) return `${set.dropSet ? "Drop " : ""}${set.reps || "--"} reps`;
  return `${set.dropSet ? "Drop " : ""}${set.weight} x ${set.reps || "--"}`;
}

function restPresetButtons(fullscreen = false) {
  const exerciseIndex = state.timer.exerciseIndex ?? null;
  return [60, 90, 120, 180, 240].map((seconds) => `
    <button class="chip ${seconds === state.timer.seconds ? "active" : ""}" aria-pressed="${seconds === state.timer.seconds}" onclick="startTimer(${seconds}, ${fullscreen}, ${exerciseIndex === null ? "null" : exerciseIndex})">${seconds}s</button>
  `).join("");
}

function renderRestOverlay(left, progress) {
  if (!state.timer.fullscreen) return "";
  const workout = state.activeWorkout;
  const exercise = workout && state.timer.exerciseIndex !== null ? workout.exercises[state.timer.exerciseIndex] : null;
  return `
    <div class="rest-overlay" role="dialog" aria-modal="true" aria-labelledby="restTimerTitle">
      <div class="rest-overlay-inner">
        <div class="rest-overlay-head">
          <p class="eyebrow" id="restTimerTitle">Rest timer</p>
          <button class="ghost-btn" onclick="closeRestOverlay()">Back to Workout</button>
        </div>
        <p class="muted" style="margin: 0;">${exercise ? escapeHtml(exercise.name) : "Next set"}</p>
        <div class="timer-face timer-face-large" style="--progress: ${progress}deg;">
          <div style="text-align: center;">
            <strong data-timer-time>${formatTime(left)}</strong>
            <p class="muted" data-timer-status style="margin: 8px 0 0;">${state.timer.running ? "Resting" : "Rest complete"}</p>
          </div>
        </div>
        <div class="timer-controls rest-overlay-controls">
          <div class="actions">
            <button class="secondary-btn" onclick="adjustRest(-15)">-15s</button>
            <button class="secondary-btn" onclick="adjustRest(15)">+15s</button>
          </div>
          <div class="actions">
            ${restPresetButtons(true)}
          </div>
          <button class="primary-btn" onclick="closeRestOverlay()">${state.timer.running ? "Return to Workout" : "Next Set"}</button>
          <button class="secondary-btn" onclick="playBoxingBell()">Test Bell</button>
          <button class="ghost-btn danger" onclick="stopTimer()">Stop Timer</button>
        </div>
      </div>
    </div>
  `;
}

function finishWorkout() {
  const workout = state.activeWorkout;
  if (!workout) return;
  const sets = workout.exercises.flatMap((exercise) =>
    exercise.sets
      .filter((set) => set.done)
      .map((set) => ({ exerciseId: exercise.id, exercise: exercise.name, weight: isRepsOnlyExercise(exercise) ? "" : set.weight, reps: set.reps, repsOnly: isRepsOnlyExercise(exercise), dropSet: Boolean(set.dropSet), label: set.label || String(set.set), ...(set._unitOrigin?.weight ? { _unitOrigin: { weight: set._unitOrigin.weight } } : {}) }))
  );
  if (sets.length === 0) {
    toast("Complete at least one set before saving.");
    return;
  }
  const log = {
    id: workout.id,
    title: workout.title,
    phase: workout.phase,
    date: new Date().toISOString(),
    sets,
    volume: sets.reduce((sum, set) => sum + ((Number(set.weight) || 0) * (Number(set.reps) || 0)), 0)
  };
  state.workoutLogs.unshift(log);
  state.activeWorkout = null;
  state.view = "today";
  stopTimer();
  saveState();
  toast("Workout saved.");
  render();
}

function cancelWorkout() {
  const hasProgress = state.activeWorkout?.exercises?.some((exercise) =>
    exercise.sets.some((set) => set.done || set.weight !== "" || set.reps !== "")
  );
  if (hasProgress && !window.confirm("Cancel this workout and discard the entered sets?")) return;
  state.activeWorkout = null;
  state.view = "today";
  stopTimer();
  saveState();
  render();
}

function renderSession() {
  const workout = state.activeWorkout;
  if (!workout) {
    state.view = "today";
    return renderToday();
  }
  const completed = workout.exercises.reduce((sum, ex) => sum + ex.sets.filter((set) => set.done).length, 0);
  const total = workout.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const left = timerDisplaySeconds();
  const totalTimer = timerTotalSeconds();
  const progress = state.timer.running || state.timer.fullscreen ? ((totalTimer - left) / totalTimer) * 360 : 0;

  if (state.timer.running) setTimeout(ensureTimerTick, 0);

  return `
    ${renderRestOverlay(left, progress)}
    <div class="topbar">
      <div>
        <p class="eyebrow">Live workout</p>
        <h1>${escapeHtml(workout.title)}</h1>
        <p class="muted" data-sets-completed>${completed} of ${total} sets completed</p>
      </div>
      <div class="actions">
        <button class="secondary-btn" onclick="finishWorkout()">Save Session</button>
        <button class="ghost-btn danger" onclick="cancelWorkout()">Cancel</button>
      </div>
    </div>
    <details class="card pad live-workout-customizer" ${liveCustomizerOpen ? "open" : ""} ontoggle="liveCustomizerOpen = this.open">
      <summary>Customize this workout</summary>
      <p class="muted">Add an exercise without leaving your session. Road Gym workouts only suggest travel-ready movements.</p>
      <div class="live-add-grid">
        <div class="field live-add-exercise">
          <label for="activeExerciseToAdd">Exercise</label>
          <select id="activeExerciseToAdd">${renderActiveExerciseOptions()}</select>
        </div>
        <div class="field">
          <label for="activeExerciseSets">Sets</label>
          <input id="activeExerciseSets" type="number" inputmode="decimal" value="3" min="1" max="10" />
        </div>
        <div class="field">
          <label for="activeExerciseReps">Reps</label>
          <input id="activeExerciseReps" value="8-12" />
        </div>
        <div class="field">
          <label for="activeExerciseRest">Rest Seconds</label>
          <input id="activeExerciseRest" type="number" inputmode="decimal" value="90" min="15" max="300" step="15" />
        </div>
        <div class="field">
          <label for="activeExerciseDropSets">Drop Sets</label>
          <input id="activeExerciseDropSets" type="number" inputmode="decimal" value="0" min="0" max="4" />
        </div>
      </div>
      <button class="primary-btn" onclick="addExerciseToActiveWorkout()">Add to Workout</button>
    </details>
    <div class="session-shell">
      <section class="session">
        ${workout.exercises.map((exercise, exIndex) => `
          <article class="card pad">
            <div class="card-head">
              <div>
                <span class="badge blue">${exercise.targetSets} sets${exercise.targetDropSets ? ` + ${exercise.targetDropSets} drop` : ""} x ${escapeHtml(exercise.targetReps)}</span>
                <h2 style="margin-top: 10px;">${escapeHtml(exercise.name)}</h2>
              </div>
              <span class="badge">${exercise.rest}s rest</span>
            </div>
            <div class="live-exercise-controls" aria-label="Customize ${escapeHtml(exercise.name)}">
              <div class="live-order-controls">
                <button class="ghost-btn" onclick="moveActiveWorkoutExercise(${exIndex}, -1)" ${exIndex === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(exercise.name)} earlier">Move Up</button>
                <button class="ghost-btn" onclick="moveActiveWorkoutExercise(${exIndex}, 1)" ${exIndex === workout.exercises.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(exercise.name)} later">Move Down</button>
                <button class="ghost-btn danger" onclick="removeActiveWorkoutExercise(${exIndex})" aria-label="Remove ${escapeHtml(exercise.name)} from workout">Remove</button>
              </div>
              <div class="live-substitute-controls">
                <label class="sr-only" for="activeSubstitute-${exIndex}">Suggested substitute for ${escapeHtml(exercise.name)}</label>
                <select id="activeSubstitute-${exIndex}">${renderActiveExerciseOptions(exercise.id)}</select>
                <button class="secondary-btn" onclick="substituteActiveWorkoutExercise(${exIndex})" aria-label="Substitute ${escapeHtml(exercise.name)}">Substitute</button>
              </div>
            </div>
            <div class="set-table">
              ${exercise.sets.map((set, setIndex) => `
                <div class="set-row ${isRepsOnlyExercise(exercise) ? "reps-only" : ""}">
                  <div class="set-number ${set.dropSet ? "drop" : ""}">${escapeHtml(set.label || set.set)}</div>
                  ${isRepsOnlyExercise(exercise) ? "" : `<input type="number" inputmode="decimal" min="0" placeholder="${weightUnit()}" aria-label="${escapeHtml(exercise.name)} set ${escapeHtml(set.label || set.set)} weight" value="${escapeHtml(set.weight)}" oninput="updateSet(${exIndex}, ${setIndex}, 'weight', this.value)" />`}
                  <input type="number" inputmode="numeric" min="1" step="1" placeholder="Reps" aria-label="${escapeHtml(exercise.name)} set ${escapeHtml(set.label || set.set)} reps" value="${escapeHtml(set.reps)}" oninput="updateSet(${exIndex}, ${setIndex}, 'reps', this.value)" />
                  <button class="${set.done ? "secondary-btn" : "primary-btn"}" data-set-button="${exIndex}-${setIndex}" onclick="completeSet(${exIndex}, ${setIndex})">${set.done ? "Done" : "Complete"}</button>
                </div>
              `).join("")}
            </div>
          </article>
        `).join("")}
      </section>
      <aside class="card pad">
        <p class="eyebrow">Rest timer</p>
        <div class="timer-face" style="--progress: ${progress}deg;">
          <div style="text-align: center;">
            <strong data-timer-time>${formatTime(left)}</strong>
            <p class="muted" data-timer-status style="margin: 6px 0 0;">${timerStatusText()}</p>
          </div>
        </div>
        <div class="timer-controls">
          <div class="actions">
            <button class="secondary-btn" onclick="adjustRest(-15)">-15s</button>
            <button class="secondary-btn" onclick="adjustRest(15)">+15s</button>
          </div>
          <div class="actions">
            ${restPresetButtons(false)}
          </div>
          <p class="muted" style="margin: 0; text-align: center; font-size: 12px;">Bell plays through the current device audio output.</p>
          <button class="secondary-btn" onclick="playBoxingBell()">Test Bell</button>
          <button class="ghost-btn danger" onclick="stopTimer()">Stop Timer</button>
        </div>
      </aside>
    </div>
  `;
}

function renderProgress() {
  const weights = [...state.weightLogs].reverse().map((m) => Number(m.bodyweight)).filter(Boolean);
  const latestWeight = state.weightLogs[0];
  const latestMeasurement = state.measurements[0];
  const measurementLabels = [
    ["chest", "Chest"],
    ["waist", "Waist"],
    ["shoulders", "Shoulders"],
    ["arm", "Arm"],
    ["thigh", "Thigh"],
    ["calf", "Calf"],
    ["bodyFat", "Body Fat %"]
  ];
  return `
    <div class="grid two progress-grid">
      <section class="card pad">
        <p class="eyebrow">Frequent log</p>
        <h2>Body Weight</h2>
        <div class="grid two">
          <div class="field">
            <label for="logWeight">Scale Weight</label>
            <input id="logWeight" type="number" inputmode="decimal" step="0.1" value="${latestWeight?.bodyweight || ""}" />
          </div>
          <div class="field">
            <label for="logWeightNote">Note</label>
            <input id="logWeightNote" placeholder="Morning fasted, high-carb day..." />
          </div>
        </div>
        <button class="primary-btn" style="margin-top: 14px;" onclick="saveWeight()">Save Weight</button>
      </section>
      <section class="card pad">
        <h2>Body Weight Trend</h2>
        ${weights.length > 1 ? sparkline(weights) : '<div class="empty"><p class="muted">Add two check-ins to see a trend.</p></div>'}
        <div class="grid two" style="margin-top: 12px;">
          <div class="stat card"><p class="value">${latestWeight?.bodyweight || "--"}</p><p class="label">Latest weight</p></div>
          <div class="stat card"><p class="value">${state.weightLogs.length}</p><p class="label">Weight logs</p></div>
        </div>
      </section>
    </div>
    <div class="grid two progress-grid" style="margin-top: 12px;">
      <section class="card pad">
        <p class="eyebrow">Physique check-in</p>
        <h2>Body Measurements</h2>
        <div class="measurement-grid">${measurementFields("measure")}</div>
        <button class="primary-btn" style="margin-top: 14px;" onclick="saveMeasurement()">Save Measurements</button>
      </section>
      <section class="card pad">
        <h2>Latest Measurements</h2>
        ${latestMeasurement ? `
          <div class="measurement-grid">
            ${measurementLabels.map(([key, label]) => `
              <div class="stat card">
                <p class="value">${latestMeasurement[key] ?? "--"}</p>
                <p class="label">${label}</p>
              </div>
            `).join("")}
          </div>
          <p class="muted" style="margin-top: 12px;">Last measured ${new Date(latestMeasurement.date).toLocaleDateString()}</p>
        ` : '<div class="empty"><p class="muted">No body measurements logged yet.</p></div>'}
      </section>
    </div>
  `;
}

function renderLogbook() {
  const days = logbookDays();
  const report = coachReportData(days);
  const latestMeasurementRows = measurementRows(report.latestMeasurement);
  return `
    <div class="logbook-header">
      <div>
        <p class="eyebrow">Coach export</p>
        <h1>Send the week without rewriting it.</h1>
      </div>
    </div>
    <section class="card pad">
      <div class="grid two">
        <div class="field">
          <label for="logbookRange">Report Range</label>
          <select id="logbookRange" onchange="setLogbookRange(this.value)">
            ${[7, 14, 30].map((range) => `<option value="${range}" ${days === range ? "selected" : ""}>Last ${range} days</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="coachNote">Optional Coach Note</label>
          <input id="coachNote" placeholder="Energy, appetite, joints, posing, cardio..." value="${escapeHtml(coachNoteDraft)}" oninput="coachNoteDraft = this.value" />
        </div>
      </div>
      <div class="actions" style="margin-top: 14px;">
        <button class="primary-btn" onclick="exportLogbookPdf()">Export PDF</button>
        <button class="secondary-btn" onclick="setView('progress')">Add Check-In</button>
      </div>
    </section>
    <div class="grid today-stats logbook-stats">
      <article class="card stat">
        <p class="value">${report.workouts.length}</p>
        <p class="label">Workouts</p>
      </article>
      <article class="card stat">
        <p class="value">${Math.round(report.volume).toLocaleString()}</p>
        <p class="label">Volume ${weightUnit()}</p>
      </article>
      <article class="card stat">
        <p class="value">${report.weights.length}</p>
        <p class="label">Weight logs</p>
      </article>
      <article class="card stat">
        <p class="value">${report.measurements.filter((entry) => !String(entry.id || "").startsWith("hk-")).length}</p>
        <p class="label">Measurement check-ins</p>
      </article>
    </div>
    <section class="card pad" style="margin-top: 16px;">
      <div class="card-head">
        <div>
          <p class="eyebrow">PDF preview</p>
          <h2>Coach Logbook</h2>
        </div>
        <span class="badge blue">Last ${days} days</span>
      </div>
      <div class="grid two">
        <article class="log-card card">
          <strong>Body weight</strong>
          ${report.weights.slice(0, 6).map((entry) => `
            <p class="muted">${formatShortDate(entry.date)} - ${formatWeight(entry.bodyweight)} ${weightUnit()}${Number(entry.bodyFat) > 0 ? ` · ${formatWeight(entry.bodyFat)}% BF` : ""}${entry.note ? ` - ${escapeHtml(entry.note)}` : ""}</p>
          `).join("") || '<p class="muted">No body weight logs in this range.</p>'}
        </article>
        <article class="log-card card">
          <strong>Latest measurements</strong>
          ${latestMeasurementRows.map(([label, value, unit]) => `
            <p class="muted">${escapeHtml(String(label).replace(/ %$/, ""))}: ${escapeHtml(measurementValueText(value, unit))}</p>
          `).join("") || '<p class="muted">No measurements logged yet.</p>'}
        </article>
      </div>
    </section>
    <section class="card pad" style="margin-top: 16px;">
      <h2>Workout Detail</h2>
      <div class="grid two">
        ${report.workouts.map((log) => `
          <article class="log-card card">
            <div class="card-head">
              <strong>${escapeHtml(log.title)}</strong>
              <span class="badge">${formatShortDate(log.date)}</span>
            </div>
            ${isSafeRowId(log.id) ? `<button class="ghost-btn danger compact-btn" aria-label="Delete ${escapeHtml(log.title)} from ${formatShortDate(log.date)}" onclick="deleteLogEntry('workout','${log.id}')">Delete workout</button>` : ""}
            <p class="muted">${plural((log.sets || []).length, "set")}, ${Math.round(Number(log.volume) || totalVolume(log)).toLocaleString()} ${weightUnit()} volume</p>
            <p class="muted">${(log.sets || []).slice(0, 4).map((set) => `${escapeHtml(set.exercise)} ${escapeHtml(setLogSummary(set))}`).join(" / ")}${(log.sets || []).length > 4 ? ` <span class="muted">+${(log.sets || []).length - 4} more ${(log.sets || []).length === 5 ? "set" : "sets"}</span>` : ""}</p>
          </article>
        `).join("") || '<div class="empty"><p class="muted">No workouts logged in this range.</p></div>'}
      </div>
    </section>
  `;
}

function saveWeight() {
  const bodyweight = Number(document.getElementById("logWeight").value);
  if (!bodyweight) {
    toast("Add body weight before saving.");
    return;
  }
  if (!isPlausibleBodyweight(bodyweight)) {
    toast(bodyweightRangeMessage());
    return;
  }
  const latest = state.weightLogs[0];
  const sinceLatest = latest ? Date.now() - Date.parse(latest.date) : Infinity;
  if (latest && Number(latest.bodyweight) === bodyweight && sinceLatest >= 0 && sinceLatest < 60000) {
    toast("That weigh-in is already saved.");
    return;
  }
  const entry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    bodyweight,
    note: document.getElementById("logWeightNote").value.trim()
  };
  state.weightLogs.unshift(entry);
  if (state.profile) state.profile.bodyweight = bodyweight;
  saveState();
  toast("Body weight saved.");
  render();
}

function saveMeasurement() {
  const measurements = collectMeasurementInputs("measure");
  const hasMeasurement = Object.values(measurements).some((value) => value !== null && Number.isFinite(value));
  if (!hasMeasurement) {
    toast("Add at least one body measurement.");
    return;
  }
  if (hasInvalidMeasurement(measurements)) {
    toast("Measurements must be positive numbers.");
    return;
  }
  const entry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    ...measurements,
    note: ""
  };
  state.measurements.unshift(entry);
  saveState();
  toast("Measurements saved.");
  render();
}

function sparkline(values) {
  const width = 620;
  const height = 86;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 14) - 7;
    return `${x},${y}`;
  }).join(" ");
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Body weight trend">
      <polyline points="${points}" fill="none" stroke="#2DD4BF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="0" y1="${height - 8}" x2="${width}" y2="${height - 8}" stroke="rgba(255,255,255,0.12)" />
    </svg>
  `;
}

function renderContent() {
  if (state.view === "plans") return renderPlans();
  if (state.view === "library") return renderLibrary();
  if (state.view === "builder") return renderBuilder();
  if (state.view === "progress") return renderProgress();
  if (state.view === "history") return renderExerciseHistory();
  if (state.view === "logbook") return renderLogbook();
  if (state.view === "session") return renderSession();
  return renderToday();
}

function renderActiveWorkoutBanner() {
  if (!state.activeWorkout || state.view === "session") return "";
  const completed = state.activeWorkout.exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.done).length;
  return `
    <section class="card pad resume-workout" aria-label="Workout in progress">
      <div>
        <p class="eyebrow">Workout in progress</p>
        <strong>${escapeHtml(state.activeWorkout.title)}</strong>
        <p class="muted">${completed} completed ${completed === 1 ? "set" : "sets"}. Your session is saved on this device.</p>
      </div>
      <button class="primary-btn" onclick="setView('session')">Resume Workout</button>
    </section>
  `;
}

function resetDemoData() {
  localStorage.removeItem(STORE_KEY);
  state = freshDefaultState();
  builderDraft = [];
  coachNoteDraft = "";
  render();
}

function render() {
  const root = document.getElementById("app");
  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">MM</div>
          <div>
            <p class="brand-title">${APP_NAME}</p>
            <p class="brand-subtitle">Bodybuilding logbook</p>
          </div>
        </div>
        <nav class="nav">${navHtml()}</nav>
        <div class="sidebar-card">
          <span class="badge blue">${phaseLabel(state.phase)}</span>
          <p style="margin: 12px 0 6px; font-weight: 850;">Road Gym ready</p>
          <p class="muted">Hotel bench, dumbbells to 50 lb / 22.5 kg, cable handles, rope, and ankle cuffs.</p>
        </div>
      </aside>
      <main class="main">${renderActiveWorkoutBanner()}${renderContent()}</main>
      <nav class="mobile-bar">${navHtml()}</nav>
    </div>
    ${renderOnboarding()}
  `;
  updateTimerDom();
}

// A rest timer can be running while the user browses another tab. Resume its
// tick on load so it still completes (and rings) instead of stalling.
if (state.timer.running) ensureTimerTick();

document.addEventListener("visibilitychange", () => {
  if (document.hidden && timerTick) {
    clearInterval(timerTick);
    timerTick = null;
  } else if (!document.hidden && state.timer.running) {
    primeTimerAudio();
    if (window.webkit?.messageHandlers?.peaksetTimer) window.webkit.messageHandlers.peaksetTimer.postMessage({ action: "reconcile" });
    else ensureTimerTick();
  }
});

render();
