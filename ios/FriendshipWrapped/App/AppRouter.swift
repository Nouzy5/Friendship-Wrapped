import Foundation
import Observation

enum AppTab: Hashable {
    case home
    /// Never actually selected: tapping it opens the camera over the current tab.
    case camera
    case profile
}

/// Screens pushed onto the Home tab's navigation stack.
enum AppRoute: Hashable {
    case group(String)
    case members(String)
    case groupSettings(String)
    case photo(String)
    /// The photo viewer, scrolled to its comments (a feed card's comment button).
    case photoComments(String)
}

enum AuthRoute: Hashable {
    case login
    case register
}

/// An invite to show in a sheet. Identifiable for `.sheet(item:)`.
struct PendingInvite: Identifiable, Hashable {
    let token: String
    var id: String { token }
}

/// A request to open the camera, optionally from a group (which is then preselected).
struct CameraRequest: Identifiable {
    let id = UUID()
    let groupID: String?
}

/// App-wide navigation state: tabs, stacks, deep links and the post-login detour back to an invite.
@MainActor
@Observable
final class AppRouter {
    var selectedTab: AppTab = .home
    var homePath: [AppRoute] = []
    var authPath: [AuthRoute] = []
    var presentedInvite: PendingInvite?
    var showOnboarding = false
    var cameraRequest: CameraRequest?
    var showingNewGroup = false
    var showingJoin = false

    /// An invite to reopen once the person has logged in or signed up.
    private var inviteAfterAuth: String?

    /// Handles `friendshipwrapped://invite/<token>` and web invite links.
    func open(_ url: URL) {
        guard let token = InviteLink.token(from: url) else { return }

        // SwiftUI shows one presentation at a time, so close whatever is open first.
        let somethingOpen = cameraRequest != nil || showOnboarding || showingNewGroup || showingJoin || presentedInvite != nil
        cameraRequest = nil
        showOnboarding = false
        showingNewGroup = false
        showingJoin = false
        presentedInvite = nil

        guard somethingOpen else {
            presentedInvite = PendingInvite(token: token)
            return
        }
        Task {
            // Let the closing animation finish before presenting the invite.
            try? await Task.sleep(for: .milliseconds(600))
            self.presentedInvite = PendingInvite(token: token)
        }
    }

    func selectTab(_ tab: AppTab) {
        if tab == .camera {
            openCamera(groupID: nil)
        } else {
            selectedTab = tab
        }
    }

    func openCamera(groupID: String?) {
        cameraRequest = CameraRequest(groupID: groupID)
    }

    func openGroup(_ groupID: String) {
        presentedInvite = nil
        selectedTab = .home
        homePath = [.group(groupID)]
    }

    func popToHome() {
        homePath = []
    }

    /// Signed out on an invite: log in or sign up first, then come straight back to it.
    func startAuth(_ route: AuthRoute, returningTo token: String) {
        inviteAfterAuth = token
        presentedInvite = nil
        authPath = [route]
    }

    func didSignIn(isNewAccount: Bool) {
        authPath = []
        if let token = inviteAfterAuth {
            inviteAfterAuth = nil
            presentedInvite = PendingInvite(token: token)
        } else if isNewAccount {
            // Brand-new accounts start at onboarding, unless they came from an invite.
            showOnboarding = true
        }
    }

    func didSignOut() {
        selectedTab = .home
        homePath = []
        authPath = []
        showOnboarding = false
        cameraRequest = nil
        showingNewGroup = false
        showingJoin = false
    }
}
