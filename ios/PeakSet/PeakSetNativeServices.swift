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

    func requestAuthorization() {
        center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func start(seconds: TimeInterval) {
        cancel()
        let token = UUID()
        generation = token
        let fireDate = Date().addingTimeInterval(max(1, seconds))
        center.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
            guard granted, let self, self.generation == token else { return }

            let content = UNMutableNotificationContent()
            content.title = "Rest complete"
            content.body = "Your next set is ready."
            content.sound = UNNotificationSound(named: UNNotificationSoundName("boxing-bell.wav"))
            content.categoryIdentifier = "PEAKSET_REST_TIMER"

            let remaining = max(1, fireDate.timeIntervalSinceNow)
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: remaining, repeats: false)
            let request = UNNotificationRequest(identifier: self.notificationID, content: content, trigger: trigger)
            self.center.add(request)
        }
    }

    func cancel() {
        generation = UUID()
        center.removePendingNotificationRequests(withIdentifiers: [notificationID])
        center.removeDeliveredNotifications(withIdentifiers: [notificationID])
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

    func requestAuthorization(completion: @escaping (Result<String, Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable(),
              let bodyMassType,
              let stepType else {
            completion(.failure(ServiceError.healthDataUnavailable))
            return
        }

        let shareTypes: Set<HKSampleType> = [bodyMassType, HKObjectType.workoutType()]
        let readTypes: Set<HKObjectType> = [bodyMassType, stepType, HKObjectType.workoutType()]
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { success, error in
            if let error {
                completion(.failure(error))
            } else if success {
                completion(.success("Apple Health connected"))
            } else {
                completion(.failure(ServiceError.authorizationDeclined))
            }
        }
    }

    func saveWeight(pounds: Double, date: Date, completion: @escaping (Result<String, Error>) -> Void) {
        guard let bodyMassType else {
            completion(.failure(ServiceError.healthDataUnavailable))
            return
        }
        let quantity = HKQuantity(unit: .pound(), doubleValue: pounds)
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

    func saveWorkout(title: String, start: Date, end: Date, completion: @escaping (Result<String, Error>) -> Void) {
        let workout = HKWorkout(
            activityType: .traditionalStrengthTraining,
            start: start,
            end: end,
            duration: max(0, end.timeIntervalSince(start)),
            totalEnergyBurned: nil,
            totalDistance: nil,
            metadata: [HKMetadataKeyIndoorWorkout: true, "PeakSetTitle": title]
        )
        store.save(workout) { success, error in
            if let error {
                completion(.failure(error))
            } else if success {
                completion(.success("Workout saved to Apple Health"))
            } else {
                completion(.failure(ServiceError.saveFailed))
            }
        }
    }

    enum ServiceError: LocalizedError {
        case healthDataUnavailable
        case authorizationDeclined
        case saveFailed

        var errorDescription: String? {
            switch self {
            case .healthDataUnavailable: return "Apple Health is unavailable on this device."
            case .authorizationDeclined: return "Apple Health authorization was not granted."
            case .saveFailed: return "Apple Health could not save this entry."
            }
        }
    }
}
