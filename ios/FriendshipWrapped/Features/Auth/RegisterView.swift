import SwiftUI

/// The server validates everything; its field messages are shown under each field. A new
/// account goes on to onboarding, or straight back to the invite it came from.
struct RegisterView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppRouter.self) private var router

    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""
    @State private var isPending = false
    @State private var failure: APIError?
    @FocusState private var focusedField: Field?

    private enum Field {
        case displayName, username, password
    }

    var body: some View {
        SignedOutForm(title: "Create your account") {
            if let message = failure?.formMessage {
                InlineAlert(message: message)
            }

            FWTextField(
                label: "Display name",
                text: $displayName,
                error: failure?.fieldErrors["displayName"],
                hint: "What your friends will see, e.g. Nicolas",
                contentType: .nickname,
                autocapitalization: .words,
                submitLabel: .next,
                onSubmit: { focusedField = .username }
            )
            .characterLimit(40, text: $displayName)
            .focused($focusedField, equals: .displayName)

            FWTextField(
                label: "Username",
                text: $username,
                error: failure?.fieldErrors["username"],
                hint: "3–20 characters: letters, numbers, periods and underscores",
                contentType: .username,
                autocapitalization: .never,
                submitLabel: .next,
                onSubmit: { focusedField = .password }
            )
            .characterLimit(20, text: $username)
            .focused($focusedField, equals: .username)

            FWTextField(
                label: "Password",
                text: $password,
                error: failure?.fieldErrors["password"],
                hint: "At least 8 characters",
                isSecure: true,
                contentType: .newPassword,
                submitLabel: .go,
                onSubmit: submit
            )
            .focused($focusedField, equals: .password)

            PrimaryButton(
                title: "Create account",
                pendingTitle: "Creating account…",
                isPending: isPending,
                action: submit
            )
            .padding(.top, 8)
        } footer: {
            SignedOutSwitchLink(prompt: "Already have an account?", link: "Log in") {
                router.authPath = [.login]
            }
        }
        .motion(.fwQuick, value: failure)
    }

    private func submit() {
        guard !isPending else { return }
        isPending = true
        failure = nil
        focusedField = nil

        Task {
            do {
                try await session.register(displayName: displayName, username: username, password: password)
            } catch {
                failure = error.asAPIError
            }
            isPending = false
        }
    }
}
