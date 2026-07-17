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

    func start(seconds: TimeInterval) {
        guard seconds.isFinite, seconds >= 1 else { return }
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
        let readTypes: Set<HKObjectType> = [stepType]
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

    func saveWeight(pounds: Double, date: Date, completion: @escaping (Result<String, Error>) -> Void) {
        guard pounds.isFinite, pounds > 0, let bodyMassType else {
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
            case .invalidPayload: return "PeakSet could not validate the Apple Health entry."
            }
        }
    }
}
