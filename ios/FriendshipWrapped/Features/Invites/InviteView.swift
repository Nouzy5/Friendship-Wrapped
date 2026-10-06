import SwiftUI

/// Preview an invite, then join, open the group, or sign up first (the web app's /invite/:token page).
struct InviteView: View {
    let token: String
    /// Called with the group's id once you've joined, or if you were already in it.
    let onOpenGroup: (String) -> Void

    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var preview: InvitePreview?
    @State private var loadFailure: APIError?
    @State private var isJoining = false
    @State private var joinFailure: String?

    var body: some View {
        Group {
            if let preview {
                content(preview)
            } else if let loadFailure {
                failureView(loadFailure)
            } else {
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func content(_ preview: InvitePreview) -> some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("You've been invited to join")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                GroupEmojiTile(emoji: preview.group.emoji, size: .large)
                    .padding(.vertical, 12)
                Text(preview.group.name)
                    .font(.title.weight(.black))
                    .multilineTextAlignment(.center)
                Text(Format.memberCount(preview.group.memberCount))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                actions(preview)
                    .padding(.top, 28)
            }
            .padding(24)
            .frame(maxWidth: .infinity)
        }
    }

    private func actions(_ preview: InvitePreview) -> some View {
        VStack(spacing: 12) {
            if let groupID = preview.memberOfGroupId {
                Text("You're already in this group.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("Open group") { onOpenGroup(groupID) }
                    .buttonStyle(.brand)
            } else if let user = session.user {
                if let joinFailure {
                    Text(joinFailure)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }
                PrimaryButton(title: "Join \(preview.group.name)", pendingTitle: "Joining…", isPending: isJoining) {
                    Task { await join() }
                }
                Text("Joining as @\(user.username)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                // After signing up or logging in, people come straight back to this invite.
                Button("Create an account to join") { router.startAuth(.register, returningTo: token) }
                    .buttonStyle(.brand)
                Button("I already have an account") { router.startAuth(.login, returningTo: token) }
                    .buttonStyle(.brandSecondary)
            }
        }
    }

    @ViewBuilder private func failureView(_ failure: APIError) -> some View {
        if failure.status == 404 {
            EmptyStateView(
                emoji: "🔗",
                title: "This invite has expired",
                message: "Invite links last 7 days, and the group owner can reset them. Ask your friend for a new one."
            )
        } else {
            EmptyStateView(
                emoji: "📡",
                title: "Couldn't load this invite",
                message: "Check your connection and try again."
            ) {
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private func load() async {
        loadFailure = nil
        do {
            preview = try await APIClient.shared.fetchInvitePreview(token)
        } catch is CancellationError {
            return
        } catch {
            loadFailure = error.asAPIError
        }
    }

    private func join() async {
        isJoining = true
        joinFailure = nil
        do {
            let group = try await APIClient.shared.acceptInvite(token)
            store.didJoin(group)
            onOpenGroup(group.id)
        } catch {
            joinFailure = error.asAPIError.message
            isJoining = false
        }
    }
}

/// An invite opened from a link (deep link or universal link), shown over whatever is on screen.
struct InviteSheet: View {
    let token: String

    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            InviteView(token: token) { groupID in
                router.openGroup(groupID)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
