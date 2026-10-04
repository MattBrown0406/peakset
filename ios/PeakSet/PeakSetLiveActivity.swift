import ActivityKit
import Foundation

/// Mirrors the rest timer onto the Lock Screen and Dynamic Island.
/// Operations run one at a time on the main actor so a quick end-then-show
/// never ends the new activity or leaves two on screen.
@MainActor
final class PeakSetLiveActivityManager {
    static let shared = PeakSetLiveActivityManager()
    private var queue: Task<Void, Never>?

    private init() {}

    struct Rest: Sendable {
        let startedAt: Date
        let endsAt: Date
        let workoutTitle: String
        let exerciseName: String
        let nextSetLabel: String
        let completedSets: Int
        let totalSets: Int
    }

    nonisolated func show(_ rest: Rest) {
        Task { @MainActor in self.enqueue { await self.performShow(rest) } }
    }

    nonisolated func shift(by seconds: TimeInterval) {
        Task { @MainActor in
            self.enqueue {
                for activity in Activity<RestTimerAttributes>.activities {
                    var state = activity.content.state
                    state.endsAt = state.endsAt.addingTimeInterval(seconds)
                    if state.endsAt <= Date() {
                        await activity.end(nil, dismissalPolicy: .immediate)
                    } else {
                        await activity.update(ActivityContent(state: state, staleDate: state.endsAt))
                    }
                }
            }
        }
    }

    nonisolated func end() {
        Task { @MainActor in self.enqueue { await self.endAll() } }
    }

    private func enqueue(_ operation: @escaping @MainActor () async -> Void) {
        let previous = queue
        queue = Task { @MainActor in
            await previous?.value
            await operation()
        }
    }

    private func performShow(_ rest: Rest) async {
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

    private func endAll() async {
        for activity in Activity<RestTimerAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
