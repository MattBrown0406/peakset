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
        // Activate early so watch commands queued while the phone was locked
        // are received even before the web app has loaded.
        PeakSetWatchBridge.shared.activate()
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
                .background(Color(red: 0.039, green: 0.055, blue: 0.102))
                .ignoresSafeArea()
                .onOpenURL { url in
                    PeakSetIncomingFiles.shared.open(url)
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                    PeakSetAudioSession.activate()
                }
        }
    }
}
