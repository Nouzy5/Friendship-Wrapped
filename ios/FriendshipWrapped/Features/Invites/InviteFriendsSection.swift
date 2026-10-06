import SwiftUI
import UIKit

/// Create an invite link, then copy or share it.
struct InviteFriendsSection: View {
    let group: FriendGroup
    /// Used when you're the only member, to nudge you to invite people.
    var highlight = false

    @State private var invite: CreatedInvite?
    @State private var isCreating = false
    @State private var failure: String?
    @State private var copied = false

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(highlight ? "It's just you so far" : "Invite friends")
                    .font(.headline)
                Text(
                    highlight
                        ? "Send your friends an invite link so they can join the group."
                        : "Anyone with an invite link can join this group."
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)

            if let invite {
                let url = InviteLink.url(for: invite.token)

                Text(url.absoluteString)
                    .font(.footnote.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)

                Button {
                    copy(url)
                } label: {
                    Label(copied ? "Copied!" : "Copy link", systemImage: copied ? "checkmark" : "doc.on.doc")
                }
                .sensoryFeedback(.success, trigger: copied) { _, isCopied in isCopied }

                ShareLink(
                    item: url,
                    subject: Text("Join \(group.name) on Friendship Wrapped"),
                    message: Text("Join \(group.name) on Friendship Wrapped")
                ) {
                    Label("Share…", systemImage: "square.and.arrow.up")
                }
            } else {
                Button {
                    Task { await create() }
                } label: {
                    HStack {
                        Label(isCreating ? "Creating link…" : "Create invite link", systemImage: "link.badge.plus")
                        if isCreating {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(isCreating)
            }

            if let failure {
                Text(failure)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        } footer: {
            if let invite {
                Text("Link works until \(Format.dayMonth(invite.expiresAt)). Make a new one any time.")
            }
        }
    }

    private func create() async {
        isCreating = true
        failure = nil
        do {
            invite = try await APIClient.shared.createInvite(forGroup: group.id)
        } catch {
            failure = error.asAPIError.message
        }
        isCreating = false
    }

    private func copy(_ url: URL) {
        UIPasteboard.general.string = url.absoluteString
        copied = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            copied = false
        }
    }
}
