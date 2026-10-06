import Foundation
import Observation

/// Cached groups and members, shared by every screen so edits show up everywhere
/// (the web app's TanStack Query cache for groups).
@MainActor
@Observable
final class GroupsStore {
    enum ListState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    /// Your groups, most recently joined first.
    private(set) var groups: [FriendGroup] = []
    private(set) var listState: ListState = .idle
    private var groupsByID: [String: FriendGroup] = [:]
    private var membersByGroupID: [String: [GroupMember]] = [:]

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    func group(_ groupID: String) -> FriendGroup? {
        groupsByID[groupID]
    }

    func members(of groupID: String) -> [GroupMember]? {
        membersByGroupID[groupID]
    }

    // MARK: - Loading

    func loadGroupsIfNeeded() async {
        if listState == .idle { await loadGroups() }
    }

    func loadGroups() async {
        if groups.isEmpty { listState = .loading }
        do {
            let fresh = try await api.fetchMyGroups()
            groups = fresh
            for group in fresh { groupsByID[group.id] = group }
            listState = .loaded
        } catch is CancellationError {
            if listState == .loading { listState = .idle }
        } catch {
            listState = .failed(error.asAPIError.message)
        }
    }

    /// Non-members get a 404, so a group you've left or been removed from is dropped from the cache.
    @discardableResult
    func loadGroup(_ groupID: String) async throws -> FriendGroup {
        do {
            let group = try await api.fetchGroup(groupID)
            remember(group)
            return group
        } catch let error as APIError where error.status == 404 || error.status == 400 {
            forget(groupID)
            throw error
        }
    }

    func loadMembers(of groupID: String) async throws {
        membersByGroupID[groupID] = try await api.fetchMembers(ofGroup: groupID)
    }

    // MARK: - Changes

    func createGroup(name: String, emoji: String) async throws -> FriendGroup {
        let group = try await api.createGroup(GroupInput(name: name, emoji: emoji))
        remember(group)
        return group
    }

    func updateGroup(_ groupID: String, name: String, emoji: String) async throws -> FriendGroup {
        let group = try await api.updateGroup(groupID, GroupUpdate(name: name, emoji: emoji))
        remember(group)
        return group
    }

    /// Leaves the group on the server. Navigate away first, then call `forget(_:)`,
    /// so no screen tries to reload a group you're no longer in.
    func leaveGroup(_ groupID: String) async throws {
        try await api.leaveGroup(groupID)
    }

    func removeMember(_ userID: String, from groupID: String) async throws {
        try await api.removeMember(userID, fromGroup: groupID)
        membersByGroupID[groupID]?.removeAll { $0.user.id == userID }
        _ = try? await loadGroup(groupID) // refreshes the member count
    }

    func didJoin(_ group: FriendGroup) {
        remember(group)
        membersByGroupID[group.id] = nil
    }

    func forget(_ groupID: String) {
        groupsByID[groupID] = nil
        membersByGroupID[groupID] = nil
        groups.removeAll { $0.id == groupID }
    }

    /// Drops everything, e.g. when someone signs out, so the next account sees nothing of this one's data.
    func reset() {
        groups = []
        listState = .idle
        groupsByID = [:]
        membersByGroupID = [:]
    }

    private func remember(_ group: FriendGroup) {
        groupsByID[group.id] = group
        if let index = groups.firstIndex(where: { $0.id == group.id }) {
            groups[index] = group
        } else {
            groups.insert(group, at: 0)
        }
    }
}
