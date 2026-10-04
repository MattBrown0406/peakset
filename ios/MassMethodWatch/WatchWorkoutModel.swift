import Foundation
import WatchConnectivity
import WatchKit

/// Mirror of the phone's live workout, published by the web app as JSON.
struct WatchSnapshot: Codable, Equatable {
    struct WorkoutSet: Codable, Equatable {
        let index: Int
        let label: String
        let weight: String
        let reps: String
        let done: Bool
        let drop: Bool
    }

    struct Exercise: Codable, Equatable {
        let index: Int
        let name: String
        let targetReps: String
        let repsOnly: Bool
        let suggestedWeight: String
        let suggestedReps: String
        let sets: [WorkoutSet]
    }

    struct Rest: Codable, Equatable {
        let running: Bool
        let startedAt: Double?
        let endsAt: Double?
    }

    let active: Bool
    let title: String
    let unit: String
    let blockLine: String
    let completedSets: Int
    let totalSets: Int
    let currentExercise: Int
    let exercises: [Exercise]
    let rest: Rest
    let nextPlanTitle: String
}

@MainActor
final class WatchWorkoutModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var snapshot: WatchSnapshot?
    @Published var selectedExercise = 0
    @Published var weight: Double = 0
    @Published var reps: Double = 8
    @Published private(set) var reachable = false
    private var followCurrent = true
    private var restAlertTask: Task<Void, Never>?

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    var exercise: WatchSnapshot.Exercise? {
        guard let snapshot, snapshot.exercises.indices.contains(selectedExercise) else { return nil }
        return snapshot.exercises[selectedExercise]
    }

    var nextSet: WatchSnapshot.WorkoutSet? {
        exercise?.sets.first { !$0.done }
    }

    var restEndsAt: Date? {
        guard let rest = snapshot?.rest, rest.running, let endsAt = rest.endsAt else { return nil }
        let date = Date(timeIntervalSince1970: endsAt / 1000)
        return date > Date() ? date : nil
    }

    var restStartedAt: Date {
        guard let started = snapshot?.rest.startedAt else { return Date() }
        return Date(timeIntervalSince1970: started / 1000)
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
        guard let exercise, let set = nextSet else { return }
        send([
            "action": "completeSet",
            "exIndex": exercise.index,
            "setIndex": set.index,
            "weight": exercise.repsOnly ? "" : Self.format(weight),
            "reps": String(Int(reps.rounded()))
        ])
        followCurrent = true
        WKInterfaceDevice.current().play(.success)
    }

    func adjustRest(_ seconds: Int) {
        send(["action": "adjustRest", "seconds": seconds])
    }

    func skipRest() {
        send(["action": "skipRest"])
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
            session.transferUserInfo(message)
        }
    }

    private func apply(_ text: String) {
        guard let data = text.data(using: .utf8),
              let next = try? JSONDecoder().decode(WatchSnapshot.self, from: data),
              next != snapshot else { return }
        let previousSet = nextSet?.index
        let previousExercise = selectedExercise
        snapshot = next
        if followCurrent || !next.exercises.indices.contains(selectedExercise) {
            selectedExercise = next.exercises.indices.contains(next.currentExercise) ? next.currentExercise : 0
        }
        if previousExercise != selectedExercise || previousSet != nextSet?.index {
            loadDraft()
        }
        scheduleRestAlert()
    }

    private func loadDraft() {
        guard let exercise else { return }
        let set = exercise.sets.first { !$0.done }
        weight = Double(set?.weight.isEmpty == false ? set!.weight : exercise.suggestedWeight) ?? 0
        reps = Double(set?.reps.isEmpty == false ? set!.reps : exercise.suggestedReps) ?? 8
    }

    private func scheduleRestAlert() {
        restAlertTask?.cancel()
        guard let endsAt = restEndsAt else { return }
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
