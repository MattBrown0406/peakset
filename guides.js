"use strict";

// Exercise form guides: setup, steps, common mistakes, and muscles worked for
// every library exercise, shown in a "How to" panel on Library cards, live
// workout cards, and exercise history. An exercise without a guide (for
// example one added later) falls back to its one-line cue. The demo link is a
// YouTube search; the iOS web view opens external links in Safari.
// Loaded after health.js.

const EXERCISE_GUIDES = {
  // Chest
  "incline-db-press": {
    setup: "Set the bench to 30-45 degrees. Kick the dumbbells up off your knees and pull your shoulder blades back and down.",
    steps: ["Start with the dumbbells over your upper chest, palms forward or slightly turned in.", "Lower slowly until you feel a deep upper-chest stretch, elbows slightly tucked.", "Press up and slightly in until the dumbbells nearly touch over your collarbones.", "Keep your feet planted and chest high the whole set."],
    mistakes: ["Setting the bench so steep it becomes a shoulder press.", "Flaring the elbows straight out to the sides.", "Cutting the bottom short to move more weight."],
    muscles: "Upper chest, front delts, triceps"
  },
  "flat-db-press": {
    setup: "Lie on a flat bench with your feet planted. Pull your shoulder blades back and down and keep your upper back slightly arched.",
    steps: ["Start with the dumbbells over your mid chest, arms straight but not locked hard.", "Lower slowly until the dumbbells are level with your chest and you feel a stretch.", "Press up and slightly inward, finishing with the dumbbells close but not touching.", "Keep the shoulder blades pinned so the chest does the work."],
    mistakes: ["Letting the shoulders roll forward at the top.", "Bouncing out of the bottom.", "Flaring the elbows out to 90 degrees."],
    muscles: "Chest, front delts, triceps"
  },
  "barbell-bench": {
    setup: "Lie with your eyes under the bar and grip a little wider than shoulder width. Squeeze your shoulder blades together and plant your feet.",
    steps: ["Unrack and hold the bar over your shoulders with straight arms.", "Lower the bar under control to your lower chest, elbows tucked about 45-70 degrees.", "Touch lightly, then press up and slightly back toward the rack.", "Keep your glutes on the bench and your upper back tight."],
    mistakes: ["Bouncing the bar off your chest.", "Lifting your hips off the bench.", "Going near failure without a spotter or safety arms."],
    muscles: "Chest, front delts, triceps"
  },
  "low-cable-fly": {
    setup: "Set both pulleys at the lowest position. Grab the handles and step forward into a staggered stance.",
    steps: ["Start with your arms low and out to the sides, palms forward and elbows softly bent.", "Sweep the handles up and together, finishing around upper-chest to chin height.", "Squeeze the upper chest for a beat at the top.", "Lower slowly back to the stretch without changing the elbow bend."],
    mistakes: ["Bending the elbows more until it turns into a curl or front raise.", "Shrugging your shoulders up at the top.", "Going so heavy you lose the arc."],
    muscles: "Upper chest, front delts"
  },
  "weighted-dip": {
    setup: "Add weight with a dip belt or a dumbbell held between your feet. Start supported at the top of the bars with straight arms.",
    steps: ["Lean your torso forward and let your legs drift slightly behind you.", "Bend the elbows and lower until you feel a deep chest stretch, upper arms about parallel to the floor.", "Press back up through your palms, keeping the forward lean.", "Stop the depth wherever your shoulders stay pain-free."],
    mistakes: ["Sinking too deep and straining the front of the shoulder.", "Staying fully upright, which shifts the work to the triceps.", "Dropping fast into the bottom."],
    muscles: "Lower chest, front delts, triceps"
  },
  "incline-barbell-press": {
    setup: "Set the bench to about 30-45 degrees. Grip slightly wider than shoulder width and pull your shoulder blades back.",
    steps: ["Unrack and hold the bar over your upper chest.", "Lower it to your upper chest, just below the collarbones, elbows slightly tucked.", "Press up and slightly back so the bar finishes over your shoulders.", "Keep your feet planted and upper back tight."],
    mistakes: ["Setting the bench so steep it becomes a shoulder press.", "Bouncing the bar off your chest.", "Letting the bar drift down toward your belly."],
    muscles: "Upper chest, front delts, triceps"
  },
  "decline-barbell-press": {
    setup: "Hook your legs under the pads of a decline bench and lie back. Grip slightly wider than shoulder width.",
    steps: ["Unrack and hold the bar over your lower chest.", "Lower the bar under control to your lower chest.", "Press up in a straight line.", "Keep your shoulder blades squeezed together the whole set."],
    mistakes: ["Letting the bar drift toward your neck.", "Bouncing the bar off your chest.", "Going near failure without a spotter."],
    muscles: "Lower chest, front delts, triceps"
  },
  "smith-incline-press": {
    setup: "Set an incline bench at about 30 degrees under the Smith bar so the bar lands on your upper chest. Grip slightly wider than shoulder width.",
    steps: ["Unhook the bar and hold it at arm's length.", "Lower it under control to your upper chest.", "Press straight up along the fixed path.", "Use the hooks to end the set safely close to failure."],
    mistakes: ["Placing the bench so the bar lands on your neck or belly.", "Bouncing the bar off your chest.", "Flaring the elbows wide."],
    muscles: "Upper chest, front delts, triceps"
  },
  "machine-chest-press": {
    setup: "Set the seat so the handles line up with your mid chest. Sit back with your shoulder blades pulled back against the pad.",
    steps: ["Grip the handles and brace.", "Press forward until your arms are nearly straight.", "Return slowly until you feel a chest stretch.", "Keep your back on the pad throughout."],
    mistakes: ["Setting the seat too high so the shoulders take over.", "Letting the shoulders roll forward at lockout.", "Short, fast reps."],
    muscles: "Chest, front delts, triceps"
  },
  "machine-decline-chest-press": {
    setup: "Adjust the seat so the handles start around your lower chest. Sit back and pull your shoulder blades back and down.",
    steps: ["Grip the handles and press down and forward.", "Extend until your arms are nearly straight.", "Return slowly to a full stretch.", "Keep your shoulder blades pinned the whole set."],
    mistakes: ["Shrugging your shoulders up.", "Losing contact with the back pad.", "Cutting the stretch short."],
    muscles: "Lower chest, front delts, triceps"
  },
  "machine-incline-chest-press": {
    setup: "Set the seat so the handles start around upper-chest height. Sit back with your chest up and shoulders down.",
    steps: ["Grip the handles and press up and forward.", "Extend until your arms are nearly straight without locking hard.", "Lower slowly until you feel an upper-chest stretch.", "Keep your shoulders down away from your ears."],
    mistakes: ["Setting the seat so low it becomes a shoulder press.", "Shrugging at the top.", "Bouncing the stack between reps."],
    muscles: "Upper chest, front delts, triceps"
  },
  "pec-deck": {
    setup: "Set the seat so the handles are at mid-chest height. Sit back with your chest up and grip the handles or rest your forearms on the pads.",
    steps: ["Start with your arms open and a slight bend in the elbows.", "Bring the handles together in a wide arc, driving the elbows in.", "Pause and squeeze your chest for a second.", "Open slowly to a comfortable stretch."],
    mistakes: ["Opening so far back that your shoulders hurt.", "Rolling the shoulders forward to close the handles.", "Letting the weight snap back."],
    muscles: "Chest, front delts"
  },
  "high-cable-fly": {
    setup: "Set both pulleys high. Grab the handles and step forward into a staggered stance with a slight forward lean.",
    steps: ["Start with your arms out wide and slightly up, elbows softly bent.", "Sweep the handles down and together toward your lower chest or belly button.", "Squeeze your chest where your hands meet.", "Return slowly to the stretch."],
    mistakes: ["Bending the elbows until it becomes a press.", "Letting the shoulders roll forward.", "Rushing the lowering phase."],
    muscles: "Lower and mid chest, front delts"
  },
  "mid-cable-fly": {
    setup: "Set both pulleys at about shoulder height. Step forward into a staggered stance with the handles out to your sides.",
    steps: ["Keep a slight, fixed bend in the elbows.", "Bring the handles together in front of your chest in a wide arc.", "Squeeze your chest for a beat.", "Open slowly until you feel a stretch, keeping tension on the cables."],
    mistakes: ["Turning it into a press by bending the elbows.", "Shrugging your shoulders.", "Opening so far that your shoulders take the stretch instead of your chest."],
    muscles: "Chest, front delts"
  },
  "db-fly": {
    setup: "Lie on a flat bench with the dumbbells over your chest. Turn your palms to face each other and keep the elbows softly bent.",
    steps: ["Lower the dumbbells out to the sides in a wide arc.", "Keep the same elbow bend the whole time.", "Stop at a deep chest stretch, around chest level.", "Bring the dumbbells back up along the same arc and squeeze."],
    mistakes: ["Lowering so deep that your shoulders strain.", "Bending the elbows more, which turns it into a press.", "Going too heavy to control the stretch."],
    muscles: "Chest, front delts"
  },
  "machine-fly-press": {
    setup: "Set the seat so the handles line up with your mid chest. Sit back with your shoulder blades pulled back.",
    steps: ["Start with the handles at chest level and a good stretch.", "Press forward and inward along the machine's converging path.", "Think about bringing your biceps toward each other at the end.", "Squeeze, then return slowly to the stretch."],
    mistakes: ["Rolling your shoulders forward at the end.", "Setting the seat so the handles start too high.", "Short reps with no stretch."],
    muscles: "Chest, front delts, triceps"
  },
  "push-up": {
    setup: "Place push-up handles or hex dumbbells shoulder-width apart so they can't roll. Get into a plank on the handles with your body in a straight line.",
    steps: ["Brace your abs and glutes so your hips don't sag.", "Lower your chest below your hands for a deep stretch.", "Keep your elbows about 45 degrees from your body.", "Push back up to straight arms. Slow the lowering to make it harder."],
    mistakes: ["Letting the hips sag or pike up.", "Cutting the deficit short.", "Flaring the elbows straight out."],
    muscles: "Chest, front delts, triceps, core"
  },
  "squeeze-press": {
    setup: "Lie on a flat bench holding two dumbbells pressed together over your chest, palms facing each other.",
    steps: ["Push the dumbbells hard into each other.", "Keep squeezing as you lower them to your chest.", "Press back up without letting them separate.", "Hold the squeeze for the whole set."],
    mistakes: ["Letting the dumbbells drift apart.", "Using too much weight to keep the squeeze.", "Bouncing off your chest."],
    muscles: "Chest, front delts, triceps"
  },
  "single-arm-cable-press": {
    setup: "Set a pulley at about chest height. Face away from it in a staggered stance, holding the handle in one hand at chest level.",
    steps: ["Brace your core so your torso doesn't twist.", "Press the handle forward and slightly across your body.", "Finish with your hand near the middle of your chest and squeeze.", "Return slowly until you feel the stretch."],
    mistakes: ["Rotating your torso to push.", "Shrugging the working shoulder up.", "Short reps."],
    muscles: "Chest, front delts, triceps, core"
  },
  "landmine-press-chest": {
    setup: "Load a landmine bar. Stand or kneel facing it and hold the end of the bar at chest height with both hands.",
    steps: ["Brace your core and lean slightly into the bar.", "Press the bar up and forward until your arms are straight.", "Reach a little at the top so your shoulder blades move forward.", "Lower slowly back to your chest."],
    mistakes: ["Arching your lower back.", "Pressing straight up like a shoulder press.", "Letting the bar drop fast."],
    muscles: "Upper chest, front delts, serratus, triceps"
  },
  "chest-press-drop": {
    setup: "Set up the chest press machine with the handles at mid chest. Pick a weight you can press for about 8-12 reps.",
    steps: ["Do a full set close to failure with clean form.", "Immediately drop the pin about 20-30 percent.", "Rep out again with no rest, then drop once or twice more.", "Keep the same controlled tempo on every drop."],
    mistakes: ["Resting too long between drops.", "Letting form fall apart to grind out reps.", "Using drop sets on every exercise, which hurts recovery."],
    muscles: "Chest, front delts, triceps"
  },
  "cable-pressaround": {
    setup: "Set a pulley at chest height. Stand facing away from it with the handle in the near hand, elbow bent and slightly back.",
    steps: ["Brace and keep your hips and torso square.", "Press the handle forward and across your body in a curved path.", "Finish with your hand past the middle of your chest and squeeze hard.", "Return slowly to the stretch."],
    mistakes: ["Twisting your torso to get the hand across.", "Punching straight forward with no sweep across the body.", "Using too much weight to cross the midline."],
    muscles: "Chest, front delts"
  },

  // Back
  "lat-pulldown": {
    setup: "Set the thigh pad so your legs are locked in. Grip the bar a little wider than shoulder width.",
    steps: ["Start with your arms straight overhead and lats stretched.", "Lean back slightly and pull your elbows down toward your hips.", "Bring the bar to your upper chest and squeeze your lats.", "Let the bar rise slowly until your arms are straight again."],
    mistakes: ["Leaning far back and turning it into a row.", "Pulling with your hands and biceps instead of driving the elbows.", "Letting the weight yank your arms up at the top."],
    muscles: "Lats, upper back, biceps"
  },
  "one-arm-db-row": {
    setup: "Put one knee and the same-side hand on a bench with your back flat. Hold the dumbbell in the other hand with your arm hanging straight.",
    steps: ["Let the dumbbell hang so your lat stretches.", "Row your elbow back toward your hip, as if pulling it into your back pocket.", "Pause briefly at the top with your shoulder down.", "Lower slowly to a full stretch."],
    mistakes: ["Twisting your torso open to heave the weight.", "Rowing straight up to your chest, which takes work off the lat.", "Shrugging your shoulder toward your ear."],
    muscles: "Lats, mid back, rear delts, biceps"
  },
  "cable-row": {
    setup: "Sit with your feet on the platform and knees slightly bent. Grab the handle and sit tall with your chest up.",
    steps: ["Start with your arms straight, letting your shoulders reach forward slightly for a stretch.", "Pull the handle to your lower ribs, leading with your elbows.", "Squeeze your shoulder blades together and hold for a second.", "Return slowly until your arms are straight."],
    mistakes: ["Rocking your torso back and forth to move the weight.", "Rounding your lower back at the stretch.", "Shrugging at the end of the pull."],
    muscles: "Mid back, lats, rear delts, biceps"
  },
  "barbell-row": {
    setup: "Hold the bar overhand just outside your legs. Hinge at the hips until your torso is about 45 degrees or lower, with soft knees and a flat back.",
    steps: ["Let the bar hang at arm's length, just below your knees.", "Row the bar to your lower ribs, driving your elbows back.", "Squeeze your back at the top without standing up.", "Lower under control and keep the same torso angle."],
    mistakes: ["Standing more upright each rep to cheat the weight up.", "Rounding your lower back.", "Jerking the bar up with your hips."],
    muscles: "Mid back, lats, rear delts, lower back, biceps"
  },
  "rope-pullover": {
    setup: "Attach a rope to a high pulley. Step back, hinge forward slightly, and hold the rope with your arms extended overhead.",
    steps: ["Start with your arms long and slightly bent, feeling a lat stretch.", "Pull the rope down in an arc toward your thighs, keeping your elbows fixed.", "Squeeze your lats as the rope reaches your hips.", "Let the rope rise slowly back to the stretch."],
    mistakes: ["Bending the elbows, which turns it into a triceps pushdown.", "Rounding your spine to pull with your abs.", "Rushing the stretch at the top."],
    muscles: "Lats, teres major"
  },
  "pull-up": {
    setup: "Hang from the bar with your hands slightly wider than your shoulders, palms facing away. Brace your core and keep your legs still.",
    steps: ["Start from a full hang with your shoulders pulled slightly down.", "Drive your elbows down toward your ribs and lift your chest toward the bar.", "Get your chin over the bar without craning your neck.", "Lower slowly to a full hang."],
    mistakes: ["Kipping or swinging your legs.", "Half reps that never reach a full hang.", "Craning your chin up to finish the rep."],
    muscles: "Lats, upper back, biceps"
  },
  "neutral-pulldown": {
    setup: "Attach a V-handle or neutral-grip bar. Lock your legs under the pad and grip with your palms facing each other.",
    steps: ["Start with your arms straight and lats stretched.", "Pull the handle to your upper chest, driving your elbows down and in.", "Squeeze your lats at the bottom.", "Return slowly to a full stretch."],
    mistakes: ["Leaning far back.", "Pulling with your arms instead of driving the elbows.", "Cutting the stretch short at the top."],
    muscles: "Lats, upper back, biceps"
  },
  "wide-pulldown": {
    setup: "Grip the long bar well outside shoulder width. Lock your legs under the pad and sit tall.",
    steps: ["Start with your arms straight and shoulders lifted for a stretch.", "Pull your shoulder blades down first, then drive your elbows down and out.", "Bring the bar to your upper chest.", "Let the bar rise slowly, shoulder blades rising last."],
    mistakes: ["Pulling the bar behind your neck.", "Swinging your torso.", "Gripping so wide that the range gets very short."],
    muscles: "Lats, upper back, rear delts, biceps"
  },
  "tbar-row": {
    setup: "Straddle the T-bar with your feet shoulder width apart. Hinge at the hips with knees bent and back flat, then grab the handles.",
    steps: ["Start with your arms straight and chest up.", "Row the handle toward your lower chest, driving your elbows back.", "Squeeze your mid back at the top.", "Lower under control without losing your back angle."],
    mistakes: ["Rounding your lower back.", "Jerking the weight up with your legs and hips.", "Standing taller as the set goes on."],
    muscles: "Mid back, lats, rear delts, biceps"
  },
  "chest-supported-row": {
    setup: "Set a bench to about 30-45 degrees. Lie chest-down on it with a dumbbell in each hand and your arms hanging.",
    steps: ["Keep your chest on the pad the whole set.", "Row the dumbbells back, elbows toward your hips for lats or out at 45 degrees for upper back.", "Squeeze your shoulder blades together at the top.", "Lower slowly to a full stretch."],
    mistakes: ["Lifting your chest off the pad to cheat.", "Shrugging the weights up.", "Short reps with no full stretch."],
    muscles: "Mid back, lats, rear delts, biceps"
  },
  "machine-row": {
    setup: "Adjust the seat so the handles are about chest height. Set the chest pad so you can reach the handles with straight arms.",
    steps: ["Sit tall with your chest against the pad.", "Pull the handles back by driving your elbows.", "Squeeze and hold the contraction for a second.", "Return slowly until your arms are straight and your back stretches."],
    mistakes: ["Pulling your chest off the pad.", "Shrugging your shoulders.", "Letting the stack bounce."],
    muscles: "Mid back, lats, rear delts, biceps"
  },
  "meadows-row": {
    setup: "Stand side-on to a loaded landmine in a staggered stance, with the bar end by your front foot. Hinge forward, rest your free forearm on your front knee, and grip the bar end overhand.",
    steps: ["Let your arm hang straight for a lat stretch.", "Row your elbow up and back toward your hip.", "Pause at the top with your shoulder down.", "Lower slowly to a full stretch."],
    mistakes: ["Twisting your torso open.", "Rounding your back.", "Yanking the bar with your biceps."],
    muscles: "Lats, upper back, rear delts, biceps"
  },
  "rack-pull": {
    setup: "Set the safeties so the bar sits around knee height. Stand close with your feet hip width apart and grip just outside your legs.",
    steps: ["Brace hard and pull the slack out of the bar.", "Drive your hips forward to stand up, keeping the bar against your legs.", "Finish tall with your shoulders back, without leaning back.", "Lower under control to the pins."],
    mistakes: ["Rounding your upper or lower back.", "Leaning far back at lockout.", "Bouncing the bar off the pins."],
    muscles: "Traps, upper back, lower back, glutes, hamstrings"
  },
  "db-pullover": {
    setup: "Lie on a flat bench holding one dumbbell with both hands over your chest. Keep your elbows slightly bent.",
    steps: ["Lower the dumbbell back behind your head in an arc.", "Keep the elbow bend fixed and stop at a deep lat stretch.", "Pull the dumbbell back over your chest by driving with your elbows.", "Keep your ribs down so your back doesn't arch."],
    mistakes: ["Bending the elbows a lot, which turns it into a triceps extension.", "Going so deep that your shoulders hurt.", "Arching your lower back."],
    muscles: "Lats, chest, serratus"
  },
  "straight-arm-pulldown": {
    setup: "Attach a bar or rope to a high pulley. Step back, hinge slightly forward, and hold it with straight arms at about eye level.",
    steps: ["Keep your arms long with a slight elbow bend.", "Pull the bar down in an arc toward your thighs using your lats.", "Squeeze at the bottom with your shoulders down.", "Let the bar rise slowly back to the stretch."],
    mistakes: ["Bending the elbows into a pushdown.", "Rounding your back to push down with your abs.", "Shrugging your shoulders."],
    muscles: "Lats, teres major"
  },
  "face-pull": {
    setup: "Set a rope at upper-chest to face height. Grab the ends and step back until your arms are straight.",
    steps: ["Pull the rope toward your face, splitting the ends apart.", "Drive your elbows out wide and high.", "Finish with your hands beside your ears, like a double-biceps pose.", "Return slowly."],
    mistakes: ["Leaning back to heave the weight.", "Pulling to your chest with low elbows.", "Going so heavy it turns into a row."],
    muscles: "Rear delts, upper back, rotator cuff"
  },
  "shrug": {
    setup: "Stand tall holding heavy dumbbells at your sides, palms facing in.",
    steps: ["Lift your shoulders straight up toward your ears.", "Think up and slightly back.", "Hold the top for a second.", "Lower slowly to a full stretch."],
    mistakes: ["Rolling your shoulders in circles.", "Bending your elbows to help.", "Bouncing quick, tiny reps."],
    muscles: "Upper traps"
  },
  "single-arm-lat-pulldown": {
    setup: "Attach a single handle to a high pulley. Sit or kneel so the cable runs slightly in front of you.",
    steps: ["Start with your arm long and your lat stretched.", "Pull your elbow down and back toward your back pocket.", "Squeeze your lat at the bottom.", "Return slowly to a full stretch."],
    mistakes: ["Rotating your torso to pull.", "Pulling your hand to your chest instead of driving the elbow.", "Shrugging at the top."],
    muscles: "Lats, teres major, biceps"
  },
  "seal-row": {
    setup: "Raise a flat bench high enough that your arms hang straight without the weight touching the floor. Lie face-down with the bar or dumbbells below you.",
    steps: ["Let the weight hang with your arms straight.", "Row it toward the bench, driving your elbows back.", "Squeeze your shoulder blades together at the top.", "Lower under control to a dead hang."],
    mistakes: ["Lifting your chest off the bench.", "Kicking your legs to cheat.", "Using a bench so low that the stretch gets cut short."],
    muscles: "Upper back, mid back, lats, rear delts"
  },
  "inverted-row": {
    setup: "Set a bar in a rack or Smith machine at about waist height. Hang under it with straight arms, heels on the floor, and your body in a straight line.",
    steps: ["Squeeze your glutes and abs so your body stays rigid.", "Pull your chest to the bar, driving your elbows back.", "Squeeze your shoulder blades together at the top.", "Lower slowly to straight arms. Lower the bar or raise your feet to make it harder."],
    mistakes: ["Letting your hips sag.", "Craning your chin toward the bar.", "Half reps."],
    muscles: "Mid back, lats, rear delts, biceps"
  },

  // Shoulders
  "db-shoulder-press": {
    setup: "Set a bench upright or nearly upright. Kick the dumbbells up to shoulder height, palms forward or slightly turned in.",
    steps: ["Start with the dumbbells just above your shoulders, elbows slightly in front of your body.", "Press up in a slight arc so the dumbbells finish over your head, close but not touching.", "Keep your ribs down and lower back against the pad.", "Lower under control to about ear or chin level."],
    mistakes: ["Arching your lower back to press.", "Cutting the range short at the bottom.", "Letting your elbows drift behind your body."],
    muscles: "Front delts, side delts, triceps"
  },
  "db-lateral-raise": {
    setup: "Stand tall with the dumbbells at your sides. Lean forward slightly and keep your elbows soft.",
    steps: ["Raise the dumbbells out to the sides, leading with your elbows.", "Think of pushing the weights out wide, not lifting them up.", "Stop around shoulder height, before your traps take over.", "Lower slowly over two to three seconds."],
    mistakes: ["Swinging your body to start the rep.", "Shrugging your shoulders toward your ears.", "Raising your hands higher than your elbows."],
    muscles: "Side delts"
  },
  "cable-lateral-raise": {
    setup: "Set a pulley at the lowest position. Stand side-on and hold the handle in your far hand so the cable crosses in front of your body.",
    steps: ["Start with your hand near the opposite hip, elbow softly bent.", "Raise your arm out to the side in a wide arc to about shoulder height.", "Pause briefly at the top.", "Lower slowly and keep tension at the bottom."],
    mistakes: ["Leaning or swinging your torso.", "Shrugging your trap up.", "Bending the elbow more to cheat the handle up."],
    muscles: "Side delts"
  },
  "rear-delt-fly": {
    setup: "With dumbbells, hinge forward until your torso is nearly parallel to the floor. With cables, set two pulleys at shoulder height and cross the cables.",
    steps: ["Keep a slight bend in your elbows and your neck relaxed.", "Sweep your arms out wide to the sides.", "Pause at shoulder level without pinching your shoulder blades hard together.", "Lower slowly to the start."],
    mistakes: ["Rowing the weight with bent elbows.", "Standing up as the set gets hard.", "Using too much weight and swinging."],
    muscles: "Rear delts, upper back"
  },
  "machine-press": {
    setup: "Set the seat so the handles start at about shoulder height. Sit with your back flat against the pad.",
    steps: ["Grip the handles and brace your core.", "Press up until your arms are nearly straight.", "Lower under control until the handles are back at shoulder height.", "Keep your head and back against the pad."],
    mistakes: ["Setting the seat so the range gets cut short.", "Arching off the backrest.", "Letting the stack slam between reps."],
    muscles: "Front delts, side delts, triceps"
  },
  "barbell-overhead-press": {
    setup: "Start with the bar on your upper chest, hands just outside shoulder width. Stand with feet hip width apart and squeeze your glutes and abs.",
    steps: ["Press the bar straight up, moving your head back slightly to clear it.", "Once the bar passes your forehead, bring your head through.", "Lock out with the bar over the middle of your feet.", "Lower under control to your upper chest."],
    mistakes: ["Leaning back until it turns into an incline press.", "Pressing the bar forward around your face.", "Losing the brace in your lower back."],
    muscles: "Front delts, side delts, triceps, upper chest"
  },
  "smith-shoulder-press": {
    setup: "Set an upright bench under the Smith bar so the bar comes down just in front of your face. Grip slightly wider than your shoulders.",
    steps: ["Unhook the bar and brace with your back on the pad.", "Lower it to about chin height.", "Press straight up to near lockout.", "Re-hook the bar when you finish."],
    mistakes: ["Placing the bench so the bar hits your face.", "Arching off the pad.", "Cutting the range short at the bottom."],
    muscles: "Front delts, side delts, triceps"
  },
  "arnold-press": {
    setup: "Sit on an upright bench holding the dumbbells in front of your shoulders, palms facing you.",
    steps: ["Start pressing up while rotating your palms to face forward.", "Finish overhead with palms forward and arms nearly straight.", "Reverse the rotation as you lower back to the start.", "Keep the turn smooth and the lowering slow."],
    mistakes: ["Rushing the rotation.", "Arching your lower back.", "Using a weight too heavy to control the turn."],
    muscles: "Front delts, side delts, triceps"
  },
  "machine-lateral-raise": {
    setup: "Set the seat so your shoulders line up with the machine's pivot. Rest your arms against the pads.",
    steps: ["Raise your arms out to the sides, leading with your elbows.", "Stop around shoulder height.", "Pause briefly at the top.", "Lower slowly without letting the stack touch."],
    mistakes: ["Sitting so your shoulders don't line up with the pivot.", "Shrugging up into your traps.", "Bouncing the weight at the bottom."],
    muscles: "Side delts"
  },
  "lean-away-lateral-raise": {
    setup: "Set a pulley at the lowest position. Hold the frame with your near hand and the handle with your far hand, then lean away until your support arm is straight.",
    steps: ["Start with the handle in front of your hips and your side delt stretched.", "Raise your arm out to the side to about shoulder height.", "Keep the lean steady instead of pulling yourself upright.", "Lower slowly back to the stretch."],
    mistakes: ["Changing your lean during the set.", "Shrugging your trap.", "Bending the elbow to cheat."],
    muscles: "Side delts"
  },
  "seated-lateral-raise": {
    setup: "Sit on the end of a bench with your feet planted and the dumbbells at your sides.",
    steps: ["Lean slightly forward and keep a soft bend in your elbows.", "Raise the dumbbells out to the sides, leading with your elbows.", "Stop at shoulder height.", "Lower slowly over two to three seconds."],
    mistakes: ["Shrugging your shoulders.", "Swinging your torso.", "Going too heavy for a full range."],
    muscles: "Side delts"
  },
  "front-raise": {
    setup: "Stand holding the dumbbells in front of your thighs, palms facing your body or each other.",
    steps: ["Keep a soft bend in your elbows and your torso still.", "Raise the dumbbells forward to about shoulder height.", "Pause briefly.", "Lower slowly."],
    mistakes: ["Swinging the weights up with your hips.", "Raising much higher than shoulder height.", "Doing lots of sets after heavy pressing, which already trains the front delts."],
    muscles: "Front delts"
  },
  "cable-front-raise": {
    setup: "Set a pulley at the lowest position. Stand facing away from it with the handle in one hand and the cable running between your legs.",
    steps: ["Start with your hand in front of your thigh, elbow soft.", "Raise your arm forward to about shoulder height.", "Pause briefly at the top.", "Lower slowly, keeping tension at the bottom."],
    mistakes: ["Leaning back to lift the weight.", "Shrugging your shoulder.", "Letting the stack touch between reps."],
    muscles: "Front delts"
  },
  "reverse-pec-deck": {
    setup: "Set the handles to the back position. Sit facing the pad and grip the handles at shoulder height with your arms nearly straight.",
    steps: ["Keep your chest on the pad.", "Sweep your arms back and out in a wide arc.", "Pause for a second when your arms line up with your body.", "Return slowly."],
    mistakes: ["Pinching your shoulder blades hard, which shifts work to the upper back.", "Bending the elbows into a row.", "Letting the weight snap back."],
    muscles: "Rear delts, upper back"
  },
  "cable-rear-delt-fly": {
    setup: "Set two pulleys at about shoulder height. Grab the left cable with your right hand and the right cable with your left hand, so the cables cross.",
    steps: ["Step back until your arms are straight out in front of you.", "Sweep your arms out and back wide, keeping a slight elbow bend.", "Pause when your arms line up with your shoulders.", "Return slowly to the crossed start."],
    mistakes: ["Bending the elbows and rowing.", "Leaning back.", "Shrugging or tensing your neck."],
    muscles: "Rear delts, upper back"
  },
  "upright-row": {
    setup: "Attach a bar or rope to a low pulley. Stand close with your hands at least shoulder width apart.",
    steps: ["Pull the handle up close to your body, leading with your elbows.", "Raise your elbows to about shoulder height.", "Stop before you feel any pinch in your shoulders.", "Lower slowly."],
    mistakes: ["Using a narrow grip that jams your shoulders.", "Pulling your elbows far above shoulder height.", "Swinging your hips."],
    muscles: "Side delts, upper traps"
  },
  "y-raise": {
    setup: "Lie chest-down on an incline bench set to about 30-45 degrees. Hold light dumbbells with your arms hanging and thumbs up.",
    steps: ["Raise your arms forward and out in a Y shape.", "Keep your thumbs up and shoulders down away from your ears.", "Pause at the top, about in line with your body.", "Lower slowly."],
    mistakes: ["Going so heavy that you shrug.", "Lifting your chest off the bench.", "Rushing the reps."],
    muscles: "Lower traps, rear delts, side delts"
  },
  "bus-driver": {
    setup: "Stand tall holding a plate with both hands at the 3 and 9 o'clock positions. Hold it out in front at shoulder height.",
    steps: ["Keep your arms extended at shoulder height.", "Turn the plate to one side, like turning a big steering wheel.", "Turn back through the middle and to the other side.", "Keep going for high reps or time without letting your arms drop."],
    mistakes: ["Letting your arms sag below shoulder height.", "Twisting your torso instead of turning the plate.", "Using a plate too heavy to hold up."],
    muscles: "Front delts, side delts, forearms"
  },
  "behind-neck-press": {
    setup: "Sit or stand with the bar on your upper traps, hands slightly wider than shoulder width. Only use this if your shoulders handle it without pain.",
    steps: ["Brace and keep your head neutral, tipped slightly forward.", "Press the bar straight up over the back of your head.", "Lock out over the crown of your head.", "Lower only as far as your shoulders stay pain-free, often to ear level."],
    mistakes: ["Forcing depth with poor shoulder mobility.", "Pushing your head far forward.", "Going heavy before the range feels comfortable."],
    muscles: "Front delts, side delts, triceps, upper traps"
  },
  "cable-shoulder-press": {
    setup: "Set two pulleys low. Stand between them holding the handles at shoulder height, palms forward.",
    steps: ["Brace your core and squeeze your glutes.", "Press up and slightly in until your hands meet overhead.", "Keep your ribs down.", "Lower slowly to shoulder height."],
    mistakes: ["Arching your back.", "Letting the cables pull your arms wide at the bottom.", "Using your legs to push."],
    muscles: "Front delts, side delts, triceps"
  },

  // Arms
  "ez-curl": {
    setup: "Stand tall and hold the EZ bar on the angled grips, palms up and arms straight.",
    steps: ["Keep your elbows at your sides, slightly forward.", "Curl the bar up by bending only at the elbows.", "Squeeze your biceps at the top.", "Lower slowly to fully straight arms."],
    mistakes: ["Swinging your hips to start the rep.", "Stopping short of a full stretch at the bottom.", "Letting your elbows travel up and forward to finish."],
    muscles: "Biceps, brachialis, forearms"
  },
  "db-curl": {
    setup: "Stand or sit holding the dumbbells at your sides, palms facing in.",
    steps: ["Curl one dumbbell up, turning the palm up as it rises.", "Keep turning the pinky up at the top for a hard biceps squeeze.", "Lower slowly to a straight arm, then curl the other side.", "Keep your upper arm still beside your body."],
    mistakes: ["Rocking your torso to swing the weight.", "Rushing the lowering phase.", "Not fully straightening your arm at the bottom."],
    muscles: "Biceps, brachialis, forearms"
  },
  "hammer-curl": {
    setup: "Hold the dumbbells at your sides with your palms facing each other, like holding two hammers.",
    steps: ["Keep the neutral grip the whole rep.", "Curl the dumbbells up with your elbows pinned to your sides.", "Stop when your forearms are near vertical and squeeze.", "Lower slowly to straight arms."],
    mistakes: ["Swinging the weights up.", "Letting your elbows drift forward.", "Turning your palms up, which makes it a regular curl."],
    muscles: "Brachialis, brachioradialis, biceps"
  },
  "rope-pushdown": {
    setup: "Attach a rope to a high pulley. Stand close, lean slightly forward, and pin your elbows to your sides.",
    steps: ["Start with your forearms just above parallel to the floor.", "Push the rope down by straightening your elbows.", "At the bottom, spread the rope ends apart and lock out hard.", "Let the rope rise slowly without moving your upper arms."],
    mistakes: ["Letting your elbows flare or drift forward.", "Leaning over the rope and pushing with body weight.", "Letting your hands rise so high that your shoulders take over."],
    muscles: "Triceps"
  },
  "overhead-rope-extension": {
    setup: "Attach a rope to a pulley at about chest height or lower. Face away in a split stance and hold the rope behind your head.",
    steps: ["Keep your elbows pointing forward and close to your head.", "Let your hands sink behind your head for a deep triceps stretch.", "Extend your elbows until your arms are straight.", "Return slowly to the stretch."],
    mistakes: ["Letting your elbows flare wide.", "Arching your lower back.", "Cutting the stretch short."],
    muscles: "Triceps, especially the long head"
  },
  "barbell-curl": {
    setup: "Stand tall holding a straight bar with your palms up, hands about shoulder width. Switch to an EZ bar if a straight bar bothers your wrists.",
    steps: ["Pin your elbows to your sides.", "Curl the bar up by bending only at the elbows.", "Squeeze your biceps at the top.", "Lower slowly to fully straight arms."],
    mistakes: ["Swinging your torso.", "Letting your elbows drift forward to finish.", "Skipping the full stretch at the bottom."],
    muscles: "Biceps, brachialis, forearms"
  },
  "preacher-curl": {
    setup: "Set the seat so your armpits sit snug against the top of the pad. Grip an EZ bar or dumbbells with your palms up.",
    steps: ["Keep the backs of your upper arms flat on the pad.", "Curl the weight up until your forearms are near vertical.", "Squeeze, then lower slowly.", "Go to almost straight arms, controlling the stretch."],
    mistakes: ["Dropping fast into the bottom, which strains the elbow.", "Lifting your elbows off the pad.", "Leaning back to cheat."],
    muscles: "Biceps, brachialis"
  },
  "machine-preacher-curl": {
    setup: "Set the seat so your upper arms rest flat on the pad. Line your elbows up with the machine's pivot.",
    steps: ["Grip the handles with your palms up.", "Curl up until you feel a hard biceps squeeze.", "Lower slowly into the stretch.", "Keep your upper arms planted throughout."],
    mistakes: ["Sitting so your elbows don't line up with the pivot.", "Lifting off the pad.", "Rushing the lowering phase."],
    muscles: "Biceps, brachialis"
  },
  "incline-db-curl": {
    setup: "Set a bench to about 45-60 degrees. Sit back with your arms hanging straight down behind your torso, palms forward.",
    steps: ["Keep your shoulders back and your head on the pad.", "Curl the dumbbells up without bringing your upper arms forward.", "Squeeze at the top.", "Lower slowly to a full stretch."],
    mistakes: ["Bringing your elbows forward as you curl.", "Lifting off the bench.", "Going too heavy for the stretched position."],
    muscles: "Biceps (long head), brachialis"
  },
  "spider-curl": {
    setup: "Lie chest-down on an incline bench with your arms hanging straight down, holding dumbbells palms up.",
    steps: ["Keep your upper arms vertical and still.", "Curl the dumbbells up toward your shoulders.", "Squeeze your biceps hard at the top.", "Lower slowly to straight arms."],
    mistakes: ["Swinging your arms forward.", "Lifting your chest off the bench.", "Partial reps at the bottom."],
    muscles: "Biceps, brachialis"
  },
  "cable-curl": {
    setup: "Attach a straight bar, EZ bar, or handles to a low pulley. Stand close with your palms up.",
    steps: ["Pin your elbows at your sides.", "Curl the handle up toward your shoulders.", "Squeeze at the top.", "Lower slowly, keeping tension at the bottom."],
    mistakes: ["Leaning back.", "Letting your elbows slide forward.", "Letting the stack touch between reps."],
    muscles: "Biceps, brachialis, forearms"
  },
  "single-arm-cable-curl": {
    setup: "Set a pulley low and hold the handle in one hand. Stand so the cable lines up with your wrist, elbow, and shoulder.",
    steps: ["Keep your elbow fixed at your side.", "Curl the handle up, turning your pinky slightly up at the top.", "Squeeze hard.", "Lower slowly to a straight arm."],
    mistakes: ["Standing off-line so the cable pulls you sideways.", "Moving your shoulder.", "Rushing the lowering phase."],
    muscles: "Biceps, brachialis"
  },
  "bayesian-curl": {
    setup: "Set a pulley low and face away from it with the handle in one hand. Step forward until your arm is pulled slightly behind your body.",
    steps: ["Stagger your stance and keep your torso upright.", "Curl the handle forward and up, keeping your elbow behind your torso.", "Squeeze at the top.", "Lower slowly until your arm is straight and your biceps stretches."],
    mistakes: ["Letting your elbow swing forward.", "Leaning forward to shorten the stretch.", "Going too heavy to control the bottom."],
    muscles: "Biceps (long head), brachialis"
  },
  "concentration-curl": {
    setup: "Sit on a bench with your feet wide. Rest the back of your upper arm against your inner thigh, holding a dumbbell.",
    steps: ["Let your arm hang straight.", "Curl the dumbbell slowly toward your shoulder.", "Squeeze at the top without moving your shoulder.", "Lower slowly to a full stretch."],
    mistakes: ["Rocking your torso.", "Lifting your elbow off your thigh.", "Swinging the dumbbell."],
    muscles: "Biceps, brachialis"
  },
  "close-grip-bench": {
    setup: "Lie on a flat bench and grip the bar about shoulder width apart. Pull your shoulder blades back.",
    steps: ["Unrack and hold the bar over your shoulders.", "Lower it to your lower chest, elbows close to your sides.", "Press up and lock out hard with your triceps.", "Keep your wrists stacked over your elbows."],
    mistakes: ["Gripping so narrow that your wrists hurt.", "Letting your elbows flare out.", "Bouncing the bar off your chest."],
    muscles: "Triceps, chest, front delts"
  },
  "skull-crusher": {
    setup: "Lie on a flat bench holding an EZ bar or dumbbells over your chest with your arms straight.",
    steps: ["Let your arms angle back slightly toward your head.", "Bend your elbows to lower the weight to your forehead or just behind your head.", "Keep your elbows pointing up and in.", "Extend back up and squeeze your triceps."],
    mistakes: ["Letting your elbows flare out.", "Moving your upper arms so much it becomes a press.", "Lowering fast toward your face."],
    muscles: "Triceps"
  },
  "decline-skull-crusher": {
    setup: "Lie on a decline bench with your legs secured. Hold an EZ bar or dumbbells over your chest with your arms straight.",
    steps: ["Keep your upper arms still and angled slightly back.", "Lower the weight behind your forehead under control.", "Pause at the stretch.", "Extend your elbows to lockout."],
    mistakes: ["Letting your upper arms drift.", "Flaring your elbows.", "Bouncing out of the bottom."],
    muscles: "Triceps, especially the long head"
  },
  "crossbody-triceps-extension": {
    setup: "Set a pulley at about shoulder height and stand side-on to it. Hold the handle in your far hand, starting near the opposite shoulder.",
    steps: ["Keep your upper arm still and pointed toward the pulley.", "Straighten your elbow, sweeping your hand out and away from your body.", "Lock out and squeeze your triceps.", "Return slowly to the bent position."],
    mistakes: ["Moving your upper arm.", "Rotating your torso.", "Short reps that skip the bent start."],
    muscles: "Triceps, especially the lateral head"
  },
  "single-arm-pushdown": {
    setup: "Attach a single handle to a high pulley. Stand close with your elbow pinned to your side.",
    steps: ["Start with your forearm just above parallel to the floor.", "Straighten your elbow until your arm is fully extended.", "Squeeze your triceps hard at lockout.", "Let the handle rise slowly."],
    mistakes: ["Letting your elbow drift forward.", "Leaning over the handle.", "Rushing the lowering phase."],
    muscles: "Triceps"
  },
  "dip-triceps": {
    setup: "Support yourself on the dip bars with your arms straight and body upright.",
    steps: ["Keep your torso vertical and elbows tucked back.", "Bend your elbows to lower until your upper arms are about parallel to the floor.", "Press up to full lockout.", "Stay within a pain-free shoulder range."],
    mistakes: ["Leaning forward, which shifts work to the chest.", "Going so deep it stresses the shoulders.", "Letting your elbows flare out."],
    muscles: "Triceps, chest, front delts"
  },
  "bench-dip": {
    setup: "Sit on the edge of a bench with your hands beside your hips. Slide your hips off the edge with your legs bent or straight.",
    steps: ["Keep your back close to the bench.", "Bend your elbows to lower your hips until your upper arms are about parallel to the floor, or less if your shoulders complain.", "Press back up to straight arms.", "Straighten your legs or put a plate on your lap to make it harder."],
    mistakes: ["Dipping so deep that the front of your shoulder strains.", "Letting your hips drift away from the bench.", "Shrugging your shoulders up."],
    muscles: "Triceps, front delts"
  },
  "reverse-curl": {
    setup: "Hold an EZ bar or dumbbells with an overhand grip, palms down and arms straight.",
    steps: ["Pin your elbows at your sides.", "Curl the weight up while keeping your wrists straight.", "Pause near the top.", "Lower slowly."],
    mistakes: ["Letting your wrists bend back.", "Swinging the weight.", "Going too heavy, since this curl is much weaker than a regular curl."],
    muscles: "Brachialis, brachioradialis, forearm extensors"
  },

  // Legs
  "barbell-squat": {
    setup: "Set the bar on your upper traps, not your neck. Brace your core and step back with your feet about shoulder width apart.",
    steps: ["Take a big breath and brace before each rep.", "Sit down and back, with your knees tracking over your toes.", "Go as deep as you can with a neutral back, ideally thighs at or below parallel.", "Drive up through your whole foot, keeping your chest up."],
    mistakes: ["Letting your knees cave inward.", "Lifting your heels off the floor.", "Losing your brace and rounding your lower back at the bottom."],
    muscles: "Quads, glutes, adductors, lower back"
  },
  "db-bulgarian-split-squat": {
    setup: "Stand about a stride in front of a bench and rest the top of your back foot on it. Hold the dumbbells at your sides.",
    steps: ["Lower straight down by bending your front knee.", "Go until your back knee is near the floor and your front thigh is about parallel.", "Drive up through your front foot.", "Finish all reps on one side, then switch. Lean forward slightly for more glutes."],
    mistakes: ["Standing so close to the bench that your front knee jams.", "Pushing off your back foot.", "Letting your front knee cave inward."],
    muscles: "Quads, glutes, adductors"
  },
  "db-rdl": {
    setup: "Stand with your feet hip width apart, holding the dumbbells in front of your thighs. Unlock your knees slightly.",
    steps: ["Push your hips back and let the dumbbells slide down the front of your legs.", "Keep your back flat and your knees softly bent and still.", "Stop when you feel a strong hamstring stretch, usually around mid-shin.", "Drive your hips forward to stand up and squeeze your glutes."],
    mistakes: ["Rounding your lower back to reach lower.", "Bending your knees until it becomes a squat.", "Letting the dumbbells drift away from your legs."],
    muscles: "Hamstrings, glutes, lower back"
  },
  "cable-kickback": {
    setup: "Strap an ankle cuff on and attach it to a low pulley. Face the machine, hold the frame, and hinge forward slightly.",
    steps: ["Start with your working leg slightly forward and the knee softly bent.", "Kick the leg back by squeezing your glute, not by arching your back.", "Pause at full hip extension.", "Return slowly under control."],
    mistakes: ["Arching your lower back to get the leg higher.", "Swinging the leg with momentum.", "Rotating your hips open."],
    muscles: "Glutes, hamstrings"
  },
  "standing-calf-raise": {
    setup: "Stand with the balls of your feet on a step and your heels hanging off. Hold a dumbbell and use a wall or rail for balance.",
    steps: ["Lower your heels until you feel a full calf stretch.", "Pause for a second at the bottom.", "Rise as high as you can onto the balls of your feet.", "Hold the top briefly, then lower slowly."],
    mistakes: ["Bouncing at the bottom.", "Cutting the range short at the top.", "Bending your knees to help."],
    muscles: "Calves (gastrocnemius and soleus)"
  },
  "front-squat": {
    setup: "Rest the bar on the front of your shoulders, close to your throat. Use a clean grip or crossed arms and keep your elbows high.",
    steps: ["Brace hard and keep your elbows up.", "Squat straight down with an upright torso.", "Let your knees travel forward over your toes.", "Drive up through your whole foot, leading with your elbows."],
    mistakes: ["Letting your elbows drop, which tips the bar forward.", "Rounding your upper back.", "Lifting your heels."],
    muscles: "Quads, glutes, upper back, core"
  },
  "hack-squat": {
    setup: "Stand on the platform with your feet about shoulder width apart and your back and shoulders firmly on the pads. A lower foot position puts more work on the quads.",
    steps: ["Release the safeties.", "Lower under control as deep as you can while keeping your hips on the pad.", "Drive up through your whole foot without slamming your knees into lockout.", "Re-engage the safeties at the end of the set."],
    mistakes: ["Lifting your heels.", "Bouncing out of the bottom.", "Letting your hips come off the back pad."],
    muscles: "Quads, glutes, adductors"
  },
  "leg-press": {
    setup: "Sit with your back and hips flat on the pad. Place your feet shoulder width apart in the middle of the platform.",
    steps: ["Release the safeties and lower the platform under control.", "Go as deep as you can without your hips rolling off the pad.", "Press up through your whole foot.", "Stop just short of locking your knees."],
    mistakes: ["Letting your lower back round off the pad at the bottom.", "Locking your knees hard at the top.", "Letting your knees cave in."],
    muscles: "Quads, glutes, adductors"
  },
  "leg-extension": {
    setup: "Set the back pad so your knees line up with the machine's pivot. Put the ankle pad just above your feet.",
    steps: ["Hold the handles and sit back.", "Straighten your knees until your legs are fully extended.", "Pause and squeeze your quads at the top.", "Lower slowly."],
    mistakes: ["Kicking the weight up with momentum.", "Lifting your hips off the seat.", "Skipping the pause at lockout."],
    muscles: "Quads"
  },
  "walking-lunge": {
    setup: "Stand tall holding the dumbbells at your sides, with clear floor space ahead of you.",
    steps: ["Step forward and lower until your back knee nearly touches the floor.", "Keep your front foot flat and your knee in line with your toes.", "Drive through your front foot and step straight into the next lunge.", "Take longer strides for more glutes, shorter strides for more quads."],
    mistakes: ["Stepping on a narrow line so you lose balance.", "Pushing off your back foot.", "Letting your torso collapse forward."],
    muscles: "Quads, glutes, adductors"
  },
  "goblet-squat": {
    setup: "Hold a dumbbell vertically against your chest, cupping the top end. Stand with your feet a little wider than shoulder width.",
    steps: ["Brace and keep your chest up.", "Squat down between your knees as deep as you can with a neutral back.", "Pause briefly at the bottom.", "Drive up through your whole foot. Lower slowly to make a light dumbbell harder."],
    mistakes: ["Letting the dumbbell pull you forward.", "Letting your knees cave inward.", "Rushing the reps."],
    muscles: "Quads, glutes, adductors"
  },
  "db-step-up": {
    setup: "Stand facing a bench or box about knee height, holding the dumbbells at your sides.",
    steps: ["Place your whole foot on the bench.", "Drive through that foot to stand up on the bench.", "Lower slowly with the same leg.", "Do all reps on one side, then switch."],
    mistakes: ["Pushing off your back foot.", "Bouncing off the floor to start each rep.", "Using a box so high that your hips shift sideways."],
    muscles: "Quads, glutes"
  },
  "lying-leg-curl": {
    setup: "Lie face-down with your knees just off the edge of the pad. Set the ankle pad just above your heels.",
    steps: ["Grip the handles and press your hips into the pad.", "Curl your heels toward your glutes.", "Squeeze your hamstrings at the top.", "Lower slowly to almost straight legs."],
    mistakes: ["Lifting your hips off the pad.", "Swinging the weight up.", "Cutting the stretch short."],
    muscles: "Hamstrings, calves"
  },
  "seated-leg-curl": {
    setup: "Sit with your knees lined up with the machine's pivot. Lock the thigh pad down snugly and set the ankle pad above your heels.",
    steps: ["Lean forward slightly to increase the hamstring stretch.", "Curl your heels down and back as far as you can.", "Pause and squeeze.", "Return slowly to straight legs."],
    mistakes: ["Leaving the thigh pad loose so you lift off the seat.", "Rushing the lowering phase.", "Partial reps."],
    muscles: "Hamstrings"
  },
  "nordic-curl": {
    setup: "Kneel on a pad and anchor your ankles under something solid, or have a partner hold them.",
    steps: ["Keep your body straight from knees to head with your glutes squeezed.", "Lower your torso toward the floor as slowly as you can.", "Catch yourself with your hands when you can't hold it any longer.", "Push off lightly and pull back up with your hamstrings."],
    mistakes: ["Bending at the hips to make it easier.", "Dropping fast at the end.", "Doing too many reps too soon, since soreness can be severe at first."],
    muscles: "Hamstrings"
  },
  "hip-thrust": {
    setup: "Sit on the floor with your upper back against the side of a bench. Roll a padded barbell over your hips, or hold a dumbbell there.",
    steps: ["Plant your feet about shoulder width apart so your shins are near vertical at the top.", "Tuck your chin and drive through your heels to lift your hips.", "Lock out with your pelvis tucked under and glutes squeezed hard.", "Lower under control."],
    mistakes: ["Arching your lower back at the top instead of extending your hips.", "Placing your feet so far out that your hamstrings take over.", "Rushing past the lockout."],
    muscles: "Glutes, hamstrings"
  },
  "machine-hip-thrust": {
    setup: "Sit in the machine with your upper back on the pad and the belt or pad across your hips. Plant your feet flat, about hip width apart.",
    steps: ["Brace your core and tuck your chin.", "Drive through your heels to push your hips up.", "Hold the top with your glutes squeezed and pelvis tucked.", "Lower slowly."],
    mistakes: ["Overarching your lower back.", "Bouncing at the bottom.", "Placing your feet so far forward that your hamstrings take over."],
    muscles: "Glutes, hamstrings"
  },
  "cable-pull-through": {
    setup: "Attach a rope to a low pulley. Face away, straddle the cable, and hold the rope between your legs, then walk forward a few steps.",
    steps: ["Hinge at your hips and let the rope pull your hands back between your legs.", "Keep your back flat and your knees softly bent.", "Drive your hips forward to stand tall.", "Squeeze your glutes at the top, then hinge back slowly."],
    mistakes: ["Squatting down instead of hinging.", "Pulling with your arms.", "Leaning back at the top."],
    muscles: "Glutes, hamstrings"
  },
  "seated-calf-raise": {
    setup: "Sit with the balls of your feet on the platform and the pad snug on your lower thighs.",
    steps: ["Release the safety.", "Lower your heels as far as you can for a full stretch.", "Pause, then rise as high as you can.", "Squeeze at the top and lower slowly."],
    mistakes: ["Bouncing at the bottom.", "Half reps.", "Rushing the tempo."],
    muscles: "Calves, especially the soleus"
  },
  "standing-machine-calf-raise": {
    setup: "Step under the shoulder pads with the balls of your feet on the edge of the platform. Stand tall with your knees straight but not locked.",
    steps: ["Lower your heels for a full stretch.", "Pause briefly at the bottom.", "Rise onto your toes as high as you can.", "Hold, then lower slowly."],
    mistakes: ["Bending your knees to bounce the weight.", "Using a short range.", "Fast, bouncy reps."],
    muscles: "Calves (gastrocnemius and soleus)"
  },
  "leg-press-calf-raise": {
    setup: "Sit in the leg press and press the platform up. Slide your feet down until only the balls of your feet are on the bottom edge.",
    steps: ["Keep your knees straight but not locked.", "Let the platform push your toes back for a deep stretch.", "Press through the balls of your feet to full ankle extension.", "Pause and lower slowly."],
    mistakes: ["Bending your knees.", "Releasing the safeties before your feet feel secure.", "Bouncing reps."],
    muscles: "Calves (gastrocnemius and soleus)"
  },
  "cable-hip-abduction": {
    setup: "Strap an ankle cuff to the leg farther from a low pulley. Stand side-on to the machine and hold the frame.",
    steps: ["Stand tall with a slight bend in your standing knee.", "Lift your working leg out to the side, leading with your heel.", "Pause at the top without leaning your torso.", "Lower slowly."],
    mistakes: ["Leaning your torso away from the machine.", "Turning your toes up so your hip flexors do the work.", "Swinging the leg."],
    muscles: "Glute medius, glute minimus"
  },

  // Abs
  "cable-crunch": {
    setup: "Attach a rope to a high pulley. Kneel facing the machine and hold the rope beside your head.",
    steps: ["Keep your hips still and high.", "Crunch down by rounding your spine, bringing your elbows toward your knees.", "Squeeze your abs at the bottom.", "Return slowly to the stretch."],
    mistakes: ["Sitting back on your heels and pulling with your hips.", "Pulling with your arms.", "Keeping your back flat instead of rounding it."],
    muscles: "Abs, obliques"
  },
  "stability-ball-crunch": {
    setup: "Sit on a stability ball and walk your feet out until the ball supports your lower and mid back.",
    steps: ["Let your upper back curve over the ball for a stretch.", "Crunch up by bringing your ribs toward your pelvis.", "Squeeze your abs at the top.", "Lower slowly back over the ball."],
    mistakes: ["Pulling on your neck.", "Sitting all the way up so your hip flexors take over.", "Placing your feet too close together so the ball rolls."],
    muscles: "Abs"
  },
  "hanging-leg-raise": {
    setup: "Hang from a pull-up bar, or support yourself in a captain's chair, with your legs straight.",
    steps: ["Tilt your pelvis back first, as if tucking your tailbone under.", "Raise your legs by curling your hips up toward your ribs.", "Pause at the top.", "Lower slowly without swinging."],
    mistakes: ["Swinging your body for momentum.", "Lifting only from the hips with no pelvic tilt.", "Dropping your legs fast."],
    muscles: "Abs, hip flexors"
  },
  "captains-chair-knee-raise": {
    setup: "Rest your forearms on the pads with your back against the backrest and your legs hanging.",
    steps: ["Brace and keep your back on the pad.", "Pull your knees up toward your chest, curling your pelvis up.", "Pause at the top.", "Lower slowly."],
    mistakes: ["Swinging your legs.", "Stopping when your thighs reach hip height.", "Shrugging your shoulders up."],
    muscles: "Abs, hip flexors"
  },
  "decline-sit-up": {
    setup: "Hook your feet under the pads of a decline bench and lie back. Cross your arms or hold a plate on your chest.",
    steps: ["Curl your chin and shoulders up first.", "Roll up until your torso is close to upright.", "Lower slowly, one section of your spine at a time.", "Stop just short of lying flat to keep tension."],
    mistakes: ["Yanking on your neck with your hands.", "Dropping fast on the way down.", "Swinging your arms for momentum."],
    muscles: "Abs, hip flexors"
  },
  "weighted-crunch": {
    setup: "Lie on your back with your knees bent and feet flat. Hold a plate or dumbbell on your chest.",
    steps: ["Press your lower back into the floor.", "Curl your shoulders off the floor, bringing your ribs toward your hips.", "Squeeze hard at the top.", "Lower slowly."],
    mistakes: ["Pulling your head forward.", "Sitting all the way up.", "Bouncing quick reps."],
    muscles: "Abs"
  },
  "reverse-crunch": {
    setup: "Lie on a bench or the floor with your knees bent. Hold the bench behind your head or keep your hands by your sides.",
    steps: ["Lift your knees up over your hips.", "Curl your hips up off the bench, bringing your knees toward your chest.", "Pause at the top.", "Lower your hips slowly."],
    mistakes: ["Kicking your legs to swing up.", "Dropping your hips fast.", "Moving only your legs without curling your pelvis."],
    muscles: "Abs, hip flexors"
  },
  "bench-leg-raise": {
    setup: "Lie flat on a bench and hold the edge behind your head. Keep your legs straight or slightly bent.",
    steps: ["Press your lower back into the bench.", "Raise your legs until they're about vertical.", "Lower slowly, stopping before your lower back arches.", "Bend your knees to make it easier."],
    mistakes: ["Letting your lower back arch as your legs drop.", "Swinging your legs.", "Dropping your legs fast."],
    muscles: "Abs, hip flexors"
  },
  "rope-woodchop": {
    setup: "Set a pulley high. Stand side-on with your feet wide and hold the handle or rope with both hands.",
    steps: ["Brace your core and keep your arms long.", "Pull the handle down and across your body toward the opposite hip.", "Rotate through your torso while your hips stay braced and mostly forward.", "Return slowly. Finish one side, then switch."],
    mistakes: ["Pulling with your arms.", "Spinning your hips.", "Going so heavy that you jerk the weight."],
    muscles: "Obliques, abs"
  },
  "pallof-press": {
    setup: "Set a pulley at chest height. Stand side-on, hold the handle at your chest with both hands, and step out until you feel tension.",
    steps: ["Stand tall with your feet shoulder width apart and glutes squeezed.", "Press the handle straight out in front of your chest.", "Hold for one or two seconds without letting your torso rotate.", "Bring the handle back to your chest. Finish one side, then switch."],
    mistakes: ["Twisting toward the cable.", "Leaning away from the cable.", "Letting your ribs flare."],
    muscles: "Obliques, deep core"
  },
  "ab-wheel-rollout": {
    setup: "Kneel on a pad holding the ab wheel on the floor under your shoulders.",
    steps: ["Brace hard and tuck your pelvis slightly.", "Roll the wheel forward slowly, keeping your back flat.", "Stop before your lower back starts to arch.", "Pull back to the start using your abs."],
    mistakes: ["Letting your lower back sag.", "Rolling out farther than you can control.", "Pulling back with your hips first."],
    muscles: "Abs, obliques, lats"
  },
  "plank": {
    setup: "Get on your forearms and toes with your elbows under your shoulders. Have a partner place a plate on your upper back.",
    steps: ["Squeeze your glutes and tuck your ribs down.", "Keep a straight line from your head to your heels.", "Breathe slowly while holding the brace.", "Hold for your target time, then rest."],
    mistakes: ["Letting your hips sag.", "Piking your hips up.", "Holding your breath."],
    muscles: "Abs, obliques, deep core"
  },
  "side-plank": {
    setup: "Lie on your side with your elbow under your shoulder and your legs stacked.",
    steps: ["Lift your hips so your body is straight from head to feet.", "Drive your bottom elbow into the floor.", "Keep your hips stacked, not pushed back.", "Hold, then switch sides."],
    mistakes: ["Letting your hips sag toward the floor.", "Rolling forward or back.", "Sinking into your bottom shoulder."],
    muscles: "Obliques, deep core, glute medius"
  },
  "dead-bug": {
    setup: "Lie on your back with your arms straight up and your knees bent at 90 degrees over your hips.",
    steps: ["Press your lower back into the floor.", "Slowly extend one arm overhead and the opposite leg out straight.", "Stop before your lower back lifts.", "Return and switch sides."],
    mistakes: ["Letting your lower back arch off the floor.", "Moving too fast.", "Holding your breath."],
    muscles: "Deep core, abs"
  },
  "stomach-vacuum": {
    setup: "Stand, kneel on all fours, or lie on your back. Breathe out completely.",
    steps: ["After the full exhale, pull your belly button in toward your spine.", "Hold the waist drawn in for 10-20 seconds, taking small breaths if you need to.", "Relax, take a few normal breaths, and repeat.", "Work up to longer holds over time."],
    mistakes: ["Starting with your lungs full of air.", "Sucking in your chest instead of your waist.", "Bearing down instead of drawing in."],
    muscles: "Transverse abdominis"
  },
  "mountain-climber": {
    setup: "Start in a high plank with your hands under your shoulders and your body in a straight line.",
    steps: ["Brace your core and keep your hips level.", "Slowly drive one knee toward your chest.", "Return it and switch legs.", "Move under control, since the goal is core tension, not cardio."],
    mistakes: ["Bouncing your hips up and down.", "Rushing the reps.", "Letting your shoulders drift behind your hands."],
    muscles: "Abs, hip flexors, shoulders"
  },
  // Hotel room and dumbbell-only travel exercises
  "feet-elevated-push-up": {
    setup: "Put your feet on the bed or a sturdy chair and your hands on the floor, a little wider than your shoulders.",
    steps: ["Brace your abs and squeeze your glutes so your body forms a straight line.", "Lower your chest toward the floor over 3 seconds, elbows about 45 degrees from your body.", "Press the floor away until your arms are straight.", "Higher feet put more work on the upper chest and shoulders."],
    mistakes: ["Letting the hips sag toward the floor.", "Stopping short of a full stretch at the bottom.", "Flaring the elbows straight out."],
    muscles: "Upper chest, front delts, triceps"
  },
  "close-grip-push-up": {
    setup: "Start in a push-up position with your hands under your chest, about shoulder width or a little closer.",
    steps: ["Keep your elbows tight to your ribs as you lower.", "Lower until your chest is just above your hands.", "Press up and lock your elbows out fully, squeezing the triceps.", "Raise your hands on the bed edge if full reps are too hard."],
    mistakes: ["Letting the elbows flare out, which moves the work to the chest.", "Setting the hands so close the wrists hurt.", "Sagging through the hips."],
    muscles: "Triceps, chest, front delts"
  },
  "band-chest-press": {
    setup: "Anchor the band in the door at chest height behind you. Hold a handle in each hand and step forward until the band is tight.",
    steps: ["Stand in a staggered stance with your elbows bent and hands beside your chest.", "Press your hands forward and slightly together until your arms are straight.", "Squeeze the chest for a second.", "Return slowly, letting the band pull your elbows back."],
    mistakes: ["Standing too close, so there is no tension at the start.", "Shrugging your shoulders toward your ears.", "Letting the band snap your arms back."],
    muscles: "Chest, front delts, triceps"
  },
  "band-chest-fly": {
    setup: "Anchor the band in the door at chest height behind you and step forward until it is tight, arms out to the sides.",
    steps: ["Keep a soft bend in your elbows and lock it there.", "Hug your hands around in a wide arc until they meet in front of your chest.", "Squeeze for a second.", "Open slowly back to a full chest stretch."],
    mistakes: ["Bending the elbows more, which turns it into a press.", "Letting the shoulders roll forward at the finish.", "Rushing the stretch on the way back."],
    muscles: "Chest, front delts"
  },
  "table-inverted-row": {
    setup: "Test that the table is solid and won't tip. Lie under the edge, grip it about shoulder width, and straighten your body with your heels on the floor.",
    steps: ["Brace your abs and keep a straight line from head to heels.", "Pull your chest up to the edge, driving your elbows toward your hips.", "Squeeze your shoulder blades together at the top.", "Lower slowly until your arms are straight."],
    mistakes: ["Using a table that is light, wobbly, or has a thin edge.", "Letting the hips sag so only the arms move.", "Shrugging instead of pulling with the back."],
    muscles: "Lats, mid back, rear delts, biceps"
  },
  "band-row": {
    setup: "Anchor the band low in the door or loop it around your feet. Sit tall with your legs out and a handle in each hand.",
    steps: ["Start with your arms straight and the band already tight.", "Pull your elbows back past your ribs, keeping them close to your sides.", "Squeeze your shoulder blades together for a second.", "Let your arms extend slowly and feel your back stretch."],
    mistakes: ["Leaning back to pull instead of using your back.", "Shrugging your shoulders up.", "Letting the band snap your arms forward."],
    muscles: "Mid back, lats, rear delts, biceps"
  },
  "band-lat-pulldown": {
    setup: "Anchor the band high on the door. Kneel facing it, far enough back that the band is tight with your arms overhead.",
    steps: ["Start with your arms straight up and your chest tall.", "Pull your elbows down and in toward your sides.", "Squeeze your lats at the bottom with your hands near your shoulders.", "Let your arms rise slowly to a full stretch."],
    mistakes: ["Pulling with the hands and biceps instead of the elbows.", "Leaning far back to cheat the reps.", "Losing tension at the top."],
    muscles: "Lats, upper back, biceps"
  },
  "band-straight-arm-pulldown": {
    setup: "Anchor the band high on the door. Step back, hinge slightly at the hips, and hold the band with straight arms at eye level.",
    steps: ["Keep your elbows straight but not locked.", "Sweep your hands down in an arc to your thighs.", "Squeeze your lats hard at the bottom.", "Let your arms rise slowly and feel the lats stretch."],
    mistakes: ["Bending the elbows, which turns it into a pushdown.", "Rocking the torso to move the band.", "Rushing back up."],
    muscles: "Lats, long head of the triceps"
  },
  "band-face-pull": {
    setup: "Anchor the band at face height. Hold an end in each hand with your palms facing down and step back until it is tight.",
    steps: ["Start with your arms straight in front of you.", "Pull the band toward your face, elbows high and wide.", "Finish with your hands beside your ears and your upper arms level with your shoulders.", "Return slowly."],
    mistakes: ["Pulling the elbows down low, which makes it a row.", "Leaning back.", "Shrugging with the traps."],
    muscles: "Rear delts, upper back, rotator cuff"
  },
  "pike-push-up": {
    setup: "Start in a push-up position, then walk your feet in and lift your hips high so your body makes an upside-down V.",
    steps: ["Keep your arms about shoulder width and your legs as straight as you can.", "Bend your elbows and lower the top of your head toward the floor, just in front of your hands.", "Press back up until your arms are straight.", "Put your feet on the bed to make it harder."],
    mistakes: ["Dropping the hips, which turns it into a push-up.", "Flaring the elbows wide.", "Cutting the depth short."],
    muscles: "Front delts, triceps, upper chest"
  },
  "band-overhead-press": {
    setup: "Stand on the middle of the band with your feet about hip width. Hold the ends at shoulder height, palms forward.",
    steps: ["Brace your abs and squeeze your glutes so your ribs stay down.", "Press straight up until your arms are locked overhead.", "Bring your head slightly through at the top.", "Lower slowly back to your shoulders."],
    mistakes: ["Arching the lower back to finish the rep.", "Pressing forward instead of straight up.", "Letting the band yank your hands down."],
    muscles: "Front delts, side delts, triceps"
  },
  "band-lateral-raise": {
    setup: "Stand on the band with one or both feet. Hold the ends at your sides with a slight bend in your elbows.",
    steps: ["Lean your torso very slightly forward.", "Raise your arms out to the sides, leading with your elbows.", "Pause for a second at shoulder height.", "Lower slowly, keeping tension on the band at the bottom."],
    mistakes: ["Shrugging your traps to lift the band.", "Swinging the body to start each rep.", "Raising the hands higher than the elbows."],
    muscles: "Side delts"
  },
  "band-rear-delt-pull-apart": {
    setup: "Hold the band in front of you at shoulder height with straight arms, hands about shoulder width apart.",
    steps: ["Keep your arms straight and your shoulders down.", "Pull the band apart until it touches your chest.", "Squeeze between your shoulder blades for a second.", "Return slowly to the start."],
    mistakes: ["Bending the elbows to make it easier.", "Shrugging the shoulders toward the ears.", "Arching the lower back."],
    muscles: "Rear delts, upper back"
  },
  "band-curl": {
    setup: "Stand on the middle of the band with your feet about hip width. Hold the ends with your palms facing forward and your elbows at your sides.",
    steps: ["Pin your elbows to your sides.", "Curl your hands up toward your shoulders.", "Squeeze your biceps hard at the top, where the band is tightest.", "Lower slowly over 2 to 3 seconds."],
    mistakes: ["Letting the elbows drift forward.", "Swinging the torso to finish reps.", "Dropping fast on the way down."],
    muscles: "Biceps, forearms"
  },
  "band-hammer-curl": {
    setup: "Stand on the band and hold the ends with your palms facing each other, elbows at your sides.",
    steps: ["Keep your elbows still.", "Curl up with your palms facing in, like holding a hammer.", "Squeeze at the top.", "Lower slowly."],
    mistakes: ["Rotating the wrists during the rep.", "Leaning back to lift.", "Using a band so light you never get close to failure."],
    muscles: "Brachialis, biceps, forearms"
  },
  "band-pushdown": {
    setup: "Anchor the band high on the door. Hold an end in each hand and stand close with your elbows at your sides.",
    steps: ["Start with your forearms angled up and your elbows pinned.", "Push your hands down until your arms are fully straight.", "Squeeze your triceps for a second.", "Let your forearms rise slowly without your elbows moving."],
    mistakes: ["Letting the elbows drift forward and up.", "Leaning over the band to push with body weight.", "Stopping short of full lockout."],
    muscles: "Triceps"
  },
  "band-overhead-extension": {
    setup: "Anchor the band low in the door behind you, or stand on it. Face away and hold the ends behind your head with your elbows pointing forward.",
    steps: ["Keep your upper arms close to your head.", "Straighten your arms overhead.", "Squeeze at the top.", "Lower slowly behind your head until you feel a deep triceps stretch."],
    mistakes: ["Letting the elbows flare wide.", "Arching the lower back.", "Cutting the stretch short."],
    muscles: "Triceps (long head)"
  },
  "db-overhead-extension": {
    setup: "Sit on a bench or stand. Hold one dumbbell with both hands under the top plate, arms straight overhead.",
    steps: ["Keep your elbows pointing forward and close to your head.", "Lower the dumbbell behind your head until you feel a deep stretch.", "Straighten your arms back overhead.", "Keep your ribs down throughout."],
    mistakes: ["Letting the elbows flare out wide.", "Arching the lower back to finish.", "Going so heavy you lose control at the bottom."],
    muscles: "Triceps (long head)"
  },
  "db-triceps-kickback": {
    setup: "Put one hand and knee on a bench with your back flat. Hold a dumbbell with your upper arm against your side, parallel to the floor.",
    steps: ["Keep your upper arm still.", "Straighten your elbow until your whole arm is in line with your body.", "Hold the squeeze for a second.", "Lower slowly to about 90 degrees."],
    mistakes: ["Letting the upper arm drop, which takes tension off.", "Swinging the dumbbell up.", "Going too heavy to hold the top."],
    muscles: "Triceps"
  },
  "bodyweight-split-squat": {
    setup: "Stand about two feet in front of the bed or a chair and rest the top of your back foot on it.",
    steps: ["Lower straight down over 3 seconds until your back knee nearly touches the floor.", "Pause for a second at the bottom.", "Drive up through the front heel.", "Lean slightly forward for more glutes, stay upright for more quads."],
    mistakes: ["Standing too close, so the front knee jams forward.", "Pushing off the back foot.", "Bouncing out of the bottom."],
    muscles: "Quads, glutes, adductors"
  },
  "pause-air-squat": {
    setup: "Stand with your feet about shoulder width and your toes turned out slightly. Hold your arms out in front for balance.",
    steps: ["Sit down between your heels as deep as you can with a flat back.", "Hold the bottom for 2 seconds, staying tight.", "Stand up without bouncing.", "Slow the lowering if the reps get easy."],
    mistakes: ["Bouncing out of the pause.", "Letting the knees cave in.", "Lifting the heels."],
    muscles: "Quads, glutes"
  },
  "single-leg-rdl": {
    setup: "Stand on one leg with a soft bend in the knee. Hold a dumbbell in the opposite hand, or nothing.",
    steps: ["Push your hips back and tip your torso forward, letting your free leg rise behind you.", "Keep your back flat and your hips square to the floor.", "Lower until you feel a strong hamstring stretch.", "Drive your hips forward to stand tall."],
    mistakes: ["Rounding the back to reach lower.", "Letting the hips twist open.", "Locking the standing knee."],
    muscles: "Hamstrings, glutes"
  },
  "band-leg-curl": {
    setup: "Anchor the band low in the door. Lie face down with your feet toward the door and loop the band around one or both ankles.",
    steps: ["Keep your hips pressed into the floor.", "Curl your heels toward your glutes.", "Squeeze your hamstrings at the top.", "Lower slowly."],
    mistakes: ["Lifting the hips to finish the rep.", "Lying so close to the door that there's no tension.", "Letting the band snap the legs down."],
    muscles: "Hamstrings"
  },
  "single-leg-glute-bridge": {
    setup: "Lie on your back with one foot flat near your glutes and the other leg straight or tucked in.",
    steps: ["Drive through the heel of the planted foot.", "Lift your hips until your body is straight from shoulder to knee.", "Hold the top for a second, squeezing the glute.", "Lower slowly. Put your shoulders on the bed edge for more range."],
    mistakes: ["Pushing through the toes.", "Arching the lower back instead of using the glute.", "Letting the hips tilt to one side."],
    muscles: "Glutes, hamstrings"
  },
  "band-hip-abduction": {
    setup: "Loop a small band just above your knees. Sit on the edge of the bed or stand in a half squat.",
    steps: ["Keep your feet planted.", "Push your knees out against the band as far as you can.", "Hold for a second.", "Let your knees come back in slowly."],
    mistakes: ["Letting the band pull the knees in fast.", "Rocking the torso to move the knees.", "Using a band so light it's easy."],
    muscles: "Glutes (side), hip abductors"
  },
  "single-leg-calf-raise": {
    setup: "Stand on one foot on a step, a thick book, or the bottom stair, holding a wall or door frame for balance.",
    steps: ["Lower your heel below the step for a full stretch.", "Rise as high as you can onto the ball of your foot.", "Hold the top for 2 seconds.", "Lower slowly."],
    mistakes: ["Bouncing at the bottom.", "Cutting the range short.", "Bending the knee to push."],
    muscles: "Calves"
  }
};

