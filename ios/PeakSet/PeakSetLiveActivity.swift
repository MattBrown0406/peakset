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

    /// Starts the workout's activity in its "next set ready" state when none
    /// is running. Called at workout start and on foregrounding: iOS refuses
    /// requests from the background, so a workout logged entirely on the watch
    /// with the phone locked would otherwise never get a Lock Screen countdown.
    nonisolated func showReady(workoutTitle: String, exerciseName: String, completedSets: Int, totalSets: Int) {
        Task { @MainActor in
            self.enqueue {
                guard ActivityAuthorizationInfo().areActivitiesEnabled,
                      !Activity<RestTimerAttributes>.activities.contains(where: { $0.activityState == .active || $0.activityState == .stale }) else { return }
                let now = Date()
                let state = RestTimerAttributes.ContentState(startedAt: now, endsAt: now, exerciseName: exerciseName, nextSetLabel: "", completedSets: completedSets, totalSets: totalSets)
                do {
                    _ = try Activity.request(attributes: RestTimerAttributes(workoutTitle: workoutTitle), content: ActivityContent(state: state, staleDate: nil), pushType: nil)
                } catch {
                    #if DEBUG
                    NSLog("MassMethod ready Live Activity request failed: %@", String(describing: error))
                    #endif
                }
            }
        }
    }

    /// Moves the running rest. `target` (the rest the watch adjusted) keeps a
    /// late command from moving a newer rest.
    nonisolated func shift(by seconds: TimeInterval, ifEndingAt target: Date? = nil) {
        Task { @MainActor in
            self.enqueue {
                for activity in Activity<RestTimerAttributes>.activities {
                    var state = activity.content.state
                    // Nothing to move once the rest is over.
                    guard state.endsAt > Date() else { continue }
                    if let target, abs(state.endsAt.timeIntervalSince(target)) > 5 { continue }
                    state.endsAt = state.endsAt.addingTimeInterval(seconds)
                    if state.endsAt <= Date() {
                        // Keep the workout's activity (it can't be restarted
                        // from the background); show the next set as ready.
                        state.startedAt = Date()
                        state.endsAt = state.startedAt
                        await activity.update(ActivityContent(state: state, staleDate: nil))
                    } else {
                        await activity.update(ActivityContent(state: state, staleDate: state.endsAt))
                    }
                }
            }
        }
    }

    /// Rest over (or skipped) mid-workout: keep the activity in a "next set
    /// ready" state. iOS only lets the app start an activity in the
    /// foreground, so ending it would leave later rests logged on the watch
    /// (phone locked) with no Lock Screen countdown.
    nonisolated func settle() {
        Task { @MainActor in
            self.enqueue {
                let now = Date()
                for activity in Activity<RestTimerAttributes>.activities {
                    var state = activity.content.state
                    state.startedAt = now
                    state.endsAt = now
                    await activity.update(ActivityContent(state: state, staleDate: nil))
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
        // An activity iOS ended (8-hour limit) or the user dismissed can't be updated.
        if let current = Activity<RestTimerAttributes>.activities.first(where: { $0.attributes.workoutTitle == rest.workoutTitle && ($0.activityState == .active || $0.activityState == .stale) }) {
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
