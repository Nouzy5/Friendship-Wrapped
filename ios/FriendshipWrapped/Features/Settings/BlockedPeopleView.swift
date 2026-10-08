import SwiftUI

/// Settings → Privacy & safety → Blocked people: unblocking brings back their photos, comments
/// and reactions (and yours for them).
struct BlockedPeopleView: View {
    @Environment(AccountStore.self) private var account
    @Environment(PhotosStore.self) private var photos
    @Environment(GroupsStore.self) private var groups

    @State private var failed = false
    @State private var unblockingID: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .navigationTitle("Blocked people")
        .navigationBarTitleDisplayMode(.large)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private var content: some View {
        if let blocked = account.blocked {
            if blocked.isEmpty {
                EmptyStateView(
                    emoji: "🕊️",
                    title: "Nobody's blocked",
                    message: "You can block someone from the menu on any of their photos."
                )
            } else {
                SettingsGroup {
                    ForEach(Array(blocked.enumerated()), id: \.element.id) { index, person in
                        row(person)
                            .listItemTransition(index: index)
                    }
                }
                .motion(.fwEase, value: blocked.map(\.id))
            }
        } else if failed {
            SettingsLoadError("Couldn't load who you've blocked. Check your connection.") {
                await load()
            }
        } else {
            ListSkeleton(rows: 2)
        }
    }

    private func row(_ person: UserSummary) -> some View {
        SettingsValueRow(
            label: person.displayName,
            description: "@\(person.username)",
            leading: {
                PersonAvatar(name: person.displayName, imagePath: person.avatarUrl, size: .md)
            },
            trailing: {
                if unblockingID == person.id {
                    ProgressView()
                        .frame(width: 44, height: 44)
                } else {
                    Button("Unblock") {
                        Task { await unblock(person) }
                    }
                    .buttonStyle(.fwCompact(.ghost))
                    .disabled(unblockingID != nil)
                    .accessibilityLabel("Unblock \(person.displayName)")
                }
            }
        )
    }

    private func load() async {
        do {
            try await account.loadBlocked()
            failed = false
        } catch is CancellationError {
            return
        } catch {
            if account.blocked == nil { failed = true }
        }
    }

    private func unblock(_ person: UserSummary) async {
        unblockingID = person.id
        do {
            try await account.unblock(person)
            // Their photos, comments and reactions show again: cached lists are loaded afresh.
            photos.clearCachedPhotos()
            groups.invalidateMembers()
            ToastCenter.shared.show("\(person.displayName) is unblocked")
        } catch {
            ToastCenter.shared.show("Couldn't unblock them.", isError: true)
        }
        unblockingID = nil
    }
}
