import Foundation

/// The five reactions, in the order they're shown.
enum ReactionType: String, Codable, CaseIterable, Identifiable, Hashable {
    case heart = "HEART"
    case laugh = "LAUGH"
    case skull = "SKULL"
    case fire = "FIRE"
    case cry = "CRY"

    var id: String { rawValue }

    var emoji: String {
        switch self {
        case .heart: return "❤️"
        case .laugh: return "😂"
        case .skull: return "💀"
        case .fire: return "🔥"
        case .cry: return "😭"
        }
    }

    var label: String {
        switch self {
        case .heart: return "Love"
        case .laugh: return "Laughing"
        case .skull: return "Dead"
        case .fire: return "Fire"
        case .cry: return "Crying"
        }
    }
}

/// How a photo has been reacted to, as you see it.
struct ReactionSummary: Codable, Hashable {
    /// Every type is present, zero included. Keyed by the raw type ("HEART", …).
    var counts: [String: Int]
    var total: Int
    /// Your own reaction.
    var mine: ReactionType?

    func count(_ type: ReactionType) -> Int {
        counts[type.rawValue] ?? 0
    }

    /// The summary after switching your reaction to `next` (nil takes it back), for showing a tap instantly.
    func with(_ next: ReactionType?) -> ReactionSummary {
        var updated = self
        if let mine { updated.counts[mine.rawValue, default: 0] -= 1 }
        if let next { updated.counts[next.rawValue, default: 0] += 1 }
        updated.total += (next == nil ? 0 : 1) - (mine == nil ? 0 : 1)
        updated.mine = next
        return updated
    }
}

/// One person's reaction, for "who reacted".
struct ReactionEntry: Codable, Identifiable, Hashable {
    let user: UserSummary
    let type: ReactionType
    let createdAt: Date

    var id: String { user.id }
}

struct Comment: Codable, Identifiable, Hashable {
    let id: String
    let photoId: String
    let body: String
    let createdAt: Date
    let author: UserSummary
    /// Only the author may delete a comment.
    let canDelete: Bool
}

/// One page of a photo's comments, oldest first.
struct CommentPage: Decodable {
    let comments: [Comment]
    let nextCursor: String?
}
