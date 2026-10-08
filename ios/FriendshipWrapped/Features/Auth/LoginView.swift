import SwiftUI

/// On success the session changes and RootView swaps to the signed-in app (and reopens an
/// invite you came from); no navigation needed here.
struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppRouter.self) private var router

    @State private var username = ""
    @State private var password = ""
    @State private var isPending = false
    @State private var failure: APIError?
    @FocusState private var focusedField: Field?

    private enum Field {
        case username, password
    }

    var body: some View {
        SignedOutForm(title: "Log in") {
            if let message = failure?.formMessage {
                InlineAlert(message: message)
            }

            FWTextField(
                label: "Username",
                text: $username,
                error: failure?.fieldErrors["username"],
                contentType: .username,
                autocapitalization: .never,
                submitLabel: .next,
                onSubmit: { focusedField = .password }
            )
            .focused($focusedField, equals: .username)

            FWTextField(
                label: "Password",
                text: $password,
                error: failure?.fieldErrors["password"],
                isSecure: true,
                contentType: .password,
                submitLabel: .go,
                onSubmit: submit
            )
            .focused($focusedField, equals: .password)

            PrimaryButton(title: "Log in", pendingTitle: "Logging in…", isPending: isPending, action: submit)
                .padding(.top, 8)
        } footer: {
            // Keeps the way back to an invite: the router remembers it until you're signed in.
            SignedOutSwitchLink(prompt: "New here?", link: "Create an account") {
                router.authPath = [.register]
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
                try await session.login(username: username, password: password)
            } catch {
                failure = error.asAPIError
            }
            isPending = false
        }
    }
}
