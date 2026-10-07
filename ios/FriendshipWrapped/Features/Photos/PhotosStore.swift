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

    /// The next page, when you scroll to the end of the feed.
    func loadMore(in groupID: String) async {
        guard let feed = feeds[groupID], let cursor = feed.nextCursor, !feed.isLoadingMore else { return }
        feeds[groupID]?.isLoadingMore = true
        feeds[groupID]?.loadMoreFailed = false
        do {
            let page = try await api.fetchGroupPhotos(groupID, cursor: cursor)
            let known = Set(feeds[groupID]?.photos.map(\.id) ?? [])
            feeds[groupID]?.photos.append(contentsOf: page.photos.filter { !known.contains($0.id) })
            feeds[groupID]?.nextCursor = page.nextCursor
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

    func upload(_ jpeg: Data, caption: String, to groupID: String) async throws -> Photo {
        let photo = try await api.uploadPhoto(toGroup: groupID, jpeg: jpeg, caption: caption)
        feeds[groupID]?.photos.insert(photo, at: 0)
        return photo
    }

    /// Deletes on the server. Navigate away first, then call `forget(_:)`.
    func delete(_ photo: Photo) async throws {
        try await api.deletePhoto(photo.id)
    }

    /// Reacts (or, with nil, takes your reaction back). Shows instantly and rolls back if it fails.
    func react(to photoID: String, with type: ReactionType?) async throws {
        guard let current = photo(photoID) else { return }
        let previous = current.reactions
        update(photoID) { $0.reactions = previous.with(type) }
        do {
            let summary: ReactionSummary
            if let type {
                summary = try await api.setReaction(type, onPhoto: photoID)
            } else {
                summary = try await api.removeReaction(fromPhoto: photoID)
            }
            update(photoID) { $0.reactions = summary }
        } catch {
            update(photoID) { $0.reactions = previous }
            throw error
        }
    }

    /// Shows instantly and rolls back if it fails.
    func setFavorite(_ favorite: Bool, photoID: String) async throws {
        let previous = photo(photoID)?.isFavorite ?? !favorite
        update(photoID) { $0.isFavorite = favorite }
        do {
            let saved = try await api.setFavorite(favorite, photoID: photoID)
            update(photoID) { $0.isFavorite = saved }
        } catch {
            update(photoID) { $0.isFavorite = previous }
            throw error
        }
    }

    /// After adding (+1) or deleting (-1) a comment, so feed cards show the new count.
    func adjustCommentCount(of photoID: String, by delta: Int) {
        update(photoID) { $0.commentCount = max(0, $0.commentCount + delta) }
    }

    func forget(_ photoID: String) {
        details[photoID] = nil
        seen[photoID] = nil
        for groupID in Array(feeds.keys) {
            feeds[groupID]?.photos.removeAll { $0.id == photoID }
        }
    }

    func reset() {
        feeds = [:]
        details = [:]
        seen = [:]
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
