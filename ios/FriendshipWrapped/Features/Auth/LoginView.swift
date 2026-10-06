import SwiftUI

/// On success the session changes and RootView swaps to the signed-in app; no navigation needed here.
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
        Form {
            if let message = failure?.formMessage {
                FormErrorSection(message: message)
            }

            Section {
                TextField("Username", text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .username)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
            } footer: {
                FieldFooter(error: failure?.fieldErrors["username"])
            }

            Section {
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit(submit)
            } footer: {
                FieldFooter(error: failure?.fieldErrors["password"])
            }

            Section {
                PrimaryButton(title: "Log in", pendingTitle: "Logging in…", isPending: isPending, action: submit)
            }
            .buttonRow()

            Section {
                Button("New here? Create an account") {
                    router.authPath = [.register]
                }
                .frame(maxWidth: .infinity)
            }
            .listRowBackground(Color.clear)
        }
        .navigationTitle("Log in")
        .scrollDismissesKeyboard(.interactively)
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
