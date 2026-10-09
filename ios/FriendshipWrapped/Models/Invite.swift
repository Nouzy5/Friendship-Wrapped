import Foundation

/// A freshly created invite. Only its hash is stored on the server, so the token can't be fetched again later.
struct CreatedInvite: Codable, Hashable {
    let token: String
    let expiresAt: Date
}

/// How long a new invite link can last. A week unless the creator picks another.
enum InviteLifetime {
    static let options: [SegmentedPicker<Int>.Option] = [
        .init(value: 1, label: "1 day"),
        .init(value: 7, label: "7 days"),
        .init(value: 30, label: "30 days"),
    ]
    static let defaultDays = 7
}

/// What someone holding an invite link may see before joining.
struct InvitePreview: Codable, Hashable {
    struct GroupInfo: Codable, Hashable {
        let name: String
        let emoji: String
        let memberCount: Int
    }

    let group: GroupInfo
    /// The display name of whoever made the link. Missing from servers older than this field.
    let invitedBy: String?
    let expiresAt: Date
    /// Set when the signed-in viewer already belongs to the group.
    let memberOfGroupId: String?
}

/// What an expired link tells whoever opens it: who to ask for a new one.
struct ExpiredInvite: Equatable {
    let invitedBy: String
    let groupName: String
    let groupEmoji: String

    /// From the API's `INVITE_EXPIRED` error, or nil for any other error.
    init?(_ error: APIError) {
        guard error.code == "INVITE_EXPIRED", let invitedBy = error.info["invitedBy"] else { return nil }
        self.invitedBy = invitedBy
        groupName = error.info["groupName"] ?? "the group"
        groupEmoji = error.info["groupEmoji"] ?? ""
    }
}
