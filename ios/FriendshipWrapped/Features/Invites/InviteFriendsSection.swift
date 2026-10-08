import Observation
import SwiftUI
import UIKit

/// Creating and copying an invite link, shared by the card and the group settings section.
@MainActor
@Observable
final class InviteLinkModel {
    private(set) var invite: CreatedInvite?
    private(set) var isCreating = false
    private(set) var failure: String?
    private(set) var copied = false

    /// Bumped by `clear()`, so a link still being made for the old state is dropped.
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var copiedReset: Task<Void, Never>?

    var url: URL? {
        invite.map { InviteLink.url(for: $0.token) }
    }

    func create(for groupID: String) async {
        guard !isCreating else { return }
        let started = generation
        isCreating = true
        failure = nil
        do {
            let created = try await APIClient.shared.createInvite(forGroup: groupID)
            guard started == generation else { return }
            invite = created
        } catch {
            guard started == generation else { return }
            failure = error.asAPIError.message
        }
        isCreating = false
    }

    func copy(_ url: URL) {
        UIPasteboard.general.string = url.absoluteString
        Haptics.success()
        UIAccessibility.post(notification: .announcement, argument: "Link copied")
        withMotion(.fwQuick) { copied = true }
        copiedReset?.cancel()
        copiedReset = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard let self, !Task.isCancelled else { return }
            withMotion(.fwQuick) { self.copied = false }
        }
    }

    /// Forgets the link: another group, or every link was just turned off.
    func clear() {
        generation += 1
        copiedReset?.cancel()
        invite = nil
        failure = nil
        copied = false
        isCreating = false
    }
}

/// "Invite friends" on a grey panel (the web app's InviteFriendsCard): make a link, then copy
/// or share it. Home shows it with `highlight` when you're the only one in the group.
struct InviteFriendsCard: View {
    let group: FriendGroup
    var highlight = false

    @State private var model = InviteLinkModel()

    var body: some View {
        InviteLinkPanel(group: group, highlight: highlight, model: model)
            .onChange(of: group.id) { _, _ in model.clear() }
    }
}

/// Group settings' invite links: the card, and for the owner a way to turn off every link
/// that's been shared.
struct InviteFriendsSection: View {
    let group: FriendGroup

    @State private var model = InviteLinkModel()
    @State private var confirmingReset = false
    @State private var isResetting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            InviteLinkPanel(group: group, highlight: false, model: model)

            if group.isOwner {
                SettingsSection(footnote: "If a link ended up somewhere it shouldn't, turn them off. Every link already shared stops working.") {
                    SettingsGroup {
                        SettingsButtonRow("Turn off all invite links", systemImage: "link") {
                            confirmingReset = true
                        }
                        .disabled(isResetting)
                    }
                }
            }
        }
        .onChange(of: group.id) { _, _ in model.clear() }
        // No red: the alert says what happens and asks first.
        .alert("Turn off all invite links?", isPresented: $confirmingReset) {
            Button("Turn off links") {
                Task { await resetLinks() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Links that have already been shared will stop working. Members can make new ones.")
        }
    }

    private func resetLinks() async {
        guard !isResetting else { return }
        isResetting = true
        do {
            try await APIClient.shared.resetInvites(forGroup: group.id)
            // The link on the card stopped working too.
            model.clear()
            Haptics.success()
            ToastCenter.shared.show("Invite links turned off")
        } catch {
            ToastCenter.shared.show(error.asAPIError.message, isError: true)
        }
        isResetting = false
    }
}

/// The card itself: a heading, then "Create invite link", then the link with Copy and Share.
private struct InviteLinkPanel: View {
    let group: FriendGroup
    let highlight: Bool
    let model: InviteLinkModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(highlight ? "It's just you so far" : "Invite friends")
                .font(Theme.title(.title3))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)

            Text(
                highlight
                    ? "Send your friends an invite link so they can join the group."
                    : "Anyone with an invite link can join this group."
            )
            .font(.subheadline)
            .foregroundStyle(.sub)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 4)

            if let failure = model.failure {
                PanelAlert(message: failure)
                    .padding(.top, 16)
            }

            if let invite = model.invite {
                InviteLinkActions(group: group, invite: invite, model: model)
                    .padding(.top, 16)
                    .transition(.opacity.combined(with: .offset(y: 8)))
            } else {
                PrimaryButton(title: "Create invite link", pendingTitle: "Creating link…", isPending: model.isCreating) {
                    Task { await model.create(for: group.id) }
                }
                .padding(.top, 16)
                .transition(.opacity)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .motion(.fwEase, value: model.invite)
        .motion(.fwQuick, value: model.failure)
    }
}

/// The link (selectable, in case copying is easier by hand), Copy and Share, and how long it lasts.
private struct InviteLinkActions: View {
    let group: FriendGroup
    let invite: CreatedInvite
    let model: InviteLinkModel

    var body: some View {
        let url = InviteLink.url(for: invite.token)

        VStack(alignment: .leading, spacing: 12) {
            // On a grey panel, fields take the page's colour (the web app's --field-bg).
            Text(url.absoluteString)
                .font(.subheadline)
                .foregroundStyle(.sub)
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .background(.bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityLabel("Invite link")
                .accessibilityValue(url.absoluteString)

            // Side by side when they fit, stacked with very large text.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    copyButton(url)
                    shareButton(url)
                }
                VStack(spacing: 8) {
                    copyButton(url)
                    shareButton(url)
                }
            }

            Text("Link works until \(Format.dayMonth(invite.expiresAt)). Make a new one any time.")
                .font(.footnote)
                .foregroundStyle(.sub)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func copyButton(_ url: URL) -> some View {
        Button {
            model.copy(url)
        } label: {
            Label(model.copied ? "Copied!" : "Copy link", systemImage: model.copied ? "checkmark" : "doc.on.doc")
        }
        .buttonStyle(.fwPrimary)
    }

    private func shareButton(_ url: URL) -> some View {
        ShareLink(
            item: url,
            subject: Text("Join \(group.name) on Friendship Wrapped"),
            message: Text("Join \(group.name) on Friendship Wrapped")
        ) {
            Label("Share…", systemImage: "square.and.arrow.up")
        }
        .buttonStyle(PanelButtonStyle())
    }
}

/// A form error inside the grey panel: on the page's colour, like the fields there.
private struct PanelAlert: View {
    let message: String

    var body: some View {
        Label {
            Text(message).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "exclamationmark.circle.fill")
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.fg)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .riseIn()
    }
}

/// The secondary pill on a grey panel: ink on the page's colour (a grey pill would vanish there).
private struct PanelButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.callout, design: .rounded, weight: .semibold))
            .foregroundStyle(.fg)
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(.bg, in: Capsule())
            .contentShape(Capsule())
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .motion(.fwQuick, value: configuration.isPressed)
    }
}
