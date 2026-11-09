import Foundation
import UIKit
import WidgetKit

/// Phone side of the Home Screen and Lock Screen widgets. The web app posts
/// a small JSON summary (debounced) on every state change; it is stored in
/// the App Group, where the widget extension reads it.
///
/// iOS budgets widget reloads, so they are throttled: at most one per
/// `minimumReloadInterval` while the app is open, and any reload still
/// waiting is sent as soon as the app goes to the background.
/// Only used on the main thread (script message handlers).
final class PeakSetWidgetBridge {
    static let shared = PeakSetWidgetBridge()

    private let minimumReloadInterval: TimeInterval = 60
    private var lastReload: Date?
    private var pendingReload: DispatchWorkItem?
    private var backgroundObserver: NSObjectProtocol?

    private init() {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.flushPendingReload()
        }
    }

    func publish(summaryJSON: String) {
        // Only a summary the widget can read is stored.
        guard let data = summaryJSON.data(using: .utf8),
              MassMethodWidgetSummary.decode(data) != nil,
              let defaults = UserDefaults(suiteName: MassMethodWidgetSummary.appGroup) else { return }
        guard defaults.data(forKey: MassMethodWidgetSummary.storeKey) != data else { return }
        defaults.set(data, forKey: MassMethodWidgetSummary.storeKey)
        requestReload()
    }

    private func requestReload() {
        guard pendingReload == nil else { return }
        let wait = lastReload.map { minimumReloadInterval - Date().timeIntervalSince($0) } ?? 0
        guard wait > 0 else { return reloadNow() }
        let item = DispatchWorkItem { [weak self] in self?.reloadNow() }
        pendingReload = item
        DispatchQueue.main.asyncAfter(deadline: .now() + wait, execute: item)
    }

    private func flushPendingReload() {
        if pendingReload != nil { reloadNow() }
    }

    private func reloadNow() {
        pendingReload?.cancel()
        pendingReload = nil
        lastReload = Date()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
