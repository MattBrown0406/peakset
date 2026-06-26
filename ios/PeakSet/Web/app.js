const STORE_KEY = "stageforge-v1";
const APP_NAME = "PeakSet";
const DEFAULT_REST_SECONDS = 180;

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
  { id: "incline-db-curl", name: "Incline Dumbbell Curl", muscle: "arms", equipment: "Dumbbells, incline bench", hotel: true, cue: "Long-head biceps stretch." },
  { id: "spider-curl", name: "Spider Curl", muscle: "arms", equipment: "Incline bench, dumbbells", hotel: true, cue: "Chest down, strict biceps squeeze." },
  { id: "cable-curl", name: "Cable Curl", muscle: "arms", equipment: "Cable bar or handles", hotel: true, cue: "Constant tension through the full rep." },
  { id: "single-arm-cable-curl", name: "Single-Arm Cable Curl", muscle: "arms", equipment: "Cable handle", hotel: true, cue: "Line wrist, elbow, and shoulder with the cable." },
  { id: "bayesian-curl", name: "Bayesian Cable Curl", muscle: "arms", equipment: "Cable handle", hotel: true, cue: "Curl with the arm behind the body." },
  { id: "concentration-curl", name: "Concentration Curl", muscle: "arms", equipment: "Dumbbell", hotel: true, cue: "Slow squeeze, no shoulder movement." },
  { id: "close-grip-bench", name: "Close-Grip Bench Press", muscle: "arms", equipment: "Barbell, bench", hotel: false, cue: "Heavy triceps compound." },
  { id: "skull-crusher", name: "Skull Crusher", muscle: "arms", equipment: "EZ bar or dumbbells", hotel: true, cue: "Let elbows travel slightly back for stretch." },
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
  { id: "goblet-squat", name: "Goblet Squat", muscle: "legs", equipment: "Dumbbell", hotel: true, cue: "Slow tempo makes 50 lb feel heavy." },
  { id: "db-step-up", name: "Dumbbell Step-Up", muscle: "legs", equipment: "Dumbbells, bench", hotel: true, cue: "Drive through the front leg, no bounce." },
  { id: "lying-leg-curl", name: "Lying Leg Curl", muscle: "legs", equipment: "Leg curl machine", hotel: false, cue: "Hamstring squeeze without hip lift." },
  { id: "seated-leg-curl", name: "Seated Leg Curl", muscle: "legs", equipment: "Leg curl machine", hotel: false, cue: "Great lengthened hamstring tension." },
  { id: "nordic-curl", name: "Nordic Curl", muscle: "legs", equipment: "Anchor or partner", hotel: false, cue: "Advanced eccentric hamstring work." },
  { id: "hip-thrust", name: "Hip Thrust", muscle: "legs", equipment: "Barbell or dumbbell, bench", hotel: true, cue: "Posterior pelvic tilt and hard glute lockout." },
  { id: "cable-pull-through", name: "Cable Pull-Through", muscle: "legs", equipment: "Cable, rope", hotel: true, cue: "Hinge through the hips and squeeze glutes." },
  { id: "seated-calf-raise", name: "Seated Calf Raise", muscle: "legs", equipment: "Seated calf machine", hotel: false, cue: "Soleus-focused calf work." },
  { id: "leg-press-calf-raise", name: "Leg Press Calf Raise", muscle: "legs", equipment: "Leg press", hotel: false, cue: "Deep stretch and full plantar flexion." },
  { id: "cable-hip-abduction", name: "Cable Hip Abduction", muscle: "legs", equipment: "Cable, ankle cuff", hotel: true, cue: "Glute medius shape and hip stability." },

  { id: "cable-crunch", name: "Cable Crunch", muscle: "abs", equipment: "Cable, rope", hotel: true, cue: "Round the spine down and squeeze the abs, not the hips." },
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
      ["rear-delt-fly", 4, "12-20", 60]
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
    note: "Built around a hotel bench, 5-50 lb dumbbells, cables, rope, handles, and ankle cuffs.",
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
      ["reverse-pec-deck", 4, "12-20", 60]
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
      ["upright-row", 3, "12-15", 50]
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
      ["rear-delt-fly", 4, "15-20", 40]
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
      ["cable-lateral-raise", 3, "15-25", 35]
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
  todayPlanId: null,
  todayWorkoutPick: "recommended",
  timer: { seconds: DEFAULT_REST_SECONDS, left: 0, running: false, startedAt: null, endsAt: null }
};

