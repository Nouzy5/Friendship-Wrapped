import Foundation

/// Settings kept with your account: they change what other people see, or what the server sends
/// you (`GET /users/me/settings`). Appearance and camera choices stay on the phone (`DeviceSettings`).
struct UserSettings: Codable, Equatable {
    /// Friends can save the photos you post.
    var allowPhotoSaving: Bool
    /// Your name and colour appear on Wrapped slides (you count in the totals either way).
    var showInWrapped: Bool
    /// Your IANA time zone, for quiet hours and morning notifications. The app keeps it up to date.
    var timeZone: String?
    var notifications: NotificationSettings
}

struct NotificationSettings: Codable, Equatable {
    /// Off pauses everything at once.
    var enabled: Bool
    var photos: Bool
    var reactions: Bool
    var comments: Bool
    var members: Bool
    var onThisDay: Bool
    var wrapped: Bool
    /// A gentle reminder to post, at most one every two weeks. On unless switched off.
    var nudges: Bool
    /// When someone in a group starts a moment. On unless switched off.
    var moments: Bool
    var quietHours: QuietHours

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try container.decode(Bool.self, forKey: .enabled)
        photos = try container.decode(Bool.self, forKey: .photos)
        reactions = try container.decode(Bool.self, forKey: .reactions)
        comments = try container.decode(Bool.self, forKey: .comments)
        members = try container.decode(Bool.self, forKey: .members)
        onThisDay = try container.decode(Bool.self, forKey: .onThisDay)
        wrapped = try container.decode(Bool.self, forKey: .wrapped)
        // A server from before reminders doesn't send it.
        nudges = try container.decodeIfPresent(Bool.self, forKey: .nudges) ?? true
        moments = try container.decodeIfPresent(Bool.self, forKey: .moments) ?? true
        quietHours = try container.decode(QuietHours.self, forKey: .quietHours)
    }
}

struct QuietHours: Codable, Equatable {
    var enabled: Bool
    /// "HH:MM", 24-hour, in your time zone.
    var start: String
    var end: String
}

/// A change to some of the settings (`PATCH /users/me/settings` takes any part). Nil fields are
/// left out of the JSON, so they stay as they are.
struct UserSettingsChange: Encodable {
    var allowPhotoSaving: Bool?
    var showInWrapped: Bool?
    var timeZone: String?
    var notifications: NotificationChange?

    struct NotificationChange: Encodable {
        var enabled: Bool?
        var photos: Bool?
        var reactions: Bool?
        var comments: Bool?
        var members: Bool?
        var onThisDay: Bool?
        var wrapped: Bool?
        var nudges: Bool?
        var moments: Bool?
        var quietHours: QuietHoursChange?
    }

    struct QuietHoursChange: Encodable {
        var enabled: Bool?
        var start: String?
        var end: String?
    }
}

extension UserSettings {
    /// What the settings look like once `change` is saved, to show a switch flip straight away.
    func applying(_ change: UserSettingsChange) -> UserSettings {
        var next = self
        if let value = change.allowPhotoSaving { next.allowPhotoSaving = value }
        if let value = change.showInWrapped { next.showInWrapped = value }
        if let value = change.timeZone { next.timeZone = value }
        if let notifications = change.notifications {
            if let value = notifications.enabled { next.notifications.enabled = value }
            if let value = notifications.photos { next.notifications.photos = value }
            if let value = notifications.reactions { next.notifications.reactions = value }
            if let value = notifications.comments { next.notifications.comments = value }
            if let value = notifications.members { next.notifications.members = value }
            if let value = notifications.onThisDay { next.notifications.onThisDay = value }
            if let value = notifications.wrapped { next.notifications.wrapped = value }
            if let value = notifications.nudges { next.notifications.nudges = value }
            if let value = notifications.moments { next.notifications.moments = value }
            if let quiet = notifications.quietHours {
                if let value = quiet.enabled { next.notifications.quietHours.enabled = value }
                if let value = quiet.start { next.notifications.quietHours.start = value }
                if let value = quiet.end { next.notifications.quietHours.end = value }
            }
        }
        return next
    }
}

/// A device where you're signed in (`GET /users/me/sessions`).
struct SignedInDevice: Codable, Identifiable, Hashable {
    /// Opaque, not the session token.
    let id: String
    /// e.g. "Safari on iPhone", "Friendship Wrapped app on iPhone".
    let device: String
    let createdAt: Date
    let lastActiveAt: Date
    /// This phone.
    let current: Bool
}

/// An invite link you made that still works (`GET /users/me/invites`). The link itself can't be
/// shown again: only its hash is stored.
struct MyInvite: Codable, Identifiable, Hashable {
    struct GroupInfo: Codable, Hashable {
        let id: String
        let name: String
        let emoji: String
        let avatarUrl: String?
    }

    let id: String
    let group: GroupInfo
    let createdAt: Date
    let expiresAt: Date
}
