import SwiftUI

/// A group's home. Non-members (or removed members) get a "not found" screen.
struct GroupDetailView: View {
    let groupID: String

    @Environment(GroupsStore.self) private var store
    @Environment(PhotosStore.self) private var photos
    @Environment(AppRouter.self) private var router
    @State private var failure: APIError?
    @State private var photosFailed = false

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
            .task { await load() }
    }

    @ViewBuilder private var content: some View {
        if let group = store.group(groupID) {
            List {
                Section {
                    VStack(spacing: 12) {
                        GroupEmojiTile(emoji: group.emoji, size: .extraLarge)
                        Text(group.name)
                            .font(.largeTitle.weight(.black))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }

                Section {
                    NavigationLink(value: AppRoute.members(groupID)) {
                        HStack(spacing: 12) {
                            if let members = store.members(of: groupID) {
                                MemberAvatarStack(members: members)
                            }
                            Text(Format.memberCount(group.memberCount))
                        }
                    }
                }

                // Inviting comes first until there's someone to share photos with.
                if group.memberCount == 1 {
                    InviteFriendsSection(group: group, highlight: true)
                }

                GroupPhotosSection(groupID: groupID, loadFailed: photosFailed) {
                    Task { await loadPhotos() }
                }

                if group.memberCount > 1 {
                    InviteFriendsSection(group: group)
                }
            }
            .refreshable { await load() }
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
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.borderedProminent)
                }
            }
        } else {
            ProgressView()
        }
    }

    private func load() async {
        do {
            try await store.loadGroup(groupID)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            failure = error.asAPIError
            return
        }
        try? await store.loadMembers(of: groupID)
        await loadPhotos()
    }

    private func loadPhotos() async {
        do {
            try await photos.loadPhotos(in: groupID)
            photosFailed = false
        } catch is CancellationError {
            return
        } catch {
            photosFailed = true
        }
    }
}
