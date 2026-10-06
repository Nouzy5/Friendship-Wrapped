import Foundation
import Observation

/// Who's signed in (the web app's `useSession`). Any 401 from the API signs the app out.
@MainActor
@Observable
final class SessionStore {
    enum Phase: Equatable {
        case loading
        case signedOut
        case signedIn(User)
        /// The session couldn't be checked (offline, server down, or no server configured).
        case unreachable(String)
    }

    private(set) var phase: Phase = .loading

    /// True right after creating an account, so the app can show onboarding.
    private(set) var justRegistered = false

    var user: User? {
        if case .signedIn(let user) = phase { return user }
        return nil
    }

    private let api: APIClient
    @ObservationIgnored private var expiryObserver: NSObjectProtocol?

    init(api: APIClient = .shared) {
        self.api = api
        expiryObserver = NotificationCenter.default.addObserver(
            forName: .sessionDidExpire,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.phase = .signedOut
            }
        }
    }

    func restore() async {
        phase = .loading
        do {
            if let user = try await api.fetchSessionUser() {
                phase = .signedIn(user)
            } else {
                api.clearSession()
                phase = .signedOut
            }
        } catch {
            phase = .unreachable(error.asAPIError.message)
        }
    }

    func login(username: String, password: String) async throws {
        let user = try await api.login(LoginInput(username: username, password: password))
        justRegistered = false
        phase = .signedIn(user)
    }

    func register(displayName: String, username: String, password: String) async throws {
        let user = try await api.register(
            RegisterInput(username: username, displayName: displayName, password: password)
        )
        justRegistered = true
        phase = .signedIn(user)
    }

    func logout() async throws {
        try await api.logout()
        api.clearSession()
        justRegistered = false
        phase = .signedOut
    }

    func updateProfile(displayName: String) async throws -> User {
        let user = try await api.updateProfile(UpdateProfileInput(displayName: displayName))
        phase = .signedIn(user)
        return user
    }

    func setAvatar(jpeg: Data) async throws {
        let user = try await api.uploadAvatar(jpeg: jpeg)
        phase = .signedIn(user)
    }

    func removeAvatar() async throws {
        let user = try await api.removeAvatar()
        phase = .signedIn(user)
    }
}
