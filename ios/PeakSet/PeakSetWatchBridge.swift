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

    func publish(snapshotJSON: String) {
        lock.lock()
        pendingSnapshot = snapshotJSON
        lock.unlock()
        flushSnapshot()
    }

    private func flushSnapshot() {
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
            PeakSetLiveActivityManager.shared.end()
        case "completeSet":
            let endsAtMs = (command["restEndsAt"] as? NSNumber)?.doubleValue ?? 0
            guard endsAtMs > 0 else { return }
            let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
            guard endsAt > Date() else { return }
            // The watch alerts for its own rests, so only the Lock Screen
            // countdown is updated here (no phone notification).
            PeakSetLiveActivityManager.shared.show(.init(
                startedAt: Date(),
                endsAt: endsAt,
                workoutTitle: command["workoutTitle"] as? String ?? "Mass Method",
                exerciseName: command["exerciseName"] as? String ?? "Next set",
                nextSetLabel: "",
                completedSets: (command["completedSets"] as? NSNumber)?.intValue ?? 0,
                totalSets: (command["totalSets"] as? NSNumber)?.intValue ?? 0
            ))
        case "adjustRest":
            let seconds = (command["seconds"] as? NSNumber)?.doubleValue ?? 0
            guard seconds != 0 else { return }
            PeakSetTimerService.shared.shift(by: seconds)
            PeakSetLiveActivityManager.shared.shift(by: seconds)
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
