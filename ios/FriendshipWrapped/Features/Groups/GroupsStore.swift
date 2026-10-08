import Foundation
import Observation

/// Cached groups and members, shared by every screen so edits show up everywhere
/// (the web app's TanStack Query cache for groups), and the group you're looking at.
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
    @ObservationIgnored private var membersLoadedAt: [String: Date] = [:]
    @ObservationIgnored private var membersInFlight: [String: Task<Void, Never>] = [:]
    /// Counts groups created, joined or left here: a list that was already on its way from
    /// before such a change would bring a left group back (or drop a new one), so it's fetched again.
    private var membershipChanges = 0
    /// The group you last looked at (remembered on this phone): Home opens it, the camera posts
    /// to it, Memories shows it, and your colour in it is the app's accent.
    private var rememberedGroupID: String?

    private let api: APIClient
    @ObservationIgnored private let defaults: UserDefaults
    private static let currentGroupKey = "fw.current-group"
    /// How long a group's member list counts as fresh (colours rarely change).
    private static let membersFreshFor: TimeInterval = 60

    init(api: APIClient = .shared, defaults: UserDefaults = .standard) {
        self.api = api
        self.defaults = defaults
        rememberedGroupID = defaults.string(forKey: Self.currentGroupKey)
    }

    func group(_ groupID: String) -> FriendGroup? {
        groupsByID[groupID]
    }

    /// Owner first, then by join date. Nil until loaded (see `loadMembersIfNeeded`).
    func members(of groupID: String) -> [GroupMember]? {
        membersByGroupID[groupID]
    }

    /// Someone in a group, or nil for people who have left (they show neutral).
    func member(_ userID: String, in groupID: String) -> GroupMember? {
        membersByGroupID[groupID]?.first { $0.user.id == userID }
    }

    /// A person's colour in a group: it marks their photos, reactions and comments.
    func colorOf(_ userID: String, in groupID: String) -> MemberColor? {
        member(userID, in: groupID)?.color
    }

    /// The members' colours in the order they joined, for the group's badge.
    func badgeColors(of groupID: String) -> [MemberColor?]? {
        membersByGroupID[groupID]?.sorted { $0.joinedAt < $1.joinedAt }.map(\.color)
    }

    // MARK: - The group you're looking at

    /// The remembered group while you're still in it, else your first one. Nil while your groups
    /// load and when you have none (check `listState`).
    var currentGroup: FriendGroup? {
        if let rememberedGroupID, let group = groupsByID[rememberedGroupID], groups.contains(where: { $0.id == group.id }) {
            return group
        }
        return groups.first
    }

    /// Looking at a group makes it the current one.
    func setCurrentGroup(_ groupID: String) {
        guard rememberedGroupID != groupID else { return }
        rememberedGroupID = groupID
        defaults.set(groupID, forKey: Self.currentGroupKey)
    }

    // MARK: - Loading

    func loadGroupsIfNeeded() async {
        if listState == .idle { await loadGroups() }
    }

    func loadGroups() async {
        if groups.isEmpty { listState = .loading }
        let changesBefore = membershipChanges
        do {
            let fresh = try await api.fetchMyGroups()
            guard membershipChanges == changesBefore else {
                // After signing out (reset) there's nothing to load; otherwise fetch the list again.
                if listState != .idle { await loadGroups() }
                return
            }
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
        let members = try await api.fetchMembers(ofGroup: groupID)
        membersByGroupID[groupID] = members
        membersLoadedAt[groupID] = Date()
    }

    /// Loads the members unless they're fresh or already on their way. Failures are quiet:
    /// people just show neutral until the next try.
    func loadMembersIfNeeded(of groupID: String) async {
        if let loadedAt = membersLoadedAt[groupID], Date().timeIntervalSince(loadedAt) < Self.membersFreshFor { return }
        if let inFlight = membersInFlight[groupID] { return await inFlight.value }
        let task = Task { [weak self] in
            guard let self else { return }
            try? await self.loadMembers(of: groupID)
        }
        membersInFlight[groupID] = task
        await task.value
        membersInFlight[groupID] = nil
    }

    // MARK: - Changes

    func createGroup(name: String, emoji: String) async throws -> FriendGroup {
        let group = try await api.createGroup(GroupInput(name: name, emoji: emoji))
        membershipChanges += 1
        remember(group)
        return group
    }

    func updateGroup(_ groupID: String, name: String, emoji: String) async throws -> FriendGroup {
        let group = try await api.updateGroup(groupID, GroupUpdate(name: name, emoji: emoji))
        remember(group)
        return group
    }

    /// Your colour or mute. A colour someone else just took is a `409 COLOR_TAKEN`: the members
    /// are reloaded either way, so the picker shows who has what now.
    @discardableResult
    func updateMyMembership(in groupID: String, color: MemberColor? = nil, muted: Bool? = nil) async throws -> FriendGroup {
        do {
            let group = try await api.updateMyMembership(inGroup: groupID, MembershipUpdate(color: color, muted: muted))
            remember(group)
            if color != nil { try? await loadMembers(of: groupID) }
            return group
        } catch {
            if color != nil { try? await loadMembers(of: groupID) }
            throw error
        }
    }

    /// The group photo (owner only).
    func setGroupPhoto(_ groupID: String, jpeg: Data) async throws {
        remember(try await api.uploadGroupAvatar(groupID, jpeg: jpeg))
    }

    func removeGroupPhoto(_ groupID: String) async throws {
        remember(try await api.removeGroupAvatar(groupID))
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
        membershipChanges += 1
        remember(group)
        membersByGroupID[group.id] = nil
        membersLoadedAt[group.id] = nil
    }

    func forget(_ groupID: String) {
        membershipChanges += 1
        groupsByID[groupID] = nil
        membersByGroupID[groupID] = nil
        membersLoadedAt[groupID] = nil
        groups.removeAll { $0.id == groupID }
    }

    /// After blocking or unblocking someone: what each group shows of them changes.
    func invalidateMembers() {
        membersLoadedAt = [:]
    }

    /// Drops everything, e.g. when someone signs out, so the next account sees nothing of this one's data
    /// (nor starts in its group, or its colour).
    func reset() {
        membershipChanges += 1
        groups = []
        listState = .idle
        groupsByID = [:]
        membersByGroupID = [:]
        membersLoadedAt = [:]
        for task in membersInFlight.values { task.cancel() }
        membersInFlight = [:]
        rememberedGroupID = nil
        defaults.removeObject(forKey: Self.currentGroupKey)
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
