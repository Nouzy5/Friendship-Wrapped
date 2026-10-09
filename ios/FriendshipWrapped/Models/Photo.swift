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

    /// How to play a video post. The file is served through the API like the images: with the
    /// session cookie, and in pieces (`Range`), so it starts at once and can be scrubbed.
    struct Video: Codable, Hashable {
        /// A server path, e.g. `/api/photos/<id>/video`.
        let url: String
        let durationMs: Int
        let sizeBytes: Int
        /// A Live Photo's motion: plays by itself, muted and looping.
        let isLive: Bool
    }

    struct GroupInfo: Codable, Hashable {
        let id: String
        let name: String
        let emoji: String
    }

    let id: String
    let groupId: String
    /// The moment it was posted into, if any.
    let momentId: String?
    /// Set for a video. The three images are then its poster frame, so everything that shows
    /// photos shows a video too.
    let video: Video?
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
    /// Whether you may save it to your phone: your own photos, or the uploader allows it
    /// (Settings → Privacy & safety → "Let friends save your photos").
    let canSave: Bool
    /// Only included by `GET /photos/:photoId`.
    let group: GroupInfo?
    /// The photos either side of this one in its group feed. Only included by `GET /photos/:photoId`,
    /// and null there for someone who can see the photo but not its group (they posted it, then left).
    let feed: FeedNeighbors?

    var aspectRatio: CGFloat {
        CGFloat(width) / CGFloat(max(height, 1))
    }

    var isVideo: Bool {
        video != nil
    }

    /// "photo" or "video", for labels.
    var noun: String {
        isVideo ? "video" : "photo"
    }

    var altText: String {
        caption ?? "\(isVideo ? "Video" : "Photo") by \(uploader.displayName)"
    }

    enum Variant {
        case thumbnail, medium, full
    }

    /// The image path to show at a size, minding Settings → Photos & data → Data saver
    /// (never the full-size photo).
    @MainActor
    func imagePath(_ variant: Variant) -> String {
        switch variant {
        case .thumbnail: return imageUrls.thumbnail
        case .medium: return imageUrls.medium
        case .full: return DeviceSettings.shared.values.dataSaver ? imageUrls.medium : imageUrls.full
        }
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
