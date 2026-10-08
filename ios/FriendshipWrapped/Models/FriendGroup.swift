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
    /// Your colour here; nil only when all twelve were taken when you joined.
    let myColor: MemberColor?
    /// Muted groups send you no notifications (their photos still show in the app).
    let muted: Bool
    /// The group photo (a server path); nil shows the badge of everyone's colours with the emoji.
    let avatarUrl: String?

    var isOwner: Bool { myRole == .owner }

    init(
        id: String,
        name: String,
        emoji: String,
        createdAt: Date,
        memberCount: Int,
        myRole: GroupRole,
        myColor: MemberColor?,
        muted: Bool,
        avatarUrl: String?
    ) {
        self.id = id
        self.name = name
        self.emoji = emoji
        self.createdAt = createdAt
        self.memberCount = memberCount
        self.myRole = myRole
        self.myColor = myColor
        self.muted = muted
        self.avatarUrl = avatarUrl
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, emoji, createdAt, memberCount, myRole, myColor, muted, avatarUrl
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        emoji = try container.decode(String.self, forKey: .emoji)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        memberCount = try container.decode(Int.self, forKey: .memberCount)
        myRole = try container.decode(GroupRole.self, forKey: .myRole)
        myColor = container.decodeMemberColor(forKey: .myColor)
        muted = (try? container.decodeIfPresent(Bool.self, forKey: .muted)) ?? false
        avatarUrl = try? container.decodeIfPresent(String.self, forKey: .avatarUrl)
    }
}

struct GroupMember: Codable, Identifiable, Hashable {
    let user: UserSummary
    let role: GroupRole
    let joinedAt: Date
    /// Their colour in this group; nil beyond twelve members (they show neutral).
    let color: MemberColor?

    var id: String { user.id }

    private enum CodingKeys: String, CodingKey {
        case user, role, joinedAt, color
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        user = try container.decode(UserSummary.self, forKey: .user)
        role = try container.decode(GroupRole.self, forKey: .role)
        joinedAt = try container.decode(Date.self, forKey: .joinedAt)
        color = container.decodeMemberColor(forKey: .color)
    }
}
