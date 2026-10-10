import SwiftUI

/// Picks signed-out vs signed-in UI, applies the look (theme, accent, motion, rounded type) and
/// hosts app-wide presentations (invite links, onboarding).
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var groups
    @Environment(PhotosStore.self) private var photos
    @Environment(AlbumsStore.self) private var albums
    @Environment(MomentsStore.self) private var moments
    @Environment(WrappedStore.self) private var wrapped
    @Environment(AccountStore.self) private var account
    @Environment(DeviceSettings.self) private var settings
    @Environment(AppRouter.self) private var router
    @Environment(\.accessibilityReduceMotion) private var deviceReducesMotion

    /// Your colour from last time, so the shutter doesn't flash another colour while groups load.
    @AppStorage("fw.accent") private var lastAccent = ""

    private var reduceMotion: Bool {
        switch settings.values.reduceMotion {
        case .system: return deviceReducesMotion
        case .on: return true
        case .off: return false
        }
    }

    private var accentColor: MemberColor? {
        if groups.listState == .loaded { return groups.currentGroup?.myColor }
        return MemberColor(rawValue: lastAccent)
    }

    var body: some View {
        @Bindable var router = router

        content
            .background(Color.bg.ignoresSafeArea())
            .sheet(item: $router.presentedInvite) { invite in
                InviteSheet(token: invite.token)
            }
            .fullScreenCover(isPresented: $router.showOnboarding) {
                OnboardingView()
            }
            .onOpenURL { url in
                router.open(url)
            }
            .task {
                Motion.isReduced = reduceMotion
                ThemeApplier.apply(settings.values.theme, animated: false)
                await session.restore()
            }
            .onChange(of: reduceMotion) { _, reduced in
                Motion.isReduced = reduced
            }
            .onChange(of: settings.values.theme) { _, theme in
                ThemeApplier.apply(theme, animated: true)
            }
            .onChange(of: groups.currentGroup?.myColor) { _, color in
                if groups.listState == .loaded { lastAccent = color?.rawValue ?? "" }
            }
            .onChange(of: session.user?.id) { oldID, newID in
                // A different account (or none) must never see the previous one's cached data.
                groups.reset()
                photos.reset()
                albums.reset()
                moments.reset()
                wrapped.reset()
                account.reset()
                ImageCache.shared.removeAll()
                if newID == nil {
                    lastAccent = ""
                    router.didSignOut()
                    PushRegistrar.shared.sessionDidEnd()
                } else {
                    // Decides whether the Wrapped tab shows.
                    wrapped.setNeedsRefresh()
                    Task { await account.syncTimeZone() }
                    Task { await PushRegistrar.shared.sessionDidStart() }
                    if oldID == nil {
                        router.didSignIn(isNewAccount: session.justRegistered)
                    }
                }
            }
            // Outside the presentations above, so the invite sheet and onboarding get the look too.
            .fontDesign(.rounded)
            .tint(Theme.fg)
            .environment(\.accentMemberColor, accentColor)
            .environment(\.fwReduceMotion, reduceMotion)
    }

    @ViewBuilder private var content: some View {
        switch session.phase {
        case .loading:
            LaunchView()
        case .unreachable(let message):
            EmptyStateView(emoji: "📡", title: "Can't reach Friendship Wrapped", message: message) {
                Button("Try again") {
                    Task { await session.restore() }
                }
                .buttonStyle(.fwCompact(.primary))
            }
        case .signedOut:
            AuthFlowView()
        case .needsEmail(let user):
            EmailGateView(user: user)
        case .signedIn:
            MainTabView()
        }
    }
}

