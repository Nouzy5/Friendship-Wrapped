import Foundation

/// A photo as the API returns it. Every rendition is a WebP served through the API,
/// which checks access on each request, so images are loaded with the session cookie.
struct Photo: Codable, Identifiable, Hashable {
    struct ImageURLs: Codable, Hashable {
        /// Up to 2560 px.
        let full: String
        /// Up to 1280 px.
        let medium: String
        /// 480 px square, centre-cropped: for grids.
        let thumbnail: String
    }

    struct GroupInfo: Codable, Hashable {
        let id: String
        let name: String
        let emoji: String
    }

    let id: String
    let groupId: String
    let caption: String?
    /// Pixel size of the full rendition, so space can be reserved before it loads.
    let width: Int
    let height: Int
    /// Upload time.
    let createdAt: Date
    let uploader: UserSummary
    let imageUrls: ImageURLs
    /// Only the uploader may delete a photo.
    let canDelete: Bool
    /// Only included by `GET /photos/:photoId`.
    let group: GroupInfo?

    var aspectRatio: CGFloat {
        CGFloat(width) / CGFloat(max(height, 1))
    }

    var altText: String {
        caption ?? "Photo by \(uploader.displayName)"
    }
}

/// One page of a group's photos, newest first.
struct PhotoPage: Decodable {
    let photos: [Photo]
    let nextCursor: String?
}
