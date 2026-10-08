import SwiftUI

/// Settings → Privacy & safety → Invite links you've made: the ones that still work, so you can
/// turn off one you shared by mistake. The links themselves can't be shown again.
struct MyInviteLinksView: View {
    @Environment(AccountStore.self) private var account

    @State private var failed = false
    @State private var revokingID: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Anyone with one of these links can join the group until it expires.")
                    .font(.callout)
                    .foregroundStyle(.sub)
                    .padding(.horizontal, 8)
                    .fixedSize(horizontal: false, vertical: true)
                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .navigationTitle("Invite links")
        .navigationBarTitleDisplayMode(.large)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private var content: some View {
        if let invites = account.invites {
            if invites.isEmpty {
                EmptyStateView(
                    emoji: "🔗",
                    title: "No working links",
                    message: "Invite links you make in a group's settings show up here until they expire."
                )
            } else {
                SettingsGroup {
                    ForEach(Array(invites.enumerated()), id: \.element.id) { index, invite in
                        row(invite)
                            .listItemTransition(index: index)
                    }
                }
                .motion(.fwEase, value: invites.map(\.id))
            }
        } else if failed {
            SettingsLoadError("Couldn't load your invite links. Check your connection.") {
                await load()
            }
        } else {
            ListSkeleton(rows: 2)
        }
    }

    private func row(_ invite: MyInvite) -> some View {
        SettingsValueRow(
            label: invite.group.name,
            description: "Works until \(Format.dayMonth(invite.expiresAt))",
            leading: {
                GroupBadge(
                    groupID: invite.group.id,
                    emoji: invite.group.emoji,
                    avatarURL: invite.group.avatarUrl,
                    size: 36
                )
            },
            trailing: {
                if revokingID == invite.id {
                    ProgressView()
                        .frame(width: 44, height: 44)
                } else {
                    Button("Turn off") {
                        Task { await revoke(invite) }
                    }
                    .buttonStyle(.fwCompact(.ghost))
                    .disabled(revokingID != nil)
                    .accessibilityLabel("Turn off the invite link for \(invite.group.name)")
                }
            }
        )
    }

    private func load() async {
        do {
            try await account.loadInvites()
            failed = false
        } catch is CancellationError {
            return
        } catch {
            if account.invites == nil { failed = true }
        }
    }

    private func revoke(_ invite: MyInvite) async {
        revokingID = invite.id
        do {
            try await account.revoke(invite)
            ToastCenter.shared.show("Invite link turned off")
        } catch {
            ToastCenter.shared.show("Couldn't turn off that link.", isError: true)
        }
        revokingID = nil
    }
}
