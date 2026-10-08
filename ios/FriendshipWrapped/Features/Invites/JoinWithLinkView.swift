import SwiftUI

/// Paste an invite link a friend sent, then preview and join the group.
/// (On the web you just open the link; links don't open the app until universal links are set up.)
/// Presented by the shell (`router.showingJoin`) and from onboarding.
struct JoinWithLinkView: View {
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var link = ""
    @State private var token: String?
    @State private var showInvalid = false

    private var isEmpty: Bool {
        link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Editing clears the error; pasting (below) sets the link without clearing it.
    private var linkBinding: Binding<String> {
        Binding(
            get: { link },
            set: { newValue in
                link = newValue
                showInvalid = false
            }
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("🔗")
                        .font(.system(size: 44))
                        .popIn()
                        .accessibilityHidden(true)

                    Text("Paste a friend's invite link")
                        .font(Theme.title(.title2))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.top, 12)
                        .riseIn(delay: 0.05)

                    Text("You'll see the group before you join it.")
                        .foregroundStyle(.sub)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 6)
                        .riseIn(delay: 0.08)

                    FWTextField(
                        label: "Invite link",
                        text: linkBinding,
                        prompt: "https://…/invite/…",
                        error: showInvalid ? "That doesn't look like a Friendship Wrapped invite link." : nil,
                        hint: "Paste the link a friend sent you.",
                        contentType: .URL,
                        keyboard: .URL,
                        autocapitalization: .never,
                        autocorrection: false,
                        submitLabel: .continue,
                        onSubmit: continueToInvite
                    )
                    .padding(.top, 28)
                    .riseIn(delay: 0.12)

                    PasteButton(payloadType: String.self) { strings in
                        Task { @MainActor in
                            link = strings.first ?? ""
                            continueToInvite()
                        }
                    }
                    .buttonBorderShape(.capsule)
                    .labelStyle(.titleAndIcon)
                    .padding(.top, 16)
                    .riseIn(delay: 0.14)

                    Button("Continue", action: continueToInvite)
                        .buttonStyle(.fwPrimary)
                        .disabled(isEmpty)
                        .padding(.top, 28)
                        .riseIn(delay: 0.18)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .navigationTitle("Join a group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .navigationDestination(item: $token) { token in
                InviteView(token: token) { groupID in
                    dismiss()
                    // Joining from onboarding is done with onboarding too.
                    router.showOnboarding = false
                    router.openGroup(groupID)
                }
            }
        }
    }

    private func continueToInvite() {
        guard !isEmpty else { return }
        if let parsed = InviteLink.token(from: link) {
            token = parsed
        } else {
            withMotion(.fwQuick) { showInvalid = true }
        }
    }
}
