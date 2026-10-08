import SwiftUI

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
        Format.monthYear(start)
    }

    /// e.g. "October".
    var monthName: String {
        Self.name(ofMonth: month)
    }

    static func name(ofMonth month: Int) -> String {
        let symbols = Calendar.current.standaloneMonthSymbols
        guard symbols.indices.contains(month - 1) else { return "" }
        return symbols[month - 1]
    }

    static func < (lhs: MonthYear, rhs: MonthYear) -> Bool {
        (lhs.year, lhs.month) < (rhs.year, rhs.month)
    }
}

/// The group's photos month by month, newest first, with a way to jump back to any month
/// (the web app's Timeline). Each month's heading sticks to the top while it scrolls past.
struct MemoriesTimeline: View {
    let group: FriendGroup
    let model: PhotoListModel
    /// Showing this month and earlier; nil for the latest photos.
    let from: MonthYear?
    /// Only this member's photos ("Taken by"); nil for everyone's.
    let uploaderID: String?
    let onJump: (MonthYear?) -> Void

    @Environment(PhotosStore.self) private var photos

    private struct MonthGroup: Identifiable {
        let month: MonthYear
        var items: [Photo]

        var id: String { month.id }
    }

    /// Consecutive photos grouped by their local month (the list is already newest first).
    private var monthGroups: [MonthGroup] {
        var result: [MonthGroup] = []
        for photo in model.photos {
            let month = MonthYear(date: photo.createdAt)
            if let last = result.indices.last, result[last].month == month {
                result[last].items.append(photo)
            } else {
                result.append(MonthGroup(month: month, items: [photo]))
            }
        }
        return result
    }

    var body: some View {
        let months = monthGroups

        VStack(alignment: .leading, spacing: 12) {
            // Keyed, so the pickers follow when the month changes from outside ("Back to the latest").
            MemoriesMonthJump(group: group, from: from, onJump: onJump)
                .id(from?.id ?? "latest")

            if let from {
                showingNote(from)
            }

            if model.phase == .failed {
                EmptyStateView(emoji: "📡", title: "Couldn't load photos") {
                    Button("Try again") {
                        Task { await model.reload() }
                    }
                    .buttonStyle(.fwCompact(.primary))
                }
            } else if model.phase == .loaded && months.isEmpty {
                if from != nil {
                    EmptyStateView(emoji: "🕰️", title: "Nothing that far back", message: "This group had no photos yet by then.")
                } else {
                    EmptyStateView(
                        emoji: "📸",
                        title: "No photos yet",
                        message: uploaderID != nil ? "Nothing from them yet." : "Photos shared in the group show up here by month."
                    )
                }
            }

            ZStack(alignment: .top) {
                // Always there, so the first months rise in one after another.
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                    ForEach(Array(months.enumerated()), id: \.element.id) { index, entry in
                        Section {
                            MemoriesPhotoGrid(photos: entry.items)
                                .padding(.bottom, 16)
                                .listItemTransition(index: index)
                        } header: {
                            MemoriesMonthHeading(month: entry.month)
                                .listItemTransition(index: index)
                        }
                    }
                    if model.phase == .loaded && !months.isEmpty {
                        MemoriesLoadMore(model: model, label: "Load earlier photos", endMessage: "That's the very beginning.")
                    }
                }
                if model.phase == .loading {
                    GridSkeleton()
                        .padding(.horizontal, -8)
                        .padding(.top, 8)
                        .transition(.opacity)
                }
            }
            .motion(.fwEase, value: model.photos.map(\.id))
            .motion(.fwEase, value: model.phase)
        }
        // Loads once (it keeps your place when you come back from a photo), and again for each
        // new month or person.
        .task(id: ObjectIdentifier(model)) {
            model.store = photos
            if model.photos.isEmpty { await model.reload() }
        }
    }

    private func showingNote(_ from: MonthYear) -> some View {
        let note = Text("Showing \(from.title) and earlier")
            .font(.subheadline)
            .foregroundStyle(.sub)
        let back = Button {
            Haptics.tap()
            onJump(nil)
        } label: {
            Text("Back to the latest")
                .underline()
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.fg)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)

        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                note
                back
            }
            VStack(alignment: .leading, spacing: 0) {
                note
                back
            }
        }
    }
}

/// A month's big heading: "October" and the year, on paper so it covers the photos under it
/// while it's pinned.
private struct MemoriesMonthHeading: View {
    let month: MonthYear

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(month.monthName)
                .font(Theme.title(.title))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(String(month.year))
                .font(.subheadline)
                .foregroundStyle(.sub)
        }
        .padding(.top, 12)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            Color.bg.padding(.horizontal, -16)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// "Taken by": everyone, or one person's photos. Each person is marked with their colour.
