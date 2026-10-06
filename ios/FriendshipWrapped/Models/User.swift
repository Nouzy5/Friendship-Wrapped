import Foundation

/// How a person appears wherever they show up (members, photo uploaders, …).
struct UserSummary: Codable, Identifiable, Hashable {
    let id: String
    let username: String
    let displayName: String
    /// A server path such as `/api/users/<id>/avatar?v=…`. Nil when they haven't added a profile picture.
    let avatarUrl: String?
}

/// The signed-in user as the API returns them (`toPublicUser` on the server).
struct User: Codable, Identifiable, Hashable {
    let id: String
    let username: String
    let displayName: String
    let avatarUrl: String?
    let createdAt: Date

    /// "Nicolas" from "Nicolas Szántai".
    var firstName: String {
        displayName.split(whereSeparator: \.isWhitespace).first.map { String($0) } ?? displayName
    }
}
