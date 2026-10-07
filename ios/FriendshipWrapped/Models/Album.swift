import Foundation

/// A shared album in a group: any member can add or remove photos.
struct Album: Codable, Identifiable, Hashable {
    struct Cover: Codable, Hashable {
        let photoId: String
        let thumbnailUrl: String
    }

    let id: String
    let groupId: String
    let name: String
    let createdAt: Date
    /// Nil once the creator's account is gone.
    let createdBy: UserSummary?
    let photoCount: Int
    /// The photo most recently added to the album.
    let cover: Cover?
    /// Renaming and deleting are for the album's creator and the group owner.
    let canManage: Bool

    var photoCountText: String {
        photoCount == 1 ? "1 photo" : "\(photoCount) photos"
    }
}

/// Photos from today's date in earlier years.
struct OnThisDay: Decodable {
    struct Year: Decodable, Identifiable {
        let year: Int
        let photos: [Photo]

        var id: Int { year }
    }

    /// The day looked back from, "YYYY-MM-DD".
    let date: String
    /// Newest year first; only years that have photos.
    let years: [Year]
}
