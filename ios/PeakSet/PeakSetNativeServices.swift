import Foundation
import HealthKit
import UserNotifications

struct PeakSetSharedWorkout: Codable {
    let id: UUID
    let title: String
    let startedAt: Date
    let endedAt: Date?
    let completedSets: Int
}

final class PeakSetTimerService {
    static let shared = PeakSetTimerService()
    private let center = UNUserNotificationCenter.current()
    private let notificationID = "peakset-rest-timer"
    private var generation = UUID()

    private init() {}

    /// When the pending rest notification fires. A time-interval trigger's
    /// nextTriggerDate() always reports now + its interval, so it can't be used.
    private var scheduledFireDate: Date? {
        didSet {
            if let scheduledFireDate {
                UserDefaults.standard.set(scheduledFireDate.timeIntervalSince1970, forKey: fireDateKey)
            } else {
                UserDefaults.standard.removeObject(forKey: fireDateKey)
            }
        }
    }
    private let fireDateKey = "MassMethodRestFireDate"

    /// After iOS relaunches the app (e.g. for a watch command) the in-memory
    /// value is gone; fall back to the persisted one.
    private var currentFireDate: Date? {
        if let scheduledFireDate { return scheduledFireDate }
        let stored = UserDefaults.standard.double(forKey: fireDateKey)
        return stored > 0 ? Date(timeIntervalSince1970: stored) : nil
    }

    private func schedule(fireDate: Date, token: UUID) {
        center.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
            // `generation` and `scheduledFireDate` are only touched on main.
            DispatchQueue.main.async {
                guard granted, let self, self.generation == token else { return }
                let content = UNMutableNotificationContent()
                content.title = "Rest complete"
                content.body = "Your next set is ready."
                content.sound = UNNotificationSound(named: UNNotificationSoundName("boxing-bell.wav"))
                let remaining = max(1, fireDate.timeIntervalSinceNow)
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: remaining, repeats: false)
                self.center.add(UNNotificationRequest(identifier: self.notificationID, content: content, trigger: trigger))
            }
        }
    }

    func start(seconds: TimeInterval) {
        guard seconds.isFinite, seconds >= 1 else { return }
        cancel()
        let token = UUID()
        generation = token
        let fireDate = Date().addingTimeInterval(max(1, seconds))
        scheduledFireDate = fireDate
        schedule(fireDate: fireDate, token: token)
    }

    /// Moves the pending rest notification (watch +/-15s while the phone's web
    /// app is paused). A rest moved into the past is cancelled.
    func shift(by seconds: TimeInterval) {
        guard let current = currentFireDate else { return }
        let fireDate = current.addingTimeInterval(seconds)
        guard fireDate.timeIntervalSinceNow >= 1 else { return cancel() }
        let token = UUID()
        generation = token
        scheduledFireDate = fireDate
        schedule(fireDate: fireDate, token: token)
    }

    func cancel() {
        generation = UUID()
        scheduledFireDate = nil
        center.removePendingNotificationRequests(withIdentifiers: [notificationID])
        center.removeDeliveredNotifications(withIdentifiers: [notificationID])
    }

    func reconcile(completion: @escaping (Bool) -> Void) {
        let center = self.center
        let notificationID = self.notificationID
        center.getDeliveredNotifications { notifications in
            let delivered = notifications.contains { $0.request.identifier == notificationID }
            if delivered {
                center.removeDeliveredNotifications(withIdentifiers: [notificationID])
            }
            completion(delivered)
        }
    }
}

final class PeakSetHealthKitService {
    static let shared = PeakSetHealthKitService()
    private let store = HKHealthStore()

    private init() {}

    private var bodyMassType: HKQuantityType? {
        HKObjectType.quantityType(forIdentifier: .bodyMass)
    }

    private var stepType: HKQuantityType? {
        HKObjectType.quantityType(forIdentifier: .stepCount)
    }

    struct AuthorizationSummary {
        let bodyMassWrite: Bool
        let workoutWrite: Bool
    }