struct MemoriesPeopleFilter: View {
    let groupID: String
    /// The member whose photos are shown, or nil for everyone's.
    let selected: String?
    let onSelect: (String?) -> Void

    @Environment(GroupsStore.self) private var groups
    @Environment(SessionStore.self) private var session

    var body: some View {
        let people = (groups.members(of: groupID) ?? []).sorted { $0.joinedAt < $1.joinedAt }

        if people.count >= 2 {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    chip("Everyone", color: nil, showsDot: false, isSelected: selected == nil) {
                        onSelect(nil)
                    }
                    ForEach(people) { member in
                        let isSelected = member.user.id == selected
                        chip(name(of: member), color: member.color, showsDot: true, isSelected: isSelected) {
                            onSelect(isSelected ? nil : member.user.id)
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
            .contentMargins(.horizontal, 16, for: .scrollContent)
            .padding(.horizontal, -16)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Taken by")
        }
    }

    private func name(of member: GroupMember) -> String {
        member.user.id == session.user?.id ? "You" : memoriesFirstName(member.user.displayName)
    }

    private func chip(
        _ title: String,
        color: MemberColor?,
        showsDot: Bool,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                if showsDot {
                    Circle()
                        .fill(MemberFill(color).background)
                        .frame(width: 16, height: 16)
                        .accessibilityHidden(true)
                }
                Text(title)
                    .lineLimit(1)
            }
        }
        .buttonStyle(ChipButtonStyle(isSelected: isSelected))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// Month and year pickers, from when the group began until now, and "Go".
private struct MemoriesMonthJump: View {
    let group: FriendGroup
    let from: MonthYear?
    let onJump: (MonthYear?) -> Void

    @State private var month: Int
    @State private var year: Int

    init(group: FriendGroup, from: MonthYear?, onJump: @escaping (MonthYear?) -> Void) {
        self.group = group
        self.from = from
        self.onJump = onJump
        let start = from ?? MonthYear.current
        _month = State(initialValue: start.month)
        _year = State(initialValue: start.year)
    }

    private var years: [Int] {
        let now = MonthYear.current.year
        let first = min(MonthYear(date: group.createdAt).year, now)
        return Array((first...now).reversed())
    }

    var body: some View {
        // On one line when it fits (it doesn't with very large text).
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                label
                controls
                Spacer(minLength: 0)
            }
            VStack(alignment: .leading, spacing: 8) {
                label
                HStack(spacing: 8) {
                    controls
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Jump to a month")
    }

    private var label: some View {
        Text("Jump to")
            .font(.subheadline)
            .foregroundStyle(.sub)
            .accessibilityHidden(true)
    }

    @ViewBuilder private var controls: some View {
        Menu {
            Picker("Month", selection: $month) {
                ForEach(1...12, id: \.self) { value in
                    Text(MonthYear.name(ofMonth: value)).tag(value)
                }
            }
        } label: {
            MemoriesMenuPill(text: MonthYear.name(ofMonth: month))
        }
        .accessibilityLabel("Month")
        .accessibilityValue(MonthYear.name(ofMonth: month))

        Menu {
            Picker("Year", selection: $year) {
                ForEach(years, id: \.self) { value in
                    Text(String(value)).tag(value)
                }
            }
        } label: {
            MemoriesMenuPill(text: String(year))
        }
        .accessibilityLabel("Year")
        .accessibilityValue(String(year))

        Button("Go") {
            Haptics.tap()
            let picked = MonthYear(year: year, month: month)
            // This month or later is just the latest photos.
            onJump(picked < MonthYear.current ? picked : nil)
        }
        .buttonStyle(ChipButtonStyle(isSelected: false))
        .accessibilityLabel("Go to \(MonthYear.name(ofMonth: month)) \(String(year))")
    }
}

/// A menu's current choice as a grey pill with a chevron.
private struct MemoriesMenuPill: View {
    let text: String

    var body: some View {
        HStack(spacing: 6) {
            Text(text)
                .lineLimit(1)
            Image(systemName: "chevron.down")
                .font(.system(size: 11, weight: .bold))
                .accessibilityHidden(true)
        }
        .font(.system(.subheadline, design: .rounded, weight: .medium))
        .foregroundStyle(.fg)
        .padding(.horizontal, 14)
        .frame(minHeight: 44)
        .background(.surface, in: Capsule())
        .contentShape(Capsule())
    }
}
