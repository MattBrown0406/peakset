import ActivityKit
import SwiftUI
import WidgetKit

private let accent = Color(red: 1.0, green: 0.47, blue: 0.29)
private let teal = Color(red: 0.18, green: 0.83, blue: 0.75)

struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            RestTimerLockScreenView(context: context)
                .activityBackgroundTint(Color(red: 0.07, green: 0.09, blue: 0.16))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Rest", systemImage: "timer")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(accent)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RestCountdown(state: context.state, isStale: context.isStale)
                        .font(.title2.weight(.heavy).monospacedDigit())
                        .frame(maxWidth: 90, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Next: \(context.state.exerciseName) · \(context.state.nextSetLabel)")
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        RestProgress(state: context.state, isStale: context.isStale)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(accent)
            } compactTrailing: {
                RestCountdown(state: context.state, isStale: context.isStale)
                    .monospacedDigit()
                    .frame(maxWidth: 52)
                    .foregroundStyle(accent)
            } minimal: {
                Image(systemName: "timer")
                    .foregroundStyle(accent)
            }
            .keylineTint(accent)
        }
    }
}

private struct RestTimerLockScreenView: View {
    let context: ActivityViewContext<RestTimerAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.workoutTitle)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(accent)
                        .lineLimit(1)
                    Text(context.isStale ? "Rest complete" : "Resting")
                        .font(.headline)
                        .foregroundStyle(.white)
                }
                Spacer()
                RestCountdown(state: context.state, isStale: context.isStale)
                    .font(.system(size: 40, weight: .heavy).monospacedDigit())
                    .foregroundStyle(.white)
                    .frame(maxWidth: 140, alignment: .trailing)
            }
            RestProgress(state: context.state, isStale: context.isStale)
            HStack {
                Text("Next: \(context.state.exerciseName) · \(context.state.nextSetLabel)")
                    .lineLimit(1)
                Spacer()
                Text("\(context.state.completedSets)/\(context.state.totalSets) sets")
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color.white.opacity(0.75))
        }
        .padding(16)
    }
}

private struct RestCountdown: View {
    let state: RestTimerAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if isStale || state.endsAt <= state.startedAt {
            Text("Go")
                .foregroundStyle(teal)
        } else {
            Text(timerInterval: state.startedAt...state.endsAt, countsDown: true)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct RestProgress: View {
    let state: RestTimerAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if isStale || state.endsAt <= state.startedAt {
            ProgressView(value: 1)
                .tint(teal)
        } else {
            ProgressView(timerInterval: state.startedAt...state.endsAt, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(accent)
        }
    }
}
