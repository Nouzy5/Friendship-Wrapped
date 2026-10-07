import Foundation

/// A Wrapped you can open: one per group and year with photos (years in your time zone).
struct WrappedSummary: Decodable, Identifiable, Hashable {
    let group: Photo.GroupInfo
    let year: Int
    /// False while the year is still going (the numbers keep growing).
    let final: Bool

    var id: String { "\(group.id)-\(year)" }
}

/// A group's year as a story of slides. The server decides which slides there are;
/// the words around the numbers are written here.
struct Wrapped: Decodable {
    let group: Photo.GroupInfo
    let year: Int
    let final: Bool
    /// The zone the year was counted in.
    let timeZone: String
    /// When the numbers were counted: now for a year in progress, or when a finished year was saved.
    let generatedAt: Date
    /// In order. Slide types this version of the app doesn't know (from a newer server) are left out.
    let slides: [WrappedSlide]

    private enum CodingKeys: String, CodingKey {
        case group, year, final, timeZone, generatedAt, slides
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        group = try container.decode(Photo.GroupInfo.self, forKey: .group)
        year = try container.decode(Int.self, forKey: .year)
        final = try container.decode(Bool.self, forKey: .final)
        timeZone = try container.decode(String.self, forKey: .timeZone)
        generatedAt = try container.decode(Date.self, forKey: .generatedAt)
        slides = try container.decode([WrappedSlide].self, forKey: .slides).filter { $0 != .unknown }
    }
}

/// One slide of the story, decoded by its `type`.
enum WrappedSlide: Decodable, Hashable {
    typealias PersonCount = YearStats.PersonCount

    case intro
    case photos(total: Int, photographerCount: Int)
    case topPhotographer(top: PersonCount, runnersUp: [PersonCount])
    /// `month` is 1–12; `byMonth` has 12 counts, January first.
    case busiestMonth(month: Int, count: Int, byMonth: [Int], busiestDay: YearStats.DayCount?)
    case mostReactedPhoto(photo: Photo, count: Int)
    case reactions(total: Int, comments: Int, topReactor: PersonCount?)
    /// Up to 9 highlights, at least 2.
    case collage(photos: [Photo])
    case outro(photos: Int, reactions: Int, comments: Int, people: Int)
    /// A slide from a newer server that this version of the app can't show.
    case unknown

    private enum CodingKeys: String, CodingKey {
        case type
        case total, photographerCount
        case top, runnersUp
        case month, count, byMonth, busiestDay
        case photo
        case comments, topReactor
        case photos, reactions, people
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "intro":
            self = .intro
        case "photos":
            self = try .photos(
                total: container.decode(Int.self, forKey: .total),
                photographerCount: container.decode(Int.self, forKey: .photographerCount)
            )
        case "topPhotographer":
            self = try .topPhotographer(
                top: container.decode(PersonCount.self, forKey: .top),
                runnersUp: container.decode([PersonCount].self, forKey: .runnersUp)
            )
        case "busiestMonth":
            self = try .busiestMonth(
                month: container.decode(Int.self, forKey: .month),
                count: container.decode(Int.self, forKey: .count),
                byMonth: container.decode([Int].self, forKey: .byMonth),
                busiestDay: container.decodeIfPresent(YearStats.DayCount.self, forKey: .busiestDay)
            )
        case "mostReactedPhoto":
            self = try .mostReactedPhoto(
                photo: container.decode(Photo.self, forKey: .photo),
                count: container.decode(Int.self, forKey: .count)
            )
        case "reactions":
            self = try .reactions(
                total: container.decode(Int.self, forKey: .total),
                comments: container.decode(Int.self, forKey: .comments),
                topReactor: container.decodeIfPresent(PersonCount.self, forKey: .topReactor)
            )
        case "collage":
            self = try .collage(photos: container.decode([Photo].self, forKey: .photos))
        case "outro":
            self = try .outro(
                photos: container.decode(Int.self, forKey: .photos),
                reactions: container.decode(Int.self, forKey: .reactions),
                comments: container.decode(Int.self, forKey: .comments),
                people: container.decode(Int.self, forKey: .people)
            )
        default:
            self = .unknown
        }
    }
}
