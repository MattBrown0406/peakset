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
        case downloadPending

        var errorDescription: String? {
            switch self {
            case .invalidPayload: return "The backup could not be written."
            case .notFound: return "That backup is no longer available."
            case .downloadPending: return "That backup is still downloading from iCloud. Check your connection and try again."
            }
        }
    }

    private let queue = DispatchQueue(label: "com.mattbrown.peakset.backup", qos: .utility)
    /// Photo downloads can take minutes on a new phone; they never block backups.
    private let photoQueue = DispatchQueue(label: "com.mattbrown.peakset.backup.photos", qos: .utility)
    /// Restores wait on iCloud downloads, so they never share the snapshot queue.
    private let restoreQueue = DispatchQueue(label: "com.mattbrown.peakset.backup.restore", qos: .userInitiated)
    private let downloadTimeout: TimeInterval = 30
    private let fileManager = FileManager.default
    private let keepCount = 30
    /// Set when a restore from iCloud succeeds and cleared once every mirrored
    /// photo has been copied. Persisted so photos still downloading when the
    /// app was suspended keep arriving on later launches; never set on a
    /// fresh install that has not restored, so the More tab alone never pulls
    /// an account's photos. UserDefaults is safe to use from any queue.
    private static let photoRestorePendingKey = "massmethod.photoRestorePending"
    private var photoRestorePending: Bool {
        get { UserDefaults.standard.bool(forKey: Self.photoRestorePendingKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.photoRestorePendingKey) }
    }

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
                // Mirroring can copy every photo on a fresh iCloud account; it
                // must not delay the "Backed up" status or later snapshots.
                if location == .iCloud {
                    self.replayPendingMirrorDeletes()
                    self.photoQueue.async { self.mirrorPhotosToICloud() }
                }
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
                for url in urls {
                    // Not-yet-downloaded iCloud files appear as ".name.json.icloud".
                    guard let name = Self.realName(of: url), name.hasSuffix(".json") else { continue }
                    // Read metadata through the logical name: the ".icloud" stub
                    // reports its own (tiny, recent) size and date, which would
                    // mis-sort "most recent" after a reinstall.
                    let logical = directory.appendingPathComponent(name)
                    let values = (try? logical.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]))
                        ?? (try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]))
                    files.append(BackupFile(name: name, date: values?.contentModificationDate ?? .distantPast, bytes: values?.fileSize ?? 0, location: location))
                }
            }
            completion(files.sorted { $0.date > $1.date })
            // Photos still downloading when a restore ran are copied as they land.
            if self.photoRestorePending {
                self.photoQueue.async { self.restorePhotosFromICloud() }
            }
        }
    }

    func read(name: String, location: Location, completion: @escaping (Result<(String, Date), Error>) -> Void) {
        // A coordinated read of an undownloaded iCloud item blocks until the
        // download finishes (forever when offline), so restores run on their
        // own queue and give up after a bounded wait instead of stalling
        // every later snapshot and list call.
        let worker = location == .iCloud ? restoreQueue : queue
        worker.async {
            guard let directory = self.backupsDirectory(for: location) else {
                completion(.failure(BackupError.notFound))
                return
            }
            let url = directory.appendingPathComponent(Self.safeFilename(name))
            do {
                if location == .iCloud {
                    try self.waitForDownload(of: url)
                }
                let data = try self.readCoordinated(url)
                let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
                guard let text = String(data: data, encoding: .utf8) else { throw BackupError.invalidPayload }
                completion(.success((text, date)))
                if location == .iCloud {
                    self.photoRestorePending = true
                    self.photoQueue.async { self.restorePhotosFromICloud() }
                }
            } catch {
                completion(.failure(error))
            }
        }
    }

    /// Starts the iCloud download for `url` and waits (bounded) until the item
    /// is local. Throws `.notFound` when neither the file nor its placeholder
    /// exists and `.downloadPending` when the download does not finish in time.
    private func waitForDownload(of url: URL) throws {
        let placeholder = url.deletingLastPathComponent().appendingPathComponent(".\(url.lastPathComponent).icloud")
        guard fileManager.fileExists(atPath: url.path) || fileManager.fileExists(atPath: placeholder.path) else {
            throw BackupError.notFound
        }
        try? fileManager.startDownloadingUbiquitousItem(at: url)
        let deadline = Date().addingTimeInterval(downloadTimeout)
        while true {
            if Self.isDownloaded(url, placeholder: placeholder) { return }
            if Date() >= deadline { throw BackupError.downloadPending }
            Thread.sleep(forTimeInterval: 0.5)
        }
    }

    /// Resource values are cached per NSURL and only refreshed on a run-loop
    /// pass, which a polling background queue never gets; probe a fresh URL.
    private static func isDownloaded(_ url: URL, placeholder: URL) -> Bool {
        let probe = URL(fileURLWithPath: url.path)
        let status = try? probe.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey]).ubiquitousItemDownloadingStatus
        if status == .current || status == .downloaded { return true }
        // A file that is not ubiquitous at all reports no status; if it is
        // present on disk (and no stub remains) it can be read directly.
        return status == nil && FileManager.default.fileExists(atPath: url.path) && !FileManager.default.fileExists(atPath: placeholder.path)
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
        // Offloaded iCloud backups appear as ".name.json.icloud" stand-ins and
        // still count toward the limit (deleting the stand-in deletes the file).
        // Order by the date in the filename ("…-backup-2026-10-07-…",
        // "…-before-restore-2026-10-07T12-34-56-…"): an offloaded iCloud
        // stand-in reports its own recent modification date, which would sort
        // old backups first and prune the newest real ones. The modification
        // date (read through the logical name, as list() does) breaks ties.
        let modified: (URL) -> Date = { url in
            let logical = Self.realName(of: url).map { directory.appendingPathComponent($0) } ?? url
            return (try? logical.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
                ?? (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
                ?? .distantPast
        }
        let stamp: (URL) -> String = { url in
            let name = Self.realName(of: url) ?? url.lastPathComponent
            guard let range = name.range(of: #"\d{4}-\d{2}-\d{2}(T\d{2}-\d{2}-\d{2})?"#, options: .regularExpression) else { return "" }
            let found = String(name[range])
            return found.count == 10 ? found + "T00-00-00" : found
        }
        // A real file and its stand-in are one backup.
        var seen = Set<String>()
        let unique = urls.filter { url in
            guard let name = Self.realName(of: url), name.hasSuffix(".json") else { return false }
            return seen.insert(name).inserted
        }
        let sorted = unique.sorted {
            let lhs = stamp($0), rhs = stamp($1)
            return lhs != rhs ? lhs > rhs : modified($0) > modified($1)
        }
        for url in sorted.dropFirst(keepCount) {
            guard let name = Self.realName(of: url) else { continue }
            // Remove the backup whether it is local, offloaded, or both.
            try? fileManager.removeItem(at: directory.appendingPathComponent(name))
            try? fileManager.removeItem(at: directory.appendingPathComponent(".\(name).icloud"))
        }
    }

    // Progress photos are too large for the JSON backup, so they are mirrored
    // file-by-file next to it and copied back on restore.
    private func mirrorPhotosToICloud() {
        guard let cloudPhotos = iCloudDocuments()?.appendingPathComponent("ProgressPhotos", isDirectory: true) else { return }
        copyMissingFiles(from: PeakSetPhotoStore.directory, to: cloudPhotos)
    }

    /// A backup restored from a file (not from the iCloud list) still needs
    /// its photo files copied back from the iCloud Drive mirror. Reports how
    /// many photo files arrived.
    func requestPhotoRestore(completion: @escaping (Int) -> Void) {
        photoRestorePending = true
        photoQueue.async {
            let before = self.localPhotoCount()
            self.restorePhotosFromICloud()
            completion(max(0, self.localPhotoCount() - before))
        }
    }

    private func localPhotoCount() -> Int {
        ((try? fileManager.contentsOfDirectory(atPath: PeakSetPhotoStore.directory.path)) ?? []).filter { $0.hasSuffix(".jpg") }.count
    }

    private func restorePhotosFromICloud() {
        guard let cloudPhotos = iCloudDocuments()?.appendingPathComponent("ProgressPhotos", isDirectory: true) else { return }
        queue.sync { self.replayPendingMirrorDeletes() }
        if let urls = try? fileManager.contentsOfDirectory(at: cloudPhotos, includingPropertiesForKeys: nil) {
            urls.forEach { try? fileManager.startDownloadingUbiquitousItem(at: $0) }
        }
        let stillDownloading = copyMissingFiles(from: cloudPhotos, to: PeakSetPhotoStore.directory)
        if stillDownloading == 0 { photoRestorePending = false }
    }

    /// Copies photos the destination lacks and returns how many were skipped
    /// because they are still downloading from iCloud (a coordinated read
    /// would block the queue until they land, forever when offline); `list()`
    /// retries those on this and later launches. Athletes' photos ("coach-")
    /// stay local.
    @discardableResult
    private func copyMissingFiles(from source: URL, to destination: URL) -> Int {
        guard let urls = try? fileManager.contentsOfDirectory(at: source, includingPropertiesForKeys: nil) else { return 0 }
        try? fileManager.createDirectory(at: destination, withIntermediateDirectories: true)
        var stillDownloading = 0
        for url in urls {
            guard let name = Self.realName(of: url), name.hasSuffix(".jpg"), !name.hasPrefix("coach-") else { continue }
            let target = destination.appendingPathComponent(name)
            let placeholder = destination.appendingPathComponent(".\(name).icloud")
            guard !fileManager.fileExists(atPath: target.path), !fileManager.fileExists(atPath: placeholder.path) else { continue }
            let realSource = source.appendingPathComponent(name)
            let sourcePlaceholder = source.appendingPathComponent(".\(name).icloud")
            if !Self.isDownloaded(realSource, placeholder: sourcePlaceholder) {
                try? fileManager.startDownloadingUbiquitousItem(at: realSource)
                stillDownloading += 1
                continue
            }
            if let data = try? readCoordinated(realSource) {
                try? data.write(to: target, options: .atomic)
            }
        }
        return stillDownloading
    }

    /// Mirror deletions that could not run yet (iCloud unavailable); replayed
    /// on later snapshots and before photos are restored, so a deleted body
    /// photo never lingers in iCloud Drive or comes back on restore.
    private static let pendingMirrorDeletesKey = "massmethod.pendingMirrorDeletes"

    func deleteMirroredPhoto(named name: String) {
        guard Self.realName(of: URL(fileURLWithPath: name)) == name, !name.contains("/") else { return }
        queue.async {
            if !self.removeMirroredPhoto(named: name) {
                let pending = UserDefaults.standard.stringArray(forKey: Self.pendingMirrorDeletesKey) ?? []
                if !pending.contains(name) {
                    UserDefaults.standard.set(Array((pending + [name]).suffix(500)), forKey: Self.pendingMirrorDeletesKey)
                }
            }
        }
    }

    /// Returns false when iCloud is unavailable, so the deletion is retried.
    @discardableResult
    private func removeMirroredPhoto(named name: String) -> Bool {
        guard let folder = iCloudDocuments()?.appendingPathComponent("ProgressPhotos", isDirectory: true) else { return false }
        // An evicted copy exists only as its ".name.icloud" placeholder.
        for url in [folder.appendingPathComponent(name), folder.appendingPathComponent(".\(name).icloud")] where fileManager.fileExists(atPath: url.path) {
            var coordinationError: NSError?
            NSFileCoordinator().coordinate(writingItemAt: url, options: .forDeleting, error: &coordinationError) { target in
                try? self.fileManager.removeItem(at: target)
            }
        }
        return true
    }

    private func replayPendingMirrorDeletes() {
        let pending = UserDefaults.standard.stringArray(forKey: Self.pendingMirrorDeletesKey) ?? []
        guard !pending.isEmpty else { return }
        let remaining = pending.filter { !removeMirroredPhoto(named: $0) }
        UserDefaults.standard.set(remaining, forKey: Self.pendingMirrorDeletesKey)
    }

    /// Maps ".name.ext.icloud" placeholders to "name.ext"; nil for other hidden files.
    static func realName(of url: URL) -> String? {
        let name = url.lastPathComponent
        if name.hasPrefix("."), name.hasSuffix(".icloud") {
            return String(name.dropFirst().dropLast(".icloud".count))
        }
        return name.hasPrefix(".") ? nil : name
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

    func detach() {
        deliver = nil
    }

    /// Reads off the main thread: a large file handed over at launch would
    /// otherwise block the UI and risk the launch watchdog. `pending` and
    /// `deliver` are only touched on the main queue.
    func open(_ url: URL) {
        DispatchQueue.global(qos: .userInitiated).async {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            // Check the size before reading: the app opens any .json file.
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            var text = ""
            if size > 0, size < 50_000_000, let data = try? Data(contentsOf: url) {
                // An empty string reaches the web app's "could not be read" message.
                text = String(data: data, encoding: .utf8) ?? ""
            }
            // Files handed over by AirDrop, Mail or Messages are copied into
            // Documents/Inbox (visible in Files); remove the copy once read.
            if url.deletingLastPathComponent().lastPathComponent == "Inbox",
               let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
               url.resolvingSymlinksInPath().path.hasPrefix(documents.appendingPathComponent("Inbox").resolvingSymlinksInPath().path) {
                try? FileManager.default.removeItem(at: url)
            }
            DispatchQueue.main.async { self.enqueue(text) }
        }
    }

    private func enqueue(_ text: String) {
        if let deliver {
            deliver(text)
        } else {
            pending.append(text)
        }
    }
}