    func requestAuthorization(completion: @escaping (Result<AuthorizationSummary, Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable(),
              let bodyMassType,
              let stepType else {
            completion(.failure(ServiceError.healthDataUnavailable))
            return
        }

        let shareTypes: Set<HKSampleType> = [bodyMassType, HKObjectType.workoutType()]
        var readTypes: Set<HKObjectType> = [stepType]
        readTypes.formUnion(Self.bodyReadTypes.map(\.type))
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { success, error in
            if let error {
                completion(.failure(error))
            } else if success {
                completion(.success(AuthorizationSummary(
                    bodyMassWrite: self.store.authorizationStatus(for: bodyMassType) == .sharingAuthorized,
                    workoutWrite: self.store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
                )))
            } else {
                completion(.failure(ServiceError.authorizationDeclined))
            }
        }
    }

    func saveWeight(value: Double, kilograms: Bool, date: Date, completion: @escaping (Result<String, Error>) -> Void) {
        guard value.isFinite, value > 0, let bodyMassType else {
            completion(.failure(ServiceError.healthDataUnavailable))
            return
        }
        let quantity = HKQuantity(unit: kilograms ? .gramUnit(with: .kilo) : .pound(), doubleValue: value)
        let sample = HKQuantitySample(type: bodyMassType, quantity: quantity, start: date, end: date)
        store.save(sample) { success, error in
            if let error {
                completion(.failure(error))
            } else if success {
                completion(.success("Weight sent to Apple Health"))
            } else {
                completion(.failure(ServiceError.saveFailed))
            }
        }
    }

    /// Body metrics imported into the logbook. Values are converted to the
    /// athlete's units here so JavaScript never deals with HealthKit units.
    private static let bodyReadTypes: [(key: String, type: HKQuantityType)] = [
        (HKQuantityTypeIdentifier.bodyMass, "weight"),
        (.bodyFatPercentage, "bodyFat"),
        (.leanBodyMass, "leanMass"),
        (.waistCircumference, "waist")
    ].compactMap { identifier, key in
        HKObjectType.quantityType(forIdentifier: identifier).map { (key, $0) }
    }

    func readBodySamples(since: Date, kilograms: Bool, centimeters: Bool, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(.failure(ServiceError.healthDataUnavailable))
            return
        }
        let massUnit: HKUnit = kilograms ? .gramUnit(with: .kilo) : .pound()
        let lengthUnit: HKUnit = centimeters ? .meterUnit(with: .centi) : .inch()
        let ownBundle = Bundle.main.bundleIdentifier
        let formatter = ISO8601DateFormatter()
        let predicate = HKQuery.predicateForSamples(withStart: since, end: Date(), options: [])
        let group = DispatchGroup()
        let lock = NSLock()
        var samples: [[String: Any]] = []
        var firstError: Error?

        for (key, type) in Self.bodyReadTypes {
            group.enter()
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, results, error in
                defer { group.leave() }
                lock.lock()
                defer { lock.unlock() }
                if let error {
                    // Unauthorized types simply return no data; keep other types.
                    if firstError == nil { firstError = error }
                    return
                }
                for case let sample as HKQuantitySample in results ?? [] {
                    // Skip weights Mass Method itself wrote so they never echo back.
                    if sample.sourceRevision.source.bundleIdentifier == ownBundle { continue }
                    let value: Double
                    switch key {
                    case "weight", "leanMass": value = sample.quantity.doubleValue(for: massUnit)
                    case "bodyFat": value = sample.quantity.doubleValue(for: .percent()) * 100
                    default: value = sample.quantity.doubleValue(for: lengthUnit)
                    }
                    guard value.isFinite, value > 0 else { continue }
                    samples.append([
                        "type": key,
                        "id": sample.uuid.uuidString,
                        "date": formatter.string(from: sample.startDate),
                        "value": (value * 100).rounded() / 100,
                        "source": sample.sourceRevision.source.name
                    ])
                }
            }
            store.execute(query)
        }

        group.notify(queue: .global()) {
            if samples.isEmpty, let firstError {
                completion(.failure(firstError))
            } else {
                completion(.success(samples))
            }
        }
    }

    func readTodaySteps(completion: @escaping (Result<Double, Error>) -> Void) {
        guard let stepType else {
            completion(.failure(ServiceError.healthDataUnavailable))
            return
        }
        let now = Date()
        let start = Calendar.current.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
            if let error {
                completion(.failure(error))
                return
            }
            let steps = result?.sumQuantity()?.doubleValue(for: .count()) ?? 0
            completion(.success(steps))
        }
        store.execute(query)
    }

    func saveWorkout(id: String, title: String, start: Date, end: Date, completion: @escaping (Result<String, Error>) -> Void) {
        guard end > start else {
            completion(.failure(ServiceError.invalidPayload))
            return
        }
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: .local())
        builder.beginCollection(withStart: start) { success, error in
            guard success, error == nil else {
                completion(.failure(error ?? ServiceError.saveFailed))
                return
            }
            let metadata: [String: Any] = [
                HKMetadataKeyIndoorWorkout: true,
                HKMetadataKeyExternalUUID: id,
                "com.mattbrown.peakset.title": title
            ]
            builder.addMetadata(metadata) { metadataSuccess, metadataError in
                guard metadataSuccess, metadataError == nil else {
                    completion(.failure(metadataError ?? ServiceError.saveFailed))
                    return
                }
                builder.endCollection(withEnd: end) { endSuccess, endError in
                    guard endSuccess, endError == nil else {
                        completion(.failure(endError ?? ServiceError.saveFailed))
                        return
                    }
                    builder.finishWorkout { workout, finishError in
                        if let finishError {
                            completion(.failure(finishError))
                        } else if workout != nil {
                            completion(.success("Workout saved to Apple Health"))
                        } else {
                            completion(.failure(ServiceError.saveFailed))
                        }
                    }
                }
            }
        }
    }

    enum ServiceError: LocalizedError {
        case healthDataUnavailable
        case authorizationDeclined
        case saveFailed
        case invalidPayload

        var errorDescription: String? {
            switch self {
            case .healthDataUnavailable: return "Apple Health is unavailable on this device."
            case .authorizationDeclined: return "Apple Health authorization was not granted."
            case .saveFailed: return "Apple Health could not save this entry."
            case .invalidPayload: return "Mass Method could not validate the Apple Health entry."
            }
        }
    }
}
