import Foundation

private struct AlbumsResponse: Decodable {
    let albums: [Album]
}

private struct AlbumResponse: Decodable {
    let album: Album
}

private struct AlbumIDsResponse: Decodable {
    let albumIds: [String]
}

private struct AlbumNameInput: Encodable {
    let name: String
}

private struct AlbumPhotosInput: Encodable {
    let photoIds: [String]
}

extension APIClient {
    private func albumPath(_ albumID: String) -> String {
        "/albums/\(albumID.pathSegment)"
    }

    /// Newest albums first.
    func fetchAlbums(inGroup groupID: String) async throws -> [Album] {
        let response: AlbumsResponse = try await send(.get, "/groups/\(groupID.pathSegment)/albums")
        return response.albums
    }

    func fetchAlbum(_ albumID: String) async throws -> Album {
        let response: AlbumResponse = try await send(.get, albumPath(albumID))
        return response.album
    }

    /// One page of an album's photos, oldest first, so it reads like the story of the event.
    func fetchAlbumPhotos(_ albumID: String, cursor: String? = nil) async throws -> PhotoPage {
        var path = "\(albumPath(albumID))/photos"
        if let cursor { path += "?cursor=\(cursor.queryValue)" }
        return try await send(.get, path)
    }

    /// Any member can start an album. Names are 1–60 characters.
    func createAlbum(inGroup groupID: String, name: String) async throws -> Album {
        let response: AlbumResponse = try await send(
            .post,
            "/groups/\(groupID.pathSegment)/albums",
            body: AlbumNameInput(name: name)
        )
        return response.album
    }

    /// The album's creator or the group owner.
    func renameAlbum(_ albumID: String, to name: String) async throws -> Album {
        let response: AlbumResponse = try await send(.patch, albumPath(albumID), body: AlbumNameInput(name: name))
        return response.album
    }

    /// The album's creator or the group owner. Its photos stay in the group.
    func deleteAlbum(_ albumID: String) async throws {
        try await perform(.delete, albumPath(albumID))
    }

    /// Up to 100 at a time; photos already in the album are skipped.
    func addPhotos(_ photoIDs: [String], toAlbum albumID: String) async throws -> Album {
        let response: AlbumResponse = try await send(
            .post,
            "\(albumPath(albumID))/photos",
            body: AlbumPhotosInput(photoIds: photoIDs)
        )
        return response.album
    }

    func removePhoto(_ photoID: String, fromAlbum albumID: String) async throws -> Album {
        let response: AlbumResponse = try await send(.delete, "\(albumPath(albumID))/photos/\(photoID.pathSegment)")
        return response.album
    }

    /// Which of the group's albums a photo is in.
    func fetchAlbumIDs(forPhoto photoID: String) async throws -> [String] {
        let response: AlbumIDsResponse = try await send(.get, "/photos/\(photoID.pathSegment)/albums")
        return response.albumIds
    }
}
