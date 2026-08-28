import SwiftUI
import UIKit

@main
struct PeakSetApp: App {
    init() {
        UIApplication.shared.applicationSupportsShakeToEdit = false
    }

    var body: some Scene {
        WindowGroup {
            PeakSetWebView()
                .ignoresSafeArea()
        }
    }
}
