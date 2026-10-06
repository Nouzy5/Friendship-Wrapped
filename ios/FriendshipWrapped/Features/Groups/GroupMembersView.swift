import SwiftUI

/// Everyone in the group. The owner can swipe to remove people.
struct GroupMembersView: View {
    let groupID: String

    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var store

    @State private var loadFailed = false
    @State private var memberToRemove: GroupMember?
    @State private var removingID: String?
    @State private var alertMessage: String?

    private var isOwner: Bool { store.group(groupID)?.isOwner == true }

    var body: some View {
        List {
            Section {
                if let members = store.members(of: groupID) {
                    ForEach(members) { member in
                        MemberRow(
                            member: member,
                            isYou: member.user.id == session.user?.id,
                            isRemoving: removingID == member.user.id
                        )
                        .swipeActions(edge: .trailing) {
                            if canRemove(member) {
                                Button("Remove", systemImage: "person.badge.minus") {
                                    memberToRemove = member
                                }
                                .tint(.red)
                            }
                        }
                    }
                } else if loadFailed {
                    EmptyStateView(emoji: "📡", title: "Couldn't load members") {
                        Button("Try again") { Task { await load() } }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            } footer: {
                if isOwner, (store.members(of: groupID)?.count ?? 0) > 1 {
                    Text("Swipe left on someone to remove them from the group.")
                }
            }

            if let group = store.group(groupID) {
                InviteFriendsSection(group: group)
            }
        }
        .navigationTitle("Members")
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog(
            "Remove \(memberToRemove?.user.displayName ?? "member")?",
            isPresented: Binding(
                get: { memberToRemove != nil },
                set: { if !$0 { memberToRemove = nil } }
            ),
            titleVisibility: .visible,
            presenting: memberToRemove
        ) { member in
            Button("Remove", role: .destructive) {
                Task { await remove(member) }
            }
        } message: { _ in
            Text("They'll lose access to this group straight away. They can only come back with a new invite link.")
        }
        .errorAlert("Couldn't remove member", message: $alertMessage)
    }

    private func canRemove(_ member: GroupMember) -> Bool {
        isOwner && member.user.id != session.user?.id && removingID == nil
    }

    private func load() async {
        do {
            try await store.loadMembers(of: groupID)
            loadFailed = false
        } catch is CancellationError {
            return
        } catch {
            loadFailed = true
        }
    }

    private func remove(_ member: GroupMember) async {
        removingID = member.user.id
        do {
            try await store.removeMember(member.user.id, from: groupID)
        } catch {
            alertMessage = error.asAPIError.message
        }
        removingID = nil
    }
}
