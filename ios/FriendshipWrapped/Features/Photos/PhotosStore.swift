import Foundation
import Observation

/// Cached photos, shared by the group feed, the photo viewer and the composer, so a reaction,
/// favorite or new comment shows up everywhere at once (the web app's TanStack Query cache).
@MainActor
@Observable
final class PhotosStore {
    /// A group's feed: the pages loaded so far, newest first.
    struct GroupFeed {
        var photos: [Photo] = []
        var nextCursor: String?
        var isLoadingMore = false
        var loadMoreFailed = false

        var hasMore: Bool { nextCursor != nil }
    }

    private var feeds: [String: GroupFeed] = [:]
    /// Photos opened in the viewer (these include the group and the feed neighbours).
    private var details: [String: Photo] = [:]
    /// Photos seen in other lists (timeline, favorites, albums, On This Day).
    private var seen: [String: Photo] = [:]
    /// Photos deleted (or found gone) since lists were loaded, so those lists leave them out.
    private(set) var deletedPhotoIDs: Set<String> = []
    /// The last reaction or favorite request per photo ("reaction:<id>", "favorite:<id>"): the
    /// next one waits for it, so a quick tap and untap reach the server in that order.
    private var lastRequests: [String: Task<Void, Never>] = [:]
    /// Taps so far per key, so only the latest tap's answer is shown (like the web app).
    private var taps: [String: Int] = [:]

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    func feed(for groupID: String) -> GroupFeed? {
        feeds[groupID]
    }

    func photo(_ photoID: String) -> Photo? {
        if let detail = details[photoID] { return detail }
        for feed in feeds.values {
            if let match = feed.photos.first(where: { $0.id == photoID }) { return match }
        }
        return seen[photoID]
    }

    /// Photos listed elsewhere, so opening one shows it straight away.
    func remember(_ photos: [Photo]) {
        for photo in photos { seen[photo.id] = photo }
    }

    // MARK: - Loading

    /// Loads the first page again, replacing what was there (pull to refresh, opening the group).
    func refreshFeed(in groupID: String) async throws {
        let page = try await api.fetchGroupPhotos(groupID)
        feeds[groupID] = GroupFeed(photos: page.photos, nextCursor: page.nextCursor)
    }

    /// Coming back to a group: photos posted since go on top and the newest ones' counts are
    /// updated, but the pages scrolled through stay, and so does your place in them.
    func refreshNewest(in groupID: String) async throws {
        guard feeds[groupID] != nil else { return try await refreshFeed(in: groupID) }
        let page = try await api.fetchGroupPhotos(groupID)
        guard var feed = feeds[groupID] else { return }
        let known = Set(feed.photos.map(\.id))
        // No overlap with what's loaded (lots of new photos, or everything deleted): start over.
        guard page.photos.contains(where: { known.contains($0.id) }) else {
            feeds[groupID] = GroupFeed(photos: page.photos, nextCursor: page.nextCursor)
            return
        }
        for photo in page.photos {
            if let index = feed.photos.firstIndex(where: { $0.id == photo.id }) { feed.photos[index] = photo }
        }
        feed.photos.insert(contentsOf: page.photos.filter { !known.contains($0.id) }, at: 0)
        feeds[groupID] = feed
    }

    /// The next page, when you scroll to the end of the feed.
    func loadMore(in groupID: String) async {
        guard let feed = feeds[groupID], let cursor = feed.nextCursor, !feed.isLoadingMore else { return }
        feeds[groupID]?.isLoadingMore = true
        feeds[groupID]?.loadMoreFailed = false
        do {
            let page = try await api.fetchGroupPhotos(groupID, cursor: cursor)
            // Unless a pull to refresh started the feed again meanwhile: this page doesn't follow on.
            if feeds[groupID]?.nextCursor == cursor {
                let known = Set(feeds[groupID]?.photos.map(\.id) ?? [])
                feeds[groupID]?.photos.append(contentsOf: page.photos.filter { !known.contains($0.id) })
                feeds[groupID]?.nextCursor = page.nextCursor
            }
        } catch is CancellationError {
            // Try again next time the end of the feed comes into view.
        } catch {
            feeds[groupID]?.loadMoreFailed = true
        }
        feeds[groupID]?.isLoadingMore = false
    }

    @discardableResult
    func loadPhoto(_ photoID: String) async throws -> Photo {
        do {
            let photo = try await api.fetchPhoto(photoID)
            details[photoID] = photo
            // Keep the feed's copy in step (counts, reactions) too.
            replaceInFeeds(photo)
            return photo
        } catch let error as APIError where error.status == 404 || error.status == 400 {
            forget(photoID)
            throw error
        }
    }

    // MARK: - Changes

