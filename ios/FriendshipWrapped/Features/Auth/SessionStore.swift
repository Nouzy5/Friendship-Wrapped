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
        /// Signed in, but the email address isn't confirmed yet (or an older account has none): the
        /// app shows only the screen asking for it, and nothing else loads until it's confirmed.
        case needsEmail(User)
        /// The session couldn't be checked (offline, server down, or no server configured).
        case unreachable(String)
    }

    private(set) var phase: Phase = .loading

    /// True right after creating an account, so the app can show onboarding.
    private(set) var justRegistered = false

    /// Why the app just signed out, when it's worth saying (after deleting the account), for the
    /// welcome screen to show once.
    private(set) var signOutNotice: String?

    /// The signed-in user, once they're let in (an account waiting for its email has none yet).
    var user: User? {
        if case .signedIn(let user) = phase { return user }
        return nil
    }

    private let api: APIClient
    @ObservationIgnored private var expiryObserver: NSObjectProtocol?
    @ObservationIgnored private var emailObserver: NSObjectProtocol?

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
        // The server held a request because the email isn't confirmed (the link was opened or the
        // address changed elsewhere): look again at who this is.
        emailObserver = NotificationCenter.default.addObserver(
            forName: .emailNotVerified,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, case .signedIn = self.phase else { return }
                Task { await self.refresh() }
            }
        }
    }

    /// Signed in, or signed in and waiting for the email to be confirmed.
    private func apply(_ user: User) {
        phase = user.emailVerified ? .signedIn(user) : .needsEmail(user)
    }

    private var accountID: String? {
        switch phase {
        case .signedIn(let user), .needsEmail(let user): return user.id
        default: return nil
        }
    }

    func restore() async {
        phase = .loading
        do {
            if let user = try await api.fetchSessionUser() {
                apply(user)
            } else {
                api.clearSession()
                phase = .signedOut
            }
        } catch {
            phase = .unreachable(error.asAPIError.message)
        }
    }

    /// Asks the server who's signed in now: after the email link was opened on another device, say.
    /// Keeps what it has when the server can't be reached.
    func refresh() async {
        guard accountID != nil else { return }
        do {
            if let user = try await api.fetchSessionUser() {
                guard accountID == user.id else { return }
                apply(user)
            } else {
                api.clearSession()
                phase = .signedOut
            }
        } catch {
            // Offline: carry on with what we have.
        }
    }

    /// `identifier` is the email address, or the username the account has always had.
    func login(identifier: String, password: String) async throws {
        let user = try await api.login(LoginInput(identifier: identifier, password: password))
        justRegistered = false
        signOutNotice = nil
        apply(user)
    }

    func register(email: String, displayName: String, username: String, password: String) async throws {
        let user = try await api.register(
            RegisterInput(email: email, username: username, displayName: displayName, password: password)
        )
        justRegistered = true
        signOutNotice = nil
        apply(user)
    }

    /// Sets or changes the email address (confirmed with the password) and emails a link to the new
    /// one. Until it's opened the account is back to waiting for its email.
    func updateEmail(_ email: String, password: String) async throws {
        let user = try await api.changeEmail(email: email, password: password)
        // An answer that comes after signing out mustn't sign back in.
        guard accountID == user.id else { return }
        apply(user)
    }

    /// Sends the confirmation link again. `429 EMAIL_COOLDOWN` if one went out in the last minute.
    func resendVerificationEmail() async throws {
        try await api.resendVerificationEmail()
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
