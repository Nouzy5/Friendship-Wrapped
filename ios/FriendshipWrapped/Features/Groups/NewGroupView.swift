import SwiftUI

/// Creates a group (the web app's NewGroupPage). By default it then opens the group, where the
/// invite card is waiting; the camera passes `onCreated` to stay where it is (the new group is
/// preselected there).
struct NewGroupView: View {
    private let onCreated: ((FriendGroup) -> Void)?

    @Environment(GroupsStore.self) private var store
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var emoji = presetEmojis[0]
    @State private var isCreating = false
    @State private var failure: APIError?

    init(onCreated: ((FriendGroup) -> Void)? = nil) {
        self.onCreated = onCreated
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    NewGroupPreview(name: name, emoji: emoji)
                        .frame(maxWidth: .infinity)

                    if let message = failure?.formMessage {
                        InlineAlert(message: message)
                    }

                    GroupFormFields(name: $name, emoji: $emoji, errors: failure?.fieldErrors ?? [:])
                        .riseIn(delay: 0.08)

                    PrimaryButton(title: "Create group", pendingTitle: "Creating…", isPending: isCreating) {
                        Task { await create() }
                    }
                    .riseIn(delay: 0.14)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .navigationTitle("New group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isCreating)
                }
            }
            .interactiveDismissDisabled(isCreating)
            .motion(.fwQuick, value: failure)
        }
    }

    private func create() async {
        guard !isCreating else { return }
        isCreating = true
        failure = nil
        do {
            let group = try await store.createGroup(name: name, emoji: emoji)
            Haptics.success()
            if let onCreated {
                onCreated(group)
                dismiss()
            } else {
                dismiss()
                router.openGroup(group.id)
            }
        } catch {
            failure = error.asAPIError
            isCreating = false
        }
    }
}

/// What the new group will look like: its emoji on a tile (it gets your colour once it's
/// made), springing each time you pick another, and its name.
private struct NewGroupPreview: View {
    let name: String
    let emoji: String

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(spacing: 12) {
            GroupBadge(groupID: nil, emoji: emoji, size: 88)
                .bounceOnce(trigger: emoji)
                .popIn()
            Text(trimmedName.isEmpty ? "Your new group" : trimmedName)
                .font(Theme.title(.title2))
                .foregroundStyle(trimmedName.isEmpty ? Theme.sub : Theme.fg)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .riseIn(delay: 0.04)
        }
        .padding(.top, 8)
        .accessibilityHidden(true)
    }
}

/// First stop after registering (unless they arrived through an invite link): the web app's
/// OnboardingPage. Shown full screen by RootView.
struct OnboardingView: View {
    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var name = ""
    @State private var emoji = presetEmojis[0]
    @State private var isCreating = false
    @State private var failure: APIError?
    @State private var joiningWithLink = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    AppMark(size: 56)
                        .popIn()

                    Text("Welcome, \(session.user?.firstName ?? "friend")! 🎉")
                        .font(Theme.title())
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.top, 20)
                        .riseIn(delay: 0.06)

                    Text("Friendship Wrapped happens in private groups. Start one for your friends, and you'll get a link to invite them.")
                        .foregroundStyle(.sub)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                        .riseIn(delay: 0.1)

                    VStack(alignment: .leading, spacing: 20) {
                        Text("Create your first group")
                            .font(Theme.title(.title3))
                            .accessibilityAddTraits(.isHeader)

                        if let message = failure?.formMessage {
                            InlineAlert(message: message)
                        }

                        GroupFormFields(name: $name, emoji: $emoji, errors: failure?.fieldErrors ?? [:])

                        PrimaryButton(title: "Create group", pendingTitle: "Creating…", isPending: isCreating) {
                            Task { await create() }
                        }
                    }
                    .padding(.top, 36)
                    .riseIn(delay: 0.16)

                    VStack(spacing: 4) {
                        Text("Got an invite link from a friend?")
                            .font(.subheadline)
                            .foregroundStyle(.sub)
                            .multilineTextAlignment(.center)
                        Button("Join with your link") { joiningWithLink = true }
                            .buttonStyle(.fwGhost)
                            .disabled(isCreating)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 28)
                    .riseIn(delay: 0.22)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Skip for now") { router.showOnboarding = false }
                        .disabled(isCreating)
                }
            }
            .motion(.fwQuick, value: failure)
            // Joining closes onboarding too (JoinWithLinkView does it), and opens the group.
            .sheet(isPresented: $joiningWithLink) {
                JoinWithLinkView()
            }
        }
    }

    private func create() async {
        guard !isCreating else { return }
        isCreating = true
        failure = nil
        do {
            let group = try await store.createGroup(name: name, emoji: emoji)
            Haptics.success()
            router.showOnboarding = false
            router.openGroup(group.id)
        } catch {
            failure = error.asAPIError
            isCreating = false
        }
    }
}
