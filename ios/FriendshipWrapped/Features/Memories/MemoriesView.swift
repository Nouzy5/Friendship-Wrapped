import SwiftUI

/// What the Memories tab lists under On This Day.
enum MemoriesTab: Hashable {
    case timeline, moments, albums, favorites
}

/// A group's shared archive (the web app's MemoriesPage): On This Day, then the timeline
/// (everyone's, or one person's), the albums and your favorites. It always shows the current
/// group; picking another one here makes that the current group everywhere.
struct MemoriesView: View {
    @Environment(GroupsStore.self) private var groups
    @Environment(AppRouter.self) private var router

    /// Kept when you switch groups (the person and month filters aren't).
    @State private var tab: MemoriesTab = .timeline

    var body: some View {
        content
            .toolbar(.hidden, for: .navigationBar)
            .background(Color.bg.ignoresSafeArea())
            .safeAreaInset(edge: .top, spacing: 0) {
                // Paper behind the status bar, so photos don't scroll under the clock.
                Color.clear
                    .frame(height: 0)
                    .background(.bg)
            }
            .task { await groups.loadGroupsIfNeeded() }
    }

    @ViewBuilder private var content: some View {
        if let group = groups.currentGroup {
            // Keyed by group: another group starts afresh, without the last one's filters.
            MemoriesGroupScreen(group: group, tab: $tab)
                .id(group.id)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    MemoriesHeader(group: nil)
                    placeholder
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
            .refreshable { await groups.loadGroups() }
        }
    }

    @ViewBuilder private var placeholder: some View {
        switch groups.listState {
        case .idle, .loading:
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 64)
        case .failed:
            EmptyStateView(emoji: "📡", title: "Couldn't load your groups", message: "Check your connection and try again.") {
                Button("Try again") {
                    Task { await groups.loadGroups() }
                }
                .buttonStyle(.fwCompact(.primary))
            }
        case .loaded:
            EmptyStateView(
                emoji: "🫶",
                title: "No memories yet",
                message: "Memories are made with friends. Create a group, or open an invite link from a friend."
            ) {
                Button("Create a group") {
                    router.showingNewGroup = true
                }
                .buttonStyle(.fwCompact(.primary))
            }
        }
    }
}

/// "Memories", with the group picker on the right.
private struct MemoriesHeader: View {
    let group: FriendGroup?

    @Environment(GroupsStore.self) private var groups

    var body: some View {
        HStack(spacing: 12) {
            Text("Memories")
                .font(Theme.title(.title))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .layoutPriority(1)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            if let group {
                GroupPicker(current: group, style: .pill, onSelect: { next in
                    groups.setCurrentGroup(next.id)
                })
            }
        }
        .frame(minHeight: 44)
    }
}

/// One group's memories. The lists live here (not in the tabs) so pull to refresh can reload
/// them, and so switching tabs keeps each one's place.
private struct MemoriesGroupScreen: View {
    let group: FriendGroup
    @Binding var tab: MemoriesTab

    @Environment(GroupsStore.self) private var groups
    @Environment(PhotosStore.self) private var photos
    @Environment(AlbumsStore.self) private var albums
    @Environment(MomentsStore.self) private var moments
    @Environment(AppRouter.self) private var router

    @State private var onThisDay: OnThisDay?
    @State private var onThisDayFailed = false
    /// "Taken by": one member's photos, or nil for everyone's.
    @State private var uploaderID: String?
    /// The timeline from this month back, or nil for the latest photos.
    @State private var from: MonthYear?
    @State private var timeline: PhotoListModel
    @State private var favorites: PhotoListModel
    @State private var creatingAlbum = false
    @State private var startingMoment = false

    init(group: FriendGroup, tab: Binding<MemoriesTab>) {
        self.group = group
        _tab = tab
        _timeline = State(initialValue: Self.timelineModel(groupID: group.id, from: nil, uploaderID: nil))
        let groupID = group.id
        _favorites = State(initialValue: PhotoListModel { cursor in
            try await APIClient.shared.fetchGroupPhotos(groupID, cursor: cursor, favoritesOnly: true)
        })
    }

