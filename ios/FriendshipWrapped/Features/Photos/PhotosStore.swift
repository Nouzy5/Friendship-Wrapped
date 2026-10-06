import Foundation
import Observation

/// Cached photos per group, shared by the group screen, photo screen and composer.
@MainActor
@Observable
final class PhotosStore {
    private var photosByGroupID: [String: [Photo]] = [:]
    /// Photos opened on their own screen (these include the group's name and emoji).
    private var details: [String: Photo] = [:]

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    func photos(in groupID: String) -> [Photo]? {
        photosByGroupID[groupID]
    }

    func photo(_ photoID: String) -> Photo? {
        if let detail = details[photoID] { return detail }
        for photos in photosByGroupID.values {
            if let match = photos.first(where: { $0.id == photoID }) { return match }
        }
        return nil
    }

    func loadPhotos(in groupID: String) async throws {
        photosByGroupID[groupID] = try await api.fetchGroupPhotos(groupID).photos
    }

    @discardableResult
    func loadPhoto(_ photoID: String) async throws -> Photo {
        do {
            let photo = try await api.fetchPhoto(photoID)
            details[photoID] = photo
            return photo
        } catch let error as APIError where error.status == 404 || error.status == 400 {
            forget(photoID)
            throw error
        }
    }

    func upload(_ jpeg: Data, caption: String, to groupID: String) async throws -> Photo {
        let photo = try await api.uploadPhoto(toGroup: groupID, jpeg: jpeg, caption: caption)
        if photosByGroupID[groupID] != nil {
            photosByGroupID[groupID]?.insert(photo, at: 0)
        }
        return photo
    }

    /// Deletes on the server. Navigate away first, then call `forget(_:)`.
    func delete(_ photo: Photo) async throws {
        try await api.deletePhoto(photo.id)
    }

    func forget(_ photoID: String) {
        details[photoID] = nil
        for groupID in Array(photosByGroupID.keys) {
            photosByGroupID[groupID]?.removeAll { $0.id == photoID }
        }
    }

    func reset() {
        photosByGroupID = [:]
        details = [:]
    }
}
