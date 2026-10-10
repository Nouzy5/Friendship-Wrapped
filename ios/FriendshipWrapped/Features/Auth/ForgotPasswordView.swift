import SwiftUI

/// "I forgot my password" (the web app's ForgotPasswordPage): asks for an email address or a username
/// and emails a link to choose a new password. The link opens in the browser, which is where the new
/// password is chosen; after that the person logs in here as usual. The answer is the same whether or
/// not an account matched, so this screen can't say who has one.
struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var identifier = ""
    @State private var isPending = false
    @State private var failure: APIError?
    /// What was asked for, once the request went through.
    @State private var asked: String?
    /// The server sends one email a minute to a person (and says nothing when it doesn't), so "send it again" waits as long.
    @State private var sendAgainAt: Date?
    @FocusState private var isFocused: Bool

    private var trimmed: String { identifier.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        SignedOutForm(title: asked == nil ? "Reset your password" : "Check your inbox") {
            if let asked {
                sent(to: asked)
            } else {
                form
            }
        } footer: {
            SignedOutSwitchLink(prompt: "Remembered it?", link: "Back to log in") { dismiss() }
        }
        .motion(.fwQuick, value: failure)
        .motion(.fwQuick, value: asked)
    }

    // MARK: - Asking

    private var form: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Enter your email or username and we'll email you a link to choose a new one.")
                .font(.body)
                .foregroundStyle(.sub)
                .fixedSize(horizontal: false, vertical: true)

            if let message = failure?.formMessage {
                InlineAlert(message: message)
            }

            FWTextField(
                label: "Email or username",
                text: $identifier,
                error: failure?.fieldErrors["identifier"],
                contentType: .username,
                keyboard: .emailAddress,
                autocapitalization: .never,
                autocorrection: false,
                submitLabel: .go,
                onSubmit: send
            )
            .focused($isFocused)

            PrimaryButton(title: "Email me a link", pendingTitle: "Sending…", isPending: isPending, action: send)
                .disabled(trimmed.isEmpty)
                .padding(.top, 8)
        }
    }

    // MARK: - Asked

    private func sent(to name: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            InlineAlert(
                message: "If an account matches \(name), we've emailed it a link to choose a new password. It works for an hour.",
                systemImage: "checkmark.circle.fill"
            )

            Text("Nothing there? Look in your spam folder, and check the address. Accounts made before we asked for an email have none on file, so they can't be reset this way.")
                .font(.subheadline)
                .foregroundStyle(.sub)
                .fixedSize(horizontal: false, vertical: true)

            if let message = failure?.formMessage {
                InlineAlert(message: message)
            }

            // Counts down by itself, once a second.
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = secondsLeft(at: context.date)
                Button(action: send) {
                    Text(remaining > 0 ? "Send it again in \(remaining)s" : (isPending ? "Sending…" : "Send the email again"))
                }
                .buttonStyle(.fwSecondary)
                .disabled(isPending || remaining > 0)
            }
        }
    }

    private func secondsLeft(at date: Date) -> Int {
        guard let sendAgainAt else { return 0 }
        return max(0, Int(sendAgainAt.timeIntervalSince(date).rounded(.up)))
    }

    private func send() {
        let name = trimmed
        guard !name.isEmpty, !isPending else { return }
        isPending = true
        failure = nil
        isFocused = false

        Task {
            do {
                try await APIClient.shared.requestPasswordReset(identifier: name)
                asked = name
                sendAgainAt = Date().addingTimeInterval(60)
            } catch {
                failure = error.asAPIError
            }
            isPending = false
        }
    }
}
