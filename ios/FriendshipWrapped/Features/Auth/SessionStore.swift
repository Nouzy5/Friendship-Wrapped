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

    /// Why the app just signed out, when it's worth saying (after deleting the account), for the
    /// welcome screen to show once.
    private(set) var signOutNotice: String?

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
        signOutNotice = nil
        phase = .signedIn(user)
    }

    func register(displayName: String, username: String, password: String) async throws {
        let user = try await api.register(
            RegisterInput(username: username, displayName: displayName, password: password)
        )
        justRegistered = true
        signOutNotice = nil
        phase = .signedIn(user)
    }

    func logout() async throws {
        try await api.logout()
        api.clearSession()
        justRegistered = false
        phase = .signedOut
    }

    /// Deletes the account for good (see `APIClient.deleteAccount`), then signs out.
    func deleteAccount(password: String) async throws {
        try await api.deleteAccount(password: password)
        api.clearSession()
        justRegistered = false
        signOutNotice = "Your account and everything you posted have been deleted."
        phase = .signedOut
    }

    /// Once the welcome screen has shown it.
    func clearSignOutNotice() {
        signOutNotice = nil
    }

    func updateProfile(displayName: String) async throws -> User {
        let user = try await api.updateProfile(UpdateProfileInput(displayName: displayName))
        profileChanged(user)
        return user
    }

    func setAvatar(jpeg: Data) async throws {
        let user = try await api.uploadAvatar(jpeg: jpeg)
        profileChanged(user)
    }

    func removeAvatar() async throws {
        let user = try await api.removeAvatar()
        profileChanged(user)
    }

    /// `409 USERNAME_TAKEN` when someone has it already.
    func updateUsername(_ username: String) async throws {
        let user = try await api.updateUsername(username)
        profileChanged(user)
    }

    /// Signs out your other devices; this one stays signed in.
    func changePassword(current: String, new: String) async throws {
        try await api.changePassword(current: current, new: new)
    }

    /// Signing out this phone from the devices list: the session is gone on the server already.
    func didSignOutThisDevice() {
        api.clearSession()
        justRegistered = false
        phase = .signedOut
    }

    /// A change answered after signing out (an upload still finishing) mustn't sign back in.
    private func profileChanged(_ user: User) {
        guard case .signedIn(let current) = phase, current.id == user.id else { return }
        phase = .signedIn(user)
    }
}
