import SwiftUI

/// Owners edit the group and reset invite links; everyone can leave.
struct GroupSettingsView: View {
    let groupID: String

    @Environment(GroupsStore.self) private var store

    var body: some View {
        // Only reachable from the group screen, which has already loaded the group. After leaving,
        // the group is gone while this screen slides away, so don't fetch it again here.
        if let group = store.group(groupID) {
            GroupSettingsForm(group: group)
        } else {
            ProgressView()
        }
    }
}

private struct GroupSettingsForm: View {
    let group: FriendGroup

    @Environment(GroupsStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var name: String
    @State private var emoji: String
    @State private var isSaving = false
    @State private var saveFailure: APIError?
    @State private var saved = false

    @State private var confirmingReset = false
    @State private var isResetting = false
    @State private var resetDone = false

    @State private var confirmingLeave = false
    @State private var isLeaving = false

    @State private var alertMessage: String?

    init(group: FriendGroup) {
        self.group = group
        _name = State(initialValue: group.name)
        _emoji = State(initialValue: group.emoji)
    }

    private var hasChanges: Bool {
        name.trimmingCharacters(in: .whitespaces) != group.name || emoji != group.emoji
    }

    private var leaveConsequence: String {
        if group.memberCount == 1 {
            return "You're the only member, so leaving will permanently delete this group."
        }
        if group.isOwner {
            return "Ownership will pass to the member who has been in the group longest."
        }
        return "You'll lose access to this group until someone sends you a new invite link."
    }

    var body: some View {
        Form {
            if group.isOwner {
                if let message = saveFailure?.formMessage {
                    FormErrorSection(message: message)
                }

                GroupFormFields(name: $name, emoji: $emoji, errors: saveFailure?.fieldErrors ?? [:])

                Section {
                    PrimaryButton(
                        title: saved && !hasChanges ? "Saved" : "Save changes",
                        pendingTitle: "Saving…",
                        isPending: isSaving
                    ) {
                        Task { await save() }
                    }
                    .disabled(!hasChanges)
                }
                .buttonRow()

                Section {
                    Button("Reset invite links", role: .destructive) {
                        confirmingReset = true
                    }
                    .disabled(isResetting)
                } header: {
                    Text("Invite links")
                } footer: {
                    Text(
                        resetDone
                            ? "All invite links have been reset."
                            : "If a link ended up somewhere it shouldn't, reset them. Every existing invite link stops working."
                    )
                }
            }

            Section {
                Button(role: .destructive) {
                    confirmingLeave = true
                } label: {
                    HStack {
                        Text("Leave \(group.name)")
                        if isLeaving {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(isLeaving)
            } header: {
                Text("Leave group")
            } footer: {
                Text(leaveConsequence)
            }
        }
        .navigationTitle("Group settings")
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .confirmationDialog("Reset all invite links?", isPresented: $confirmingReset, titleVisibility: .visible) {
            Button("Reset links", role: .destructive) {
                Task { await resetInvites() }
            }
        } message: {
            Text("Links that have already been shared will stop working. Members can create new ones.")
        }
        .confirmationDialog("Leave \(group.name)?", isPresented: $confirmingLeave, titleVisibility: .visible) {
            Button(group.memberCount == 1 ? "Leave and delete" : "Leave group", role: .destructive) {
                Task { await leave() }
            }
        } message: {
            Text(leaveConsequence)
        }
        .errorAlert("Something went wrong", message: $alertMessage)
        .sensoryFeedback(.success, trigger: saved) { _, isSaved in isSaved }
    }

    private func save() async {
        isSaving = true
        saveFailure = nil
        do {
            let updated = try await store.updateGroup(group.id, name: name, emoji: emoji)
            name = updated.name
            emoji = updated.emoji
            saved = true
        } catch {
            saveFailure = error.asAPIError
        }
        isSaving = false
    }

    private func resetInvites() async {
        isResetting = true
        do {
            try await APIClient.shared.resetInvites(forGroup: group.id)
            resetDone = true
        } catch {
            alertMessage = error.asAPIError.message
        }
        isResetting = false
    }

    private func leave() async {
        isLeaving = true
        do {
            try await store.leaveGroup(group.id)
            // Navigate away first so no screen tries to reload a group you're no longer in.
            router.popToHome()
            store.forget(group.id)
        } catch {
            alertMessage = error.asAPIError.message
            isLeaving = false
        }
    }
}
