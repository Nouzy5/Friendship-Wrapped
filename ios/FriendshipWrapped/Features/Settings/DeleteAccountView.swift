import SwiftUI

/// Spells out what goes, then deletes the account once the password confirms it. On success the
/// session ends and the app shows the welcome screen, which says the account is gone.
struct DeleteAccountView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var password = ""
    @State private var isDeleting = false
    @State private var failure: APIError?
    @FocusState private var passwordFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("This can't be undone. It permanently deletes:")
                    Label("Every photo you've posted, with the reactions and comments on them", systemImage: "photo.on.rectangle.angled")
                    Label("Your own comments, reactions and favorites", systemImage: "bubble.left.and.bubble.right")
                    Label("Your profile and profile picture", systemImage: "person.crop.circle")
                } footer: {
                    Text("You'll leave all your groups. A group you own passes to whoever has been in it longest, and a group with no one else in it is deleted. Albums you made stay with their group.")
                }

                if let message = failure?.formMessage {
                    FormErrorSection(message: message)
                }

                Section {
                    SecureField("Your password", text: $password)
                        .textContentType(.password)
                        .focused($passwordFocused)
                        .submitLabel(.done)
                        .onSubmit { Task { await delete() } }
                } header: {
                    Text("Confirm with your password")
                } footer: {
                    FieldFooter(error: failure?.fieldErrors["password"])
                }

                Section {
                    Button(role: .destructive) {
                        Task { await delete() }
                    } label: {
                        HStack {
                            Text(isDeleting ? "Deleting…" : "Delete account")
                            if isDeleting {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(password.isEmpty || isDeleting)
                }
            }
            .navigationTitle("Delete your account?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isDeleting)
                }
            }
            .interactiveDismissDisabled(isDeleting)
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private func delete() async {
        guard !password.isEmpty, !isDeleting else { return }
        isDeleting = true
        failure = nil
        passwordFocused = false
        do {
            try await session.deleteAccount(password: password)
            // Signed out: the signed-in screens, this sheet included, go away.
        } catch {
            failure = error.asAPIError
            isDeleting = false
        }
    }
}
