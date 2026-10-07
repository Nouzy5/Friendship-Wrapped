import Foundation

private struct PhotoResponse: Decodable {
    let photo: Photo
}

extension APIClient {
    /// One page of the group's photos, newest first. Pass the previous page's `nextCursor` to continue.
    /// - Parameters:
    ///   - before: Start from photos posted before this instant (the timeline jumping to a month).
    ///   - favoritesOnly: Only the photos you've favorited.
    func fetchGroupPhotos(
        _ groupID: String,
        cursor: String? = nil,
        limit: Int = 24,
        before: Date? = nil,
        favoritesOnly: Bool = false
    ) async throws -> PhotoPage {
        var path = "/groups/\(groupID.pathSegment)/photos?limit=\(limit)"
        if let cursor { path += "&cursor=\(cursor.queryValue)" }
        if let before { path += "&before=\(ISO8601DateFormatter().string(from: before).queryValue)" }
        if favoritesOnly { path += "&favorites=true" }
        return try await send(.get, path)
    }

    /// Photos from today's date in earlier years. Days begin at midnight in your own time zone.
    func fetchOnThisDay(_ groupID: String, timeZone: TimeZone = .current) async throws -> OnThisDay {
        try await send(.get, "/groups/\(groupID.pathSegment)/photos/on-this-day?tz=\(timeZone.identifier.queryValue)")
    }

    /// 404 for photos you can't see, so their existence isn't revealed.
    func fetchPhoto(_ photoID: String) async throws -> Photo {
        let response: PhotoResponse = try await send(.get, "/photos/\(photoID.pathSegment)")
        return response.photo
    }

    /// Multipart: `caption`, then the image in `photo`. The server re-encodes it and strips metadata such as GPS.
    func uploadPhoto(toGroup groupID: String, jpeg: Data, caption: String) async throws -> Photo {
        var form = MultipartForm()
        form.addField("caption", value: caption)
        form.addFile("photo", filename: "photo.jpg", mimeType: "image/jpeg", data: jpeg)
        let response: PhotoResponse = try await upload(.post, "/groups/\(groupID.pathSegment)/photos", form: form)
        return response.photo
    }

    /// Only the uploader can delete a photo.
    func deletePhoto(_ photoID: String) async throws {
        try await perform(.delete, "/photos/\(photoID.pathSegment)")
    }
}

extension String {
    /// Percent-encodes a value for use in a URL query string.
    var queryValue: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+?#"))) ?? self
    }
}
