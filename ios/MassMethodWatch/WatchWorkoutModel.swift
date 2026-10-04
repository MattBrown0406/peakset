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
    }

    struct Exercise: Codable, Equatable {
        let index: Int
        let id: String?
        let rest: Double?
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
    @Published private(set) var localRest: (start: Date, end: Date)?
    /// Skip pressed on the watch while the phone (possibly locked) still
    /// reports an older rest as running.
    private var restSkippedAt: Date?
    private let restNotificationID = "mass-method-watch-rest"

    private var followCurrent = true
    private var restAlertTask: Task<Void, Never>?
    private var loadingDraft = false
    private var draftEdited = false
    /// Sets completed here that the phone has not confirmed yet.
    private struct PendingCompletion {
        let exerciseIndex: Int
        let setIndex: Int
        let exerciseID: String
        let label: String
        let weight: String
        let reps: String
        let completedAt: Date
        var unconfirmedSnapshots = 0
    }
    private var pendingCompletions: [PendingCompletion] = []

    override init() {
        super.init()
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

    func completeSet() {
        guard var current = snapshot, let exercise, let set = nextSet else { return }
        let weightText = exercise.repsOnly ? "" : Self.format(weight)
        let repsText = String(Int(reps.rounded()))
        send([
            "commandId": UUID().uuidString,
            "sentAt": Date().timeIntervalSince1970 * 1000,
            "action": "completeSet",
            "workoutId": current.workoutId ?? "",
            "exerciseId": exercise.id ?? "",
            "exIndex": exercise.index,
            "setIndex": set.index,
            "setLabel": set.label,
            "weight": weightText,
            "reps": repsText,
            "completedAt": Date().timeIntervalSince1970 * 1000
        ])
        // Apply locally so the next set and the rest timer appear immediately.
        pendingCompletions.append(PendingCompletion(exerciseIndex: exercise.index, setIndex: set.index, exerciseID: exercise.id ?? "", label: set.label, weight: weightText, reps: repsText, completedAt: Date()))
        Self.markDone(&current, exerciseIndex: selectedExercise, setIndex: set.index, weight: weightText, reps: repsText)
        snapshot = current
        let restSeconds = max(15, exercise.rest ?? 120)
        localRest = (Date(), Date().addingTimeInterval(restSeconds))
        followCurrent = true
        draftEdited = false
        if current.exercises[selectedExercise].sets.allSatisfy(\.done),
           let next = current.exercises.firstIndex(where: { $0.sets.contains { !$0.done } }) {
            selectedExercise = next
        }
        loadDraft()
        scheduleRestAlert()
        WKInterfaceDevice.current().play(.success)
    }

    func adjustRest(_ seconds: Int) {
        // Adjust whichever rest is showing, even one the phone started.
        let current = (localRest.flatMap { $0.end > Date() ? $0 : nil }) ?? snapshotRest
        if let rest = current {
            localRest = (rest.start, max(Date().addingTimeInterval(1), rest.end.addingTimeInterval(TimeInterval(seconds))))
            scheduleRestAlert()
        }
        send(["commandId": UUID().uuidString, "sentAt": Date().timeIntervalSince1970 * 1000, "action": "adjustRest", "seconds": seconds, "workoutId": snapshot?.workoutId ?? ""])
    }

    func skipRest() {
        localRest = nil
        restSkippedAt = Date()
        restAlertTask?.cancel()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [restNotificationID])
        send(["commandId": UUID().uuidString, "sentAt": Date().timeIntervalSince1970 * 1000, "action": "skipRest", "workoutId": snapshot?.workoutId ?? ""])
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
        if next.workoutId != snapshot?.workoutId || !next.active {
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
        if pendingCompletions.isEmpty { localRest = nil }
        // A rest the phone started after the watch's Skip replaces the skip.
        if let skipped = restSkippedAt, let started = next.rest.startedAt, Date(timeIntervalSince1970: started / 1000) > skipped {
            restSkippedAt = nil
        }
        guard next != snapshot else { return }
        let previousSet = nextSet?.index
        let previousExercise = selectedExercise
        let previousValues = nextSet.map { ($0.weight, $0.reps) }
        let previousUnit = snapshot?.unit
        snapshot = next
        if followCurrent || !next.exercises.indices.contains(selectedExercise) {
            selectedExercise = next.exercises.indices.contains(next.currentExercise) ? next.currentExercise : 0
        }
        let valuesChanged = nextSet.map { ($0.weight, $0.reps) }.map { $0 != (previousValues?.0 ?? "", previousValues?.1 ?? "") } ?? false
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
        weight = Double(set?.weight.isEmpty == false ? set!.weight : exercise.suggestedWeight) ?? 0
        reps = Double(set?.reps.isEmpty == false ? set!.reps : exercise.suggestedReps) ?? 8
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
        if let localRest, localRest.end == endsAt {
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
            WKInterfaceDevice.current().play(.notification)
            self?.objectWillChange.send()
        }
    }

    static func format(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value).replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
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
