import Foundation
import UIKit
import WatchConnectivity

/// Phone side of the watch link. The web app publishes a workout snapshot;
/// the watch sends back commands (complete set, adjust or skip rest) that
/// are forwarded to `window.handleWatchCommand`.
///
/// Activated at app launch (not after the page loads). Every command is
/// persisted until the web app acknowledges applying it, so a set completed
/// on the watch survives a background launch, a suspended web view, or the
/// app being killed before it was applied.
final class PeakSetWatchBridge: NSObject, WCSessionDelegate {
    typealias CommandHandler = (_ command: [String: Any], _ acknowledge: @escaping () -> Void) -> Void
    static let shared = PeakSetWatchBridge()

    private let lock = NSLock()
    private let storeKey = "MassMethodPendingWatchCommands"
    /// Commands the page already applied. A transferUserInfo copy can arrive
    /// after the sendMessage copy was acknowledged; it must not be applied
    /// natively again (it would cancel the rest notification the page
    /// rescheduled).
    private let acknowledgedKey = "MassMethodAcknowledgedWatchCommands"
    private var commandHandler: CommandHandler?
    private var pendingSnapshot: String?
    private var lastSentSnapshot = ""

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        if session.delegate == nil { session.delegate = self }
        if session.activationState != .activated { session.activate() }
    }

    /// Attaches the web app and delivers every unacknowledged command.
    func attach(_ handler: @escaping CommandHandler) {
        lock.lock()
        commandHandler = handler
        lock.unlock()
        storedCommands().forEach(deliver)
    }

    /// Called when the web content process dies; commands queue until reload.
    func detach() {
        lock.lock()
        commandHandler = nil
        lock.unlock()
    }

    private func storedCommands() -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return (UserDefaults.standard.stringArray(forKey: storeKey) ?? []).compactMap { text in
            text.data(using: .utf8).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        }
    }

    private func store(_ command: [String: Any]) -> Bool {
        guard let id = command["commandId"] as? String,
              let data = try? JSONSerialization.data(withJSONObject: command),
              let text = String(data: data, encoding: .utf8) else { return false }
        lock.lock()
        defer { lock.unlock() }
        if (UserDefaults.standard.stringArray(forKey: acknowledgedKey) ?? []).contains(id) { return false }
        var stored = UserDefaults.standard.stringArray(forKey: storeKey) ?? []
        if stored.contains(where: { $0.contains("\"commandId\":\"\(id)\"") }) { return false }
        stored.append(text)
        UserDefaults.standard.set(Array(stored.suffix(200)), forKey: storeKey)
        return true
    }

    private func acknowledge(_ id: String) {
        lock.lock()
        defer { lock.unlock() }
        let stored = UserDefaults.standard.stringArray(forKey: storeKey) ?? []
        UserDefaults.standard.set(stored.filter { !$0.contains("\"commandId\":\"\(id)\"") }, forKey: storeKey)
        let acknowledged = (UserDefaults.standard.stringArray(forKey: acknowledgedKey) ?? []).filter { $0 != id } + [id]
        UserDefaults.standard.set(Array(acknowledged.suffix(200)), forKey: acknowledgedKey)
    }

    private func deliver(_ command: [String: Any]) {
        lock.lock()
        let handler = commandHandler
        lock.unlock()
        guard let handler, let id = command["commandId"] as? String else { return }
        DispatchQueue.main.async { [weak self] in
            handler(command) { self?.acknowledge(id) }
        }
    }

    /// Whether the web app's latest snapshot has a workout in progress. Only
    /// touched on main (script message handlers).
    @MainActor private(set) var workoutActive = false
    /// The in-app Lock Screen setting, mirrored from snapshots for commands
    /// handled while the web app is paused.
    private static let liveActivityKey = "MassMethodLiveActivityEnabled"

    /// The latest active-workout snapshot, for the ready-state Live Activity.
    @MainActor private var activeSnapshot: [String: Any]?

    @MainActor func publish(snapshotJSON: String) {
        let parsed = snapshotJSON.data(using: .utf8).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
        let active = parsed?["active"] as? Bool ?? false
        if let enabled = parsed?["liveActivity"] as? Bool {
            UserDefaults.standard.set(enabled, forKey: Self.liveActivityKey)
        }
        // The Lock Screen activity lives for the whole workout.
        if workoutActive, !active { PeakSetLiveActivityManager.shared.end() }
        let started = active && !workoutActive
        workoutActive = active
        activeSnapshot = active ? parsed : nil
        if started { ensureLiveActivity() }
        lock.lock()
        pendingSnapshot = snapshotJSON
        lock.unlock()
        flushSnapshot()
    }

    /// Shows the workout's Lock Screen activity in its ready state if none is
    /// running (foreground only; a no-op when one already exists).
    @MainActor func ensureLiveActivity() {
        guard workoutActive, let snapshot = activeSnapshot,
              UIApplication.shared.applicationState == .active,
              UserDefaults.standard.object(forKey: Self.liveActivityKey) as? Bool ?? true else { return }
        let exercises = snapshot["exercises"] as? [[String: Any]] ?? []
        let current = (snapshot["currentExercise"] as? NSNumber)?.intValue ?? 0
        let exerciseName = exercises.indices.contains(current) ? exercises[current]["name"] as? String ?? "Next set" : "Next set"
        PeakSetLiveActivityManager.shared.showReady(
            workoutTitle: snapshot["title"] as? String ?? "Mass Method",
            exerciseName: exerciseName,
            completedSets: (snapshot["completedSets"] as? NSNumber)?.intValue ?? 0,
            totalSets: (snapshot["totalSets"] as? NSNumber)?.intValue ?? 0
        )
    }

    private func flushSnapshot() {
        // Delegate callbacks and publish() both flush; one queue keeps an older
        // snapshot from landing after a newer one.
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.flushSnapshot() }
            return
        }
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        lock.lock()
        let snapshot = pendingSnapshot
        let alreadySent = snapshot == lastSentSnapshot
        lock.unlock()
        guard let snapshot, !alreadySent,
              session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        do {
            try session.updateApplicationContext(["snapshot": snapshot, "sentAt": Date().timeIntervalSince1970])
            lock.lock()
            lastSentSnapshot = snapshot
            lock.unlock()
        } catch {
            return
        }
        if session.isReachable {
            session.sendMessage(["snapshot": snapshot], replyHandler: nil, errorHandler: nil)
        }
    }

    private func forward(_ message: [String: Any]) {
        guard let text = message["command"] as? String,
              let data = text.data(using: .utf8),
              var command = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if (command["commandId"] as? String)?.isEmpty != false { command["commandId"] = UUID().uuidString }
        // A command already stored (sendMessage plus its transferUserInfo
        // fallback) is delivered once.
        guard store(command) else { return }
        DispatchQueue.main.async {
            // With the phone locked the web app is paused, so rest commands
            // must reach the notification and Live Activity natively. When the
            // web app later applies the same command it computes the same end
            // time from its own state, so nothing is applied twice.
            if UIApplication.shared.applicationState != .active {
                Self.applyRestCommandNatively(command)
            }
            self.deliver(command)
        }
    }

    @MainActor private static func applyRestCommandNatively(_ command: [String: Any]) {
        switch command["action"] as? String {
        case "skipRest":
            PeakSetTimerService.shared.cancel()
            PeakSetLiveActivityManager.shared.settle()
        case "completeSet":
            let endsAtMs = (command["restEndsAt"] as? NSNumber)?.doubleValue ?? 0
            guard endsAtMs > 0 else { return }
            let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
            guard endsAt > Date() else { return }
            // This rest replaces any phone rest still pending, so its
            // notification must not fire mid-rest (the watch alerts itself).
            PeakSetTimerService.shared.cancel()
            guard UserDefaults.standard.object(forKey: liveActivityKey) as? Bool ?? true else { return }
            // The watch alerts for its own rests, so only the Lock Screen
            // countdown is updated here (no phone notification).
            // The rest began when the set was finished on the watch.
            let completedAtMs = (command["completedAt"] as? NSNumber)?.doubleValue ?? 0
            let completedAt = Date(timeIntervalSince1970: completedAtMs / 1000)
            PeakSetLiveActivityManager.shared.show(.init(
                startedAt: completedAtMs > 0 && completedAt <= Date() && completedAt < endsAt ? completedAt : Date(),
                endsAt: endsAt,
                workoutTitle: command["workoutTitle"] as? String ?? "Mass Method",
                exerciseName: command["exerciseName"] as? String ?? "Next set",
                nextSetLabel: command["nextSetLabel"] as? String ?? "",
                completedSets: (command["completedSets"] as? NSNumber)?.intValue ?? 0,
                totalSets: (command["totalSets"] as? NSNumber)?.intValue ?? 0
            ))
        case "adjustRest":
            let seconds = (command["seconds"] as? NSNumber)?.doubleValue ?? 0
            guard seconds != 0 else { return }
            // Only move the phone's notification if it belongs to the rest the
            // watch adjusted.
            let targetMs = (command["restEndsAt"] as? NSNumber)?.doubleValue ?? 0
            let target = targetMs > 0 ? Date(timeIntervalSince1970: targetMs / 1000) : nil
            PeakSetTimerService.shared.shift(by: seconds, ifEndingAt: target)
            PeakSetLiveActivityManager.shared.shift(by: seconds, ifEndingAt: target)
        default:
            break
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        flushSnapshot()
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    func sessionWatchStateDidChange(_ session: WCSession) {
        // The watch app was installed or paired: send the current workout.
        lock.lock()
        lastSentSnapshot = ""
        lock.unlock()
        flushSnapshot()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        flushSnapshot()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        forward(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        forward(message)
        replyHandler(["ok": true])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        forward(userInfo)
    }
}
