import Foundation

private struct PhotoResponse: Decodable {
    let photo: Photo
}

extension APIClient {
    /// The group's newest photos (the first page; the paginated feed comes with Phase 5).
    func fetchGroupPhotos(_ groupID: String) async throws -> PhotoPage {
        try await send(.get, "/groups/\(groupID.pathSegment)/photos")
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
