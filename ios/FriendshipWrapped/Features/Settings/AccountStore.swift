import Foundation
import Observation

/// What's kept with your account on the server: notification and privacy settings, the devices
/// you're signed in on, invite links you've made and people you've blocked.
@MainActor
@Observable
final class AccountStore {
    enum LoadState: Equatable {
        case idle, loading, loaded, failed
    }

    private(set) var settings: UserSettings?
    private(set) var settingsState: LoadState = .idle
    private(set) var devices: [SignedInDevice]?
    private(set) var invites: [MyInvite]?
    private(set) var blocked: [UserSummary]?

    /// Changes sent so far, so only the latest one's answer is shown (quick switch flips).
    @ObservationIgnored private var changesSent = 0

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    // MARK: - Settings

    func loadSettings() async {
        if settings == nil { settingsState = .loading }
        do {
            settings = try await api.fetchSettings()
            settingsState = .loaded
        } catch {
            if settings == nil { settingsState = .failed }
        }
    }

    func loadSettingsIfNeeded() async {
        if settings == nil, settingsState != .loading { await loadSettings() }
    }

    /// Shows the change straight away; if saving fails it's put back and the error is thrown
    /// (show a toast: "Couldn't save that setting.").
    func update(_ change: UserSettingsChange) async throws {
        let before = settings
        settings = settings?.applying(change)
        changesSent += 1
        let sent = changesSent
        do {
            let saved = try await api.updateSettings(change)
            if sent == changesSent { settings = saved }
        } catch {
            if sent == changesSent { settings = before }
            throw error
        }
    }

    /// The server needs your time zone for quiet hours and morning notifications.
    func syncTimeZone() async {
        await loadSettingsIfNeeded()
        let zone = TimeZone.current.identifier
        guard let settings, settings.timeZone != zone else { return }
        try? await update(UserSettingsChange(timeZone: zone))
    }

    // MARK: - Signed-in devices

    func loadDevices() async throws {
        devices = try await api.fetchSignedInDevices()
    }

    func signOut(_ device: SignedInDevice) async throws {
        try await api.signOutDevice(device.id)
        devices?.removeAll { $0.id == device.id }
    }

    func signOutOtherDevices() async throws {
        try await api.signOutOtherDevices()
        devices?.removeAll { !$0.current }
    }

    // MARK: - Invite links you made

    func loadInvites() async throws {
        invites = try await api.fetchMyInvites()
    }

    func revoke(_ invite: MyInvite) async throws {
        try await api.revokeMyInvite(invite.id)
        invites?.removeAll { $0.id == invite.id }
    }

    // MARK: - Blocking

    func loadBlocked() async throws {
        blocked = try await api.fetchBlocked()
    }

    /// Callers then refresh what's on screen: the person's photos, comments and reactions go.
    func block(_ person: UserSummary) async throws {
        try await api.block(person.id)
        if blocked?.contains(where: { $0.id == person.id }) == false {
            blocked?.append(person)
        }
    }

    func unblock(_ person: UserSummary) async throws {
        try await api.unblock(person.id)
        blocked?.removeAll { $0.id == person.id }
    }

    func report(_ input: ReportInput) async throws {
        try await api.sendReport(input)
    }

    /// On sign-out, so the next account sees none of this.
    func reset() {
        settings = nil
        settingsState = .idle
        devices = nil
        invites = nil
        blocked = nil
        changesSent += 1
    }
}
