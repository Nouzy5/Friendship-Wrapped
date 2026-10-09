import SwiftUI

/// Home's offer to turn notifications on, shown once there are friends in the group and while
/// iOS hasn't been asked yet. "Not now" hides it for good; Settings → Notifications still has the switch.
struct PushPromptCard: View {
    @State private var push = PushRegistrar.shared
    @State private var isWorking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Know when friends post")
                .font(Theme.title(.title3))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)

            Text("Get a notification when someone posts, reacts or comments. You pick which ones in Settings.")
                .font(.subheadline)
                .foregroundStyle(.sub)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)

            VStack(spacing: 8) {
                PrimaryButton(title: "Turn on notifications", pendingTitle: "Turning on…", isPending: isWorking) {
                    guard !isWorking else { return }
                    isWorking = true
                    Task {
                        await push.turnOn()
                        isWorking = false
                    }
                }
                Button("Not now") {
                    withMotion(.fwEase) { push.dismissPrompt() }
                }
                .buttonStyle(.fwGhost)
            }
            .padding(.top, 16)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .riseIn()
    }
}
