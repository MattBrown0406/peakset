import Foundation
import UserNotifications
import WatchConnectivity
import WatchKit

/// Mirror of the phone's live workout, published by the web app as JSON.
struct WatchSnapshot: Codable, Equatable {
    struct WorkoutSet: Codable, Equatable {
        let index: Int
        let label: String
        var weight: String
        var reps: String
        var done: Bool
        let drop: Bool
        /// The phone's pre-fill for this set; nil from older iPhone builds.
        var suggestedWeight: String? = nil
        var suggestedReps: String? = nil
    }

    struct Exercise: Codable, Equatable {
        let index: Int
        let id: String?
        let rest: Double?
        let restAfterNext: Bool?
        /// Superset letter ("" for none); nil from older iPhone builds.
        let group: String?
        let name: String
        let targetReps: String
        let repsOnly: Bool
        let suggestedWeight: String
        let suggestedReps: String
        var sets: [WorkoutSet]
    }

    struct Rest: Codable, Equatable {
        let running: Bool
        let startedAt: Double?
        let endsAt: Double?
    }

    let active: Bool
    let workoutId: String?
    let title: String
    let unit: String
    let blockLine: String
    var completedSets: Int
    let totalSets: Int
    let currentExercise: Int
    var exercises: [Exercise]
    let rest: Rest
    let nextPlanTitle: String
}

