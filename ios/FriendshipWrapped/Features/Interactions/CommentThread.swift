import Foundation
import Observation

/// One photo's comments, oldest first, loaded a page at a time.
@MainActor
@Observable
final class CommentThread {
    enum Phase: Equatable {
        case loading, loaded, failed
    }

    let photoID: String
    private(set) var comments: [Comment] = []
    private(set) var nextCursor: String?
    private(set) var phase: Phase = .loading
    private(set) var isLoadingMore = false
    private(set) var loadMoreFailed = false

    private let api: APIClient

    init(photoID: String, api: APIClient = .shared) {
        self.photoID = photoID
        self.api = api
    }

    var hasMore: Bool { nextCursor != nil }

    func load() async {
        if comments.isEmpty { phase = .loading }
        do {
            let page = try await api.fetchComments(onPhoto: photoID)
            comments = page.comments
            nextCursor = page.nextCursor
            phase = .loaded
        } catch {
            // Keep showing what's already loaded when a refresh fails.
            if comments.isEmpty { phase = .failed }
        }
    }

    func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        loadMoreFailed = false
        do {
            let page = try await api.fetchComments(onPhoto: photoID, cursor: cursor)
            let known = Set(comments.map(\.id))
            comments.append(contentsOf: page.comments.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch {
            loadMoreFailed = true
        }
        isLoadingMore = false
    }

    func add(_ body: String) async throws -> Comment {
        let comment = try await api.addComment(body, toPhoto: photoID)
        // With older pages still unloaded the new comment arrives with them, in order.
        if nextCursor == nil { comments.append(comment) }
        return comment
    }

    func delete(_ comment: Comment) async throws {
        try await api.deleteComment(comment.id)
        comments.removeAll { $0.id == comment.id }
    }
}
