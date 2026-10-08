import Foundation

/// A group's year in numbers: everything the Wrapped slides need. The server counts it
/// live from photos, reactions and comments. A year with nothing in it comes back as
/// zeros, empty lists and nils.
struct YearStats: Decodable {
    /// Someone and how many photos, reactions or comments they made.
    struct PersonCount: Decodable, Identifiable, Hashable {
        let user: UserSummary
        let count: Int
        /// Their colour in the group now; nil for people who have left.
        let color: MemberColor?

        var id: String { user.id }

        private enum CodingKeys: String, CodingKey {
            case user, count, color
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            user = try container.decode(UserSummary.self, forKey: .user)
            count = try container.decode(Int.self, forKey: .count)
            color = container.decodeMemberColor(forKey: .color)
        }
    }

    struct MonthCount: Decodable, Hashable {
        /// 1–12.
        let month: Int
        let count: Int
    }

    struct DayCount: Decodable, Hashable {
        /// "YYYY-MM-DD", a calendar day in `timeZone`.
        let date: String
        let count: Int
    }

    struct PhotoCount: Decodable, Hashable {
        let photo: Photo
        let count: Int
    }

    struct Photos: Decodable {
        /// Posted during the year.
        let total: Int
        /// 12 counts, January first.
        let byMonth: [Int]
        /// Most photos first.
        let byUser: [PersonCount]
        /// Most photos; on a tie, whoever posted first that year.
        let topPhotographer: PersonCount?
        /// On a tie, the earlier month.
        let mostActiveMonth: MonthCount?
        /// On a tie, the earlier day.
        let mostActiveDay: DayCount?
    }

    struct Reactions: Decodable {
        /// Given during the year, on any of the group's photos.
        let total: Int
        /// Most first.
        let byUser: [PersonCount]
        /// Of the photos posted during the year, the one with the most reactions (on a tie, the earlier photo).
        let mostReactedPhoto: PhotoCount?
    }

    struct Comments: Decodable {
        /// Written during the year, on any of the group's photos.
        let total: Int
        /// Most first.
        let byUser: [PersonCount]
    }

    let group: Photo.GroupInfo
    let year: Int
    /// The year, its months and its days run from local midnight in this IANA zone.
    let timeZone: String
    /// The exact span counted: from (inclusive) to (exclusive).
    let from: Date
    let to: Date
    /// Members today.
    let memberCount: Int
    /// People who posted, reacted or commented in the group during the year, including anyone who has left since.
    let activeUserCount: Int
    let photos: Photos
    let reactions: Reactions
    let comments: Comments
    /// Up to 9 photos for the collage: most reactions and comments first, then the earlier photo.
    let highlights: [Photo]
}
