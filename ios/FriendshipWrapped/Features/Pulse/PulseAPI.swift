import Foundation

/// How a group is doing: numbers about the group, never about individuals. There is nothing
/// in it about who has or hasn't posted (`GET /groups/:groupId/pulse`).
struct GroupPulse: Decodable, Equatable {
    /// The calendar month it is now, in the viewer's time zone.
    struct Month: Decodable, Equatable {
        let year: Int
        /// 1–12
        let month: Int
        let photos: Int
        /// Reactions given this month, on photos from any time.
        let reactions: Int
        let comments: Int

        var isQuiet: Bool { photos == 0 && reactions == 0 && comments == 0 }
    }

    /// Weeks (Monday to Sunday) in a row with at least one photo from the group.
    struct Streak: Decodable, Equatable {
        let weeks: Int
        /// False while this week has no photo yet: the streak is alive until the week ends.
        let thisWeekDone: Bool
    }

    let month: Month
    let streak: Streak
}

private struct PulseResponse: Decodable {
    let pulse: GroupPulse
}

extension APIClient {
    /// This month in the group, and its weekly streak. Members only. The month and the weeks
    /// begin at local midnight in `timeZone`, so they match the viewer's own calendar.
    func fetchGroupPulse(_ groupID: String, timeZone: TimeZone = .current) async throws -> GroupPulse {
        let response: PulseResponse = try await send(
            .get,
            "/groups/\(groupID.pathSegment)/pulse?tz=\(timeZone.identifier.queryValue)"
        )
        return response.pulse
    }
}
