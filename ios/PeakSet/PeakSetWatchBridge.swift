import Foundation
import WatchConnectivity

/// Phone side of the watch link. The web app publishes a workout snapshot;
/// the watch sends back commands (complete set, adjust or skip rest) that
/// are forwarded to `window.handleWatchCommand`.
///
/// Activated at app launch (not after the page loads) so queued watch
/// commands are received even before the web view exists; they wait in
/// `pendingCommands` until the web app attaches.
final class PeakSetWatchBridge: NSObject, WCSessionDelegate {
    static let shared = PeakSetWatchBridge()

    private let lock = NSLock()
    private var commandHandler: (([String: Any]) -> Void)?
    private var pendingCommands: [[String: Any]] = []
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

    /// Attaches the web app and delivers commands that arrived before it loaded.
    func attach(_ handler: @escaping ([String: Any]) -> Void) {
        lock.lock()
        commandHandler = handler
        let queued = pendingCommands
        pendingCommands.removeAll()
        lock.unlock()
        DispatchQueue.main.async { queued.forEach(handler) }
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
              let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        lock.lock()
        let handler = commandHandler
        if handler == nil { pendingCommands.append(command) }
        lock.unlock()
        if let handler {
            DispatchQueue.main.async { handler(command) }
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
