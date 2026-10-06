import Foundation

private struct SetReactionInput: Encodable {
    let type: ReactionType
}

private struct ReactionSummaryResponse: Decodable {
    let summary: ReactionSummary
}

private struct ReactionsResponse: Decodable {
    let reactions: [ReactionEntry]
}

private struct AddCommentInput: Encodable {
    let body: String
}

private struct CommentResponse: Decodable {
    let comment: Comment
}

private struct FavoriteResponse: Decodable {
    let isFavorite: Bool
}

extension APIClient {
    // MARK: - Reactions

    /// Adds your reaction, or changes it (one per person per photo). Members only.
    func setReaction(_ type: ReactionType, onPhoto photoID: String) async throws -> ReactionSummary {
        let response: ReactionSummaryResponse = try await send(
            .put,
            "/photos/\(photoID.pathSegment)/reaction",
            body: SetReactionInput(type: type)
        )
        return response.summary
    }

    /// Takes your reaction back. Allowed even after leaving the group.
    func removeReaction(fromPhoto photoID: String) async throws -> ReactionSummary {
        let response: ReactionSummaryResponse = try await send(.delete, "/photos/\(photoID.pathSegment)/reaction")
        return response.summary
    }

    /// Who reacted, and how, first reaction first.
    func fetchReactions(onPhoto photoID: String) async throws -> [ReactionEntry] {
        let response: ReactionsResponse = try await send(.get, "/photos/\(photoID.pathSegment)/reactions")
        return response.reactions
    }

    // MARK: - Comments

    /// One page of comments, oldest first. Pass the previous page's `nextCursor` to continue.
    func fetchComments(onPhoto photoID: String, cursor: String? = nil) async throws -> CommentPage {
        var path = "/photos/\(photoID.pathSegment)/comments"
        if let cursor { path += "?cursor=\(cursor.queryValue)" }
        return try await send(.get, path)
    }

    /// Members only. Up to 500 characters; line breaks are kept.
    func addComment(_ body: String, toPhoto photoID: String) async throws -> Comment {
        let response: CommentResponse = try await send(
            .post,
            "/photos/\(photoID.pathSegment)/comments",
            body: AddCommentInput(body: body)
        )
        return response.comment
    }

    /// Only the author can delete a comment.
    func deleteComment(_ commentID: String) async throws {
        try await perform(.delete, "/comments/\(commentID.pathSegment)")
    }

    // MARK: - Favorites

    /// Favorites are private bookmarks. Returns the new state.
    func setFavorite(_ favorite: Bool, photoID: String) async throws -> Bool {
        let response: FavoriteResponse = try await send(
            favorite ? .put : .delete,
            "/photos/\(photoID.pathSegment)/favorite"
        )
        return response.isFavorite
    }
}
