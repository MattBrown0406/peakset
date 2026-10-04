import SwiftUI

private let accent = Color(red: 1.0, green: 0.47, blue: 0.29)
private let teal = Color(red: 0.18, green: 0.83, blue: 0.75)

struct WatchWorkoutView: View {
    @EnvironmentObject private var model: WatchWorkoutModel

    var body: some View {
        Group {
            if let snapshot = model.snapshot, snapshot.active {
                if let endsAt = model.restEndsAt {
                    RestView(startedAt: model.restStartedAt, endsAt: endsAt)
                } else {
                    SetEntryView(snapshot: snapshot)
                }
            } else {
                IdleView(nextPlan: model.snapshot?.nextPlanTitle ?? "")
            }
        }
        .tint(accent)
    }
}

private struct IdleView: View {
    let nextPlan: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "dumbbell.fill")
                .font(.title2)
                .foregroundStyle(accent)
            Text("No workout running")
                .font(.headline)
            Text(nextPlan.isEmpty ? "Start a workout on your iPhone." : "Next: \(nextPlan). Start it on your iPhone.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

private struct SetEntryView: View {
    @EnvironmentObject private var model: WatchWorkoutModel
    let snapshot: WatchSnapshot
    @State private var editingReps = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Button { model.move(by: -1) } label: { Image(systemName: "chevron.left") }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Previous exercise")
                    VStack(alignment: .leading, spacing: 1) {
                        Text(model.exercise?.name ?? "")
                            .font(.headline)
                            .lineLimit(2)
                        if let set = model.nextSet, let exercise = model.exercise {
                            Text("Set \(set.label) of \(exercise.sets.count) · \(exercise.targetReps)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("All sets done")
                                .font(.caption2)
                                .foregroundStyle(teal)
                        }
                    }
                    Spacer(minLength: 0)
                    Button { model.move(by: 1) } label: { Image(systemName: "chevron.right") }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Next exercise")
                }

                if model.nextSet != nil {
                    if model.exercise?.repsOnly == false {
                        ValueRow(label: snapshot.unit, value: WatchWorkoutModel.format(model.weight), selected: !editingReps) {
                            editingReps = false
                        } minus: {
                            model.weight = max(0, model.weight - model.weightStep)
                        } plus: {
                            model.weight += model.weightStep
                        }
                    }
                    ValueRow(label: "reps", value: String(Int(model.reps.rounded())), selected: editingReps || model.exercise?.repsOnly == true) {
                        editingReps = true
                    } minus: {
                        model.reps = max(1, model.reps - 1)
                    } plus: {
                        model.reps += 1
                    }
                    Button(action: model.completeSet) {
                        Text("Complete Set")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }

                Text("\(snapshot.completedSets)/\(snapshot.totalSets) sets\(snapshot.blockLine.isEmpty ? "" : " · \(snapshot.blockLine)")")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .focusable()
        .digitalCrownRotation(
            editingReps || model.exercise?.repsOnly == true ? $model.reps : $model.weight,
            from: editingReps || model.exercise?.repsOnly == true ? 1 : 0,
            through: editingReps || model.exercise?.repsOnly == true ? 100 : 1500,
            by: editingReps || model.exercise?.repsOnly == true ? 1 : model.weightStep,
            sensitivity: .low
        )
    }
}

private struct ValueRow: View {
    let label: String
    let value: String
    let selected: Bool
    let select: () -> Void
    let minus: () -> Void
    let plus: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Button(action: minus) { Image(systemName: "minus") }
                .buttonStyle(.bordered)
                .frame(width: 40)
                .accessibilityLabel("Decrease \(label)")
            Button(action: select) {
                VStack(spacing: 0) {
                    Text(value)
                        .font(.title3.weight(.heavy).monospacedDigit())
                    Text(label)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 2)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? accent : .clear, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .accessibilityHint("Turn the Digital Crown to adjust")
            Button(action: plus) { Image(systemName: "plus") }
                .buttonStyle(.bordered)
                .frame(width: 40)
                .accessibilityLabel("Increase \(label)")
        }
    }
}

private struct RestView: View {
    @EnvironmentObject private var model: WatchWorkoutModel
    let startedAt: Date
    let endsAt: Date

    var body: some View {
        // Scrolls so +15s and Skip stay reachable at large text sizes.
        ScrollView {
        VStack(spacing: 8) {
            Text("Rest")
                .font(.caption.weight(.bold))
                .foregroundStyle(accent)
            Text(timerInterval: min(startedAt, endsAt)...endsAt, countsDown: true)
                .font(.system(size: 44, weight: .heavy).monospacedDigit())
                .multilineTextAlignment(.center)
            ProgressView(timerInterval: min(startedAt, endsAt)...endsAt, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(accent)
            if let exercise = model.exercise {
                Text("Next: \(exercise.name)")
                    .font(.footnote)
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button("+15s") { model.adjustRest(15) }
                Button("Skip") { model.skipRest() }
                    .tint(teal)
            }
        }
        }
    }
}
