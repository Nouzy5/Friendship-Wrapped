import SwiftUI

/// Who reacted with what (the web app's ReactionBar). Each reaction anyone used is a pill with
/// the people behind it as dots in their colours; yours is outlined in your own colour and its
/// emoji bounces when it becomes yours. Tap a pill to join it (or leave yours), or the smiley to
/// pick another. Long-press a pill to see who reacted. Without access to the group (you posted
/// this, then left) it's read-only, except that you can still take back your own reaction.
struct ReactionBar: View {
    let photo: Photo

    @Environment(PhotosStore.self) private var photos
    @Environment(GroupsStore.self) private var groups
    @Environment(SessionStore.self) private var session
    @Environment(\.accent) private var accent

    @State private var pickerOpen = false
    @State private var showingWho = false
    /// Bumped each time a reaction becomes yours, so its emoji bounces then (and not when it stops
    /// being yours).
    @State private var bounces: [ReactionType: Int] = [:]

    init(photo: Photo) {
        self.photo = photo
    }

    /// One pill: a reaction and everyone who used it.
    private struct Entry: Identifiable {
        let type: ReactionType
        let people: [PersonDots.Person]
        /// For VoiceOver: "you" for yourself.
        let names: [String]
        let count: Int

        var id: ReactionType { type }

        var accessibilityLabel: String {
            names.isEmpty ? "\(type.label), \(count)" : "\(type.label), from \(Format.list(names))"
        }
    }

    private var entries: [Entry] {
        let me = session.user
        let membersLoaded = groups.members(of: photo.groupId) != nil
        let reactors = photo.reactions.reactors

        return ReactionType.allCases.compactMap { type -> Entry? in
            var people: [PersonDots.Person] = []
            var names: [String] = []
            for userID in photo.reactions.people(type) {
                let isMe = userID == me?.id
                let name: String
                if isMe {
                    name = me?.displayName ?? "You"
                } else if let member = groups.member(userID, in: photo.groupId) {
                    name = member.user.displayName
                } else if userID == photo.uploader.id {
                    name = photo.uploader.displayName
                } else {
                    name = membersLoaded ? "someone who left" : "someone"
                }
                people.append(PersonDots.Person(id: userID, name: name, color: groups.colorOf(userID, in: photo.groupId)))
                names.append(isMe ? "you" : name)
            }
            // An older server sends only the counts: show the number instead of dots.
            let count = reactors.isEmpty ? photo.reactions.count(type) : people.count
            guard count > 0 else { return nil }
            return Entry(type: type, people: people, names: names, count: count)
        }
    }

    var body: some View {
        let layout = ReactionFlowLayout(spacing: 6)

        layout {
            ForEach(entries) { entry in
                pill(entry)
            }
            reactButton
        }
        .motion(.fwPop, value: photo.reactions.reactors)
        .motion(.fwPop, value: photo.reactions.mine)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Reactions")
        .task(id: photo.groupId) { await groups.loadMembersIfNeeded(of: photo.groupId) }
        .sheet(isPresented: $showingWho) {
            ReactionsSheet(photoID: photo.id, groupID: photo.groupId)
        }
    }

