import SwiftUI

/// Spells out what goes, then deletes the account once the password confirms it (the web app's
/// DeleteAccountDialog). On success the session ends, this phone's own settings and app icon go
/// back to the defaults, and the welcome screen says the account is gone.
struct DeleteAccountView: View {
    @Environment(SessionStore.self) private var session

    @State private var password = ""
    @State private var isDeleting = false
    @State private var failure: APIError?

    var body: some View {
        SettingsFormSheet(title: "Delete your account?", isBusy: isDeleting) {
            VStack(alignment: .leading, spacing: 12) {
                Text("This can't be undone. It permanently deletes:")
                    .font(.callout)
                    .foregroundStyle(.fg)
                consequence("Every photo you've posted, with the reactions and comments on them", systemImage: "photo.on.rectangle.angled")
                consequence("Your own comments, reactions and favorites", systemImage: "bubble.left.and.bubble.right")
                consequence("Your profile and profile picture", systemImage: "person.crop.circle")
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))

            Text("You'll leave all your groups. A group you own passes to whoever has been in it longest, and a group with no one else in it is deleted. Albums you made stay with their group.")
                .font(.callout)
                .foregroundStyle(.sub)
                .fixedSize(horizontal: false, vertical: true)

            FWTextField(
                label: "Your password",
                text: $password,
                error: failure?.fieldErrors["password"],
                isSecure: true,
                contentType: .password,
                submitLabel: .done,
                onSubmit: { Task { await delete() } }
            )

            if let message = failure?.formMessage {
                InlineAlert(message: message)
            }

            // No red: the words say what it does, and the password confirms it.
            PrimaryButton(title: "Delete account", pendingTitle: "Deleting…", isPending: isDeleting) {
                Task { await delete() }
            }
            .disabled(password.isEmpty)
        }
    }

    private func consequence(_ text: String, systemImage: String) -> some View {
        Label {
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(.fg)
        }
        .font(.callout)
        .foregroundStyle(.sub)
    }

    private func delete() async {
        guard !password.isEmpty, !isDeleting else { return }
        isDeleting = true
        failure = nil
        do {
            try await session.deleteAccount(password: password)
            // Signed out: the signed-in screens, this sheet included, go away. This phone's own
            // choices (theme, camera, the app icon) belonged to that account too.
            DeviceSettings.shared.reset()
            AppIconApplier.apply(.classic, color: nil)
        } catch {
            failure = error.asAPIError
            isDeleting = false
        }
    }
}
