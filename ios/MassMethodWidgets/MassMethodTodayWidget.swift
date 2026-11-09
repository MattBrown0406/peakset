import SwiftUI
import WidgetKit

private let accent = Color(red: 1.0, green: 0.47, blue: 0.29)
private let teal = Color(red: 0.18, green: 0.83, blue: 0.75)
private let navy = Color(red: 0.07, green: 0.09, blue: 0.16)
private let staleMessage = "Open Mass Method to see today's workout"

/// Home Screen (small, medium) and Lock Screen (rectangular, inline, circular)
/// widget for today's workout. Tapping it opens the app.
struct MassMethodTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: MassMethodWidgetSummary.widgetKind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's Workout")
        .description("Today's workout, your training block week, and the muscles furthest behind on weekly sets.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let summary: MassMethodWidgetSummary?

    /// Today's summary, or nil when there is none or it is from another day.
    var current: MassMethodWidgetSummary? {
        guard let summary, summary.isCurrent(at: date) else { return nil }
        return summary
    }
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), summary: .sample(for: Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        let now = Date()
        let stored = MassMethodWidgetSummary.load()
        // The widget gallery shows sample data until the app has published.
        let summary = context.isPreview && stored?.isCurrent(at: now) != true ? .sample(for: now) : stored
        completion(TodayEntry(date: now, summary: summary))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let now = Date()
        let summary = MassMethodWidgetSummary.load()
        // At midnight the summary goes stale; a second entry shows that
        // without waiting for the app to be opened.
        let calendar = Calendar.current
        let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now.addingTimeInterval(3600)
        let entries = [TodayEntry(date: now, summary: summary), TodayEntry(date: midnight, summary: summary)]
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

extension MassMethodWidgetSummary {
    static func sample(for date: Date) -> MassMethodWidgetSummary {
        MassMethodWidgetSummary(
            day: dayKey(for: date),
            title: "Chest Density",
            exerciseCount: 6,
            blockLine: "Week 2 of 5 · 2 RIR",
            behind: [
                Muscle(label: "Side delts", sets: 4, low: 16, high: 22),
                Muscle(label: "Back", sets: 6, low: 14, high: 22),
                Muscle(label: "Hamstrings", sets: 3, low: 10, high: 16)
            ],
            weightAverage: 201.4,
            unit: "lb"
        )
    }
}

/// What the widget says about today, in every size.
private struct TodayStatus {
    let header: String
    let symbol: String
    let tint: Color
    let title: String
    let detail: String

    init(_ summary: MassMethodWidgetSummary) {
        if summary.active {
            header = "In progress"
            symbol = "figure.strengthtraining.traditional"
            tint = accent
            title = summary.activeTitle.isEmpty ? "Workout" : summary.activeTitle
            detail = "\(summary.completedSets)/\(summary.totalSets) sets"
        } else if summary.doneToday {
            header = "Done today"
            symbol = "checkmark.circle.fill"
            tint = teal
            title = summary.doneTitle.isEmpty ? "Workout logged" : summary.doneTitle
            detail = summary.title.isEmpty ? "" : "Next: \(summary.title)"
        } else {
            header = "Today"
            symbol = "dumbbell.fill"
            tint = accent
            title = summary.title.isEmpty ? "Rest day" : summary.title
            detail = summary.exerciseCount == 1 ? "1 exercise" : "\(summary.exerciseCount) exercises"
        }
    }
}

private func formatSets(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
}

private func targetText(_ muscle: MassMethodWidgetSummary.Muscle) -> String {
    let low = formatSets(muscle.low)
    return muscle.high > muscle.low ? "\(low)–\(formatSets(muscle.high))" : low
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            inline.containerBackground(for: .widget) { Color.clear }
        case .accessoryCircular:
            circular.containerBackground(for: .widget) { Color.clear }
        case .accessoryRectangular:
            rectangular.containerBackground(for: .widget) { Color.clear }
        case .systemMedium:
            medium.containerBackground(for: .widget) { navy }
        default:
            small.containerBackground(for: .widget) { navy }
        }
    }

    // MARK: Home Screen

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            brand
            Spacer(minLength: 6)
            if let summary = entry.current {
                todayBlock(summary)
            } else {
                staleBlock
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var medium: some View {
        Group {
            if let summary = entry.current {
                HStack(alignment: .top, spacing: 14) {
                    VStack(alignment: .leading, spacing: 0) {
                        brand
                        Spacer(minLength: 6)
                        todayBlock(summary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    weekColumn(summary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    brand
                    Spacer(minLength: 6)
                    staleBlock
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
    }

    private var brand: some View {
        Text("MASS METHOD")
            .font(.caption2.weight(.heavy))
            .foregroundStyle(accent)
    }

    private var staleBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "dumbbell.fill")
                .font(.title3)
                .foregroundStyle(accent)
            Text(staleMessage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(3)
                .minimumScaleFactor(0.85)
        }
    }

    private func todayBlock(_ summary: MassMethodWidgetSummary) -> some View {
        let status = TodayStatus(summary)
        return VStack(alignment: .leading, spacing: 3) {
            Label(status.header, systemImage: status.symbol)
                .font(.caption.weight(.bold))
                .foregroundStyle(status.tint)
            Text(status.title)
                .font(.headline)
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            if !status.detail.isEmpty {
                Text(status.detail)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.white.opacity(0.7))
                    .lineLimit(1)
            }
            if !summary.blockLine.isEmpty {
                Text(summary.blockLine)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 2)
            }
        }
    }

    private func weekColumn(_ summary: MassMethodWidgetSummary) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("BEHIND THIS WEEK")
                .font(.caption2.weight(.heavy))
                .foregroundStyle(Color.white.opacity(0.55))
            if summary.behind.isEmpty {
                Text("Every muscle is on target")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(teal)
                    .lineLimit(2)
            } else {
                ForEach(summary.behind.prefix(4), id: \.self) { muscle in
                    MuscleRow(muscle: muscle)
                }
            }
            Spacer(minLength: 0)
            if let average = summary.weightAverage {
                Text("7-day avg \(String(format: "%.1f", average)) \(summary.unit)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.white.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
    }

    // MARK: Lock Screen

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let summary = entry.current {
                let status = TodayStatus(summary)
                Label(status.header, systemImage: status.symbol)
                    .font(.headline)
                    .widgetAccentable()
                Text(status.title)
                    .lineLimit(1)
                Text(summary.blockLine.isEmpty ? status.detail : summary.blockLine)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                Label("Mass Method", systemImage: "dumbbell.fill")
                    .font(.headline)
                    .widgetAccentable()
                Text("Open to see today's workout")
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var inline: some View {
        Group {
            if let summary = entry.current {
                let status = TodayStatus(summary)
                if summary.doneToday && !summary.active {
                    Label("Done today · \(status.title)", systemImage: status.symbol)
                } else {
                    Label("\(status.title) · \(status.detail)", systemImage: status.symbol)
                }
            } else {
                Label("Open Mass Method", systemImage: "dumbbell.fill")
            }
        }
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let summary = entry.current {
                if summary.doneToday && !summary.active {
                    Image(systemName: "checkmark")
                        .font(.title2.weight(.bold))
                        .widgetAccentable()
                } else {
                    VStack(spacing: 0) {
                        Text(summary.active ? "\(summary.completedSets)" : "\(summary.exerciseCount)")
                            .font(.title3.weight(.heavy))
                            .widgetAccentable()
                        Text(summary.active ? "sets" : "ex.")
                            .font(.caption2)
                    }
                }
            } else {
                Image(systemName: "dumbbell.fill")
                    .font(.title3)
            }
        }
    }
}

private struct MuscleRow: View {
    let muscle: MassMethodWidgetSummary.Muscle

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text(muscle.label)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 2)
                Text("\(formatSets(muscle.sets))/\(targetText(muscle))")
                    .monospacedDigit()
                    .foregroundStyle(Color.white.opacity(0.75))
            }
            .font(.caption2.weight(.semibold))
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.15))
                    Capsule().fill(accent)
                        .frame(width: proxy.size.width * min(1, muscle.low > 0 ? muscle.sets / muscle.low : 1))
                }
            }
            .frame(height: 3)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(muscle.label): \(formatSets(muscle.sets)) of \(targetText(muscle)) hard sets")
    }
}
