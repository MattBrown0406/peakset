import ActivityKit
import Foundation

/// Mirrors the rest timer onto the Lock Screen and Dynamic Island.
final class PeakSetLiveActivityManager {
    static let shared = PeakSetLiveActivityManager()
    private init() {}

    struct Rest {
        let startedAt: Date
        let endsAt: Date
        let workoutTitle: String
        let exerciseName: String
        let nextSetLabel: String
        let completedSets: Int
        let totalSets: Int
    }

    func show(_ rest: Rest) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled, rest.endsAt > Date() else {
            #if DEBUG
            NSLog("MassMethod Live Activity skipped: enabled=%d", ActivityAuthorizationInfo().areActivitiesEnabled ? 1 : 0)
            #endif
            return
        }
        let state = RestTimerAttributes.ContentState(
            startedAt: rest.startedAt,
            endsAt: rest.endsAt,
            exerciseName: rest.exerciseName,
            nextSetLabel: rest.nextSetLabel,
            completedSets: rest.completedSets,
            totalSets: rest.totalSets
        )
        let content = ActivityContent(state: state, staleDate: rest.endsAt)
        Task {
            if let current = Activity<RestTimerAttributes>.activities.first(where: { $0.attributes.workoutTitle == rest.workoutTitle }) {
                await current.update(content)
                for other in Activity<RestTimerAttributes>.activities where other.id != current.id {
                    await other.end(nil, dismissalPolicy: .immediate)
                }
            } else {
                await endAll()
                do {
                    _ = try Activity.request(attributes: RestTimerAttributes(workoutTitle: rest.workoutTitle), content: content, pushType: nil)
                } catch {
                    #if DEBUG
                    NSLog("MassMethod Live Activity request failed: %@", String(describing: error))
                    #endif
                }
            }
        }
    }

    func end() {
        Task { await endAll() }
    }

    private func endAll() async {
        for activity in Activity<RestTimerAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
