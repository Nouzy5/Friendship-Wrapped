import Foundation

struct MomentPage: Decodable {
    let moments: [Moment]
    let nextCursor: String?
}

private struct MomentResponse: Decodable {
    let moment: Moment
}

private struct OpenMomentResponse: Decodable {
    let moment: Moment?
}

private struct StartMomentInput: Encodable {
    let title: String
    let emoji: String?
    let durationHours: Int

    // An absent emoji is left out, not sent as null.
    private enum CodingKeys: String, CodingKey {
        case title, emoji, durationHours
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encodeIfPresent(emoji, forKey: .emoji)
        try container.encode(durationHours, forKey: .durationHours)
    }
}

extension APIClient {
    private func momentPath(_ momentID: String) -> String {
        "/moments/\(momentID.pathSegment)"
    }

    /// One page of a group's moments, newest first. Pass the previous page's `nextCursor` to continue.
    func fetchMoments(inGroup groupID: String, cursor: String? = nil) async throws -> MomentPage {
        var path = "/groups/\(groupID.pathSegment)/moments"
        if let cursor { path += "?cursor=\(cursor.queryValue)" }
        return try await send(.get, path)
    }

    /// The moment taking photos now, or nil.
    func fetchOpenMoment(inGroup groupID: String) async throws -> Moment? {
        let response: OpenMomentResponse = try await send(.get, "/groups/\(groupID.pathSegment)/moments/open")
        return response.moment
    }

    func fetchMoment(_ momentID: String) async throws -> Moment {
        let response: MomentResponse = try await send(.get, momentPath(momentID))
        return response.moment
    }

    /// One page of a moment's photos, oldest first.
    func fetchMomentPhotos(_ momentID: String, cursor: String? = nil) async throws -> PhotoPage {
        var path = "\(momentPath(momentID))/photos"
        if let cursor { path += "?cursor=\(cursor.queryValue)" }
        return try await send(.get, path)
    }

    /// Any member can start one. A group has one open at a time (`409 MOMENT_ALREADY_OPEN`).
    func startMoment(inGroup groupID: String, title: String, emoji: String?, durationHours: Int) async throws -> Moment {
        let response: MomentResponse = try await send(
            .post,
            "/groups/\(groupID.pathSegment)/moments",
            body: StartMomentInput(title: title, emoji: emoji, durationHours: durationHours)
        )
        return response.moment
    }

    /// The moment's creator or the group owner. Ending one that has ended changes nothing.
    func endMoment(_ momentID: String) async throws -> Moment {
        let response: MomentResponse = try await send(.post, "\(momentPath(momentID))/end")
        return response.moment
    }

    /// The moment's creator or the group owner. Its photos stay in the group.
    func deleteMoment(_ momentID: String) async throws {
        try await perform(.delete, momentPath(momentID))
    }
}