private struct LaunchView: View {
    var body: some View {
        AppMark(size: 72)
            .popIn()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Signed-in shell: Home, the camera shutter (opens over the current tab) and Memories, with
/// Wrapped once there's one to show. Settings open from your avatar at the top of Home.
struct MainTabView: View {
    @Environment(AppRouter.self) private var router
    @Environment(WrappedStore.self) private var wrapped
    @Environment(GroupsStore.self) private var groups
    @Environment(AccountStore.self) private var account
    @Environment(NetworkMonitor.self) private var network
    @Environment(\.scenePhase) private var scenePhase
    @State private var toasts = ToastCenter.shared
    @State private var keyboardShown = false

    var body: some View {
        @Bindable var router = router

        ZStack {
            tab(.home) {
                NavigationStack(path: $router.homePath) {
                    HomeView()
                        .navigationDestination(for: AppRoute.self) { AppRouteDestination(route: $0) }
                }
            }
            tab(.memories) {
                NavigationStack(path: $router.memoriesPath) {
                    MemoriesView()
                        .navigationDestination(for: AppRoute.self) { AppRouteDestination(route: $0) }
                }
            }
            if wrapped.hasAny {
                tab(.wrapped) {
                    NavigationStack(path: $router.wrappedPath) {
                        WrappedListView()
                            .navigationDestination(for: AppRoute.self) { AppRouteDestination(route: $0) }
                    }
                }
            }
        }
        .toastOverlay(toasts)
        .safeAreaInset(edge: .top, spacing: 0) {
            if !network.isOnline {
                OfflineBanner()
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            // Out of the way while typing (a comment), so it doesn't ride up on the keyboard.
            if router.showsTabBar && !keyboardShown {
                TabBar()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .motion(.fwEase, value: router.showsTabBar)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardShown = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardShown = false
        }
        .motion(.fwEase, value: network.isOnline)
        .fullScreenCover(item: $router.cameraRequest) { request in
            CaptureFlowView(preferredGroupID: request.groupID, momentID: request.momentID)
        }
        .fullScreenCover(item: $router.playingWrapped) { summary in
            WrappedStoryView(groupID: summary.group.id, year: summary.year)
        }
        .sheet(isPresented: $router.showingNewGroup) {
            NewGroupView()
        }
        .sheet(isPresented: $router.showingJoin) {
            JoinWithLinkView()
        }
        .task { await groups.loadGroupsIfNeeded() }
        .onChange(of: network.isOnline) { _, online in
            // Back online: catch up on what changed meanwhile.
            guard online else { return }
            Task { await groups.loadGroups() }
            wrapped.setNeedsRefresh()
        }
        .onChange(of: wrapped.hasAny) { _, hasAny in
            // Leaving your last group with photos takes the tab away.
            if !hasAny, router.selectedTab == .wrapped { router.selectTab(.home) }
        }
        .onChange(of: scenePhase) { _, phase in
            // A new year, new groups, or friends' photos while the app was away.
            guard phase == .active else { return }
            Task { await groups.loadGroups() }
            Task { await account.syncTimeZone() }
            Task { await PushRegistrar.shared.appDidBecomeActive() }
            wrapped.setNeedsRefresh()
        }
        // A tapped notification opens the page it is about. Also when the tap launched the app.
        .onChange(of: PushRegistrar.shared.pendingPath) { _, _ in openTappedNotification() }
        .task { openTappedNotification() }
    }

    private func openTappedNotification() {
        guard let path = PushRegistrar.shared.pendingPath else { return }
        PushRegistrar.shared.pendingPath = nil
        router.openNotification(path: path, wrapped: wrapped.list)
    }

    /// One tab's screens. All visited tabs stay alive (keeping their place); the one you switch
    /// to rises into place as the other fades.
    @ViewBuilder
    private func tab<Content: View>(_ tab: AppTab, @ViewBuilder content: () -> Content) -> some View {
        let isSelected = router.selectedTab == tab
        if router.visitedTabs.contains(tab) {
            content()
                .opacity(isSelected ? 1 : 0)
                .offset(y: isSelected ? 0 : 8)
                .allowsHitTesting(isSelected)
                .accessibilityHidden(!isSelected)
                .zIndex(isSelected ? 1 : 0)
                .motion(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28), value: isSelected)
        }
    }
}

/// The bottom bar: Home, the shutter (your colour; opens the camera), Memories and Wrapped.
private struct TabBar: View {
    @Environment(AppRouter.self) private var router
    @Environment(WrappedStore.self) private var wrapped
    @Environment(GroupsStore.self) private var groups
    @Environment(\.accent) private var accent
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        HStack(spacing: 0) {
            item(.home, label: "Home", systemImage: "house", selectedImage: "house.fill")
            shutter
                .frame(maxWidth: .infinity)
            item(.memories, label: "Memories", systemImage: "rectangle.on.rectangle", selectedImage: "rectangle.fill.on.rectangle.fill")
            if wrapped.hasAny {
                item(.wrapped, label: "Wrapped", systemImage: "chart.bar", selectedImage: "chart.bar.fill")
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 64)
        .background(Color.bg.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) {
            Rectangle().fill(.line).frame(height: 1 / displayScale)
        }
        .motion(.fwEase, value: wrapped.hasAny)
    }

    private func item(_ tab: AppTab, label: String, systemImage: String, selectedImage: String) -> some View {
        let isSelected = router.selectedTab == tab
        return Button {
            if !isSelected { Haptics.tap() }
            router.selectTab(tab)
        } label: {
            VStack(spacing: 3) {
                Image(systemName: isSelected ? selectedImage : systemImage)
                    .font(.system(size: 21, weight: isSelected ? .semibold : .regular))
                    .frame(height: 26)
                    .bounceOnce(trigger: isSelected)
                Text(label)
                    .font(.system(size: 12, weight: isSelected ? .semibold : .medium, design: .rounded))
            }
            .foregroundStyle(isSelected ? Theme.fg : Theme.sub)
            .frame(maxWidth: .infinity, minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    /// The camera is the app's main action: a shutter in your colour.
    private var shutter: some View {
        Button {
            Haptics.tap()
            router.openCamera(groupID: groups.currentGroup?.id)
        } label: {
            // A ring and a dot, with a gap between them.
            Circle()
                .fill(accent.background)
                .padding(8)
                .overlay(Circle().strokeBorder(accent.background, lineWidth: 4))
                .frame(width: 54, height: 54)
                .motion(.fwEase, value: accent)
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.88))
        .accessibilityLabel("Camera")
    }
}

/// The screen for a route, on whichever tab's stack it was pushed.
struct AppRouteDestination: View {
    let route: AppRoute

    var body: some View {
        switch route {
        case .photo(let photoID):
            PhotoDetailView(photoID: photoID)
        case .photoComments(let photoID):
            PhotoDetailView(photoID: photoID, scrollToComments: true)
        case .album(let albumID):
            AlbumDetailView(albumID: albumID)
        case .moment(let momentID):
            MomentDetailView(momentID: momentID)
        case .groupSettings(let groupID):
            GroupSettingsView(groupID: groupID)
        case .settings(let screen):
            SettingsDestination(route: screen)
        }
    }
}
