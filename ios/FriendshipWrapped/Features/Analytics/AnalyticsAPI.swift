import Foundation

private struct YearStatsResponse: Decodable {
    let stats: YearStats
}

extension APIClient {
    /// A group's year in numbers, for Wrapped. Members only (others get a 404). The year runs
    /// from local midnight on 1 January in `timeZone`, so it matches the viewer's own calendar.
    func fetchYearStats(_ groupID: String, year: Int, timeZone: TimeZone = .current) async throws -> YearStats {
        let response: YearStatsResponse = try await send(
            .get,
            "/groups/\(groupID.pathSegment)/stats/\(year)?tz=\(timeZone.identifier.queryValue)"
        )
        return response.stats
    }
}
