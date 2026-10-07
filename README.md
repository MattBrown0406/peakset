# Mass Method Bodybuilding

Mass Method is a standalone bodybuilding training and physique logbook. It does not use Virex code and does not include AI features.

## Open

Open `index.html` in a browser.

## Xcode

Open `ios/PeakSet.xcodeproj` in Xcode and run the internal `PeakSet` scheme. The visible product name is Mass Method; the existing target and bundle ID remain unchanged for build and data continuity. The iOS target is a native SwiftUI shell that loads the bundled Mass Method web app through `WKWebView`.

Before making an Xcode build after web changes, run:

```bash
scripts/sync-ios-web.sh
node scripts/validate-source.mjs
```

The validator checks exercise IDs and required library entries, confirms Incline Y-Raise is included in every shoulder workout template, verifies reps-only abs logging, validates the Bodybuilder Toolkit and native bridges, confirms HealthKit signing/privacy configuration, confirms shake-to-undo remains disabled, and ensures the web files are synchronized into the iOS bundle.

The Logbook PDF export uses a native iOS share sheet in the Xcode build, so users can text or email the PDF from the device.

## Built In

- Onboarding for gender, age, starting body weight, training phase, and starting measurements
- Off-season, bulking, and contest prep training context
- Stage Timeline that calculates weeks out from a show or goal date
- Phase-aware targets, scale trend signals, and a stage checklist
- Today workout picker for recommended or random body-part workouts
- Expanded lift library with 20+ movements each for chest, back, shoulders, arms, and legs
- Abs exercise library with ab finishers mixed into many plans instead of a standalone abs day
- Road Gym mode for hotel gyms with a bench, dumbbells up to 50 lb, cable handles, rope, and ankle cuffs
- 30+ pre-planned body-part, prep, weak-point, and Road Gym workouts
- Advanced workout builder with equipment profiles, scheduling, reordering, duplication, supersets, set types, and reusable templates
- Live-workout editing for adding, removing, reordering, substituting, or changing the planned set count
- Set-by-set logging for weight, reps, RIR, and bodybuilding set type
- Previous-performance display, Copy Last, exercise history, PR statistics, and deterministic double-progression guidance
- Searchable exercise library with favorites, persistent setup notes, pain flags, and equipment-aware substitutions
- Native-backed rest timer with a boxing-style bell and local notification when iOS backgrounds the app
- Expanded body measurements and selectable physique trend charts
- Weekly recovery check-ins plus cardio, steps, and posing adherence logs
- Apple Health authorization, step import, weight export, and completed strength-workout export
- A Codable shared workout model that can be reused by a future watchOS companion target
- Coach-ready Logbook tab with PDF export for body weight, measurements, and workout logs
- Local progress history stored in browser localStorage

## Market Notes

I could not access private App Store Connect data from this workspace. Public market research points to these patterns:

- Strong and Hevy win with fast workout logging and low-friction templates.
- Fitbod and PUSH lean heavily on adaptive or AI-guided planning.
- Centr and BetterMe are broader wellness platforms, which can feel rich but less focused.
- A bodybuilding-specific app can stand apart by being narrower: body-part splits, prep/bulk/off-season language, physique measurements, and travel workouts without an AI layer.
