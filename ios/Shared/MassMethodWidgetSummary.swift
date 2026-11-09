import Foundation

/// Today's summary for the Home Screen and Lock Screen widgets. The web app
/// builds it (widget.js `buildWidgetSummary`), the app stores it in the App
/// Group, and the widget extension reads it. Every field decodes leniently so
/// an older or newer app build never leaves the widget blank.
struct MassMethodWidgetSummary: Codable, Equatable {
    struct Muscle: Codable, Equatable, Hashable {
        var label: String
        var sets: Double
        var low: Double
        var high: Double

        init(label: String, sets: Double, low: Double, high: Double) {
            self.label = label
            self.sets = sets
            self.low = low
            self.high = high
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            label = try container.decodeIfPresent(String.self, forKey: .label) ?? ""
            sets = try container.decodeIfPresent(Double.self, forKey: .sets) ?? 0
            low = try container.decodeIfPresent(Double.self, forKey: .low) ?? 0
            high = try container.decodeIfPresent(Double.self, forKey: .high) ?? low
        }
    }

    static let appGroup = "group.com.mattbrown.peakset"
    static let storeKey = "MassMethodWidgetSummary"
    static let widgetKind = "MassMethodToday"

    var version: Int
    /// Local calendar day the summary describes, "yyyy-MM-dd".
    var day: String
    var title: String
    var exerciseCount: Int
    var doneToday: Bool
    var doneTitle: String
    var active: Bool
    var activeTitle: String
    var completedSets: Int
    var totalSets: Int
    var blockLine: String
    var behind: [Muscle]
    var weightAverage: Double?
    var unit: String

    init(version: Int = 1, day: String, title: String, exerciseCount: Int, doneToday: Bool = false, doneTitle: String = "",
         active: Bool = false, activeTitle: String = "", completedSets: Int = 0, totalSets: Int = 0,
         blockLine: String = "", behind: [Muscle] = [], weightAverage: Double? = nil, unit: String = "lb") {
        self.version = version
        self.day = day
        self.title = title
        self.exerciseCount = exerciseCount
        self.doneToday = doneToday
        self.doneTitle = doneTitle
        self.active = active
        self.activeTitle = activeTitle
        self.completedSets = completedSets
        self.totalSets = totalSets
        self.blockLine = blockLine
        self.behind = behind
        self.weightAverage = weightAverage
        self.unit = unit
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        // Without a day the summary can't be dated, so it is rejected.
        day = try container.decode(String.self, forKey: .day)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        exerciseCount = try container.decodeIfPresent(Int.self, forKey: .exerciseCount) ?? 0
        doneToday = try container.decodeIfPresent(Bool.self, forKey: .doneToday) ?? false
        doneTitle = try container.decodeIfPresent(String.self, forKey: .doneTitle) ?? ""
        active = try container.decodeIfPresent(Bool.self, forKey: .active) ?? false
        activeTitle = try container.decodeIfPresent(String.self, forKey: .activeTitle) ?? ""
        completedSets = try container.decodeIfPresent(Int.self, forKey: .completedSets) ?? 0
        totalSets = try container.decodeIfPresent(Int.self, forKey: .totalSets) ?? 0
        blockLine = try container.decodeIfPresent(String.self, forKey: .blockLine) ?? ""
        behind = try container.decodeIfPresent([Muscle].self, forKey: .behind) ?? []
        weightAverage = try container.decodeIfPresent(Double.self, forKey: .weightAverage)
        unit = try container.decodeIfPresent(String.self, forKey: .unit) ?? "lb"
    }

    /// The local calendar day, formatted like the web app's `dateKey`.
    static func dayKey(for date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Whether this summary describes the day `date` falls on.
    func isCurrent(at date: Date) -> Bool {
        day == Self.dayKey(for: date)
    }

    static func decode(_ data: Data) -> MassMethodWidgetSummary? {
        try? JSONDecoder().decode(MassMethodWidgetSummary.self, from: data)
    }

    /// The summary the app last stored, if any.
    static func load() -> MassMethodWidgetSummary? {
        guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: storeKey) else { return nil }
        return decode(data)
    }
}
