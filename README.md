# PeakSet Bodybuilding

PeakSet is a new standalone bodybuilding app prototype. It does not use Virex code and does not include AI features.

## Open

Open `index.html` in a browser.

## Xcode

Open `ios/PeakSet.xcodeproj` in Xcode and run the `PeakSet` scheme. The iOS target is a native SwiftUI shell that loads the bundled PeakSet web app through `WKWebView`.

Before making an Xcode build after web changes, run:

```bash
scripts/sync-ios-web.sh
```

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
- Custom workout builder that filters exercises by body part, allows Abs add-ons, and starts sessions immediately
- Set-by-set logging for weight and reps
- Adjustable rest timer that defaults to 3 minutes and plays a boxing-style bell when rest ends
- Separate body weight logs and body measurement check-ins
- Coach-ready Logbook tab with PDF export for body weight, measurements, and workout logs
- Local progress history stored in browser localStorage

## Market Notes

I could not access private App Store Connect data from this workspace. Public market research points to these patterns:

- Strong and Hevy win with fast workout logging and low-friction templates.
- Fitbod and PUSH lean heavily on adaptive or AI-guided planning.
- Centr and BetterMe are broader wellness platforms, which can feel rich but less focused.
- A bodybuilding-specific app can stand apart by being narrower: body-part splits, prep/bulk/off-season language, physique measurements, and travel workouts without an AI layer.
