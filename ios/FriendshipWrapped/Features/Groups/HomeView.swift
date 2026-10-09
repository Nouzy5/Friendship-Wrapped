import SwiftUI

/// Home: the feed of the group you last looked at, with a switcher to your other groups (the web
/// app's GroupPage). Without any groups yet it explains how to start one (HomePage); while they
/// load there's a skeleton, and if they can't load, a way to try again.
struct HomeView: View {
    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var groups
    @Environment(AppRouter.self) private var router

    /// Posts or a grid; kept while you switch groups and open photos.
    @State private var layout: FeedLayout = .feed

    var body: some View {
        ZStack {
            if let group = groups.currentGroup {
                // A group of its own: switching starts at the top of the other group's feed.
                HomeFeed(group: group, layout: $layout)
                    .id(group.id)
                    .transition(.opacity)
            } else {
                switch groups.listState {
                case .failed:
                    noGroupScreen { loadFailed }
                case .loaded:
                    noGroupScreen { welcome }
                case .idle, .loading:
                    loadingSkeleton
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.bg.ignoresSafeArea())
        .motion(.fwEase, value: groups.currentGroup?.id)
        .toolbar(.hidden, for: .navigationBar)
        .task { await groups.loadGroupsIfNeeded() }
    }

    /// Before you're in any group: the page scrolls (pull to load your groups again), with your
    /// avatar in the corner for Settings.
    private func noGroupScreen<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ScrollView {
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    ProfileButton(color: nil)
                }
                .padding(.horizontal, 8)
                .padding(.top, 4)
                content()
            }
        }
        .refreshable { await groups.loadGroups() }
    }

    private var welcome: some View {
        VStack(spacing: 0) {
            AppMark(size: 72)
                .popIn()
            Text("Hey \(session.user?.firstName ?? "there")")
                .font(Theme.title())
                .multilineTextAlignment(.center)
                .padding(.top, 24)
                .accessibilityAddTraits(.isHeader)
                .riseIn(delay: 0.06)
            Text("Make a group for your friends, then send them an invite link. Got a link from a friend? Just open it, or join with it here.")
                .font(.subheadline)
                .foregroundStyle(.sub)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
                .padding(.top, 8)
                .riseIn(delay: 0.1)
            VStack(spacing: 10) {
                Button("Create a group") {
                    router.showingNewGroup = true
                }
                .buttonStyle(.fwPrimary)
                Button("Join with an invite link") {
                    router.showingJoin = true
                }
                .buttonStyle(.fwSecondary)
            }
            .frame(maxWidth: 320)
            .padding(.top, 32)
            .riseIn(delay: 0.14)
        }
        .padding(.horizontal, 24)
        .padding(.top, 40)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity)
    }

    private var loadFailed: some View {
        EmptyStateView(
            emoji: "📡",
            title: "Couldn't load your groups",
            message: "Check your connection and try again."
        ) {
            Button("Try again") {
                Task { await groups.loadGroups() }
            }
            .buttonStyle(.fwCompact(.primary))
        }
    }

    private var loadingSkeleton: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(.surface)
                    .frame(width: 36, height: 36)
                Capsule()
                    .fill(.surface)
                    .frame(width: 150, height: 26)
                Spacer()
                Circle()
                    .fill(.surface)
                    .frame(width: 32, height: 32)
                    .padding(.trailing, 6)
            }
            .frame(minHeight: 44)
            .padding(.leading, 16)
            .padding(.trailing, 8)
            .padding(.top, 8)
            .modifier(SkeletonPulse())
            .accessibilityHidden(true)

            FeedSkeleton(count: 1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

/// One group's Home: the header (badge, group switcher, grid/feed, group settings, you), an invite
/// card while you're the only one in it, then its photos, newest first, loading more as you scroll.
private struct HomeFeed: View {
    let group: FriendGroup
    @Binding var layout: FeedLayout

    @Environment(GroupsStore.self) private var groups
    @Environment(PhotosStore.self) private var photos
    @Environment(AppRouter.self) private var router
    @Environment(NetworkMonitor.self) private var network
    @Environment(\.scenePhase) private var scenePhase

    @State private var feedFailed = false

    init(group: FriendGroup, layout: Binding<FeedLayout>) {
        self.group = group
        _layout = layout
    }

    private var groupID: String { group.id }

    /// The feed minus photos deleted since it loaded (here or in the viewer).
    private func visible(_ feed: PhotosStore.GroupFeed) -> [Photo] {
        let deleted = photos.deletedPhotoIDs
        guard !deleted.isEmpty else { return feed.photos }
        return feed.photos.filter { !deleted.contains($0.id) }
    }

    private var shownIDs: [String] {
        guard let feed = photos.feed(for: groupID) else { return [] }
        return visible(feed).map(\.id)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                header

                // Until there's someone to share photos with, inviting comes first.
                if group.memberCount == 1 {
                    InviteFriendsCard(group: group, highlight: true)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 16)
                } else {
                    if PushRegistrar.shared.shouldOffer {
                        // Friends are here: now notifications are worth asking for.
                        PushPromptCard()
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                            .padding(.bottom, 16)
                    }
                    OpenMomentCard(group: group)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 8)
                    GroupPulseCard(group: group, latestPhotoID: shownIDs.first)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 16)
                }

                feedContent
            }
            .padding(.bottom, 24)
            .motion(.fwEase, value: shownIDs)
        }
        .refreshable { await load(restartFeed: true) }
        // Runs again whenever Home reappears (back from a photo or settings): only newer photos
        // come in then, so the pages you scrolled through stay, and your place in them.
        .task { await load(restartFeed: false) }
        .onChange(of: photos.feed(for: groupID) == nil) { _, cleared in
            // Blocking or unblocking someone drops every cached photo: load this group's again.
            if cleared { Task { await loadFeed(restart: true) } }
        }
        .onChange(of: network.isOnline) { _, online in
            // Back online after a failed load.
            guard online, feedFailed || photos.feed(for: groupID) == nil else { return }
            Task { await load(restartFeed: false) }
        }
        .onChange(of: scenePhase) { _, phase in
            // Friends' photos while the app was away.
            guard phase == .active, photos.feed(for: groupID) != nil else { return }
            Task { await loadFeed(restart: false) }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                GroupBadge(group: group, size: 36)
                GroupPicker(current: group, style: .title, onNewGroup: { router.showingNewGroup = true }) { next in
                    groups.setCurrentGroup(next.id)
                }
                .layoutPriority(1)
                Spacer(minLength: 0)
                HStack(spacing: 0) {
                    IconButton(
                        systemImage: layout == .grid ? "rectangle.grid.1x2" : "square.grid.2x2",
                        label: "Show as grid"
                    ) {
                        Haptics.tap()
                        withMotion(.fwEase) {
                            layout = layout == .grid ? .feed : .grid
                        }
                    }
                    .accessibilityAddTraits(layout == .grid ? .isSelected : [])

                    NavigationLink(value: AppRoute.groupSettings(groupID)) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundStyle(.fg)
                            .frame(width: 44, height: 44)
                            .contentShape(Circle())
                    }
                    .buttonStyle(PressScaleButtonStyle())
                    .accessibilityLabel("Group settings")

                    ProfileButton(color: group.myColor)
                }
                .fixedSize()
            }

            NavigationLink(value: AppRoute.groupSettings(groupID)) {
                Text(Format.memberCount(group.memberCount))
                    .font(.footnote)
                    .foregroundStyle(.sub)
                    .frame(minHeight: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 46)
            .accessibilityHint("Opens group settings")
        }
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    // MARK: - Photos

    @ViewBuilder private var feedContent: some View {
        if let feed = photos.feed(for: groupID) {
            let shown = visible(feed)
            if shown.isEmpty && !feed.hasMore {
                EmptyStateView(
                    emoji: "📸",
                    title: "No photos yet",
                    message: "Be the first to post something to \(group.name)."
                ) {
                    Button("Take a photo") {
                        router.openCamera(groupID: groupID)
                    }
                    .buttonStyle(.fwAccent)
                    .frame(maxWidth: 280)
                }
                .transition(.opacity)
            } else {
                switch layout {
                case .feed:
                    ForEach(Array(shown.enumerated()), id: \.element.id) { index, photo in
                        PhotoCard(photo: photo)
                            .padding(.bottom, 24)
                            .listItemTransition(index: index)
                    }
                case .grid:
                    PhotoGrid(photos: shown)
                        .padding(.horizontal, 8)
                        .padding(.bottom, 8)
                        .transition(.opacity)
                }
                footer(feed)
            }
        } else if feedFailed {
            EmptyStateView(
                emoji: "📡",
                title: "Couldn't load photos",
                message: "Check your connection and try again."
            ) {
                Button("Try again") {
                    Task { await loadFeed(restart: true) }
                }
                .buttonStyle(.fwCompact(.primary))
            }
        } else if layout == .grid {
            GridSkeleton()
                .padding(.horizontal, 8)
        } else {
            FeedSkeleton()
        }
    }

    @ViewBuilder private func footer(_ feed: PhotosStore.GroupFeed) -> some View {
        if feed.hasMore {
            LoadMoreRow(
                title: "Load more photos",
                isLoading: feed.isLoadingMore,
                failed: feed.loadMoreFailed,
                loadsWhenVisible: true
            ) {
                Task { await photos.loadMore(in: groupID) }
            }
        } else {
            Text("You're all caught up.")
                .font(.subheadline)
                .foregroundStyle(.sub)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
        }
    }

    // MARK: - Loading

    /// `restartFeed` loads the feed from its first page again (pull to refresh).
    private func load(restartFeed: Bool) async {
        do {
            try await groups.loadGroup(groupID)
        } catch is CancellationError {
            return
        } catch {
            // Gone (404) drops the group from the store, and Home moves on to your next one.
            // Offline with it cached, the feed still gets its turn, so it shows "Try again"
            // instead of a skeleton that never ends.
            guard groups.group(groupID) != nil else { return }
        }
        if restartFeed {
            try? await groups.loadMembers(of: groupID)
        } else {
            await groups.loadMembersIfNeeded(of: groupID)
        }
        await loadFeed(restart: restartFeed)
    }

    private func loadFeed(restart: Bool) async {
        do {
            if restart || photos.feed(for: groupID) == nil {
                try await photos.refreshFeed(in: groupID)
            } else {
                try await photos.refreshNewest(in: groupID)
            }
            feedFailed = false
        } catch is CancellationError {
            return
        } catch {
            feedFailed = true
        }
    }
}

/// You, in your colour in the group: opens Settings.
private struct ProfileButton: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppRouter.self) private var router

    let color: MemberColor?

    init(color: MemberColor?) {
        self.color = color
    }

    var body: some View {
        Button {
            Haptics.tap()
            router.openSettings()
        } label: {
            PersonAvatar(
                name: session.user?.displayName ?? "",
                imagePath: session.user?.avatarUrl,
                color: color,
                size: .sm
            )
            .frame(width: 44, height: 44)
            .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel("Your profile and settings")
    }
}
