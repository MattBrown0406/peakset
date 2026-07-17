import SwiftUI
import UIKit

@main
struct PeakSetApp: App {
    init() {
        // Prevent iOS from presenting the system Undo/Redo prompt when the
        // device is shaken while PeakSet is running.
        UIApplication.shared.applicationSupportsShakeToEdit = false
    }

    var body: some Scene {
        WindowGroup {
            PeakSetWebView()
                .ignoresSafeArea()
        }
    }
}
