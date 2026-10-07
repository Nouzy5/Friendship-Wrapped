import SwiftUI

/// Your groups. "+" creates one or joins with a link a friend sent.
struct HomeView: View {
    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var store
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router

        List {
            if store.groups.isEmpty, store.listState == .idle || store.listState == .loading {
                Section {
                    ForEach(0..<3, id: \.self) { _ in
                        GroupRowSkeleton()
                    }
                }
            }

            if !store.groups.isEmpty {
                Section {
                    ForEach(store.groups) { group in
                        NavigationLink(value: AppRoute.group(group.id)) {
                            GroupRow(group: group)
                        }
                    }
                } header: {
                    Text("Your groups")
                } footer: {
                    if case .failed(let message) = store.listState {
                        Text(message).foregroundStyle(.red)
                    } else {
                        Text("Got an invite link from a friend? Tap + to join with it.")
                    }
                }
            }
        }
        .overlay { placeholder }
        .navigationTitle("Hey \(session.user?.firstName ?? "there") 👋")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("New group", systemImage: "plus") { router.showingNewGroup = true }
                    Button("Join with invite link", systemImage: "link") { router.showingJoin = true }
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add a group")
            }
        }
        .refreshable { await store.loadGroups() }
        .task { await store.loadGroupsIfNeeded() }
        .sheet(isPresented: $router.showingNewGroup) {
            NewGroupView { group in
                router.homePath.append(.group(group.id))
            }
        }
        .sheet(isPresented: $router.showingJoin) {
            JoinWithLinkView()
        }
    }

    @ViewBuilder private var placeholder: some View {
        if store.groups.isEmpty {
            switch store.listState {
            case .idle, .loading:
                // Skeleton rows show in the list meanwhile.
                EmptyView()
            case .failed:
                EmptyStateView(
                    emoji: "📡",
                    title: "Couldn't load your groups",
                    message: "Check your connection and try again."
                ) {
                    Button("Try again") {
                        Task { await store.loadGroups() }
                    }
                    .buttonStyle(.borderedProminent)
                }
            case .loaded:
                EmptyStateView(
                    emoji: "🫶",
                    title: "No groups yet",
                    message: "Create a group for your friends, then send them an invite link. Got a link from a friend? Join with it here."
                ) {
                    VStack(spacing: 12) {
                        Button("Create a group") { router.showingNewGroup = true }
                            .buttonStyle(.brand)
                        Button("Join with invite link") { router.showingJoin = true }
                            .buttonStyle(.brandSecondary)
                    }
                    .frame(maxWidth: 300)
                }
            }
        }
    }
}
