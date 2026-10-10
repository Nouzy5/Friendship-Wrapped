import SwiftUI

/// What a signed-in account sees until its email is confirmed (the web app's EmailGate): add an
/// address (accounts from before email was required have none), or open the link that was sent.
/// Nothing else in the app loads until then. It looks for the link having been opened now and
/// then, and whenever the app comes back to the front, so tapping it in Mail and returning is enough.
struct EmailGateView: View {
    let user: User

    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase

    @State private var changing = false
    @State private var email = ""
    @State private var password = ""
    @State private var isSaving = false
    @State private var failure: APIError?

    @State private var isResending = false
    @State private var resendFailure: String?
    @State private var sentAgain = false
    /// The server sends one link a minute; until then "Send it again" waits.
    @State private var resendAvailableAt: Date?
    @State private var isChecking = false
    @State private var stillWaiting = false
    @State private var isLoggingOut = false

    private var needsAddress: Bool { user.email == nil }

    private var title: String {
        if needsAddress { return "Add your email address" }
        return changing ? "Use a different email" : "Check your inbox"
    }

    var body: some View {
        SignedOutForm(title: title) {
            if needsAddress {
                Text("Every account now needs an email address, so we can confirm it's you and tell you about new sign-ins. We'll send you a link to confirm it.")
                    .font(.body)
                    .foregroundStyle(.sub)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if needsAddress || changing {
                addressForm
            } else {
                waitingForLink
            }
        } footer: {
            SignedOutSwitchLink(prompt: "Signed in as @\(user.username).", link: isLoggingOut ? "Logging out…" : "Log out") {
                Task { await logOut() }
            }
            .disabled(isLoggingOut)
        }
        .onAppear {
            // Just signed up: the first link is on its way, and another would be turned away for a minute.
            if session.justRegistered, resendAvailableAt == nil {
                resendAvailableAt = Date().addingTimeInterval(55)
            }
        }
        // The link may be opened in Mail, Safari or on another device: look now and then.
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                if Task.isCancelled { break }
                await session.refresh()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await session.refresh() } }
        }
    }

    // MARK: - Waiting for the link

    private var waitingForLink: some View {
        VStack(alignment: .leading, spacing: 16) {
            (Text("We sent a link to ")
                + Text(user.email ?? "").fontWeight(.semibold).foregroundStyle(Theme.fg)
                + Text(". Open it, on this phone or any other device, and you'll be let in."))
                .font(.body)
                .foregroundStyle(.sub)
                .fixedSize(horizontal: false, vertical: true)

            if let resendFailure {
                InlineAlert(message: resendFailure)
            }
            if sentAgain {
                InlineAlert(
                    message: "Sent. It can take a minute to arrive; check your spam folder too.",
                    systemImage: "checkmark.circle.fill"
                )
            }
            if stillWaiting && !isChecking {
                InlineAlert(message: "Not confirmed yet. Open the link in the email first.")
            }

            PrimaryButton(title: "I've confirmed it", pendingTitle: "Checking…", isPending: isChecking) {
                Task { await check() }
            }
            .padding(.top, 8)

            // Counts down by itself, once a second.
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = secondsLeft(at: context.date)
                Button {
                    Task { await resend() }
                } label: {
                    Text(remaining > 0 ? "Send it again in \(remaining)s" : (isResending ? "Sending…" : "Send the email again"))
                }
                .buttonStyle(.fwSecondary)
                .disabled(isResending || remaining > 0)
            }

            Button("Use a different email") {
                failure = nil
                changing = true
            }
            .buttonStyle(.fwGhost)
        }
    }

    private func secondsLeft(at date: Date) -> Int {
        guard let resendAvailableAt else { return 0 }
        return max(0, Int(resendAvailableAt.timeIntervalSince(date).rounded(.up)))
    }

    private func check() async {
        guard !isChecking else { return }
        isChecking = true
        stillWaiting = false
        await session.refresh()
        isChecking = false
        // If it worked, this screen is already gone.
        stillWaiting = true
    }

    private func resend() async {
        guard !isResending else { return }
        isResending = true
        resendFailure = nil
        sentAgain = false
        do {
            try await session.resendVerificationEmail()
            sentAgain = true
            resendAvailableAt = Date().addingTimeInterval(60)
        } catch {
            let apiError = error.asAPIError
            if apiError.code == "EMAIL_COOLDOWN" {
                // "Please wait 42 seconds before asking for another email".
                let seconds = apiError.message.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }.first ?? 60
                resendAvailableAt = Date().addingTimeInterval(TimeInterval(seconds))
            } else {
                resendFailure = apiError.message
            }
        }
        isResending = false
    }

    // MARK: - Adding or changing the address

    private var addressForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            if !needsAddress {
                Text("We'll send the link to the new address instead of \(user.email ?? "").")
                    .font(.body)
                    .foregroundStyle(.sub)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let message = failure?.formMessage {
                InlineAlert(message: message)
            }
            FWTextField(
                label: "Email",
                text: $email,
                error: failure?.fieldErrors["email"],
                contentType: .emailAddress,
                keyboard: .emailAddress,
                autocapitalization: .never,
                autocorrection: false,
                submitLabel: .next
            )
            FWTextField(
                label: "Your password",
                text: $password,
                error: failure?.fieldErrors["password"],
                hint: "To confirm it's you.",
                isSecure: true,
                contentType: .password,
                submitLabel: .go,
                onSubmit: { Task { await save() } }
            )
            PrimaryButton(title: "Send me the link", pendingTitle: "Sending…", isPending: isSaving) {
                Task { await save() }
            }
            .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)
            .padding(.top, 8)

            if !needsAddress {
                Button("Cancel") {
                    failure = nil
                    changing = false
                }
                .buttonStyle(.fwGhost)
                .disabled(isSaving)
            }
        }
    }

    private func save() async {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !address.isEmpty, !password.isEmpty, !isSaving else { return }
        isSaving = true
        failure = nil
        do {
            try await session.updateEmail(address, password: password)
            Haptics.success()
            // The link is on its way: wait a minute before offering another.
            resendAvailableAt = Date().addingTimeInterval(55)
            sentAgain = false
            stillWaiting = false
            password = ""
            changing = false
        } catch {
            failure = error.asAPIError
        }
        isSaving = false
    }

    private func logOut() async {
        guard !isLoggingOut else { return }
        isLoggingOut = true
        do {
            try await session.logout()
        } catch {
            // Couldn't reach the server: this phone forgets the session anyway.
            session.didSignOutThisDevice()
        }
        isLoggingOut = false
    }
}
