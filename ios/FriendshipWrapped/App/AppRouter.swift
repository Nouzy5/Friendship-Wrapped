import Foundation
import Observation

/// The main tabs. The camera isn't one: the shutter in the tab bar opens it over whatever you're on.
enum AppTab: Hashable {
    /// The feed of the group you're looking at (with a switcher to the others).
    case home
    case memories
    /// Only in the tab bar once there's a Wrapped to show.
    case wrapped
}

/// Screens pushed onto a tab's navigation stack. Settings and group settings are "detail"
/// screens: the tab bar steps aside for them (the web app's DetailLayout).
enum AppRoute: Hashable {
    case photo(String)
    /// The photo viewer, scrolled to its comments (a feed card's comment button).
    case photoComments(String)
    case album(String)
    case moment(String)
    case groupSettings(String)
    case settings(SettingsRoute)

    /// Whether the tab bar shows over this screen.
    var showsTabBar: Bool {
        switch self {
        case .photo, .photoComments, .album, .moment: return true
        case .groupSettings, .settings: return false
        }
    }
}

/// The screens under Settings.
enum SettingsRoute: Hashable {
    case home
    case account
    case notifications
    case appearance
    case privacy
    case blocked
    case invites
    case photosAndData
    case terms
}

enum AuthRoute: Hashable {
    case login
    case register
    case forgotPassword
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
    /// A moment to post into (one of that group's, and open).
    var momentID: String?
}

/// App-wide navigation state: tabs, stacks, deep links and the post-login detour back to an invite.
@MainActor
@Observable
final class AppRouter {
    var selectedTab: AppTab = .home
    var homePath: [AppRoute] = []
    var memoriesPath: [AppRoute] = []
    var wrappedPath: [AppRoute] = []
    var authPath: [AuthRoute] = []
    var presentedInvite: PendingInvite?
    var showOnboarding = false
    var cameraRequest: CameraRequest?
    var showingNewGroup = false
    var showingJoin = false
    /// The Wrapped story playing full screen.
    var playingWrapped: WrappedSummary?
    /// Tabs opened so far: a tab's screens are only built once you first go to it.
    private(set) var visitedTabs: Set<AppTab> = [.home]

    /// An invite to reopen once the person has logged in or signed up.
    private var inviteAfterAuth: String?
    /// For `openGroup`: the group a screen asks to show becomes the current one.
    @ObservationIgnored private weak var groups: GroupsStore?

    func attach(groups: GroupsStore) {
        self.groups = groups
    }

    /// The selected tab's stack.
    var currentPath: [AppRoute] {
        get {
            switch selectedTab {
            case .home: return homePath
            case .memories: return memoriesPath
            case .wrapped: return wrappedPath
            }
        }
        set {
            switch selectedTab {
            case .home: homePath = newValue
            case .memories: memoriesPath = newValue
            case .wrapped: wrappedPath = newValue
            }
        }
    }

    /// The tab bar steps aside on detail screens (settings, group settings).
    var showsTabBar: Bool {
        currentPath.last?.showsTabBar ?? true
    }

    /// Handles `friendshipwrapped://invite/<token>` and web invite links.
    func open(_ url: URL) {
        guard let token = InviteLink.token(from: url) else { return }
        afterClosingPresentations {
            self.presentedInvite = PendingInvite(token: token)
        }
    }

    /// A tapped notification. Its `url` is a path of the web app: `/photos/<id>`, `/groups/<id>`,
    /// `/memories`, `/memories/moments/<id>`, `/wrapped/<year>?group=<id>` or `/camera?group=<id>`. Anything else is ignored.
    func openNotification(path: String, wrapped: [WrappedSummary]) {
        guard let components = URLComponents(string: path) else { return }
        let parts = components.path.split(separator: "/").map(String.init)
        var query: [String: String] = [:]
        for item in components.queryItems ?? [] where query[item.name] == nil {
            if let value = item.value { query[item.name] = value }
        }
        guard let first = parts.first else { return }

        switch (first, parts.count) {
        case ("photos", 2):
            let photoID = parts[1]
            afterClosingPresentations {
                self.visitedTabs.insert(.home)
                self.selectedTab = .home
                self.homePath = [.photo(photoID)]
            }
        case ("groups", 2):
            let groupID = parts[1]
            afterClosingPresentations { self.openGroup(groupID) }
        case ("memories", 3) where parts[1] == "moments":
            let momentID = parts[2]
            afterClosingPresentations {
                self.visitedTabs.insert(.memories)
                self.selectedTab = .memories
                self.memoriesPath = [.moment(momentID)]
            }
        case ("memories", _):
            afterClosingPresentations { self.selectTab(.memories) }
        case ("wrapped", 2):
            guard let year = Int(parts[1]), let groupID = query["group"] else { return }
            // The story only needs the ids; the list has the group's name when it has loaded.
            let summary = wrapped.first { $0.group.id == groupID && $0.year == year }
                ?? WrappedSummary(group: Photo.GroupInfo(id: groupID, name: "", emoji: ""), year: year, final: false)
            afterClosingPresentations { self.playingWrapped = summary }
        case ("camera", _):
            let groupID = query["group"]
            afterClosingPresentations { self.openCamera(groupID: groupID) }
        default:
            return
        }
    }

    /// SwiftUI shows one presentation at a time, so whatever is open closes first and `action`
    /// runs once that animation has finished.
    private func afterClosingPresentations(_ action: @escaping () -> Void) {
        let somethingOpen = cameraRequest != nil || showOnboarding || showingNewGroup || showingJoin
            || presentedInvite != nil || playingWrapped != nil
        closePresentations()

        guard somethingOpen else {
            action()
            return
        }
        Task {
            try? await Task.sleep(for: .milliseconds(600))
            action()
        }
    }

    /// Tapping the tab you're on goes back to its first screen.
    func selectTab(_ tab: AppTab) {
        if tab == selectedTab {
            currentPath = []
        } else {
            visitedTabs.insert(tab)
            selectedTab = tab
        }
    }

    func push(_ route: AppRoute) {
        currentPath.append(route)
    }

    func openSettings(_ route: SettingsRoute = .home) {
        push(.settings(route))
    }

    func openCamera(groupID: String?, momentID: String? = nil) {
        cameraRequest = CameraRequest(groupID: groupID, momentID: momentID)
    }

    /// Shows a group's feed: it becomes the current group, on the Home tab.
    func openGroup(_ groupID: String) {
        presentedInvite = nil
        groups?.setCurrentGroup(groupID)
        visitedTabs.insert(.home)
        selectedTab = .home
        homePath = []
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
        visitedTabs = [.home]
        homePath = []
        memoriesPath = []
        wrappedPath = []
        authPath = []
        closePresentations()
    }

    private func closePresentations() {
        cameraRequest = nil
        showOnboarding = false
        showingNewGroup = false
        showingJoin = false
        presentedInvite = nil
        playingWrapped = nil
    }
}
