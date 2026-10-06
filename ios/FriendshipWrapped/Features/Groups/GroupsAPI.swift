import Foundation

struct GroupInput: Encodable {
    let name: String
    let emoji: String
}

/// Partial update: nil fields are left out of the JSON body.
struct GroupUpdate: Encodable {
    var name: String?
    var emoji: String?
}

private struct GroupsResponse: Decodable {
    let groups: [FriendGroup]
}

private struct GroupResponse: Decodable {
    let group: FriendGroup
}

private struct MembersResponse: Decodable {
    let members: [GroupMember]
}

private struct LeaveResponse: Decodable {
    let groupDeleted: Bool
}

extension APIClient {
    private func groupPath(_ groupID: String) -> String {
        "/groups/\(groupID.pathSegment)"
    }

    func fetchMyGroups() async throws -> [FriendGroup] {
        let response: GroupsResponse = try await send(.get, "/groups")
        return response.groups
    }

    func fetchGroup(_ groupID: String) async throws -> FriendGroup {
        let response: GroupResponse = try await send(.get, groupPath(groupID))
        return response.group
    }

    /// Owner first, then by join date.
    func fetchMembers(ofGroup groupID: String) async throws -> [GroupMember] {
        let response: MembersResponse = try await send(.get, "\(groupPath(groupID))/members")
        return response.members
    }

    func createGroup(_ input: GroupInput) async throws -> FriendGroup {
        let response: GroupResponse = try await send(.post, "/groups", body: input)
        return response.group
    }

    /// Owner only.
    func updateGroup(_ groupID: String, _ update: GroupUpdate) async throws -> FriendGroup {
        let response: GroupResponse = try await send(.patch, groupPath(groupID), body: update)
        return response.group
    }

    /// Returns true when the group was deleted because you were its last member.
    @discardableResult
    func leaveGroup(_ groupID: String) async throws -> Bool {
        let response: LeaveResponse = try await send(.post, "\(groupPath(groupID))/leave")
        return response.groupDeleted
    }

    /// Owner only.
    func removeMember(_ userID: String, fromGroup groupID: String) async throws {
        try await perform(.delete, "\(groupPath(groupID))/members/\(userID.pathSegment)")
    }
}