// Open panels by "context:id", so a re-render (completing a set, searching the
// library) keeps a guide the athlete opened.
const openExerciseGuides = new Set();

function exerciseGuide(id) {
  return Object.prototype.hasOwnProperty.call(EXERCISE_GUIDES, id) ? EXERCISE_GUIDES[id] : null;
}

function exerciseDemoUrl(name) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${String(name || "").trim()} form`)}`;
}

function rememberExerciseGuide(key, open) {
  if (open) openExerciseGuides.add(key);
  else openExerciseGuides.delete(key);
}

// Accepts a library exercise, a live-workout exercise, or just an id. Exercises
// without a guide show their cue; with neither there is nothing to show.
function renderExerciseGuide(exercise, context = "library") {
  const id = String(exercise?.id ?? exercise ?? "");
  const source = exerciseLibrary.find((item) => item.id === id);
  const name = String(exercise?.name || source?.name || "");
  const cue = String(exercise?.cue || source?.cue || "");
  const guide = exerciseGuide(id);
  if (!guide && !cue) return "";
  // Keys go into an inline handler, so only safe characters survive.
  const key = `${context}:${id}`.replace(/[^A-Za-z0-9:_-]/g, "");
  const body = guide
    ? `<h4>Setup</h4><p>${escapeHtml(guide.setup)}</p><h4>Steps</h4><ol>${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><h4>Mistakes to avoid</h4><ul>${guide.mistakes.map((mistake) => `<li>${escapeHtml(mistake)}</li>`).join("")}</ul><h4>Muscles worked</h4><p>${escapeHtml(guide.muscles)}</p>`
    : `<p>${escapeHtml(cue)}</p>`;
  const demo = name ? `<a class="guide-demo-link" href="${escapeHtml(exerciseDemoUrl(name))}" target="_blank" rel="noopener">Watch a demo</a>` : "";
  return `<details class="exercise-guide" ${openExerciseGuides.has(key) ? "open" : ""} ontoggle="rememberExerciseGuide('${key}', this.open)"><summary>How to</summary><div class="exercise-guide-body">${body}${demo}</div></details>`;
}

