import Foundation
import WatchConnectivity

/// Phone side of the watch link. The web app publishes a workout snapshot;
/// the watch sends back commands (complete set, adjust or skip rest) that
/// are forwarded to `window.handleWatchCommand`.
final class PeakSetWatchBridge: NSObject, WCSessionDelegate {
    static let shared = PeakSetWatchBridge()
    var onCommand: (([String: Any]) -> Void)?
    private var lastSnapshot = ""

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        if session.activationState != .activated { session.activate() }
    }

    func publish(snapshotJSON: String) {
        guard WCSession.isSupported(), snapshotJSON != lastSnapshot else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        lastSnapshot = snapshotJSON
        try? session.updateApplicationContext(["snapshot": snapshotJSON, "sentAt": Date().timeIntervalSince1970])
        if session.isReachable {
            session.sendMessage(["snapshot": snapshotJSON], replyHandler: nil, errorHandler: nil)
        }
    }

    private func forward(_ message: [String: Any]) {
        guard let text = message["command"] as? String,
              let data = text.data(using: .utf8),
              let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        DispatchQueue.main.async { [weak self] in self?.onCommand?(command) }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated, !lastSnapshot.isEmpty {
            let snapshot = lastSnapshot
            lastSnapshot = ""
            publish(snapshotJSON: snapshot)
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
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
