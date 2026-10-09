import Foundation

private struct CreatedInviteResponse: Decodable {
    let invite: CreatedInvite
}

private struct InvitePreviewResponse: Decodable {
    let invite: InvitePreview
}

private struct JoinedGroupResponse: Decodable {
    let group: FriendGroup
}

private struct CreateInviteBody: Encodable {
    let lifetimeDays: Int
}

extension APIClient {
    /// Any member can create a link. It lasts 1, 7 (the default) or 30 days.
    func createInvite(forGroup groupID: String, lifetimeDays: Int = InviteLifetime.defaultDays) async throws -> CreatedInvite {
        let response: CreatedInviteResponse = try await send(
            .post,
            "/groups/\(groupID.pathSegment)/invites",
            body: CreateInviteBody(lifetimeDays: lifetimeDays)
        )
        return response.invite
    }

    /// Owner only: every existing invite link for the group stops working.
    func resetInvites(forGroup groupID: String) async throws {
        try await perform(.delete, "/groups/\(groupID.pathSegment)/invites")
    }

    /// Public: the link itself is the credential. Signed-in viewers also learn if they're already in.
    func fetchInvitePreview(_ token: String) async throws -> InvitePreview {
        let response: InvitePreviewResponse = try await send(.get, "/invites/\(token.pathSegment)")
        return response.invite
    }

    /// Joins the group. Accepting twice is harmless.
    func acceptInvite(_ token: String) async throws -> FriendGroup {
        let response: JoinedGroupResponse = try await send(.post, "/invites/\(token.pathSegment)/accept")
        return response.group
    }
}
