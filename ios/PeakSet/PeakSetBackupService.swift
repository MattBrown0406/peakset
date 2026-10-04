import Foundation

/// Writes JSON backups (and copies of progress photos) to the app's iCloud Drive
/// container when iCloud is available, otherwise to Documents/Backups, which is
/// visible in the Files app and included in device backups.
final class PeakSetBackupService {
    static let shared = PeakSetBackupService()
    static let containerIdentifier = "iCloud.com.mattbrown.peakset"

    struct BackupFile {
        let name: String
        let date: Date
        let bytes: Int
        let location: Location
    }

    enum Location: String {
        case iCloud = "iCloud Drive"
        case device = "This iPhone"
    }

    enum BackupError: LocalizedError {
        case invalidPayload
        case notFound

        var errorDescription: String? {
            switch self {
            case .invalidPayload: return "The backup could not be written."
            case .notFound: return "That backup is no longer available."
            }
        }
    }

    private let queue = DispatchQueue(label: "com.mattbrown.peakset.backup", qos: .utility)
    private let fileManager = FileManager.default
    private let keepCount = 30

    private init() {}

    private var localDocuments: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    /// Must be called off the main thread; the first lookup can block.
    private func iCloudDocuments() -> URL? {
        guard fileManager.ubiquityIdentityToken != nil,
              let container = fileManager.url(forUbiquityContainerIdentifier: Self.containerIdentifier) else { return nil }
        return container.appendingPathComponent("Documents", isDirectory: true)
    }

    private func backupsDirectory(for location: Location) -> URL? {
        switch location {
        case .iCloud: return iCloudDocuments()?.appendingPathComponent("Backups", isDirectory: true)
        case .device: return localDocuments.appendingPathComponent("Backups", isDirectory: true)
        }
    }

    func snapshot(json: String, filename: String, completion: @escaping (Result<Location, Error>) -> Void) {
        queue.async {
            guard let data = json.data(using: .utf8), !data.isEmpty else {
                completion(.failure(BackupError.invalidPayload))
                return
            }
            let safeName = Self.safeFilename(filename)
            let location: Location = self.iCloudDocuments() == nil ? .device : .iCloud
            do {
                guard let directory = self.backupsDirectory(for: location) else { throw BackupError.invalidPayload }
                try self.fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
                try data.write(to: directory.appendingPathComponent(safeName), options: .atomic)
                self.prune(directory)
                if location == .iCloud { self.mirrorPhotosToICloud() }
                completion(.success(location))
            } catch {
                completion(.failure(error))
            }
        }
    }

    func list(completion: @escaping ([BackupFile]) -> Void) {
        queue.async {
            var files: [BackupFile] = []
            for location in [Location.iCloud, .device] {
                guard let directory = self.backupsDirectory(for: location),
                      let urls = try? self.fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]) else { continue }
                for url in urls where url.pathExtension == "json" {
                    let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
                    files.append(BackupFile(name: url.lastPathComponent, date: values?.contentModificationDate ?? .distantPast, bytes: values?.fileSize ?? 0, location: location))
                }
            }
            completion(files.sorted { $0.date > $1.date })
        }
    }

    func read(name: String, location: Location, completion: @escaping (Result<(String, Date), Error>) -> Void) {
        queue.async {
            guard let directory = self.backupsDirectory(for: location) else {
                completion(.failure(BackupError.notFound))
                return
            }
            let url = directory.appendingPathComponent(Self.safeFilename(name))
            if location == .iCloud {
                try? self.fileManager.startDownloadingUbiquitousItem(at: url)
            }
            do {
                let data = try self.readCoordinated(url)
                let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
                guard let text = String(data: data, encoding: .utf8) else { throw BackupError.invalidPayload }
                if location == .iCloud { self.restorePhotosFromICloud() }
                completion(.success((text, date)))
            } catch {
                completion(.failure(error))
            }
        }
    }

    private func readCoordinated(_ url: URL) throws -> Data {
        var coordinationError: NSError?
        var result: Result<Data, Error> = .failure(BackupError.notFound)
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readURL in
            result = Result { try Data(contentsOf: readURL) }
        }
        if let coordinationError { throw coordinationError }
        return try result.get()
    }

    private func prune(_ directory: URL) {
        guard let urls = try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let sorted = urls.filter { $0.pathExtension == "json" }.sorted {
            let lhs = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let rhs = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return lhs > rhs
        }
        for url in sorted.dropFirst(keepCount) {
            try? fileManager.removeItem(at: url)
        }
    }

    // Progress photos are too large for the JSON backup, so they are mirrored
    // file-by-file next to it and copied back on restore.
    private func mirrorPhotosToICloud() {
        guard let cloudPhotos = iCloudDocuments()?.appendingPathComponent("ProgressPhotos", isDirectory: true) else { return }
        copyMissingFiles(from: PeakSetPhotoStore.directory, to: cloudPhotos)
    }

    private func restorePhotosFromICloud() {
        guard let cloudPhotos = iCloudDocuments()?.appendingPathComponent("ProgressPhotos", isDirectory: true) else { return }
        if let urls = try? fileManager.contentsOfDirectory(at: cloudPhotos, includingPropertiesForKeys: nil) {
            urls.forEach { try? fileManager.startDownloadingUbiquitousItem(at: $0) }
        }
        copyMissingFiles(from: cloudPhotos, to: PeakSetPhotoStore.directory)
    }

    private func copyMissingFiles(from source: URL, to destination: URL) {
        guard let urls = try? fileManager.contentsOfDirectory(at: source, includingPropertiesForKeys: nil) else { return }
        try? fileManager.createDirectory(at: destination, withIntermediateDirectories: true)
        for url in urls where url.pathExtension == "jpg" {
            let target = destination.appendingPathComponent(url.lastPathComponent)
            if !fileManager.fileExists(atPath: target.path) {
                try? fileManager.copyItem(at: url, to: target)
            }
        }
    }

    static func safeFilename(_ name: String) -> String {
        let cleaned = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: "..", with: "-")
        return cleaned.isEmpty ? "mass-method-backup.json" : cleaned
    }
}

/// Bridges files opened from other apps (AirDrop, Messages, Mail, Files) into
/// the web app once it has finished loading.
final class PeakSetIncomingFiles {
    static let shared = PeakSetIncomingFiles()
    private var pending: [String] = []
    private var deliver: ((String) -> Void)?

    private init() {}

    func attach(_ deliver: @escaping (String) -> Void) {
        self.deliver = deliver
        let queued = pending
        pending.removeAll()
        queued.forEach(deliver)
    }

    func open(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url), data.count < 50_000_000,
              let text = String(data: data, encoding: .utf8) else { return }
        if let deliver {
            deliver(text)
        } else {
            pending.append(text)
        }
    }
}