    private func pill(_ entry: Entry) -> some View {
        let selected = photo.reactions.mine == entry.type
        let enabled = photo.canInteract || selected
        let hint: String
        if selected {
            hint = "Takes your reaction back"
        } else if photo.canInteract {
            hint = "Reacts with \(entry.type.label) too"
        } else {
            hint = ""
        }

        return Button {
            choose(selected ? nil : entry.type)
        } label: {
            HStack(spacing: 6) {
                Text(entry.type.emoji)
                    .font(.system(size: 18))
                    .bounceOnce(trigger: bounces[entry.type] ?? 0)
                if entry.people.isEmpty {
                    Text(Format.number(entry.count))
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .monospacedDigit()
                } else {
                    PersonDots(people: entry.people, size: 22, maxShown: 4, ring: selected ? Theme.bg : Theme.surface)
                }
            }
            .foregroundStyle(.fg)
            .padding(.leading, 9)
            .padding(.trailing, 10)
            .frame(minHeight: 44)
            .background(selected ? Theme.bg : Theme.surface, in: Capsule())
            .overlay {
                // Yours: a ring in your colour, inside the pill.
                Capsule()
                    .strokeBorder(accent.background, lineWidth: 2)
                    .opacity(selected ? 1 : 0)
            }
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.9))
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
        .contentShape(.contextMenuPreview, Capsule())
        .contextMenu {
            Button("See who reacted", systemImage: "person.2") { showingWho = true }
        }
        .popIn()
        .transition(.asymmetric(insertion: .identity, removal: .scale(scale: 0.6).combined(with: .opacity)))
        .accessibilityLabel(entry.accessibilityLabel)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityHint(hint)
        .accessibilityAction(named: "See who reacted") { showingWho = true }
    }

    /// The smiley: picks a reaction, or changes yours.
    private var reactButton: some View {
        let mine = photo.reactions.mine

        return Button {
            Haptics.tap()
            pickerOpen = true
        } label: {
            Image(systemName: "face.smiling")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(.fg)
                .frame(width: 44, height: 44)
                .background(.surface, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.9))
        .disabled(!photo.canInteract)
        .opacity(photo.canInteract ? 1 : 0.4)
        .accessibilityLabel(mine == nil ? "React" : "Change your reaction")
        .popover(isPresented: $pickerOpen) {
            ReactionPicker(mine: mine) { type in
                pickerOpen = false
                choose(mine == type ? nil : type)
            }
            .presentationCompactAdaptation(.popover)
            .presentationBackground(.raised)
        }
    }

    /// Shows straight away; the store sends taps in order and rolls back if it can't be saved.
    private func choose(_ type: ReactionType?) {
        guard let myID = session.user?.id else { return }
        Haptics.tap()
        if let type { bounces[type, default: 0] += 1 }
        let photoID = photo.id
        Task {
            do {
                try await photos.react(to: photoID, with: type, myID: myID)
            } catch is CancellationError {
                // Nothing to say.
            } catch {
                ToastCenter.shared.show("Couldn't save your reaction.", isError: true)
            }
        }
    }
}

/// The five reactions in a small popover over the smiley; they pop in one after another, and
/// yours is filled in your colour.
private struct ReactionPicker: View {
    let mine: ReactionType?
    let onPick: (ReactionType) -> Void

    @Environment(\.accent) private var accent

    init(mine: ReactionType?, onPick: @escaping (ReactionType) -> Void) {
        self.mine = mine
        self.onPick = onPick
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(ReactionType.allCases.enumerated()), id: \.element.id) { index, type in
                let isMine = mine == type
                Button {
                    onPick(type)
                } label: {
                    Text(type.emoji)
                        .font(.system(size: 26))
                        .frame(width: 48, height: 48)
                        .background {
                            if isMine { Circle().fill(accent.background) }
                        }
                        .contentShape(Circle())
                }
                .buttonStyle(PressScaleButtonStyle(scale: 0.8))
                .accessibilityLabel(type.label)
                .accessibilityAddTraits(isMine ? [.isButton, .isSelected] : .isButton)
                .popIn(delay: 0.04 + Double(index) * 0.03)
            }
        }
        .padding(6)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Reactions")
    }
}

/// Lays its children out in rows, left to right, starting a new row when one is full (the
/// reaction pills wrap like the web app's flex-wrap). Children keep their own size and are
/// centred in their row.
private struct ReactionFlowLayout: Layout {
    var spacing: CGFloat

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews, maxWidth: proposal.width ?? .infinity)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrange(subviews, maxWidth: bounds.width)
        var y = bounds.minY
        for row in rows {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(
                    at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(size)
                )
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private func arrange(_ subviews: Subviews, maxWidth: CGFloat) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if !current.indices.isEmpty, current.width + spacing + size.width > maxWidth {
                rows.append(current)
                current = Row()
            }
            current.width = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            current.height = max(current.height, size.height)
            current.indices.append(index)
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}

