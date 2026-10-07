import SwiftUI

/// Picks signed-out vs signed-in UI and hosts app-wide presentations (invite links, onboarding).
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var groups
    @Environment(PhotosStore.self) private var photos
    @Environment(AlbumsStore.self) private var albums
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router

        content
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
                await session.restore()
            }
            .onChange(of: session.user?.id) { oldID, newID in
                // A different account (or none) must never see the previous one's cached data.
                groups.reset()
                photos.reset()
                albums.reset()
                ImageCache.shared.removeAll()
                if newID == nil {
                    router.didSignOut()
                } else if oldID == nil {
                    router.didSignIn(isNewAccount: session.justRegistered)
                }
            }
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
                .buttonStyle(.borderedProminent)
            }
        case .signedOut:
            AuthFlowView()
        case .signedIn:
            MainTabView()
        }
    }
}

private struct LaunchView: View {
    var body: some View {
        VStack(spacing: 24) {
            AppLogo(size: 72)
            ProgressView()
        }
    }
}

/// Signed-in shell: Home, Camera (the main action, opens over the current tab), Memories and Profile.
/// Wrapped joins the tab bar once there's a Wrapped to show.
struct MainTabView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router

        // Tapping Camera opens the camera over the current tab instead of switching to it.
        TabView(selection: Binding(get: { self.router.selectedTab }, set: { self.router.selectTab($0) })) {
            NavigationStack(path: $router.homePath) {
                HomeView()
                    .navigationDestination(for: AppRoute.self) { route in
                        AppRouteDestination(route: route)
                    }
            }
            .tabItem { Label("Home", systemImage: "house") }
            .tag(AppTab.home)

            CameraTabPlaceholder()
                .tabItem { Label("Camera", systemImage: "camera.fill") }
                .tag(AppTab.camera)

            NavigationStack(path: $router.memoriesPath) {
                MemoriesView()
                    .navigationDestination(for: AppRoute.self) { route in
                        AppRouteDestination(route: route)
                    }
            }
            .tabItem { Label("Memories", systemImage: "photo.stack") }
            .tag(AppTab.memories)

            NavigationStack {
                ProfileView()
            }
            .tabItem { Label("Profile", systemImage: "person.crop.circle") }
            .tag(AppTab.profile)
        }
        .fullScreenCover(item: $router.cameraRequest) { request in
            CaptureFlowView(preferredGroupID: request.groupID)
        }
    }
}

/// The screen for a route, on whichever tab's stack it was pushed.
struct AppRouteDestination: View {
    let route: AppRoute

    var body: some View {
        switch route {
        case .group(let groupID):
            GroupDetailView(groupID: groupID)
        case .members(let groupID):
            GroupMembersView(groupID: groupID)
        case .groupSettings(let groupID):
            GroupSettingsView(groupID: groupID)
        case .photo(let photoID):
            PhotoDetailView(photoID: photoID)
        case .photoComments(let photoID):
            PhotoDetailView(photoID: photoID, scrollToComments: true)
        case .album(let albumID):
            AlbumDetailView(albumID: albumID)
        }
    }
}

/// Normally never seen, because the Camera tab opens the camera instead. If the tab bar does
/// switch to it, open the camera anyway, and leave a way back in once it's closed.
private struct CameraTabPlaceholder: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        EmptyStateView(
            emoji: "📸",
            title: "Share a moment",
            message: "Take a photo or choose one from your library to share with a group."
        ) {
            Button("Open camera") { router.openCamera(groupID: nil) }
                .buttonStyle(.brand)
                .frame(maxWidth: 240)
        }
        .onAppear { router.openCamera(groupID: nil) }
    }
}