// Library cards: the guide sits just above each card's History / Quick Start
// buttons. The renderer is a single map, so the panel is spliced in at that
// anchor rather than copying the card markup here.
const baseRenderLibraryResultsForGuides = renderLibraryResults;
renderLibraryResults = function renderLibraryResultsWithGuides(...args) {
  return baseRenderLibraryResultsForGuides(...args).replace(
    /<div class="actions"><button class="secondary-btn" onclick="selectExerciseHistory\('([^']+)'\)">/g,
    (anchor, id) => `${renderExerciseGuide(id, "library")}${anchor}`
  );
};

// Live workout cards: above the last-performance and progression controls.
const baseRenderExerciseControlsForGuides = renderToolkitExerciseControls;
renderToolkitExerciseControls = function renderExerciseControlsWithGuide(exercise, exIndex, ...rest) {
  return `${renderExerciseGuide(exercise, "session")}${baseRenderExerciseControlsForGuides(exercise, exIndex, ...rest)}`;
};

// Library history panel: right under its header.
const baseRenderExerciseHistoryPanelForGuides = renderExerciseHistoryPanel;
renderExerciseHistoryPanel = function renderExerciseHistoryPanelWithGuide(id, ...rest) {
  const html = baseRenderExerciseHistoryPanelForGuides(id, ...rest);
  if (!html) return html;
  const anchor = `onclick="closeExerciseHistory()">Close</button></div>`;
  return html.replace(anchor, `${anchor}${renderExerciseGuide(id, "history-panel")}`);
};

// History tab: inside the exercise picker card, so it follows the selection.
const baseRenderExerciseHistoryForGuides = renderExerciseHistory;
renderExerciseHistory = function renderExerciseHistoryWithGuide(...args) {
  const html = baseRenderExerciseHistoryForGuides(...args);
  const id = selectedExerciseHistoryId();
  return html.includes('id="exerciseHistorySelect"')
    ? html.replace("</section>", `${renderExerciseGuide(id, "history")}</section>`)
    : html;
};

render();
