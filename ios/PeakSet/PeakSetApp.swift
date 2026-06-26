import SwiftUI

@main
struct PeakSetApp: App {
    var body: some Scene {
        WindowGroup {
            PeakSetWebView()
                .ignoresSafeArea()
        }
    }
}
