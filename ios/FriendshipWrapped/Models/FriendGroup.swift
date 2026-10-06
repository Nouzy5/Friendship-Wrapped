import Foundation

enum GroupRole: String, Codable, Hashable {
    case owner = "OWNER"
    case member = "MEMBER"
}

/// A group as seen by the signed-in member. Named `FriendGroup` so it doesn't clash with SwiftUI's `Group`.
struct FriendGroup: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let emoji: String
    let createdAt: Date
    let memberCount: Int
    let myRole: GroupRole

    var isOwner: Bool { myRole == .owner }
}

struct GroupMember: Codable, Identifiable, Hashable {
    let user: UserSummary
    let role: GroupRole
    let joinedAt: Date

    var id: String { user.id }
}
