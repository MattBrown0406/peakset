import SwiftUI
import UIKit
import AVFoundation

private enum PeakSetAudioSession {
    static func activate() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
    }
}

@main
struct PeakSetApp: App {
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