let state = loadState();
let timerTick = null;
let audioContext = null;

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    const next = { ...defaultState, ...stored };
    if (!Array.isArray(next.weightLogs)) next.weightLogs = [];
    if (next.weightLogs.length === 0) {
      const migratedWeights = (next.measurements || [])
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
    if (!next.timer?.running) {
      next.timer = { seconds: DEFAULT_REST_SECONDS, left: 0, running: false, startedAt: null, endsAt: null };
    }
    next.measurements = (next.measurements || []).map(({ bodyweight, ...entry }) => entry);
    return next;
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function exerciseById(id) {
  return exerciseLibrary.find((item) => item.id === id) || exerciseLibrary[0];
}

function divisionSelect(id, selected = "") {
  const normalizedSelected = selected || "";
  const customOption = normalizedSelected && !divisionOptions.includes(normalizedSelected)
    ? `<option value="${escapeHtml(normalizedSelected)}">${escapeHtml(normalizedSelected)}</option>`
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

function setView(view) {
  state.view = view;
  saveState();
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

  const candidates = allPlans().filter((plan) => planMatchesTodayPick(plan, pick));
  const selected = randomItem(candidates);
  if (!selected) {
    toast("No workouts found for that pick.");
    return;
  }

  state.todayPlanId = selected.id;
  saveState();
  render();
}

function setChoice(inputId, value, button) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = value;
  document.querySelectorAll(`[data-choice="${inputId}"]`).forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playBellStrike(context, startTime, duration = 1.35) {
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, startTime);
  master.gain.exponentialRampToValueAtTime(0.72, startTime + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  master.connect(context.destination);

  const partials = [
    { frequency: 620, gain: 0.8 },
    { frequency: 835, gain: 0.42 },
    { frequency: 1180, gain: 0.26 },
    { frequency: 1510, gain: 0.16 }
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

function playBoxingBell() {
  const context = getAudioContext();
  if (!context) return;
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

function saveProfile() {
  const get = (id) => document.getElementById(id)?.value.trim() || "";
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

  const measurements = collectMeasurementInputs("");
  state.profile = profile;
  state.phase = get("phase") || "offseason";
  state.weightLogs.unshift({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    bodyweight: profile.bodyweight,
    note: "Starting profile"
  });
  state.measurements.unshift({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    ...measurements,
    note: "Starting profile"
  });
  saveState();
  toast("Profile created. Time to train.");
  render();
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
                <input id="age" type="number" min="13" max="100" placeholder="34" />
              </div>
            </div>
            <div class="grid two">
              <div class="field">
                <label for="bodyweight">Starting Body Weight</label>
                <input id="bodyweight" type="number" step="0.1" placeholder="218.4" />
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
              <h3>Starting Measurements</h3>
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
    ["logbook", "Logbook"]
  ];
  return items.map(([id, label]) => `
    <button class="${state.view === id ? "active" : ""}" onclick="setView('${id}')">${label}</button>
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

function todaysRecommendedPlan() {
  if (state.phase === "prep") return planTemplates.find((p) => p.id === "prep-upper-pump");
  if (state.phase === "bulking") return planTemplates.find((p) => p.id === "back-width");
  return planTemplates.find((p) => p.id === "chest-density");
}

function todaysSelectedPlan() {
  const selected = state.todayPlanId ? allPlans().find((plan) => plan.id === state.todayPlanId) : null;
  return selected || todaysRecommendedPlan();
}

function todayWorkoutSelect() {
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
  return `
    <select id="todayWorkoutPick" onchange="chooseTodayWorkout(this.value)">
      ${options.map(([value, label]) => `<option value="${value}" ${state.todayWorkoutPick === value ? "selected" : ""}>${label}</option>`).join("")}
    </select>
  `;
}

function totalVolume(log) {
  return (log.sets || []).reduce((sum, set) => sum + ((Number(set.weight) || 0) * (Number(set.reps) || 0)), 0);
}

function stats() {
  const lastWeight = state.weightLogs[0];
  const firstWeight = state.weightLogs[state.weightLogs.length - 1];
  const lastSeven = state.workoutLogs.filter((log) => Date.now() - new Date(log.date).getTime() < 7 * 86400000);
  const weeklyVolume = lastSeven.reduce((sum, log) => sum + (Number(log.volume) || totalVolume(log)), 0);
  const weightDelta = lastWeight && firstWeight
    ? (Number(lastWeight.bodyweight || 0) - Number(firstWeight.bodyweight || 0)).toFixed(1)
    : "0.0";
  return { lastWeight, weeklyVolume, weightDelta, workouts: lastSeven.length };
}

function isWithinDays(dateString, days) {
  const timestamp = new Date(dateString).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < days * 86400000;
}

function formatShortDate(dateString) {
  const date = new Date(dateString);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "No date";
}

function measurementRows(entry) {
  if (!entry) return [];
  return [
    ["Chest", entry.chest, "in"],
    ["Waist", entry.waist, "in"],
    ["Shoulders", entry.shoulders, "in"],
    ["Arm", entry.arm, "in"],
    ["Thigh", entry.thigh, "in"],
    ["Calf", entry.calf, "in"],
    ["Body Fat", entry.bodyFat, "%"]
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function coachReportData(days) {
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
    latestWeight: state.weightLogs[0],
    latestMeasurement: state.measurements[0]
  };
}

function plainReportText(value) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function addReportSection(lines, title) {
  lines.push({ text: "", size: 8 });
  lines.push({ text: title, size: 13, bold: true });
}

function buildCoachReportLines(days, coachNote = "") {
  const report = coachReportData(days);
  const profile = state.profile || {};
  const lines = [
    { text: `${APP_NAME} Coach Logbook`, size: 20, bold: true },
    { text: `${days}-day report generated ${new Date().toLocaleDateString()}`, size: 10 },
    { text: `Athlete: ${profile.gender || "Not set"} - Age ${profile.age || "--"} - ${profile.division || "No division/goal set"}`, size: 10 },
    { text: `Phase: ${phaseLabel(state.phase)} - Current body weight: ${report.latestWeight?.bodyweight || profile.bodyweight || "--"} lb`, size: 10 }
  ];

  if (coachNote.trim()) {
    addReportSection(lines, "Coach Note");
    lines.push({ text: coachNote, size: 10 });
  }

  addReportSection(lines, "Weekly Summary");
  lines.push({ text: `Workouts: ${report.workouts.length}`, size: 10 });
  lines.push({ text: `Training volume: ${Math.round(report.volume).toLocaleString()} lb`, size: 10 });
  lines.push({ text: `Body weight logs: ${report.weights.length}`, size: 10 });
  lines.push({ text: `Weight change in range: ${report.weightDelta === null ? "Needs 2 weigh-ins" : `${report.weightDelta} lb`}`, size: 10 });
  lines.push({ text: `Measurement check-ins: ${report.measurements.length}`, size: 10 });

  addReportSection(lines, "Body Weight");
  if (report.weights.length) {
    report.weights.forEach((entry) => {
      lines.push({ text: `${formatShortDate(entry.date)} - ${entry.bodyweight} lb${entry.note ? ` - ${entry.note}` : ""}`, size: 10 });
    });
  } else {
    lines.push({ text: "No body weight logs in this range.", size: 10 });
  }

  addReportSection(lines, "Measurements");
  if (report.latestMeasurement) {
    lines.push({ text: `Latest: ${formatShortDate(report.latestMeasurement.date)}${report.latestMeasurement.note ? ` - ${report.latestMeasurement.note}` : ""}`, size: 10 });
    measurementRows(report.latestMeasurement).forEach(([label, value, unit]) => {
      lines.push({ text: `${label}: ${value}${unit}`, size: 10 });
    });
  } else {
    lines.push({ text: "No measurements logged yet.", size: 10 });
  }

  addReportSection(lines, "Workout Logs");
  if (report.workouts.length) {
    report.workouts.forEach((log) => {
      lines.push({ text: `${formatShortDate(log.date)} - ${log.title}`, size: 11, bold: true });
      lines.push({ text: `${(log.sets || []).length} sets - ${Math.round(Number(log.volume) || totalVolume(log)).toLocaleString()} lb volume`, size: 10 });
      const grouped = (log.sets || []).reduce((groups, set) => {
        if (!groups[set.exercise]) groups[set.exercise] = [];
        groups[set.exercise].push(`${set.weight || "--"} x ${set.reps || "--"}`);
        return groups;
      }, {});
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
  words.forEach((word) => {
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
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
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
  return new Blob([pdf], { type: "application/pdf" });
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
  const days = Number(state.logbookRange || 7);
  const note = document.getElementById("coachNote")?.value || "";
  const lines = buildCoachReportLines(days, note);
  const blob = createPdfBlob(lines);
  const filename = `${APP_NAME.toLowerCase()}-coach-log-${new Date().toISOString().slice(0, 10)}.pdf`;

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
  const daysOut = validTarget ? Math.ceil((targetDate - today) / 86400000) : null;
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
                target: "0.5-1.25 lb down per week",
                progress: 70
              }
            : weeksOut <= 16
              ? {
                  label: "Contest prep",
                  badge: `${weeksOut} weeks out`,
                  phase: "prep",
                  focus: "Create the weekly deficit while protecting heavy compounds and key body-part volume.",
                  target: "0.5-1.5 lb down per week",
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
                    target: "0.25-0.75 lb up per week",
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
  const label = Math.abs(delta) < 0.2 ? "Flat" : delta > 0 ? "Trending up" : "Trending down";
  return {
    label,
    delta,
    detail: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} lb over recent logs`
  };
}

function daysSince(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

const trackedTopLifts = new Set([
  "Barbell Bench Press",
  "Incline Barbell Press",
  "Incline Dumbbell Press",
  "Flat Dumbbell Press",
  "Lat Pulldown",
  "Neutral-Grip Pulldown",
  "Wide-Grip Pulldown",
  "Barbell Row",
  "T-Bar Row",
  "Rack Pull",
  "Dumbbell Shoulder Press",
  "Barbell Overhead Press",
  "Machine Shoulder Press",
  "Close-Grip Bench Press",
  "Barbell Back Squat",
  "Front Squat",
  "Hack Squat",
  "Leg Press",
  "Dumbbell Romanian Deadlift",
  "Hip Thrust"
]);

function exerciseByName(name) {
  const normalized = String(name || "").toLowerCase();
  return exerciseLibrary.find((exercise) => exercise.name.toLowerCase() === normalized);
}

function loggedSetsWithinDays(days) {
  const cutoff = Date.now() - days * 86400000;
  return state.workoutLogs.flatMap((log) => {
    const timestamp = new Date(log.date).getTime();
    if (!Number.isFinite(timestamp) || timestamp < cutoff) return [];
    return (log.sets || []).map((set) => ({ ...set, date: log.date, timestamp }));
  });
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function weakPointVolumeStatus() {
  const recentWorkouts = state.workoutLogs.filter((log) => {
    const timestamp = new Date(log.date).getTime();
    return Number.isFinite(timestamp) && Date.now() - timestamp < 7 * 86400000;
  });
  const weeklySets = loggedSetsWithinDays(7);
  const muscleCounts = weeklySets.reduce((counts, set) => {
    const exercise = exerciseByName(set.exercise);
    if (!exercise || exercise.muscle === "abs") return counts;
    counts[exercise.muscle] = (counts[exercise.muscle] || 0) + 1;
    return counts;
  }, {});
  const trainedMuscles = Object.entries(muscleCounts).filter(([, count]) => count > 0);

  if (recentWorkouts.length < 3) {
    return {
      done: false,
      label: "Weak-point volume reviewed",
      detail: `Needs 3 workouts in the last 7 days. ${recentWorkouts.length}/3 logged.`
    };
  }

  if (trainedMuscles.length < 3) {
    return {
      done: false,
      label: "Weak-point volume reviewed",
      detail: `Needs logged sets for 3+ body parts this week. ${trainedMuscles.length}/3 found.`
    };
  }

  const [lowestMuscle, setCount] = trainedMuscles.sort((a, b) => a[1] - b[1])[0];
  return {
    done: true,
    label: "Weak-point volume reviewed",
    detail: `Lowest weekly volume: ${titleCase(lowestMuscle)} at ${setCount} logged sets.`
  };
}

function estimatedOneRepMax(weight, reps) {
  const load = Number(weight);
  const repCount = Number(reps);
  if (!load || !repCount || load <= 0 || repCount <= 0) return 0;
  return load * (1 + repCount / 30);
}

function topLiftProgressStatus() {
  const liftSets = state.workoutLogs
    .flatMap((log) => {
      const timestamp = new Date(log.date).getTime();
      if (!Number.isFinite(timestamp)) return [];
      return (log.sets || []).map((set) => {
        const estimate = estimatedOneRepMax(set.weight, set.reps);
        return { ...set, timestamp, estimate };
      });
    })
    .filter((set) => trackedTopLifts.has(set.exercise) && set.estimate > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!liftSets.length) {
    return {
      done: false,
      label: "Top lifts progressing",
      detail: "Log weight and reps on a tracked compound lift to start the comparison."
    };
  }

  const byExercise = liftSets.reduce((groups, set) => {
    if (!groups.has(set.exercise)) groups.set(set.exercise, []);
    groups.get(set.exercise).push(set);
    return groups;
  }, new Map());

  let comparableLifts = 0;
  let bestProgress = null;

  byExercise.forEach((sets, exercise) => {
    const latestTimestamp = sets[sets.length - 1].timestamp;
    const latestBest = Math.max(...sets.filter((set) => set.timestamp === latestTimestamp).map((set) => set.estimate));
    const priorSets = sets.filter((set) => set.timestamp < latestTimestamp);
    if (!priorSets.length) return;
    comparableLifts += 1;
    const priorBest = Math.max(...priorSets.map((set) => set.estimate));
    const gain = latestBest - priorBest;
    const threshold = Math.max(1, priorBest * 0.01);
    if (gain >= threshold && (!bestProgress || gain > bestProgress.gain)) {
      bestProgress = { exercise, gain };
    }
  });

  if (bestProgress) {
    return {
      done: true,
      label: "Top lifts progressing",
      detail: `Latest best set is +${bestProgress.gain.toFixed(1)} lb estimated 1RM on ${bestProgress.exercise}.`
    };
  }

  if (!comparableLifts) {
    return {
      done: false,
      label: "Top lifts progressing",
      detail: "Needs the same tracked lift logged in 2 separate workouts."
    };
  }

  return {
    done: false,
    label: "Top lifts progressing",
    detail: "Progress means beating the prior best estimated 1RM by at least 1 lb or 1%."
  };
}

function stageChecklist(timeline) {
  const lastMeasurementDays = daysSince(state.measurements[0]?.date);
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

  if (timeline.phase === "prep") {
    return [
      ...base,
      { done: false, label: "Posing practice scheduled" },
      { done: false, label: "Cardio target reviewed" },
      { done: false, label: "Waist trend checked against scale trend" }
    ];
  }

  if (timeline.phase === "bulking") {
    return [
      ...base,
      { done: false, label: "Weak body part priority selected" },
      { done: false, label: "Progressive overload target set" },
      { done: false, label: "Waist gain checked before adding food" }
    ];
  }

  return [
    ...base,
    weakPointVolumeStatus(),
    topLiftProgressStatus()
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
  const checklist = stageChecklist(timeline);
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
          <p class="muted">${timeline.weeksOut === null ? "Add a date below." : `${timeline.daysOut} days until goal date.`}</p>
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
          <button class="phase-btn" onclick="startWorkout('road-gym-full')">Road Gym</button>
        </div>
        <div class="actions">
          <button class="primary-btn" onclick="startWorkout('${plan.id}')">Start ${escapeHtml(plan.title)}</button>
          <button class="secondary-btn" onclick="setView('plans')">Browse Plans</button>
        </div>
      </div>
    </section>

    <div class="grid today-stats">
      <article class="card stat">
        <p class="value">${s.workouts}</p>
        <p class="label">Workouts this week</p>
      </article>
      <article class="card stat">
        <p class="value">${Math.round(s.weeklyVolume).toLocaleString()}</p>
        <p class="label">Weekly volume lbs</p>
      </article>
      <article class="card stat">
        <p class="value">${s.lastWeight?.bodyweight || profile.bodyweight || "--"}</p>
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
          ${plan.exercises.map(([id, sets, reps]) => `
            <div class="exercise-row">
              <strong>${escapeHtml(exerciseById(id).name)}</strong>
              <span class="badge">${sets} x ${reps}</span>
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
  const plans = allPlans().filter((plan) => {
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
        ${plan.exercises.slice(0, 5).map(([id, sets, reps]) => `
          <div class="exercise-row">
            <span class="truncate">${escapeHtml(exerciseById(id).name)}</span>
            <span class="badge">${sets} x ${reps}</span>
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
            <input id="customSets" type="number" value="3" min="1" max="10" />
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
            <label for="customRest">Rest Seconds</label>
            <input id="customRest" type="number" value="${DEFAULT_REST_SECONDS}" min="15" max="300" step="15" />
          </div>
        </div>
        <div style="margin-top: 12px;">
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

let builderDraft = [];

function addBuilderExercise() {
  const id = document.getElementById("customExercise").value;
  const sets = Number(document.getElementById("customSets").value) || 3;
  const reps = document.getElementById("customReps").value || "8-12";
  const rest = Number(document.getElementById("customRest").value) || DEFAULT_REST_SECONDS;
  builderDraft.push([id, sets, reps, rest]);
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
  return builderDraft.map(([id, sets, reps], index) => `
    <div class="exercise-row">
      <div>
        <strong>${escapeHtml(exerciseById(id).name)}</strong>
        <p class="muted" style="margin: 4px 0 0;">${sets} sets x ${reps}</p>
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
  const title = `${phaseLabel(muscle)} Custom Session`;

  const plan = {
    id: `builder-${Date.now()}`,
    title,
    muscle,
    phase: muscle === "travel" ? "travel" : state.phase,
    rest: Number(document.getElementById("customRest").value) || DEFAULT_REST_SECONDS,
    note: "Custom bodybuilding session launched from Builder.",
    exercises: builderDraft
  };

  builderDraft = [];
  beginWorkoutFromPlan(plan);
  toast("Workout started.");
}

function beginWorkoutFromPlan(plan) {
  state.activeWorkout = {
    id: crypto.randomUUID(),
    planId: plan.id,
    title: plan.title,
    phase: plan.phase,
    startedAt: new Date().toISOString(),
    exercises: plan.exercises.map(([id, sets, reps, rest]) => ({
      id,
      name: exerciseById(id).name,
      targetSets: Number(sets),
      targetReps: String(reps),
      rest: plan.id.startsWith("custom-") || plan.id.startsWith("quick-") || plan.id.startsWith("builder-")
        ? Number(rest || plan.rest || DEFAULT_REST_SECONDS)
        : DEFAULT_REST_SECONDS,
      sets: Array.from({ length: Number(sets) }, (_, index) => ({
        set: index + 1,
        weight: "",
        reps: "",
        done: false
      }))
    }))
  };
  state.view = "session";
  state.timer = { seconds: DEFAULT_REST_SECONDS, left: 0, running: false, startedAt: null, endsAt: null };
  saveState();
  render();
}

function startWorkout(planId) {
  const plan = allPlans().find((item) => item.id === planId);
  if (!plan) return;
  beginWorkoutFromPlan(plan);
}

function quickStartExercise(id) {
  const ex = exerciseById(id);
  state.customPlans.unshift({
    id: `quick-${Date.now()}`,
    title: `${ex.name} Quick Log`,
    muscle: ex.muscle,
    phase: state.phase,
    rest: DEFAULT_REST_SECONDS,
    note: "Single-exercise quick session.",
    exercises: [[id, 4, "8-12", DEFAULT_REST_SECONDS]]
  });
  startWorkout(state.customPlans[0].id);
}

function updateSet(exIndex, setIndex, field, value) {
  state.activeWorkout.exercises[exIndex].sets[setIndex][field] = value;
  saveState();
}

function completeSet(exIndex, setIndex) {
  const ex = state.activeWorkout.exercises[exIndex];
  const set = ex.sets[setIndex];
  if (!set.weight || !set.reps) {
    toast("Enter weight and reps before completing the set.");
    return;
  }
  set.done = !set.done;
  saveState();
  if (set.done) startTimer(ex.rest);
  render();
}

function adjustRest(seconds) {
  const timer = state.timer;
  const next = Math.max(15, Math.min(300, (timer.running ? timer.left : timer.seconds) + seconds));
  if (timer.running) {
    startTimer(next);
  } else {
    state.timer.seconds = next;
    saveState();
    render();
  }
}

function startTimer(seconds = state.timer.seconds) {
  getAudioContext();
  const now = Date.now();
  state.timer = {
    seconds,
    left: seconds,
    running: true,
    startedAt: now,
    endsAt: now + seconds * 1000
  };
  saveState();
  ensureTimerTick();
}

function stopTimer() {
  state.timer.running = false;
  state.timer.left = 0;
  state.timer.startedAt = null;
  state.timer.endsAt = null;
  saveState();
  render();
}

function ensureTimerTick() {
  if (timerTick) clearInterval(timerTick);
  timerTick = setInterval(() => {
    if (!state.timer.running) return;
    const left = Math.max(0, Math.ceil((state.timer.endsAt - Date.now()) / 1000));
    state.timer.left = left;
    if (left <= 0) {
      state.timer.running = false;
      playBoxingBell();
      toast("Rest complete. Next set.");
    }
    saveState();
    updateTimerDom();
  }, 250);
}

function updateTimerDom() {
  const face = document.querySelector(".timer-face");
  const time = document.querySelector("[data-timer-time]");
  if (!face || !time) return;
  const total = Math.max(1, state.timer.seconds);
  const left = state.timer.running ? state.timer.left : state.timer.seconds;
  const elapsed = total - left;
  face.style.setProperty("--progress", `${Math.min(360, (elapsed / total) * 360)}deg`);
  time.textContent = formatTime(left);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function finishWorkout() {
  const workout = state.activeWorkout;
  if (!workout) return;
  const sets = workout.exercises.flatMap((exercise) =>
    exercise.sets
      .filter((set) => set.done)
      .map((set) => ({ exercise: exercise.name, weight: set.weight, reps: set.reps }))
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
  const left = state.timer.running ? state.timer.left : state.timer.seconds;
  const totalTimer = Math.max(1, state.timer.seconds);
  const progress = state.timer.running ? ((totalTimer - left) / totalTimer) * 360 : 0;

  setTimeout(ensureTimerTick, 0);

  return `
    <div class="topbar">
      <div>
        <p class="eyebrow">Live workout</p>
        <h1>${escapeHtml(workout.title)}</h1>
        <p class="muted">${completed} of ${total} sets completed</p>
      </div>
      <div class="actions">
        <button class="secondary-btn" onclick="finishWorkout()">Save Session</button>
        <button class="ghost-btn danger" onclick="cancelWorkout()">Cancel</button>
      </div>
    </div>
    <div class="session-shell">
      <section class="session">
        ${workout.exercises.map((exercise, exIndex) => `
          <article class="card pad">
            <div class="card-head">
              <div>
                <span class="badge blue">${exercise.targetSets} sets x ${escapeHtml(exercise.targetReps)}</span>
                <h2 style="margin-top: 10px;">${escapeHtml(exercise.name)}</h2>
              </div>
              <span class="badge">${exercise.rest}s rest</span>
            </div>
            <div class="set-table">
              ${exercise.sets.map((set, setIndex) => `
                <div class="set-row">
                  <div class="set-number">${set.set}</div>
                  <input type="number" inputmode="decimal" placeholder="Weight" value="${escapeHtml(set.weight)}" oninput="updateSet(${exIndex}, ${setIndex}, 'weight', this.value)" />
                  <input type="number" inputmode="numeric" placeholder="Reps" value="${escapeHtml(set.reps)}" oninput="updateSet(${exIndex}, ${setIndex}, 'reps', this.value)" />
                  <button class="${set.done ? "secondary-btn" : "primary-btn"}" onclick="completeSet(${exIndex}, ${setIndex})">${set.done ? "Done" : "Complete"}</button>
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
            <p class="muted" style="margin: 6px 0 0;">${state.timer.running ? "Resting" : "Ready"}</p>
          </div>
        </div>
        <div class="timer-controls">
          <div class="actions">
            <button class="secondary-btn" onclick="adjustRest(-15)">-15s</button>
            <button class="secondary-btn" onclick="adjustRest(15)">+15s</button>
          </div>
          <div class="actions">
            ${[60, 90, 120, 180, 240].map((seconds) => `<button class="chip ${seconds === DEFAULT_REST_SECONDS ? "active" : ""}" onclick="startTimer(${seconds})">${seconds}s</button>`).join("")}
          </div>
          <p class="muted" style="margin: 0; text-align: center; font-size: 12px;">Bell plays through the current device audio output.</p>
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
            <input id="logWeight" type="number" step="0.1" value="${latestWeight?.bodyweight || ""}" />
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
  const days = Number(state.logbookRange || 7);
  const report = coachReportData(days);
  const latestMeasurementRows = measurementRows(report.latestMeasurement);
  return `
    <div class="topbar">
      <div>
        <p class="eyebrow">Coach export</p>
        <h1>Send the week without rewriting it.</h1>
        <p class="muted">Create a PDF with body weight, latest measurements, workout volume, and set-by-set training logs for your coach.</p>
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
          <input id="coachNote" placeholder="Energy, appetite, joints, posing, cardio..." />
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
        <p class="label">Volume lbs</p>
      </article>
      <article class="card stat">
        <p class="value">${report.weights.length}</p>
        <p class="label">Weight logs</p>
      </article>
      <article class="card stat">
        <p class="value">${report.measurements.length}</p>
        <p class="label">Check-ins</p>
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
            <p class="muted">${formatShortDate(entry.date)} - ${entry.bodyweight} lb${entry.note ? ` - ${escapeHtml(entry.note)}` : ""}</p>
          `).join("") || '<p class="muted">No body weight logs in this range.</p>'}
        </article>
        <article class="log-card card">
          <strong>Latest measurements</strong>
          ${latestMeasurementRows.map(([label, value, unit]) => `
            <p class="muted">${label}: ${value}${unit}</p>
          `).join("") || '<p class="muted">No measurements logged yet.</p>'}
        </article>
      </div>
    </section>
    <section class="card pad" style="margin-top: 16px;">
      <h2>Workout Detail</h2>
      <div class="grid two">
        ${report.workouts.slice(0, 8).map((log) => `
          <article class="log-card card">
            <div class="card-head">
              <strong>${escapeHtml(log.title)}</strong>
              <span class="badge">${formatShortDate(log.date)}</span>
            </div>
            <p class="muted">${(log.sets || []).length} sets, ${Math.round(Number(log.volume) || totalVolume(log)).toLocaleString()} lbs volume</p>
            <p class="muted">${(log.sets || []).slice(0, 4).map((set) => `${escapeHtml(set.exercise)} ${escapeHtml(set.weight || "--")} x ${escapeHtml(set.reps || "--")}`).join(" / ")}</p>
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
      <polyline points="${points}" fill="none" stroke="#1ED8A5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="0" y1="${height - 8}" x2="${width}" y2="${height - 8}" stroke="rgba(255,255,255,0.12)" />
    </svg>
  `;
}

function renderContent() {
  if (state.view === "plans") return renderPlans();
  if (state.view === "library") return renderLibrary();
  if (state.view === "builder") return renderBuilder();
  if (state.view === "progress") return renderProgress();
  if (state.view === "logbook") return renderLogbook();
  if (state.view === "session") return renderSession();
  return renderToday();
}

function resetDemoData() {
  localStorage.removeItem(STORE_KEY);
  state = { ...defaultState };
  builderDraft = [];
  render();
}

function render() {
  const root = document.getElementById("app");
  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">PS</div>
          <div>
            <p class="brand-title">${APP_NAME}</p>
            <p class="brand-subtitle">Bodybuilding logbook</p>
          </div>
        </div>
        <nav class="nav">${navHtml()}</nav>
        <div class="sidebar-card">
          <span class="badge blue">${phaseLabel(state.phase)}</span>
          <p style="margin: 12px 0 6px; font-weight: 850;">Road Gym ready</p>
          <p class="muted">Hotel bench, dumbbells to 50, cable handles, rope, and ankle cuffs.</p>
        </div>
      </aside>
      <main class="main">${renderContent()}</main>
      <nav class="mobile-bar">${navHtml()}</nav>
    </div>
    ${renderOnboarding()}
  `;
  updateTimerDom();
}

render();
