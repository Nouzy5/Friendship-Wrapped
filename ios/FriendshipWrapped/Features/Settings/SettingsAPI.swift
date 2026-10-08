import Foundation

private struct SettingsResponse: Decodable {
    let settings: UserSettings
}

private struct UsernameInput: Encodable {
    let username: String
}

private struct AccountUserResponse: Decodable {
    let user: User
}

private struct ChangePasswordInput: Encodable {
    let currentPassword: String
    let newPassword: String
}

private struct SessionsResponse: Decodable {
    let sessions: [SignedInDevice]
}

private struct MyInvitesResponse: Decodable {
    let invites: [MyInvite]
}

private struct BlockedResponse: Decodable {
    let blocked: [UserSummary]
}

/// About a photo, a person, both, or neither (general feedback).
struct ReportInput: Encodable {
    var photoId: String?
    var userId: String?
    let message: String
}

extension APIClient {
    // MARK: - Settings kept with your account

    func fetchSettings() async throws -> UserSettings {
        let response: SettingsResponse = try await send(.get, "/users/me/settings")
        return response.settings
    }

    /// Saves part of the settings and returns all of them.
    func updateSettings(_ change: UserSettingsChange) async throws -> UserSettings {
        let response: SettingsResponse = try await send(.patch, "/users/me/settings", body: change)
        return response.settings
    }

    // MARK: - Account

    /// `409 USERNAME_TAKEN` when someone has it already.
    func updateUsername(_ username: String) async throws -> User {
        let response: AccountUserResponse = try await send(.patch, "/users/me", body: UsernameInput(username: username))
        return response.user
    }

    /// Signs out every other device; this one stays signed in. A wrong current password is a
    /// 400 with a `currentPassword` field error.
    func changePassword(current: String, new: String) async throws {
        try await perform(.put, "/users/me/password", body: ChangePasswordInput(currentPassword: current, newPassword: new))
    }

    func fetchSignedInDevices() async throws -> [SignedInDevice] {
        let response: SessionsResponse = try await send(.get, "/users/me/sessions")
        return response.sessions
    }

    /// Signing out this device here signs the app out too.
    func signOutDevice(_ deviceID: String) async throws {
        try await perform(.delete, "/users/me/sessions/\(deviceID.pathSegment)")
    }

    /// Every device except this one.
    func signOutOtherDevices() async throws {
        try await perform(.delete, "/users/me/sessions")
    }

    /// Every photo you've posted, as a zip in a temporary file (rate limited to a few an hour).
    func downloadPhotoArchive() async throws -> URL {
        try await downloadFile("/users/me/photos/archive", named: "friendship-wrapped-photos.zip")
    }

    // MARK: - Invite links you made

    func fetchMyInvites() async throws -> [MyInvite] {
        let response: MyInvitesResponse = try await send(.get, "/users/me/invites")
        return response.invites
    }

    func revokeMyInvite(_ inviteID: String) async throws {
        try await perform(.delete, "/users/me/invites/\(inviteID.pathSegment)")
    }

    // MARK: - Safety

    func fetchBlocked() async throws -> [UserSummary] {
        let response: BlockedResponse = try await send(.get, "/users/me/blocks")
        return response.blocked
    }

    /// Hides their photos, comments and reactions from you and yours from them, everywhere.
    /// They aren't told.
    func block(_ userID: String) async throws {
        try await perform(.put, "/users/me/blocks/\(userID.pathSegment)")
    }

    func unblock(_ userID: String) async throws {
        try await perform(.delete, "/users/me/blocks/\(userID.pathSegment)")
    }

    /// Stored for whoever runs the server to look at (rate limited).
    func sendReport(_ input: ReportInput) async throws {
        try await perform(.post, "/reports", body: input)
    }
}
