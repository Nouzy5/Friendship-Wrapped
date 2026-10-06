import SwiftUI

/// Paste an invite link a friend sent, then preview and join the group.
/// (On the web you just open the link; links don't open the app until universal links are set up.)
struct JoinWithLinkView: View {
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var link = ""
    @State private var token: String?
    @State private var showInvalid = false

    private var isEmpty: Bool {
        link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    // Editing clears the error; pasting (below) sets the link without clearing it.
                    TextField("Invite link", text: Binding(get: { link }, set: { link = $0; showInvalid = false }))
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.continue)
                        .onSubmit(continueToInvite)

                    PasteButton(payloadType: String.self) { strings in
                        Task { @MainActor in
                            link = strings.first ?? ""
                            continueToInvite()
                        }
                    }
                } footer: {
                    FieldFooter(
                        error: showInvalid ? "That doesn't look like a Friendship Wrapped invite link." : nil,
                        hint: "Paste the link a friend sent you."
                    )
                }
            }
            .navigationTitle("Join a group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Continue", action: continueToInvite)
                        .disabled(isEmpty)
                }
            }
            .navigationDestination(item: $token) { token in
                InviteView(token: token) { groupID in
                    dismiss()
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
            showInvalid = true
        }
    }
}
