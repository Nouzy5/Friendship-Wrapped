import Foundation

/// A photo as one viewer sees it. Every rendition is a WebP served through the API,
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
    /// Reacting and commenting are for current members of the photo's group.
    let canInteract: Bool
    var reactions: ReactionSummary
    var commentCount: Int
    /// Your private bookmark.
    var isFavorite: Bool
    /// Only included by `GET /photos/:photoId`.
    let group: GroupInfo?
    /// The photos either side of this one in its group feed. Only included by `GET /photos/:photoId`,
    /// and null there for someone who can see the photo but not its group (they posted it, then left).
    let feed: FeedNeighbors?

    var aspectRatio: CGFloat {
        CGFloat(width) / CGFloat(max(height, 1))
    }

    var altText: String {
        caption ?? "Photo by \(uploader.displayName)"
    }
}

/// Neighbours in the group feed, which is newest first; nil at either end.
struct FeedNeighbors: Codable, Hashable {
    let newerId: String?
    let olderId: String?
}

/// One page of a group's photos, newest first. Pass `nextCursor` to get the next page.
struct PhotoPage: Decodable {
    let photos: [Photo]
    let nextCursor: String?
}
