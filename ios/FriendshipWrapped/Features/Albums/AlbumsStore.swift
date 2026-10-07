import Foundation
import Observation

/// Cached albums per group, shared by the Albums tab, the album screen and the viewer's album sheet.
@MainActor
@Observable
final class AlbumsStore {
    private var albumsByGroupID: [String: [Album]] = [:]
    private var details: [String: Album] = [:]

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    func albums(in groupID: String) -> [Album]? {
        albumsByGroupID[groupID]
    }

    func album(_ albumID: String) -> Album? {
        if let album = details[albumID] { return album }
        for albums in albumsByGroupID.values {
            if let match = albums.first(where: { $0.id == albumID }) { return match }
        }
        return nil
    }

    // MARK: - Loading

    func loadAlbums(in groupID: String) async throws {
        albumsByGroupID[groupID] = try await api.fetchAlbums(inGroup: groupID)
    }

    /// Non-members get a 404, so an album you can no longer see is dropped from the cache.
    @discardableResult
    func loadAlbum(_ albumID: String) async throws -> Album {
        do {
            let album = try await api.fetchAlbum(albumID)
            remember(album)
            return album
        } catch let error as APIError where error.status == 404 || error.status == 400 {
            forget(albumID)
            throw error
        }
    }

    // MARK: - Changes

    func create(in groupID: String, name: String) async throws -> Album {
        let album = try await api.createAlbum(inGroup: groupID, name: name)
        albumsByGroupID[groupID]?.insert(album, at: 0)
        details[album.id] = album
        return album
    }

    func rename(_ albumID: String, to name: String) async throws {
        let album = try await api.renameAlbum(albumID, to: name)
        remember(album)
    }

    /// Deletes on the server. Navigate away first, then call `forget(_:)`.
    func delete(_ albumID: String) async throws {
        try await api.deleteAlbum(albumID)
    }

    /// Adds in batches of 100 (the server's limit per request).
    func addPhotos(_ photoIDs: [String], to albumID: String) async throws {
        var remaining = photoIDs[...]
        while !remaining.isEmpty {
            let batch = Array(remaining.prefix(100))
            remaining = remaining.dropFirst(batch.count)
            let album = try await api.addPhotos(batch, toAlbum: albumID)
            remember(album)
        }
    }

    func removePhoto(_ photoID: String, from albumID: String) async throws {
        let album = try await api.removePhoto(photoID, fromAlbum: albumID)
        remember(album)
    }

    func forget(_ albumID: String) {
        details[albumID] = nil
        for groupID in Array(albumsByGroupID.keys) {
            albumsByGroupID[groupID]?.removeAll { $0.id == albumID }
        }
    }

    func reset() {
        albumsByGroupID = [:]
        details = [:]
    }

    /// Keeps every copy in step: photo count, cover and name change with each edit.
    private func remember(_ album: Album) {
        details[album.id] = album
        if let index = albumsByGroupID[album.groupId]?.firstIndex(where: { $0.id == album.id }) {
            albumsByGroupID[album.groupId]?[index] = album
        }
    }
}
