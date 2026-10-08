import SwiftUI

/// Signed-out home (the web app's CardLayout header): the mark, the app's name, what it's for,
/// and the way in.
struct WelcomeView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        // Everything on one screen when it fits; it scrolls with very large text.
        ViewThatFits(in: .vertical) {
            page
            ScrollView {
                page
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        // Said once: gone when you move on to log in or sign up.
        .onDisappear { session.clearSignOutNotice() }
    }

    private var page: some View {
        VStack(spacing: 0) {
            if let notice = session.signOutNotice {
                InlineAlert(message: notice, systemImage: "checkmark.circle.fill")
                    .padding(.top, 8)
            }

            Spacer(minLength: 40)

            VStack(spacing: 0) {
                AppMark(size: 96)
                    .popIn()
                Text("Friendship Wrapped")
                    .font(Theme.title())
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 24)
                    .riseIn(delay: 0.08)
                Text("Capture your year together. Relive it as a story.")
                    .font(.body)
                    .foregroundStyle(.sub)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                    .riseIn(delay: 0.14)
            }

            Spacer(minLength: 40)

            VStack(spacing: 12) {
                NavigationLink(value: AuthRoute.register) {
                    Text("Create an account")
                }
                .buttonStyle(.fwPrimary)

                NavigationLink(value: AuthRoute.login) {
                    Text("Log in")
                }
                .buttonStyle(.fwSecondary)
            }
            .riseIn(delay: 0.2)
        }
        .padding(.horizontal, 24)
        .padding(.top, 8)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity)
    }
}

/// The signed-out navigation stack: welcome → log in / create account. An invite opened while
/// signed out comes back here (`router.startAuth`), and reopens once you're in.
struct AuthFlowView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router

        NavigationStack(path: $router.authPath) {
            WelcomeView()
                .navigationDestination(for: AuthRoute.self) { route in
                    switch route {
                    case .login: LoginView()
                    case .register: RegisterView()
                    }
                }
        }
    }
}

/// Log in and Create account (the web app's CardLayout): the mark and a big title over the
/// form, with the way to the other one under it.
struct SignedOutForm<Content: View, Footer: View>: View {
    let title: String
    @ViewBuilder var content: Content
    @ViewBuilder var footer: Footer

    init(title: String, @ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) {
        self.title = title
        self.content = content()
        self.footer = footer()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 16) {
                    AppMark(size: 56)
                        .popIn()
                    Text(title)
                        .font(Theme.title())
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .riseIn(delay: 0.05)
                }
                .padding(.top, 8)

                VStack(alignment: .leading, spacing: 16) {
                    content
                }
                .padding(.top, 28)
                .riseIn(delay: 0.1)

                footer
                    .padding(.top, 16)
                    .riseIn(delay: 0.16)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollBounceBehavior(.basedOnSize)
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// "New here? Create an account": a line of grey text with an underlined link in ink.
struct SignedOutSwitchLink: View {
    let prompt: String
    let link: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            (Text(prompt + " ").foregroundStyle(Theme.sub) + Text(link).fontWeight(.semibold).underline().foregroundStyle(Theme.fg))
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
