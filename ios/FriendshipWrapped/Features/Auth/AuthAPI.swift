import Foundation

struct LoginInput: Encodable {
    let username: String
    let password: String
}

struct RegisterInput: Encodable {
    let username: String
    let displayName: String
    let password: String
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

    func updateProfile(_ input: UpdateProfileInput) async throws -> User {
        let response: UserResponse = try await send(.patch, "/users/me", body: input)
        return response.user
    }
}
