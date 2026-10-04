import SwiftUI

@main
struct MassMethodWatchApp: App {
    @StateObject private var model = WatchWorkoutModel()

    var body: some Scene {
        WindowGroup {
            WatchWorkoutView()
                .environmentObject(model)
        }
    }
}
