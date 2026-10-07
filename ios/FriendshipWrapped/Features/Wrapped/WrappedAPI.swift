import Foundation

private struct WrappedListResponse: Decodable {
    let wrapped: [WrappedSummary]
}

private struct WrappedResponse: Decodable {
    let wrapped: Wrapped
}

extension APIClient {
    /// Every Wrapped you can open, newest year first, then by group name. Years are counted in `timeZone`.
    func fetchWrappedList(timeZone: TimeZone = .current) async throws -> [WrappedSummary] {
        let response: WrappedListResponse = try await send(.get, "/wrapped?tz=\(timeZone.identifier.queryValue)")
        return response.wrapped
    }

    /// A group's year as a story. 404 for non-members, and for a year without photos.
    func fetchWrapped(_ groupID: String, year: Int, timeZone: TimeZone = .current) async throws -> Wrapped {
        let response: WrappedResponse = try await send(
            .get,
            "/groups/\(groupID.pathSegment)/wrapped/\(year)?tz=\(timeZone.identifier.queryValue)"
        )
        return response.wrapped
    }
}
