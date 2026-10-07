import SwiftUI
import UIKit
import AVFoundation
import UserNotifications

private enum PeakSetAudioSession {
    static func activate() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
    }
}

final class PeakSetAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // JavaScript plays the native bell while PeakSet is foregrounded.
        // The local notification supplies the bell only when iOS suspends the app.
        completionHandler([])
    }
}

@main
struct PeakSetApp: App {
    @UIApplicationDelegateAdaptor(PeakSetAppDelegate.self) private var appDelegate

    init() {
        // Prevent iOS from presenting the system Undo/Redo prompt when the
        // device is shaken while PeakSet is running.
        UIApplication.shared.applicationSupportsShakeToEdit = false
        PeakSetAudioSession.activate()
    }

    var body: some Scene {
        WindowGroup {
            PeakSetWebView()
                .ignoresSafeArea()
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                    PeakSetAudioSession.activate()
                }
        }
    }
}
