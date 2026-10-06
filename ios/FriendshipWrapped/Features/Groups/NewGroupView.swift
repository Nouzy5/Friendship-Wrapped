import SwiftUI

/// Creates a group and opens it, where the invite section is waiting.
struct NewGroupView: View {
    var onCreated: (FriendGroup) -> Void

    @Environment(GroupsStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var emoji = presetEmojis[0]
    @State private var isCreating = false
    @State private var failure: APIError?

    var body: some View {
        NavigationStack {
            Form {
                if let message = failure?.formMessage {
                    FormErrorSection(message: message)
                }
                GroupFormFields(name: $name, emoji: $emoji, errors: failure?.fieldErrors ?? [:])
            }
            .navigationTitle("New group")
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isCreating {
                        ProgressView()
                    } else {
                        Button("Create") { Task { await create() } }
                    }
                }
            }
            .interactiveDismissDisabled(isCreating)
        }
    }

    private func create() async {
        isCreating = true
        failure = nil
        do {
            let group = try await store.createGroup(name: name, emoji: emoji)
            onCreated(group)
            dismiss()
        } catch {
            failure = error.asAPIError
            isCreating = false
        }
    }
}

/// First stop after registering (unless they arrived through an invite link).
struct OnboardingView: View {
    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var name = ""
    @State private var emoji = presetEmojis[0]
    @State private var isCreating = false
    @State private var failure: APIError?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Welcome, \(session.user?.firstName ?? "friend")! 🎉")
                            .font(.largeTitle.weight(.black))
                        Text("Friendship Wrapped happens in private groups. Start one for your friends, and you'll get a link to invite them.")
                            .foregroundStyle(.secondary)
                    }
                    .listRowBackground(Color.clear)
                }

                if let message = failure?.formMessage {
                    FormErrorSection(message: message)
                }

                GroupFormFields(name: $name, emoji: $emoji, errors: failure?.fieldErrors ?? [:])

                Section {
                    PrimaryButton(title: "Create group", pendingTitle: "Creating…", isPending: isCreating) {
                        Task { await create() }
                    }
                } footer: {
                    Text("Got an invite link from a friend? Skip this and join with it from Home.")
                        .padding(.top, 8)
                }
                .buttonRow()
            }
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Skip for now") { router.showOnboarding = false }
                }
            }
        }
    }

    private func create() async {
        isCreating = true
        failure = nil
        do {
            let group = try await store.createGroup(name: name, emoji: emoji)
            router.showOnboarding = false
            router.openGroup(group.id)
        } catch {
            failure = error.asAPIError
            isCreating = false
        }
    }
}
