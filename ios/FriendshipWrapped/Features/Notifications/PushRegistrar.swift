import Foundation
import Observation
import UIKit
import UserNotifications

/// The iPhone side of push notifications. It asks permission, gets this phone's Apple push token
/// and gives it to the server, which sends the notifications. The server ties the token to the
/// signed-in session, so signing out (here or from another device) stops them.
@MainActor
@Observable
final class PushRegistrar {
    static let shared = PushRegistrar()

    /// iOS's answer to "may this app show notifications?".
    enum Permission: Equatable {
        /// Not looked up yet.
        case unknown
        /// Never asked.
        case notDetermined
        /// Refused. Only iOS Settings can change that.
        case denied
        case allowed
    }

    private(set) var permission: Permission = .unknown
    /// Whether the server has an Apple push key (nil until asked).
    private(set) var serverCanPush: Bool?
    /// The server has this phone's token for the person signed in.
    private(set) var isRegistered = false
    /// Why this phone couldn't get a token (e.g. a build signed without the push capability).
    private(set) var failure: String?
    /// The person has switched notifications on for this phone (and not off again).
    /// False until they do, so asking is always their choice.
    private(set) var isWanted: Bool
    /// "Not now" on the Home card was tapped.
    private(set) var promptDismissed: Bool
    /// The page a tapped notification asked for (a web app path such as `/photos/<id>`),
    /// until the interface has opened it.
    var pendingPath: String?

    @ObservationIgnored private var signedIn = false
    /// This phone's token, in hex, once iOS has given it.
    @ObservationIgnored private var token: String?
    /// The token the server was last given in this sign-in, so it is only sent again when it changes.
    @ObservationIgnored private var uploadedToken: String?
    /// Bumped on every sign-in and sign-out, so an upload that finishes after one is dropped.
    @ObservationIgnored private var sessionGeneration = 0

    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private let defaults: UserDefaults
    private static let wantedKey = "fw.push.wanted"
    private static let promptDismissedKey = "fw.push.promptDismissed"

    init(api: APIClient = .shared, defaults: UserDefaults = .standard) {
        self.api = api
        self.defaults = defaults
        isWanted = defaults.bool(forKey: Self.wantedKey)
        promptDismissed = defaults.bool(forKey: Self.promptDismissedKey)
    }

    /// What the switch in Settings shows: asked for, and iOS allows it.
    var isOn: Bool { isWanted && permission == .allowed }

    /// Whether Home should offer to turn notifications on: never asked, the server can send them,
    /// and the person hasn't said "not now".
    var shouldOffer: Bool {
        permission == .notDetermined && serverCanPush == true && !isWanted && !promptDismissed
    }

    // MARK: - Session

    /// Someone is signed in: look up where things stand, and register this phone if they asked for that.
    func sessionDidStart() async {
        signedIn = true
        sessionGeneration += 1
        uploadedToken = nil
        isRegistered = false
        await refreshStatus()
        registerWithAppleIfWanted()
        await uploadIfPossible()
    }

    /// Signed out: the server dropped this phone's token with the session.
    func sessionDidEnd() {
        signedIn = false
        sessionGeneration += 1
        uploadedToken = nil
        isRegistered = false
        pendingPath = nil
    }

    /// The app came back to the front: the person may have changed things in iOS Settings, and
    /// Apple can hand out a new token at any time.
    func appDidBecomeActive() async {
        guard signedIn else { return }
        await refreshStatus()
        registerWithAppleIfWanted()
        await uploadIfPossible()
    }

    /// Where permission and the server stand now (for the Settings screen).
    func refreshStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined: permission = .notDetermined
        case .denied: permission = .denied
        case .authorized, .provisional, .ephemeral: permission = .allowed
        @unknown default: permission = .unknown
        }
        // Allowed in iOS Settings counts as asking, unless it was switched off here.
        if permission == .allowed, defaults.object(forKey: Self.wantedKey) == nil { setWanted(true) }

        if let supported = try? await api.fetchPushSupport() { serverCanPush = supported }
    }

    // MARK: - Turning on and off

    enum TurnOnResult {
        case on
        /// iOS says no. Only its Settings can change that.
        case denied
    }

    /// Asks iOS for permission if needed, then registers this phone.
    @discardableResult
    func turnOn() async -> TurnOnResult {
        await refreshStatus()
        if permission == .notDetermined {
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
            await refreshStatus()
            if !granted { return .denied }
        }
        guard permission == .allowed else { return .denied }

        setWanted(true)
        failure = nil
        registerWithAppleIfWanted()
        await uploadIfPossible()
        return .on
    }

    /// Stops the notifications on this phone. They keep their other settings.
    func turnOff() async {
        setWanted(false)
        let generation = sessionGeneration
        if let token, signedIn {
            try? await api.removePushDevice(token: token)
        }
        guard generation == sessionGeneration else { return }
        uploadedToken = nil
        isRegistered = false
    }

    /// "Not now" on Home's card.
    func dismissPrompt() {
        promptDismissed = true
        defaults.set(true, forKey: Self.promptDismissedKey)
    }

    // MARK: - From the app delegate

    func didRegister(deviceToken: Data) {
        token = deviceToken.map { String(format: "%02x", $0) }.joined()
        failure = nil
        Task { await uploadIfPossible() }
    }

    func didFailToRegister(message: String) {
        failure = message
    }

    /// A notification was tapped: only paths inside the app are followed.
    func didTapNotification(path: String) {
        guard path.hasPrefix("/"), !path.hasPrefix("//") else { return }
        pendingPath = path
    }

    // MARK: - Plumbing

    private func setWanted(_ wanted: Bool) {
        isWanted = wanted
        defaults.set(wanted, forKey: Self.wantedKey)
    }

    /// Asks iOS for this phone's token. It arrives in the app delegate, as often as Apple likes.
    private func registerWithAppleIfWanted() {
        guard signedIn, isWanted, permission == .allowed else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    private func uploadIfPossible() async {
        guard signedIn, isWanted, permission == .allowed, let token, uploadedToken != token else { return }
        let generation = sessionGeneration
        do {
            try await api.registerPushDevice(token: token, environment: .current)
            // Signed out, or in as someone else, while this was on its way: not this session's.
            guard generation == sessionGeneration else { return }
            uploadedToken = token
            isRegistered = true
        } catch {
            // Tried again the next time the app comes to the front.
        }
    }
}
