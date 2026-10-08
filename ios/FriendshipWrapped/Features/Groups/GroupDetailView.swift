import SwiftUI

/// A group's home: who's in it, then its photos, newest first, loading more as you scroll.
/// Non-members (or removed members) get a "not found" screen.
struct GroupDetailView: View {
    let groupID: String

    @Environment(GroupsStore.self) private var store
    @Environment(PhotosStore.self) private var photos
    @Environment(AppRouter.self) private var router

    @State private var failure: APIError?
    @State private var feedFailed = false
    @State private var layout: FeedLayout = .feed

    var body: some View {
        content
            .navigationTitle(store.group(groupID)?.name ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if store.group(groupID) != nil {
                        NavigationLink(value: AppRoute.groupSettings(groupID)) {
                            Image(systemName: "gearshape")
                        }
                        .accessibilityLabel("Group settings")
                    }
                }
            }
            // Runs again whenever the screen reappears (back from a photo, the camera closing):
            // only newer photos come in then, so the pages you scrolled through stay.
            .task { await load(restartFeed: false) }
    }

    @ViewBuilder private var content: some View {
        if let group = store.group(groupID) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    header(group)

                    // Until there's someone to share photos with, inviting comes first.
                    if group.memberCount == 1 {
                        InviteFriendsCard(group: group, highlight: true)
                    }

                    feedHeader
                    feedContent
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .refreshable { await load(restartFeed: true) }
        } else if let failure {
            if failure.status == 404 || failure.status == 400 {
                EmptyStateView(
                    emoji: "🔒",
                    title: "Group not found",
                    message: "It may have been deleted, or you're no longer a member."
                ) {
                    Button("Back to home") { router.popToHome() }
                        .buttonStyle(.bordered)
                }
            } else {
                EmptyStateView(
                    emoji: "📡",
                    title: "Couldn't load this group",
                    message: "Check your connection and try again."
                ) {
                    Button("Try again") { Task { await load(restartFeed: true) } }
                        .buttonStyle(.borderedProminent)
                }
            }
        } else {
            ProgressView()
        }
    }

    private func header(_ group: FriendGroup) -> some View {
        VStack(spacing: 12) {
            GroupEmojiTile(emoji: group.emoji, size: .extraLarge)
            Text(group.name)
                .font(.largeTitle.weight(.black))
                .multilineTextAlignment(.center)

            HStack(spacing: 8) {
                Button {
                    router.homePath.append(.members(groupID))
                } label: {
                    HStack(spacing: 10) {
                        if let members = store.members(of: groupID) {
                            MemberAvatarStack(members: members)
                        }
                        Text(Format.memberCount(group.memberCount))
                            .font(.subheadline)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                // The feed scrolls on and on, so invites live on the members screen rather than below it.
                if group.memberCount > 1 {
                    Button {
                        router.homePath.append(.members(groupID))
                    } label: {
                        Label("Invite", systemImage: "plus")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var feedHeader: some View {
        HStack(spacing: 12) {
            Text("Photos")
                .font(.headline)
            Spacer()
            Picker("Layout", selection: $layout) {
                Image(systemName: "rectangle.grid.1x2")
                    .accessibilityLabel("Feed")
                    .tag(FeedLayout.feed)
                Image(systemName: "square.grid.3x3")
                    .accessibilityLabel("Grid")
                    .tag(FeedLayout.grid)
            }
            .pickerStyle(.segmented)
            .frame(width: 100)

            Button {
                router.openCamera(groupID: groupID)
            } label: {
                Label("Add photo", systemImage: "camera")
            }
            .font(.subheadline.weight(.semibold))
        }
    }

    @ViewBuilder private var feedContent: some View {
        if let feed = photos.feed(for: groupID) {
            if feed.photos.isEmpty {
                EmptyStateView(
                    emoji: "📸",
                    title: "No photos yet",
                    message: "Be the first to share a moment with the group."
                ) {
                    Button("Take a photo") { router.openCamera(groupID: groupID) }
                        .buttonStyle(.brand)
                        .frame(maxWidth: 240)
                }
            } else {
                switch layout {
                case .feed:
                    ForEach(feed.photos) { photo in
                        PhotoCard(photo: photo)
                    }
                case .grid:
                    PhotoGrid(photos: feed.photos)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                loadMoreFooter(feed)
            }
        } else if feedFailed {
            EmptyStateView(
                emoji: "📡",
                title: "Couldn't load photos",
                message: "Check your connection and try again."
            ) {
                Button("Try again") { Task { await loadFeed(restart: true) } }
                    .buttonStyle(.borderedProminent)
            }
        } else {
            FeedSkeleton()
        }
    }

    @ViewBuilder private func loadMoreFooter(_ feed: PhotosStore.GroupFeed) -> some View {
        if feed.hasMore {
            if feed.loadMoreFailed {
                LoadMoreRow(title: "Load more photos", isLoading: false, failed: true) {
                    Task { await photos.loadMore(in: groupID) }
                }
            } else {
                // Coming into view loads the next page. A new identity per page means it fires
                // again if it's still on screen after a short page.
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .id(feed.photos.count)
                    .onAppear {
                        Task { await photos.loadMore(in: groupID) }
                    }
            }
        } else {
            Text("You're all caught up ✨")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
    }

    /// `restartFeed` loads the feed from its first page again (pull to refresh).
    private func load(restartFeed: Bool) async {
        do {
            try await store.loadGroup(groupID)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            failure = error.asAPIError
            // Gone (404) drops the group from the store. Offline with it cached, the feed still
            // gets its turn, so it shows "Try again" instead of a skeleton that never ends.
            guard store.group(groupID) != nil else { return }
        }
        try? await store.loadMembers(of: groupID)
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
