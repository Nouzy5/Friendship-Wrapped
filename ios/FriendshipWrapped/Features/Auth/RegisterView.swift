import SwiftUI

/// The server validates everything; its field messages are shown under each field.
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
        Form {
            if let message = failure?.formMessage {
                FormErrorSection(message: message)
            }

            Section {
                TextField("e.g. Nicolas", text: $displayName)
                    .textContentType(.nickname)
                    .characterLimit(40, text: $displayName)
                    .focused($focusedField, equals: .displayName)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .username }
            } header: {
                Text("Display name")
            } footer: {
                FieldFooter(error: failure?.fieldErrors["displayName"], hint: "What your friends will see.")
            }

            Section {
                TextField("username", text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .characterLimit(20, text: $username)
                    .focused($focusedField, equals: .username)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
            } header: {
                Text("Username")
            } footer: {
                FieldFooter(
                    error: failure?.fieldErrors["username"],
                    hint: "3–20 characters: letters, numbers, periods and underscores."
                )
            }

            Section {
                SecureField("Password", text: $password)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit(submit)
            } header: {
                Text("Password")
            } footer: {
                FieldFooter(error: failure?.fieldErrors["password"], hint: "At least 8 characters.")
            }

            Section {
                PrimaryButton(
                    title: "Create account",
                    pendingTitle: "Creating account…",
                    isPending: isPending,
                    action: submit
                )
            }
            .buttonRow()

            Section {
                Button("Already have an account? Log in") {
                    router.authPath = [.login]
                }
                .frame(maxWidth: .infinity)
            }
            .listRowBackground(Color.clear)
        }
        .navigationTitle("Create account")
        .scrollDismissesKeyboard(.interactively)
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
