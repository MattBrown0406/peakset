import ActivityKit
import Foundation

/// Live Activity shared by the app (which starts and ends it) and the widget
/// extension (which draws it on the Lock Screen and in the Dynamic Island).
struct RestTimerAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startedAt: Date
        var endsAt: Date
        var exerciseName: String
        var nextSetLabel: String
        var completedSets: Int
        var totalSets: Int
    }

    var workoutTitle: String
}