    private var tabOptions: [SegmentedPicker<MemoriesTab>.Option] {
        [
            .init(value: .timeline, label: "Timeline"),
            .init(value: .moments, label: "Moments"),
            .init(value: .albums, label: "Albums"),
            .init(value: .favorites, label: "Favorites"),
        ]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                MemoriesHeader(group: group)

                MemoriesOnThisDay(groupID: group.id, result: onThisDay, failed: onThisDayFailed)
                    // Again each time you come back, so it's for today and without deleted photos.
                    .task { await loadOnThisDay() }

                VStack(alignment: .leading, spacing: 12) {
                    SegmentedPicker(options: tabOptions, selection: $tab)
                    if tab == .timeline {
                        MemoriesPeopleFilter(groupID: group.id, selected: uploaderID) { person in
                            showTimeline(from: from, uploaderID: person)
                        }
                        .transition(.opacity)
                    }
                }

                // Each tab crossfades in when it's chosen (the picker animates the change).
                ZStack(alignment: .top) {
                    tabContent
                        .id(tab)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .refreshable { await refresh() }
        // Outside the refreshable scroll view, so the sheet doesn't inherit its pull to refresh.
        .sheet(isPresented: $creatingAlbum) {
            AlbumNameSheet(title: "New album", submitTitle: "Create album") { name in
                let album = try await albums.create(in: group.id, name: name)
                router.push(.album(album.id))
            }
        }
        .sheet(isPresented: $startingMoment) {
            StartMomentSheet { title, emoji, hours in
                let started = try await moments.start(in: group.id, title: title, emoji: emoji, durationHours: hours)
                router.push(.moment(started.id))
            }
        }
        .task { await groups.loadMembersIfNeeded(of: group.id) }
    }

    @ViewBuilder private var tabContent: some View {
        switch tab {
        case .timeline:
            MemoriesTimeline(group: group, model: timeline, from: from, uploaderID: uploaderID) { month in
                showTimeline(from: month, uploaderID: uploaderID)
            }
        case .moments:
            MomentsSection(groupID: group.id) {
                startingMoment = true
            }
        case .albums:
            AlbumsSection(groupID: group.id) {
                creatingAlbum = true
            }
        case .favorites:
            MemoriesFavorites(model: favorites)
        }
    }

    // MARK: - Loading

    private func loadOnThisDay() async {
        do {
            let loaded = try await APIClient.shared.fetchOnThisDay(group.id)
            photos.remember(loaded.years.flatMap(\.photos))
            onThisDay = loaded
            onThisDayFailed = false
        } catch is CancellationError {
            return
        } catch {
            // Keep showing what's there when a reload fails.
            onThisDayFailed = onThisDay == nil
        }
    }

    /// Pull to refresh: the groups (and your colours), On This Day and the list you're on, together.
    private func refresh() async {
        let groupID = group.id
        // Separate tasks, so the scroll view's refresh ending early can't cancel the requests.
        let work: [Task<Void, Never>] = [
            Task { await groups.loadGroups() },
            Task { _ = try? await groups.loadMembers(of: groupID) },
            Task { await loadOnThisDay() },
            Task { await reloadTab() },
        ]
        for task in work {
            await task.value
        }
    }

    private func reloadTab() async {
        switch tab {
        case .timeline:
            await timeline.reload()
        case .moments:
            try? await moments.loadMoments(in: group.id)
        case .albums:
            _ = try? await albums.loadAlbums(in: group.id)
        case .favorites:
            await favorites.reload()
        }
    }

    /// Jumping to a month or choosing whose photos: the timeline starts again from there.
    private func showTimeline(from month: MonthYear?, uploaderID person: String?) {
        guard month != from || person != uploaderID else { return }
        let next = Self.timelineModel(groupID: group.id, from: month, uploaderID: person)
        next.store = photos
        withMotion(.fwEase) {
            from = month
            uploaderID = person
            timeline = next
        }
    }

    private static func timelineModel(groupID: String, from: MonthYear?, uploaderID: String?) -> PhotoListModel {
        let before = from?.end
        return PhotoListModel { cursor in
            try await APIClient.shared.fetchGroupPhotos(groupID, cursor: cursor, before: before, uploaderID: uploaderID)
        }
    }
}

/// Photos from today's date in earlier years, each tagged with who took it, as a row to swipe
/// through; or a note that there's nothing yet.
private struct MemoriesOnThisDay: View {
    let groupID: String
    let result: OnThisDay?
    let failed: Bool

    @Environment(GroupsStore.self) private var groups
    @Environment(PhotosStore.self) private var photos

