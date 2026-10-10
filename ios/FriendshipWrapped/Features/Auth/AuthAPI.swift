import Foundation

struct LoginInput: Encodable {
    /// The email address, or the username the account has always had.
    let identifier: String
    let password: String
}

struct RegisterInput: Encodable {
    let email: String
    let username: String
    let displayName: String
    let password: String
}

struct ChangeEmailInput: Encodable {
    let email: String
    let password: String
}

struct ForgotPasswordInput: Encodable {
    /// The email address, or the username.
    let identifier: String
}

struct UpdateProfileInput: Encodable {
    let displayName: String
}

private struct UserResponse: Decodable {
    let user: User
}

private struct SessionResponse: Decodable {
    let user: User?
}

extension APIClient {
    /// The signed-in user, or nil when signed out (the API answers `{ "user": null }`, not 401).
    func fetchSessionUser() async throws -> User? {
        let response: SessionResponse = try await send(.get, "/auth/session")
        return response.user
    }

    func login(_ input: LoginInput) async throws -> User {
        let response: UserResponse = try await send(.post, "/auth/login", body: input)
        return response.user
    }

    func register(_ input: RegisterInput) async throws -> User {
        let response: UserResponse = try await send(.post, "/auth/register", body: input)
        return response.user
    }

    func logout() async throws {
        try await perform(.post, "/auth/logout")
    }

    /// Sets or changes the address (confirmed with the password). It counts as unconfirmed until the
    /// emailed link is opened, so the returned user has `emailVerified == false`. `409 EMAIL_TAKEN`
    /// when another account has it.
    func changeEmail(email: String, password: String) async throws -> User {
        let response: UserResponse = try await send(.put, "/auth/email", body: ChangeEmailInput(email: email, password: password))
        return response.user
    }

    /// Emails the confirmation link again. `429 EMAIL_COOLDOWN` if one went out in the last minute.
    func resendVerificationEmail() async throws {
        try await perform(.post, "/auth/email/resend")
    }

    /// Emails a link to choose a new password, to the address on the account the email or username
    /// names. Succeeds whether or not there is such an account: the server won't say who has one.
    /// `429` when this phone (or this name) has asked too often. The link opens in the browser, where
    /// the new password is chosen.
    func requestPasswordReset(identifier: String) async throws {
        try await perform(.post, "/auth/forgot-password", body: ForgotPasswordInput(identifier: identifier))
    }

    func updateProfile(_ input: UpdateProfileInput) async throws -> User {
        let response: UserResponse = try await send(.patch, "/users/me", body: input)
        return response.user
    }
}
