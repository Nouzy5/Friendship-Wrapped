import Foundation
import Observation

/// Cached moments per group, shared by the Memories tab, Home's banner, a moment's own screen
/// and the camera.
@MainActor
@Observable
final class MomentsStore {
    private var momentsByGroupID: [String: [Moment]] = [:]
    private var nextCursorByGroupID: [String: String] = [:]
    private var details: [String: Moment] = [:]
    /// The moment taking photos now, by group. A group with none is in `openLoaded` only.
    private var openByGroupID: [String: Moment] = [:]
    private var openLoaded: Set<String> = []

    private(set) var isLoadingMore = false
    private(set) var loadMoreFailed = false

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    func moments(in groupID: String) -> [Moment]? {
        momentsByGroupID[groupID]
    }

    func hasMore(in groupID: String) -> Bool {
        nextCursorByGroupID[groupID] != nil
    }

    func moment(_ momentID: String) -> Moment? {
        if let moment = details[momentID] { return moment }
        for moments in momentsByGroupID.values {
            if let match = moments.first(where: { $0.id == momentID }) { return match }
        }
        return openByGroupID.values.first { $0.id == momentID }
    }

    /// The moment taking photos now. Nil when there is none, or it isn't known yet (`hasLoadedOpen`).
    func openMoment(in groupID: String) -> Moment? {
        guard let moment = openByGroupID[groupID], moment.isStillOpen() else { return nil }
        return moment
    }

    func hasLoadedOpen(in groupID: String) -> Bool {
        openLoaded.contains(groupID)
    }

    // MARK: - Loading

    /// The newest page, replacing what was there.
    func loadMoments(in groupID: String) async throws {
        let page = try await api.fetchMoments(inGroup: groupID)
        momentsByGroupID[groupID] = page.moments
        nextCursorByGroupID[groupID] = page.nextCursor
        for moment in page.moments { details[moment.id] = moment }
    }

    func loadMore(in groupID: String) async {
        guard let cursor = nextCursorByGroupID[groupID], !isLoadingMore else { return }
        isLoadingMore = true
        loadMoreFailed = false
        defer { isLoadingMore = false }
        do {
            let page = try await api.fetchMoments(inGroup: groupID, cursor: cursor)
            var list = momentsByGroupID[groupID] ?? []
            list.append(contentsOf: page.moments.filter { fresh in !list.contains { $0.id == fresh.id } })
            momentsByGroupID[groupID] = list
            nextCursorByGroupID[groupID] = page.nextCursor
            for moment in page.moments { details[moment.id] = moment }
        } catch is CancellationError {
            return
        } catch {
            loadMoreFailed = true
        }
    }

    func loadOpenMoment(in groupID: String) async throws {
        let open = try await api.fetchOpenMoment(inGroup: groupID)
        openByGroupID[groupID] = open
        openLoaded.insert(groupID)
        if let open { remember(open) }
    }

    /// Non-members get a 404, so a moment you can no longer see is dropped from the cache.
    @discardableResult
    func loadMoment(_ momentID: String) async throws -> Moment {
        do {
            let moment = try await api.fetchMoment(momentID)
            remember(moment)
            return moment
        } catch let error as APIError where error.status == 404 || error.status == 400 {
            forget(momentID)
            throw error
        }
    }

    // MARK: - Changes

    func start(in groupID: String, title: String, emoji: String?, durationHours: Int) async throws -> Moment {
        let moment = try await api.startMoment(inGroup: groupID, title: title, emoji: emoji, durationHours: durationHours)
        momentsByGroupID[groupID]?.insert(moment, at: 0)
        openByGroupID[groupID] = moment
        openLoaded.insert(groupID)
        details[moment.id] = moment
        return moment
    }

    func end(_ momentID: String) async throws {
        let moment = try await api.endMoment(momentID)
        remember(moment)
    }

    /// Deletes on the server. Navigate away first, then call `forget(_:)`.
    func delete(_ momentID: String) async throws {
        try await api.deleteMoment(momentID)
    }

    func forget(_ momentID: String) {
        details[momentID] = nil
        for groupID in Array(momentsByGroupID.keys) {
            momentsByGroupID[groupID]?.removeAll { $0.id == momentID }
        }
        for (groupID, open) in openByGroupID where open.id == momentID {
            openByGroupID[groupID] = nil
        }
    }

    func reset() {
        momentsByGroupID = [:]
        nextCursorByGroupID = [:]
        details = [:]
        openByGroupID = [:]
        openLoaded = []
        isLoadingMore = false
        loadMoreFailed = false
    }

    /// A photo went into a moment: its count, cover and the open banner change.
    func didPost(into momentID: String) {
        Task { _ = try? await loadMoment(momentID) }
    }

    /// Keeps every copy in step: photo count, cover and whether it is open change with each edit.
    private func remember(_ moment: Moment) {
        details[moment.id] = moment
        if let index = momentsByGroupID[moment.groupId]?.firstIndex(where: { $0.id == moment.id }) {
            momentsByGroupID[moment.groupId]?[index] = moment
        }
        if moment.isStillOpen() {
            openByGroupID[moment.groupId] = moment
        } else if openByGroupID[moment.groupId]?.id == moment.id {
            openByGroupID[moment.groupId] = nil
        }
    }
}