    private struct Memory: Identifiable {
        let photo: Photo
        let ago: String

        var id: String { photo.id }
    }

    private var today: String {
        Date().formatted(.dateTime.day().month(.wide))
    }

    /// Every photo, newest year first, without any deleted since it loaded (a year left with
    /// nothing in it goes with them).
    private var memories: [Memory] {
        guard let result else { return [] }
        let thisYear = Int(result.date.prefix(4)) ?? Calendar.current.component(.year, from: Date())
        let deleted = photos.deletedPhotoIDs
        return result.years.flatMap { entry in
            entry.photos
                .filter { !deleted.contains($0.id) }
                .map { Memory(photo: $0, ago: Self.yearsAgo(thisYear - entry.year)) }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("On this day")
                    .font(Theme.title(.title3))
                Text(today)
                    .font(.subheadline)
                    .foregroundStyle(.sub)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            if result != nil {
                let items = memories
                if items.isEmpty {
                    Text("Nothing from \(today) in earlier years yet. Next year, today shows up here.")
                        .font(.subheadline)
                        .foregroundStyle(.sub)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    row(items)
                }
            } else if failed {
                Text("Couldn't look back right now.")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
            } else {
                skeleton
            }
        }
    }

    private func row(_ items: [Memory]) -> some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    tile(item)
                        .riseIn(delay: Double(min(index, 8)) * 0.06)
                }
            }
            .scrollTargetLayout()
        }
        .scrollIndicators(.hidden)
        .scrollTargetBehavior(.viewAligned)
        .contentMargins(.horizontal, 16, for: .scrollContent)
        // Edge to edge: past the screen's 16-point margins.
        .padding(.horizontal, -16)
    }

    private func tile(_ item: Memory) -> some View {
        let photo = item.photo

        return NavigationLink(value: AppRoute.photo(photo.id)) {
            VStack(alignment: .leading, spacing: 6) {
                PhotoImage(photo: photo, variant: .thumbnail)
                    .frame(width: 124, height: 124)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        if let video = photo.video {
                            VideoBadge(video: video)
                                .padding(8)
                        }
                    }
                    .overlay(alignment: .bottomLeading) {
                        NameTag(
                            name: memoriesFirstName(photo.uploader.displayName),
                            color: groups.colorOf(photo.uploader.id, in: groupID),
                            small: true
                        )
                        .frame(maxWidth: 108, alignment: .leading)
                        .padding(8)
                    }
                Text(item.ago)
                    .font(.footnote)
                    .foregroundStyle(.fg)
                    .lineLimit(1)
            }
            .frame(width: 124, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.96))
        .accessibilityLabel("\(photo.altText), \(item.ago)")
    }

    private var skeleton: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 12) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(.surface)
                        .frame(width: 124, height: 124)
                }
            }
        }
        .scrollIndicators(.hidden)
        .scrollDisabled(true)
        .contentMargins(.horizontal, 16, for: .scrollContent)
        .padding(.horizontal, -16)
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }

    static func yearsAgo(_ years: Int) -> String {
        years == 1 ? "1 year ago" : "\(years) years ago"
    }
}

/// The photos you've starred in this group, newest first. Only you see them.
private struct MemoriesFavorites: View {
    let model: PhotoListModel

    @Environment(PhotosStore.self) private var photos

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.phase == .failed {
                EmptyStateView(emoji: "📡", title: "Couldn't load favorites") {
                    Button("Try again") {
                        Task { await model.reload() }
                    }
                    .buttonStyle(.fwCompact(.primary))
                }
            } else if model.phase == .loaded {
                if model.photos.isEmpty {
                    EmptyStateView(
                        emoji: "⭐",
                        title: "No favorites yet",
                        message: "Tap the star on a photo to keep it here. Only you can see your favorites."
                    )
                } else {
                    Text("Only you can see your favorites.")
                        .font(.subheadline)
                        .foregroundStyle(.sub)
                }
            }

            MemoriesPhotoList(model: model, loadMoreLabel: "Load more favorites")
        }
        // Again each time it shows, so starring or unstarring in the viewer shows up here.
        .task {
            model.store = photos
            await model.reload()
        }
    }
}

/// "Tomáš" from "Tomáš Novák", for name tags and chips.
func memoriesFirstName(_ displayName: String) -> String {
    displayName.split(whereSeparator: \.isWhitespace).first.map { String($0) } ?? displayName
}
