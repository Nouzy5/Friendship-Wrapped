import SwiftUI

/// Signed-out home: brand, tagline, and the way in.
struct WelcomeView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        VStack(spacing: 0) {
            if let notice = session.signOutNotice {
                Label(notice, systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.green)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.top, 8)
            }

            Spacer()

            VStack(spacing: 16) {
                AppLogo(size: 88)
                    .shadow(color: Color.brandRose.opacity(0.35), radius: 24, y: 10)
                Wordmark(size: 34)
                    .multilineTextAlignment(.center)
                Text("Capture your year together. Relive it as a story.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            Spacer()

            VStack(spacing: 12) {
                NavigationLink(value: AuthRoute.register) {
                    Text("Create account")
                }
                .buttonStyle(.brand)

                NavigationLink(value: AuthRoute.login) {
                    Text("I already have an account")
                }
                .buttonStyle(.brandSecondary)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .background { BrandGlow() }
        .toolbar(.hidden, for: .navigationBar)
        // Said once: gone when you move on to log in or sign up.
        .onDisappear { session.clearSignOutNotice() }
    }
}

/// The signed-out navigation stack: welcome → log in / create account.
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

#Preview {
    NavigationStack { WelcomeView() }
        .environment(SessionStore())
}
