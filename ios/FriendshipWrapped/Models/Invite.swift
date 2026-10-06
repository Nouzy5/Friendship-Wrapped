import Foundation

/// A freshly created invite. Only its hash is stored on the server, so the token can't be fetched again later.
struct CreatedInvite: Codable, Hashable {
    let token: String
    let expiresAt: Date
}

/// What someone holding an invite link may see before joining.
struct InvitePreview: Codable, Hashable {
    struct GroupInfo: Codable, Hashable {
        let name: String
        let emoji: String
        let memberCount: Int
    }

    let group: GroupInfo
    let expiresAt: Date
    /// Set when the signed-in viewer already belongs to the group.
    let memberOfGroupId: String?
}
