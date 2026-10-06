import Observation
import SwiftUI
import UIKit

/// Creating and copying an invite link, shared by the list section and the card.
@MainActor
@Observable
final class InviteLinkModel {
    private(set) var invite: CreatedInvite?
    private(set) var isCreating = false
    private(set) var failure: String?
    private(set) var copied = false

    var url: URL? {
        invite.map { InviteLink.url(for: $0.token) }
    }

    func create(for groupID: String) async {
        isCreating = true
        failure = nil
        do {
            invite = try await APIClient.shared.createInvite(forGroup: groupID)
        } catch {
            failure = error.asAPIError.message
        }
        isCreating = false
    }

    func copy(_ url: URL) {
        UIPasteboard.general.string = url.absoluteString
        copied = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            self.copied = false
        }
    }
}

private func inviteTitle(highlight: Bool) -> String {
    highlight ? "It's just you so far" : "Invite friends"
}

private func inviteMessage(highlight: Bool) -> String {
    highlight
        ? "Send your friends an invite link so they can join the group."
        : "Anyone with an invite link can join this group."
}

private func inviteSubject(_ group: FriendGroup) -> Text {
    Text("Join \(group.name) on Friendship Wrapped")
}

/// Create an invite link, then copy or share it: as a section in a list or form.
struct InviteFriendsSection: View {
    let group: FriendGroup
    /// Used when you're the only member, to nudge you to invite people.
    var highlight = false

    @State private var model = InviteLinkModel()

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(inviteTitle(highlight: highlight))
                    .font(.headline)
                Text(inviteMessage(highlight: highlight))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)

            if let url = model.url {
                Text(url.absoluteString)
                    .font(.footnote.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)

                Button {
                    model.copy(url)
                } label: {
                    Label(model.copied ? "Copied!" : "Copy link", systemImage: model.copied ? "checkmark" : "doc.on.doc")
                }
                .sensoryFeedback(.success, trigger: model.copied) { _, isCopied in isCopied }

                ShareLink(item: url, subject: inviteSubject(group), message: inviteSubject(group)) {
                    Label("Share…", systemImage: "square.and.arrow.up")
                }
            } else {
                Button {
                    Task { await model.create(for: group.id) }
                } label: {
                    HStack {
                        Label(model.isCreating ? "Creating link…" : "Create invite link", systemImage: "link.badge.plus")
                        if model.isCreating {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(model.isCreating)
            }

            if let failure = model.failure {
                Text(failure)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        } footer: {
            if let invite = model.invite {
                Text("Link works until \(Format.dayMonth(invite.expiresAt)). Make a new one any time.")
            }
        }
    }
}

/// The same, as a card on its own (the group screen, when you're the only member).
struct InviteFriendsCard: View {
    let group: FriendGroup
    var highlight = false

    @State private var model = InviteLinkModel()

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)

        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(inviteTitle(highlight: highlight))
                    .font(.headline)
                Text(inviteMessage(highlight: highlight))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let url = model.url, let invite = model.invite {
                Text(url.absoluteString)
                    .font(.footnote.monospaced())
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                HStack(spacing: 10) {
                    Button {
                        model.copy(url)
                    } label: {
                        Label(model.copied ? "Copied!" : "Copy link", systemImage: model.copied ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(.brand)
                    .sensoryFeedback(.success, trigger: model.copied) { _, isCopied in isCopied }

                    ShareLink(item: url, subject: inviteSubject(group), message: inviteSubject(group)) {
                        Label("Share…", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.brandSecondary)
                }

                Text("Link works until \(Format.dayMonth(invite.expiresAt)). Make a new one any time.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                PrimaryButton(title: "Create invite link", pendingTitle: "Creating link…", isPending: model.isCreating) {
                    Task { await model.create(for: group.id) }
                }
            }

            if let failure = model.failure {
                Text(failure)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground), in: shape)
        .overlay(shape.strokeBorder(highlight ? Color.accentColor.opacity(0.5) : Color.clear))
    }
}
