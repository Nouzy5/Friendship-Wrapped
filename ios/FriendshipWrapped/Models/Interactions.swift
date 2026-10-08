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

/// Who reacted with what. One reaction per person per photo.
struct Reactor: Codable, Hashable {
    let userId: String
    let type: ReactionType
}

/// How a photo has been reacted to, as you see it. Reactions from people you've blocked (or who
/// blocked you) are left out of all of it.
struct ReactionSummary: Codable, Hashable {
    /// Every type is present, zero included. Keyed by the raw type ("HEART", …).
    var counts: [String: Int]
    var total: Int
    /// Your own reaction.
    var mine: ReactionType?
    /// Everyone who reacted, first reaction first, so each reaction can show its people as
    /// dots in their colours.
    var reactors: [Reactor]

    init(counts: [String: Int], total: Int, mine: ReactionType?, reactors: [Reactor]) {
        self.counts = counts
        self.total = total
        self.mine = mine
        self.reactors = reactors
    }

    private enum CodingKeys: String, CodingKey {
        case counts, total, mine, reactors
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        counts = try container.decode([String: Int].self, forKey: .counts)
        total = try container.decode(Int.self, forKey: .total)
        // A reaction type from a newer server is shown as no reaction of yours.
        mine = (try? container.decodeIfPresent(ReactionType.self, forKey: .mine)) ?? nil
        // Reactors with a type this version doesn't know are left out (the counts still say how many).
        let raw = (try? container.decodeIfPresent([RawReactor].self, forKey: .reactors)) ?? nil
        reactors = (raw ?? []).compactMap { entry in
            ReactionType(rawValue: entry.type).map { Reactor(userId: entry.userId, type: $0) }
        }
    }

    private struct RawReactor: Decodable {
        let userId: String
        let type: String
    }

    func count(_ type: ReactionType) -> Int {
        counts[type.rawValue] ?? 0
    }

    /// The people behind one reaction (user ids), first first.
    func people(_ type: ReactionType) -> [String] {
        reactors.filter { $0.type == type }.map(\.userId)
    }

    /// The summary after switching your reaction to `next` (nil takes it back), for showing a tap
    /// instantly. Changing your reaction keeps your place among the reactors; a new one goes last.
    func with(_ next: ReactionType?, myID: String) -> ReactionSummary {
        var updated = self
        if let mine { updated.counts[mine.rawValue, default: 0] -= 1 }
        if let next { updated.counts[next.rawValue, default: 0] += 1 }
        updated.total += (next == nil ? 0 : 1) - (mine == nil ? 0 : 1)
        updated.mine = next
        if let next {
            if let index = updated.reactors.firstIndex(where: { $0.userId == myID }) {
                updated.reactors[index] = Reactor(userId: myID, type: next)
            } else {
                updated.reactors.append(Reactor(userId: myID, type: next))
            }
        } else {
            updated.reactors.removeAll { $0.userId == myID }
        }
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