    /// `progress` gets the fraction sent so far (0–1), on a background queue.
    func upload(
        _ jpeg: Data,
        caption: String,
        to groupID: String,
        progress: (@Sendable (Double) -> Void)? = nil
    ) async throws -> Photo {
        let photo = try await api.uploadPhoto(toGroup: groupID, jpeg: jpeg, caption: caption, progress: progress)
        if feeds[groupID]?.photos.contains(where: { $0.id == photo.id }) == false {
            feeds[groupID]?.photos.insert(photo, at: 0)
        }
        return photo
    }

    /// Deletes on the server. Navigate away first, then call `forget(_:)`.
    func delete(_ photo: Photo) async throws {
        try await api.deletePhoto(photo.id)
    }

    /// Reacts (or, with nil, takes your reaction back). Shows instantly; taps are sent in order
    /// and only the last one's answer is shown, so quick changes of mind don't flicker.
    /// `myID` is the signed-in user's id, so your dot joins (or leaves) the reaction straight away.
    func react(to photoID: String, with type: ReactionType?, myID: String) async throws {
        guard let current = photo(photoID) else { return }
        update(photoID) { $0.reactions = current.reactions.with(type, myID: myID) }

        let key = "reaction:\(photoID)"
        let tap = nextTap(key)
        let previous = lastRequests[key]
        let request = Task { [api] () async throws -> ReactionSummary in
            _ = await previous?.value
            if let type { return try await api.setReaction(type, onPhoto: photoID) }
            return try await api.removeReaction(fromPhoto: photoID)
        }
        lastRequests[key] = Task { _ = try? await request.value }
        do {
            let summary = try await request.value
            if taps[key] == tap { update(photoID) { $0.reactions = summary } }
        } catch {
            // Show what the server has, unless a later tap is still on its way. Offline that
            // fails too, so put back what was there before the tap.
            if taps[key] == tap, (try? await loadPhoto(photoID)) == nil, taps[key] == tap {
                update(photoID) { $0.reactions = current.reactions }
            }
            throw error
        }
    }

    /// Shows instantly; like reactions, taps are sent in order and the last one wins.
    func setFavorite(_ favorite: Bool, photoID: String) async throws {
        let before = photo(photoID)?.isFavorite
        update(photoID) { $0.isFavorite = favorite }

        let key = "favorite:\(photoID)"
        let tap = nextTap(key)
        let previous = lastRequests[key]
        let request = Task { [api] () async throws -> Bool in
            _ = await previous?.value
            return try await api.setFavorite(favorite, photoID: photoID)
        }
        lastRequests[key] = Task { _ = try? await request.value }
        do {
            let saved = try await request.value
            if taps[key] == tap { update(photoID) { $0.isFavorite = saved } }
        } catch {
            if taps[key] == tap, (try? await loadPhoto(photoID)) == nil, taps[key] == tap, let before {
                update(photoID) { $0.isFavorite = before }
            }
            throw error
        }
    }

    private func nextTap(_ key: String) -> Int {
        let tap = (taps[key] ?? 0) + 1
        taps[key] = tap
        return tap
    }

    /// After adding (+1) or deleting (-1) a comment, so feed cards show the new count.
    func adjustCommentCount(of photoID: String, by delta: Int) {
        update(photoID) { $0.commentCount = max(0, $0.commentCount + delta) }
    }

    func forget(_ photoID: String) {
        deletedPhotoIDs.insert(photoID)
        details[photoID] = nil
        seen[photoID] = nil
        for groupID in Array(feeds.keys) {
            feeds[groupID]?.photos.removeAll { $0.id == photoID }
        }
    }

    /// After blocking or unblocking someone: every list shows (or hides) their photos and
    /// reactions, so cached photos are dropped and screens load them again.
    func clearCachedPhotos() {
        feeds = [:]
        details = [:]
        seen = [:]
    }

    func reset() {
        feeds = [:]
        details = [:]
        seen = [:]
        lastRequests = [:]
        // `taps` keeps counting: an answer still on its way for the previous account mustn't
        // match a tap made after signing in again.
        deletedPhotoIDs = []
    }

    // MARK: - Helpers

    /// Applies a change to every cached copy of a photo.
    private func update(_ photoID: String, _ change: (inout Photo) -> Void) {
        if var detail = details[photoID] {
            change(&detail)
            details[photoID] = detail
        }
        if var other = seen[photoID] {
            change(&other)
            seen[photoID] = other
        }
        for groupID in Array(feeds.keys) {
            guard var feed = feeds[groupID], let index = feed.photos.firstIndex(where: { $0.id == photoID }) else { continue }
            change(&feed.photos[index])
            feeds[groupID] = feed
        }
    }

    /// A feed entry has no `group`/`feed` fields, so only the shared parts are copied over.
    private func replaceInFeeds(_ detail: Photo) {
        update(detail.id) { cached in
            cached.reactions = detail.reactions
            cached.commentCount = detail.commentCount
            cached.isFavorite = detail.isFavorite
        }
    }
}
