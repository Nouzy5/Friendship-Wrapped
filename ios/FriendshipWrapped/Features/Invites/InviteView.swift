import SwiftUI

/// Preview an invite, then join, open the group, or sign up first (the web app's /invite/:token page).
struct InviteView: View {
    let token: String
    /// Called with the group's id once you've joined, or if you were already in it.
    let onOpenGroup: (String) -> Void

    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var store
    @Environment(WrappedStore.self) private var wrapped
    @Environment(AppRouter.self) private var router

    @State private var preview: InvitePreview?
    @State private var loadFailure: APIError?
    @State private var isJoining = false
    @State private var joinFailure: String?

    var body: some View {
        Group {
            if let preview {
                content(preview)
                    .transition(.opacity)
            } else if let loadFailure {
                ScrollView {
                    failureView(loadFailure)
                }
                .scrollBounceBehavior(.basedOnSize)
                .transition(.opacity)
            } else {
                InviteSkeleton()
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bg.ignoresSafeArea())
        .motion(.fwEase, value: preview)
        .motion(.fwEase, value: loadFailure)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func content(_ preview: InvitePreview) -> some View {
        ScrollView {
            VStack(spacing: 0) {
                Text(preview.invitedBy.map { "\($0) invited you to join" } ?? "You've been invited to join")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .multilineTextAlignment(.center)
                    .riseIn()

                // You can't see into the group yet, so its emoji sits on a plain tile.
                GroupBadge(groupID: nil, emoji: preview.group.emoji, size: 88)
                    .popIn(delay: 0.06)
                    .padding(.vertical, 20)

                Text(preview.group.name)
                    .font(Theme.title(.title))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .riseIn(delay: 0.1)

                Text(Format.memberCount(preview.group.memberCount))
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .padding(.top, 6)
                    .riseIn(delay: 0.12)

                actions(preview)
                    .padding(.top, 32)
                    .riseIn(delay: 0.18)
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private func actions(_ preview: InvitePreview) -> some View {
        VStack(spacing: 12) {
            if let groupID = preview.memberOfGroupId {
                Text("You're already in this group.")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .multilineTextAlignment(.center)
                Button("Open group") { onOpenGroup(groupID) }
                    .buttonStyle(.fwPrimary)
            } else if let user = session.user {
                if let joinFailure {
                    InlineAlert(message: joinFailure)
                }
                PrimaryButton(title: "Join \(preview.group.name)", pendingTitle: "Joining…", isPending: isJoining) {
                    Task { await join() }
                }
                Text("Joining as @\(user.username)")
                    .font(.caption)
                    .foregroundStyle(.sub)
            } else {
                // After signing up or logging in, people come straight back to this invite.
                Button("Create an account to join") { router.startAuth(.register, returningTo: token) }
                    .buttonStyle(.fwPrimary)
                Button("I already have an account") { router.startAuth(.login, returningTo: token) }
                    .buttonStyle(.fwSecondary)
            }
        }
        .motion(.fwQuick, value: joinFailure)
    }

    @ViewBuilder private func failureView(_ failure: APIError) -> some View {
        if let expired = ExpiredInvite(failure) {
            // Says who to ask, since the link can't be used any more.
            let group = [expired.groupEmoji, expired.groupName].filter { !$0.isEmpty }.joined(separator: " ")
            EmptyStateView(
                emoji: "⌛",
                title: "This invite has expired",
                message: "\(expired.invitedBy) invited you to join \(group), but the link has run out. Ask \(expired.invitedBy) for a new one."
            )
        } else if failure.status == 404 {
            EmptyStateView(
                emoji: "🔗",
                title: "This invite doesn't work",
                message: "The link may have been turned off, or it wasn't copied in full. Ask your friend for a new one."
            )
        } else {
            EmptyStateView(
                emoji: "📡",
                title: "Couldn't load this invite",
                message: "Check your connection and try again."
            ) {
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.fwCompact(.primary))
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
        guard !isJoining else { return }
        isJoining = true
        joinFailure = nil
        do {
            let group = try await APIClient.shared.acceptInvite(token)
            store.didJoin(group)
            // The group's Wrapped are yours now too.
            wrapped.setNeedsRefresh()
            Haptics.success()
            onOpenGroup(group.id)
        } catch {
            joinFailure = error.asAPIError.message
            isJoining = false
        }
    }
}

/// Grey shapes where the invite will be, while it loads.
private struct InviteSkeleton: View {
    var body: some View {
        VStack(spacing: 14) {
            Capsule().fill(.surface).frame(width: 170, height: 14)
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(.surface)
                .frame(width: 88, height: 88)
                .padding(.vertical, 6)
            Capsule().fill(.surface).frame(width: 210, height: 28)
            Capsule().fill(.surface).frame(width: 90, height: 14)
            Capsule().fill(.surface).frame(height: 48).padding(.top, 18)
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading invite")
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

