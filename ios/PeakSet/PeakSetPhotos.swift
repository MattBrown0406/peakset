import Foundation

/// Progress photos live as JPEG files in Documents/ProgressPhotos.
enum PeakSetPhotoStore {
    static var directory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ProgressPhotos", isDirectory: true)
    }
}