/// The watch keeps working when the iPhone is locked (its web app is paused):
/// completions and rest run locally right away and stay applied until a phone
/// snapshot confirms them.
@MainActor
final class WatchWorkoutModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var snapshot: WatchSnapshot?
    @Published var selectedExercise = 0
    @Published var weight: Double = 0 { didSet { if !loadingDraft { draftEdited = true } } }
    @Published var reps: Double = 8 { didSet { if !loadingDraft { draftEdited = true } } }
    @Published private(set) var reachable = false
    @Published private(set) var localRest: (start: Date, end: Date)? { didSet { persistLocalState() } }
    /// Only rests started here get a watch-local alert; a phone rest adjusted
    /// here keeps relying on the phone's (mirrored) notification.
    private var localRestStartedOnWatch = false { didSet { persistLocalState() } }
    /// Skip pressed on the watch while the phone (possibly locked) still
    /// reports an older rest as running.
    private var restSkippedAt: Date? { didSet { persistLocalState() } }
    private let restNotificationID = "mass-method-watch-rest"

    private var followCurrent = true
    private var restAlertTask: Task<Void, Never>?
    /// End time of the rest whose alert is currently scheduled or delivered.
    private var lastScheduledRestEnd: Date?
    private var loadingDraft = false
    private var draftEdited = false
    /// Sets completed here that the phone has not confirmed yet.
    private struct PendingCompletion: Codable {
        let exerciseIndex: Int
        let setIndex: Int
        let exerciseID: String
        let label: String
        let weight: String
        let reps: String
        let completedAt: Date
        var unconfirmedSnapshots = 0
    }
    private var pendingCompletions: [PendingCompletion] = [] { didSet { persistLocalState() } }

    /// watchOS can terminate the suspended watch app mid-workout while the
    /// phone is locked. Local completions and rests are kept on disk so a
    /// relaunch doesn't reopen a logged set or drop the rest alert.
    private struct LocalState: Codable {
        let workoutId: String
        let pending: [PendingCompletion]
        let restStart: Date?
        let restEnd: Date?
        let startedOnWatch: Bool
        let skippedAt: Date?
    }
    private static let localStateKey = "MassMethodWatchLocalState"
    private var restoredWorkoutId: String?

    private func persistLocalState() {
        let defaults = UserDefaults.standard
        guard let workoutId = snapshot?.workoutId ?? restoredWorkoutId,
              !(pendingCompletions.isEmpty && localRest == nil && restSkippedAt == nil),
              let data = try? JSONEncoder().encode(LocalState(workoutId: workoutId, pending: pendingCompletions, restStart: localRest?.start, restEnd: localRest?.end, startedOnWatch: localRestStartedOnWatch, skippedAt: restSkippedAt)) else {
            defaults.removeObject(forKey: Self.localStateKey)
            return
        }
        defaults.set(data, forKey: Self.localStateKey)
    }

    override init() {
        super.init()
        if let data = UserDefaults.standard.data(forKey: Self.localStateKey),
           let saved = try? JSONDecoder().decode(LocalState.self, from: data) {
            restoredWorkoutId = saved.workoutId
            pendingCompletions = saved.pending
            if let start = saved.restStart, let end = saved.restEnd { localRest = (start, end) }
            localRestStartedOnWatch = saved.startedOnWatch
            restSkippedAt = saved.skippedAt
        }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private var snapshotRest: (start: Date, end: Date)? {
        guard let rest = snapshot?.rest, rest.running, let endsAt = rest.endsAt else { return nil }
        let start = Date(timeIntervalSince1970: (rest.startedAt ?? endsAt) / 1000)
        if let skipped = restSkippedAt, start <= skipped { return nil }
        let end = Date(timeIntervalSince1970: endsAt / 1000)
        return end > Date() ? (start, end) : nil
    }

    var exercise: WatchSnapshot.Exercise? {
        guard let snapshot, snapshot.exercises.indices.contains(selectedExercise) else { return nil }
        return snapshot.exercises[selectedExercise]
    }

    var nextSet: WatchSnapshot.WorkoutSet? {
        exercise?.sets.first { !$0.done }
    }

    var restEndsAt: Date? {
        if let localRest, localRest.end > Date() { return localRest.end }
        return snapshotRest?.end
    }

    var restStartedAt: Date {
        if let localRest, localRest.end > Date() { return localRest.start }
        return snapshotRest?.start ?? Date()
    }

    var weightStep: Double {
        snapshot?.unit == "kg" ? 1.25 : 2.5
    }

    func move(by offset: Int) {
        guard let count = snapshot?.exercises.count, count > 0 else { return }
        selectedExercise = (selectedExercise + offset + count) % count
        followCurrent = false
        loadDraft()
    }

    /// Superset rules from the phone (toolkit completeSet): no rest while a
    /// partner's matching working (or drop) set is still open; that partner
    /// is what to do next.
    private static func supersetNext(in snapshot: WatchSnapshot, exerciseIndex: Int, setIndex: Int) -> (restFollows: Bool, partner: Int?) {
        let exercise = snapshot.exercises[exerciseIndex]
        // Older iPhone builds send only a precomputed flag.
        guard let group = exercise.group else { return (exercise.restAfterNext != false, nil) }
        guard !group.isEmpty, exercise.sets.indices.contains(setIndex) else { return (true, nil) }
        let set = exercise.sets[setIndex]
        let ordinal = exercise.sets.prefix(setIndex + 1).filter { $0.drop == set.drop }.count
        let partner = snapshot.exercises.indices.first { index in
            guard index != exerciseIndex, snapshot.exercises[index].group == group else { return false }
            let matching = snapshot.exercises[index].sets.filter { $0.drop == set.drop }
            return matching.count >= ordinal && !matching[ordinal - 1].done
        }
        return (partner == nil, partner)
    }

    func completeSet() {
        guard var current = snapshot, let exercise, let set = nextSet else { return }
        let exerciseIndex = selectedExercise
        let weightText = exercise.repsOnly ? "" : Self.format(weight)
        let repsText = Self.formatReps(reps)
        let completedAt = Date()
        // Apply locally so the next set and the rest timer appear immediately.
        pendingCompletions.append(PendingCompletion(exerciseIndex: exercise.index, setIndex: set.index, exerciseID: exercise.id ?? "", label: set.label, weight: weightText, reps: repsText, completedAt: completedAt))
        Self.markDone(&current, exerciseIndex: exerciseIndex, setIndex: set.index, weight: weightText, reps: repsText)
        snapshot = current
        let (restFollows, partner) = Self.supersetNext(in: current, exerciseIndex: exerciseIndex, setIndex: set.index)
        let restEnds = completedAt.addingTimeInterval(max(15, exercise.rest ?? 120))
        // No rest after the workout's last set (the phone skips it too).
        let anyOpen = current.exercises.contains { $0.sets.contains { !$0.done } }
        if !anyOpen {
            // Workout done: no rest screen or alert from an earlier rest.
            localRest = nil
            restSkippedAt = completedAt
        } else if restFollows {
            localRest = (completedAt, restEnds)
            localRestStartedOnWatch = true
        }
        followCurrent = true
        draftEdited = false
        let group = exercise.group ?? ""
        if let partner {
            selectedExercise = partner
        } else if !group.isEmpty, let first = current.exercises.firstIndex(where: { $0.group == group && $0.sets.contains { !$0.done } }) {
            // Superset round finished: back to its first exercise.
            selectedExercise = first
        } else if current.exercises[exerciseIndex].sets.allSatisfy(\.done),
                  let next = current.exercises.firstIndex(where: { $0.sets.contains { !$0.done } }) {
            selectedExercise = next
        }
        loadDraft()
        let upcoming = self.exercise
        let upcomingSet = nextSet
        send([
            "commandId": UUID().uuidString,
            "sentAt": completedAt.timeIntervalSince1970 * 1000,
            "action": "completeSet",
            "workoutId": current.workoutId ?? "",
            "exerciseId": exercise.id ?? "",
            "exIndex": exercise.index,
            "setIndex": set.index,
            "setLabel": set.label,
            "weight": weightText,
            // The phone converts if its units changed while this was in flight.
            "unit": current.unit,
            "reps": repsText,
            "completedAt": completedAt.timeIntervalSince1970 * 1000,
            // Lets a locked iPhone show this rest on the Lock Screen.
            "restEndsAt": restFollows && anyOpen ? restEnds.timeIntervalSince1970 * 1000 : 0,
            "workoutTitle": current.title,
            "exerciseName": upcomingSet == nil ? "Workout complete" : (upcoming?.name ?? exercise.name),
            "nextSetLabel": upcomingSet.map { "Set \($0.label) of \(upcoming?.sets.count ?? 0)" } ?? "",
            "completedSets": current.completedSets,
            "totalSets": current.totalSets
        ])
        scheduleRestAlert()
        WKInterfaceDevice.current().play(.success)
    }

    func adjustRest(_ seconds: Int) {
        // The rest this command is aimed at, captured before changing it.
        let targetEndsAt = (restEndsAt?.timeIntervalSince1970 ?? 0) * 1000
        // Adjust whichever rest is showing, even one the phone started.
        let current = (localRest.flatMap { $0.end > Date() ? $0 : nil }) ?? snapshotRest
        if let rest = current {
            localRestStartedOnWatch = localRest != nil && localRestStartedOnWatch
            localRest = (rest.start, max(Date().addingTimeInterval(1), rest.end.addingTimeInterval(TimeInterval(seconds))))
            scheduleRestAlert()
        }
        send(["commandId": UUID().uuidString, "sentAt": Date().timeIntervalSince1970 * 1000, "action": "adjustRest", "seconds": seconds, "workoutId": snapshot?.workoutId ?? "", "restEndsAt": targetEndsAt])
    }

    func skipRest() {
        let targetEndsAt = (restEndsAt?.timeIntervalSince1970 ?? 0) * 1000
        localRest = nil
        restSkippedAt = Date()
        restAlertTask?.cancel()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [restNotificationID])
        send(["commandId": UUID().uuidString, "sentAt": Date().timeIntervalSince1970 * 1000, "action": "skipRest", "workoutId": snapshot?.workoutId ?? "", "restEndsAt": targetEndsAt])
        objectWillChange.send()
    }

    private func send(_ command: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: command),
              let text = String(data: data, encoding: .utf8) else { return }
        let session = WCSession.default
        let message = ["command": text]
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { _ in
                session.transferUserInfo(message)
            }
        } else {
            // Delivered when the iPhone app next runs; the phone applies it by
            // workout, exercise, and set, using completedAt for the rest timer.
            session.transferUserInfo(message)
        }
    }

    /// The phone may have reordered exercises: prefer the exact position, else
    /// the first exercise with the same id whose set with that label is open.
    /// Only one set is ever matched, even when an exercise appears twice.
    private static func locate(_ pending: PendingCompletion, in snapshot: WatchSnapshot) -> (exercise: Int, set: Int)? {
        if snapshot.exercises.indices.contains(pending.exerciseIndex) {
            let exercise = snapshot.exercises[pending.exerciseIndex]
            if (exercise.id ?? "") == pending.exerciseID, exercise.sets.indices.contains(pending.setIndex), exercise.sets[pending.setIndex].label == pending.label {
                return (pending.exerciseIndex, pending.setIndex)
            }
        }
        for (exerciseIndex, exercise) in snapshot.exercises.enumerated() where (exercise.id ?? "") == pending.exerciseID {
            if let setIndex = exercise.sets.firstIndex(where: { $0.label == pending.label && !$0.done }) {
                return (exerciseIndex, setIndex)
            }
        }
        return nil
    }

    private static func markDone(_ snapshot: inout WatchSnapshot, exerciseIndex: Int, setIndex: Int, weight: String, reps: String) {
        guard snapshot.exercises.indices.contains(exerciseIndex),
              snapshot.exercises[exerciseIndex].sets.indices.contains(setIndex),
              !snapshot.exercises[exerciseIndex].sets[setIndex].done else { return }
        snapshot.exercises[exerciseIndex].sets[setIndex].done = true
        snapshot.exercises[exerciseIndex].sets[setIndex].weight = weight
        snapshot.exercises[exerciseIndex].sets[setIndex].reps = reps
        snapshot.completedSets += 1
    }

    private func apply(_ text: String) {
        guard let data = text.data(using: .utf8),
              var next = try? JSONDecoder().decode(WatchSnapshot.self, from: data) else { return }
        if next.workoutId != (snapshot?.workoutId ?? restoredWorkoutId) || !next.active {
            pendingCompletions.removeAll()
            localRest = nil
        }
        // Keep local completions the phone has not caught up with yet. If the
        // phone keeps publishing without them, stop showing them as done.
        pendingCompletions = pendingCompletions.compactMap { pending in
            var pending = pending
            guard let (exerciseIndex, setIndex) = Self.locate(pending, in: next) else { return nil }
            if next.exercises[exerciseIndex].sets[setIndex].done { return nil }
            pending.unconfirmedSnapshots += 1
            if pending.unconfirmedSnapshots > 6, Date().timeIntervalSince(pending.completedAt) > 120 { return nil }
            Self.markDone(&next, exerciseIndex: exerciseIndex, setIndex: setIndex, weight: pending.weight, reps: pending.reps)
            return pending
        }
        if pendingCompletions.isEmpty {
            localRest = nil
            localRestStartedOnWatch = false
        }
        // A rest the phone started after the watch's Skip replaces the skip.
        if let skipped = restSkippedAt, let started = next.rest.startedAt, Date(timeIntervalSince1970: started / 1000) > skipped {
            restSkippedAt = nil
        }
        guard next != snapshot else { return }
        let previousSet = nextSet?.index
        let previousExercise = selectedExercise
        let previousValues = nextSet.map { [$0.weight, $0.reps, $0.suggestedWeight ?? "", $0.suggestedReps ?? ""] }
        let previousUnit = snapshot?.unit
        snapshot = next
        if followCurrent || !next.exercises.indices.contains(selectedExercise) {
            selectedExercise = next.exercises.indices.contains(next.currentExercise) ? next.currentExercise : 0
        }
        // Typed values or the phone's suggestion for the target set changed.
        let valuesChanged = nextSet.map { [$0.weight, $0.reps, $0.suggestedWeight ?? "", $0.suggestedReps ?? ""] != (previousValues ?? ["", "", "", ""]) } ?? false
        // Reload when the target set moved, or when the phone typed new values
        // and the athlete has not started editing on the watch.
        // A unit switch on the phone makes any draft number meaningless.
        let unitChanged = previousUnit != nil && previousUnit != next.unit
        if unitChanged || previousExercise != selectedExercise || previousSet != nextSet?.index || (valuesChanged && !draftEdited) {
            loadDraft()
        }
        scheduleRestAlert()
    }

    private func loadDraft() {
        guard let exercise else { return }
        let set = exercise.sets.first { !$0.done }
        loadingDraft = true
        // The phone's number inputs accept anything ("1e400", 20 digits); an
        // unclamped value would trap in Int() and crash the watch on every
        // launch until the phone edited that set.
        // Same rule as the phone: a working set follows the working set just
        // done (on this watch too, while the iPhone is locked); a drop follows
        // last session's matching drop, never the working weight.
        let lastDone = set.flatMap { target in exercise.sets.last { $0.done && $0.drop == target.drop } }
        // A first-ever drop starts from today's working weight.
        let lastWorking = exercise.sets.last { $0.done && !$0.drop }
        let candidates: [(String?, String?)] = set?.drop == true
            ? [(set?.suggestedWeight, set?.suggestedReps), (lastDone?.weight, lastDone?.reps), (lastWorking?.weight, lastWorking?.reps)]
            : [(lastDone?.weight, lastDone?.reps), (set?.suggestedWeight, set?.suggestedReps)]
        let pickedWeight = set?.weight.isEmpty == false ? set!.weight : (candidates.compactMap { $0.0 }.first { !$0.isEmpty } ?? exercise.suggestedWeight)
        let pickedReps = set?.reps.isEmpty == false ? set!.reps : (candidates.compactMap { $0.1 }.first { !$0.isEmpty } ?? exercise.suggestedReps)
        weight = Self.clampWeight(Double(pickedWeight) ?? 0)
        reps = Self.clampReps(Double(pickedReps) ?? 8)
        loadingDraft = false
        draftEdited = false
    }

    private func scheduleRestAlert() {
        restAlertTask?.cancel()
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [restNotificationID])
        guard let endsAt = restEndsAt else { return }
        // A rest started on the watch has no phone notification behind it
        // (the phone may be locked), so the watch schedules its own; it fires
        // even with the wrist down when the app is suspended.
        // Clear the previous rest's delivered alert so they don't pile up in
        // Notification Center, but only when a different rest starts: a late
        // phone snapshot for the same rest must not dismiss the alert that
        // just fired before the athlete has seen it.
        if let previous = lastScheduledRestEnd, previous != endsAt {
            center.removeDeliveredNotifications(withIdentifiers: [restNotificationID])
        }
        lastScheduledRestEnd = endsAt
        if localRestStartedOnWatch, let localRest, localRest.end == endsAt {
            let content = UNMutableNotificationContent()
            content.title = "Rest complete"
            content.body = "Your next set is ready."
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, endsAt.timeIntervalSinceNow), repeats: false)
            center.add(UNNotificationRequest(identifier: restNotificationID, content: content, trigger: trigger))
        }
        restAlertTask = Task { [weak self] in
            let delay = endsAt.timeIntervalSinceNow
            if delay > 0 { try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) }
            guard !Task.isCancelled else { return }
            // Woken long after the rest ended (the app was suspended and the
            // local notification already alerted): don't buzz a second time.
            guard endsAt.timeIntervalSinceNow > -2 else {
                self?.objectWillChange.send()
                return
            }
            WKInterfaceDevice.current().play(.notification)
            self?.objectWillChange.send()
        }
    }

    static let maxWeight: Double = 2000
    static let maxReps: Double = 200

    static func clampWeight(_ value: Double) -> Double {
        value.isFinite ? min(max(value, 0), maxWeight) : 0
    }

    static func clampReps(_ value: Double) -> Double {
        value.isFinite ? min(max(value.rounded(), 1), maxReps) : 8
    }

    static func format(_ value: Double) -> String {
        let safe = clampWeight(value)
        return safe.rounded() == safe ? String(Int(safe)) : String(format: "%.2f", safe).replacingOccurrences(of: #"\.?0+$"#, with: "", options: .regularExpression)
    }

    static func formatReps(_ value: Double) -> String {
        String(Int(clampReps(value)))
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext
        let reachable = session.isReachable
        Task { @MainActor in
            self.reachable = reachable
            if let text = context["snapshot"] as? String { self.apply(text) }
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in self.reachable = reachable }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let text = applicationContext["snapshot"] as? String else { return }
        Task { @MainActor in self.apply(text) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard let text = message["snapshot"] as? String else { return }
        Task { @MainActor in self.apply(text) }
    }
}