/// Who reacted to a photo, and with what (the web app's ReactionsDialog), each person in their colour.
struct ReactionsSheet: View {
    let photoID: String
    let groupID: String

    @Environment(GroupsStore.self) private var groups
    @Environment(\.dismiss) private var dismiss
    @State private var entries: [ReactionEntry]?
    @State private var failed = false

    init(photoID: String, groupID: String) {
        self.photoID = photoID
        self.groupID = groupID
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                content
                    .padding(16)
            }
            .screenBackground()
            .navigationTitle("Reactions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task { await load() }
        .task { await groups.loadMembersIfNeeded(of: groupID) }
    }

    @ViewBuilder private var content: some View {
        if let entries {
            if entries.isEmpty {
                Text("No reactions yet.")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                SettingsGroup {
                    ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                        row(entry)
                            .riseIn(delay: Double(min(index, 8)) * 0.03)
                    }
                }
            }
        } else if failed {
            VStack(alignment: .leading, spacing: 12) {
                Text("Couldn't load reactions. Check your connection.")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                Button("Try again") {
                    Task { await load() }
                }
                .buttonStyle(.fwCompact(.secondary))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
        }
    }

    private func row(_ entry: ReactionEntry) -> some View {
        HStack(spacing: 12) {
            PersonAvatar(
                name: entry.user.displayName,
                imagePath: entry.user.avatarUrl,
                color: groups.colorOf(entry.user.id, in: groupID),
                size: .sm
            )
            Text(entry.user.displayName)
                .fontWeight(.medium)
                .foregroundStyle(.fg)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(entry.type.emoji)
                .font(.title3)
        }
        .settingsRow(trailingPadding: 16)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(entry.user.displayName), \(entry.type.label)")
    }

    private func load() async {
        failed = false
        do {
            entries = try await APIClient.shared.fetchReactions(onPhoto: photoID)
        } catch is CancellationError {
            // Closed.
        } catch {
            if entries == nil { failed = true }
        }
    }
}

/// The star (the web app's FavoriteButton). Favorites are private to you; a saved one is filled
/// in your colour and springs when you save it.
struct FavoriteButton: View {
    let photo: Photo

    @Environment(PhotosStore.self) private var photos
    @Environment(\.accent) private var accent
    /// Bumped on each save, so the star springs then (not when it's taken off).
    @State private var saves = 0

    init(photo: Photo) {
        self.photo = photo
    }

    var body: some View {
        Button(action: toggle) {
            ZStack {
                if photo.isFavorite {
                    Image(systemName: "star.fill")
                        .foregroundStyle(accent.background)
                        .transition(.opacity)
                }
                Image(systemName: "star")
                    .foregroundStyle(.fg)
            }
            .font(.system(size: 21, weight: .medium))
            .bounceOnce(trigger: saves)
            .frame(width: 44, height: 44)
            .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.9))
        .motion(.fwQuick, value: photo.isFavorite)
        .accessibilityLabel("Favorite")
        .accessibilityAddTraits(photo.isFavorite ? .isSelected : [])
        .accessibilityHint(photo.isFavorite ? "Takes it out of your favorites" : "Only you can see your favorites")
    }

    private func toggle() {
        let next = !photo.isFavorite
        Haptics.tap()
        if next { saves += 1 }
        let photoID = photo.id
        Task {
            do {
                try await photos.setFavorite(next, photoID: photoID)
            } catch is CancellationError {
                // Nothing to say.
            } catch {
                ToastCenter.shared.show("Couldn't update your favorites.", isError: true)
            }
        }
    }
}
