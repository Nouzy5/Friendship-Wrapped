import SwiftUI

private enum MemoriesTab: Hashable {
    case timeline, albums, favorites
}

/// A group's shared archive: On This Day, then the timeline, albums and your favorites.
struct MemoriesView: View {
    @Environment(GroupsStore.self) private var groups
    @Environment(AppRouter.self) private var router

    @State private var selectedGroupID: String?
    @State private var tab: MemoriesTab = .timeline

    private var currentGroup: FriendGroup? {
        groups.groups.first { $0.id == selectedGroupID } ?? groups.groups.first
    }

    var body: some View {
        content
            .navigationTitle("Memories")
            .task { await groups.loadGroupsIfNeeded() }
    }

    @ViewBuilder private var content: some View {
        if let group = currentGroup {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if groups.groups.count > 1 {
                        GroupSwitcher(groups: groups.groups, selectedID: group.id) { selectedGroupID = $0 }
                    }

                    OnThisDayCard(groupID: group.id)
                        .id("on-this-day-\(group.id)")

                    Picker("Show", selection: $tab) {
                        Text("Timeline").tag(MemoriesTab.timeline)
                        Text("Albums").tag(MemoriesTab.albums)
                        Text("Favorites").tag(MemoriesTab.favorites)
                    }
                    .pickerStyle(.segmented)

                    // Keyed by group, so switching groups starts each tab afresh.
                    switch tab {
                    case .timeline:
                        TimelineSection(group: group)
                            .id("timeline-\(group.id)")
                    case .albums:
                        AlbumsSection(groupID: group.id)
                            .id("albums-\(group.id)")
                    case .favorites:
                        FavoritesSection(groupID: group.id)
                            .id("favorites-\(group.id)")
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
        } else {
            switch groups.listState {
            case .idle, .loading:
                ProgressView()
            case .failed:
                EmptyStateView(emoji: "📡", title: "Couldn't load your groups", message: "Check your connection and try again.") {
                    Button("Try again") { Task { await groups.loadGroups() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded:
                EmptyStateView(
                    emoji: "🫶",
                    title: "No memories yet",
                    message: "Memories are made with friends. Create a group, or open an invite link from a friend."
                ) {
                    Button("Create a group") {
                        router.selectedTab = .home
                        router.showingNewGroup = true
                    }
                    .buttonStyle(.brand)
                    .frame(maxWidth: 240)
                }
            }
        }
    }
}

/// Which group's memories to show, as a row of chips (it scrolls when there are many).
private struct GroupSwitcher: View {
    let groups: [FriendGroup]
    let selectedID: String
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(groups) { group in
                    let selected = group.id == selectedID
                    Button {
                        onSelect(group.id)
                    } label: {
                        HStack(spacing: 6) {
                            Text(group.emoji)
                            Text(group.name)
                                .lineLimit(1)
                        }
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14)
                        .frame(height: 38)
                        .background(selected ? Color.accentColor.opacity(0.15) : Color(.tertiarySystemFill), in: Capsule())
                        .overlay(Capsule().strokeBorder(selected ? Color.accentColor.opacity(0.7) : Color.clear))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }
}

/// Photos from today's date in earlier years, or a note that there's nothing yet.
private struct OnThisDayCard: View {
    let groupID: String

    @Environment(PhotosStore.self) private var photos
    @State private var result: OnThisDay?
    @State private var failed = false

    private var today: String {
        Date().formatted(.dateTime.day().month(.wide))
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)

        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 4) {
                Text("On this day")
                    .font(.headline)
                Text("· \(today)")
                    .foregroundStyle(.secondary)
            }

            if let result {
                if result.years.isEmpty {
                    Text("Nothing from \(today) in earlier years yet. Keep capturing: next year, today shows up here.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    let thisYear = Int(result.date.prefix(4)) ?? Calendar.current.component(.year, from: Date())
                    ForEach(result.years) { entry in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("\(Self.yearsAgo(thisYear - entry.year)) · \(String(entry.year))")
                                .font(.subheadline.weight(.semibold))
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(entry.photos) { photo in
                                        NavigationLink(value: AppRoute.photo(photo.id)) {
                                            PhotoThumbnail(photo: photo)
                                                .frame(width: 112, height: 112)
                                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityLabel(photo.altText)
                                    }
                                }
                            }
                        }
                    }
                }
            } else if failed {
                Text("Couldn't look back right now.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: shape)
        .overlay(shape.strokeBorder(Color.accentColor.opacity(0.3)))
        .task { await load() }
    }

    static func yearsAgo(_ years: Int) -> String {
        years == 1 ? "1 year ago" : "\(years) years ago"
    }

    private func load() async {
        failed = false
        do {
            let loaded = try await APIClient.shared.fetchOnThisDay(groupID)
            photos.remember(loaded.years.flatMap(\.photos))
            result = loaded
        } catch is CancellationError {
            return
        } catch {
            failed = true
        }
    }
}

/// A calendar month in the viewer's time zone.
struct MonthYear: Hashable, Identifiable, Comparable {
    let year: Int
    /// 1–12.
    let month: Int

    init(year: Int, month: Int) {
        self.year = year
        self.month = month
    }

    init(date: Date) {
        let parts = Calendar.current.dateComponents([.year, .month], from: date)
        year = parts.year ?? 1970
        month = parts.month ?? 1
    }

    static var current: MonthYear { MonthYear(date: Date()) }

    var id: String { "\(year)-\(month)" }

    var start: Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date()
    }

    /// When the following month begins locally: the timeline lists photos from before it.
    var end: Date {
        Calendar.current.date(byAdding: .month, value: 1, to: start) ?? start
    }

    /// e.g. "October 2026".
    var title: String {
        start.formatted(.dateTime.month(.wide).year())
    }

    static func < (lhs: MonthYear, rhs: MonthYear) -> Bool {
        (lhs.year, lhs.month) < (rhs.year, rhs.month)
    }
}

/// The group's photos month by month, newest first, with a way to jump back to any month.
private struct TimelineSection: View {
    let group: FriendGroup

    @Environment(PhotosStore.self) private var photos
    @State private var model: PhotoListModel
    /// Showing this month and earlier; nil for the latest photos.
    @State private var from: MonthYear?
    @State private var pickedMonth: Int
    @State private var pickedYear: Int

    init(group: FriendGroup) {
        self.group = group
        _model = State(initialValue: Self.makeModel(groupID: group.id, from: nil))
        let now = MonthYear.current
        _pickedMonth = State(initialValue: now.month)
        _pickedYear = State(initialValue: now.year)
    }

    private struct MonthGroup: Identifiable {
        let month: MonthYear
        var photos: [Photo]
        var id: String { month.id }
    }

    /// Consecutive photos grouped by their local month (the list is already newest first).
    private var monthGroups: [MonthGroup] {
        var result: [MonthGroup] = []
        for photo in model.photos {
            let month = MonthYear(date: photo.createdAt)
            if let last = result.indices.last, result[last].month == month {
                result[last].photos.append(photo)
            } else {
                result.append(MonthGroup(month: month, photos: [photo]))
            }
        }
        return result
    }

    private var years: [Int] {
        let now = MonthYear.current.year
        let first = min(MonthYear(date: group.createdAt).year, now)
        return Array((first...now).reversed())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            monthJump

            if let from {
                HStack(spacing: 8) {
                    Text("Showing \(from.title) and earlier")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button("Back to the latest") { jump(to: nil) }
                        .font(.subheadline.weight(.medium))
                }
            }

            switch model.phase {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
            case .failed:
                EmptyStateView(emoji: "📡", title: "Couldn't load photos") {
                    Button("Try again") { Task { await model.reload() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded:
                if model.photos.isEmpty {
                    if from != nil {
                        EmptyStateView(emoji: "🕰️", title: "Nothing that far back", message: "This group had no photos yet by then.")
                    } else {
                        EmptyStateView(emoji: "📸", title: "No photos yet", message: "Photos shared in the group show up here by month.")
                    }
                } else {
                    LazyVStack(alignment: .leading, spacing: 8, pinnedViews: [.sectionHeaders]) {
                        ForEach(monthGroups) { monthGroup in
                            Section {
                                PhotoGrid(photos: monthGroup.photos)
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    .padding(.bottom, 8)
                            } header: {
                                // Sticks to the top while its month scrolls past.
                                Text(monthGroup.month.title)
                                    .font(.headline)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, 8)
                                    .background(Color(.systemBackground))
                            }
                        }
                        footer
                    }
                }
            }
        }
        .task {
            model.store = photos
            if model.photos.isEmpty { await model.reload() }
        }
    }

    private var monthJump: some View {
        HStack(spacing: 8) {
            Text("Jump to")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Picker("Month", selection: $pickedMonth) {
                ForEach(1...12, id: \.self) { month in
                    Text(Calendar.current.monthSymbols[month - 1]).tag(month)
                }
            }
            .pickerStyle(.menu)
            Picker("Year", selection: $pickedYear) {
                ForEach(years, id: \.self) { year in
                    Text(String(year)).tag(year)
                }
            }
            .pickerStyle(.menu)
            Spacer(minLength: 0)
            Button("Go") {
                let picked = MonthYear(year: pickedYear, month: pickedMonth)
                jump(to: picked < MonthYear.current ? picked : nil)
            }
            .buttonStyle(.bordered)
        }
    }

    @ViewBuilder private var footer: some View {
        if model.hasMore {
            if model.loadMoreFailed {
                LoadMoreRow(title: "Load earlier photos", isLoading: false, failed: true) {
                    Task { await model.loadMore() }
                }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .id(model.photos.count)
                    .onAppear { Task { await model.loadMore() } }
            }
        } else {
            Text("That's the very beginning ✨")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
    }

    private func jump(to month: MonthYear?) {
        from = month
        let current = month ?? MonthYear.current
        pickedMonth = current.month
        pickedYear = current.year
        let next = Self.makeModel(groupID: group.id, from: month)
        next.store = photos
        model = next
        Task { await next.reload() }
    }

    private static func makeModel(groupID: String, from: MonthYear?) -> PhotoListModel {
        let before = from?.end
        return PhotoListModel { cursor in
            try await APIClient.shared.fetchGroupPhotos(groupID, cursor: cursor, before: before)
        }
    }
}

/// The photos you've starred in this group, newest first. Only you see them.
private struct FavoritesSection: View {
    let groupID: String

    @Environment(PhotosStore.self) private var photos
    @State private var model: PhotoListModel

    init(groupID: String) {
        self.groupID = groupID
        _model = State(initialValue: PhotoListModel { cursor in
            try await APIClient.shared.fetchGroupPhotos(groupID, cursor: cursor, favoritesOnly: true)
        })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch model.phase {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
            case .failed:
                EmptyStateView(emoji: "📡", title: "Couldn't load favorites") {
                    Button("Try again") { Task { await model.reload() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded:
                if model.photos.isEmpty {
                    EmptyStateView(
                        emoji: "⭐",
                        title: "No favorites yet",
                        message: "Tap the star on a photo to keep it here. Only you can see your favorites."
                    )
                } else {
                    Text("Only you can see your favorites.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    PhotoGrid(photos: model.photos)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    if model.hasMore {
                        LoadMoreRow(
                            title: "Load more favorites",
                            isLoading: model.isLoadingMore,
                            failed: model.loadMoreFailed
                        ) {
                            Task { await model.loadMore() }
                        }
                    }
                }
            }
        }
        // Reloaded every time it appears, so starring or unstarring in the viewer shows up here.
        .onAppear {
            model.store = photos
            Task { await model.reload() }
        }
    }
}
