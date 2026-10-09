import SwiftUI

// Moments (the web app's features/moments): the list in Memories, a moment's card, the sheet that
// starts one, and Home's banner for the one happening now.

/// The group's moments as cards, with a button to start one (Memories → Moments).
/// The start sheet is the caller's (`onStart`), so it isn't inside a pull-to-refresh.
struct MomentsSection: View {
    let groupID: String
    let onStart: () -> Void

    @Environment(MomentsStore.self) private var moments
    @State private var loadFailed = false

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: 2)

    var body: some View {
        let list = moments.moments(in: groupID)

        VStack(alignment: .leading, spacing: 16) {
            if let list {
                if list.isEmpty {
                    EmptyStateView(
                        emoji: "✨",
                        title: "No moments yet",
                        message: "A moment is something you’re doing right now: a night out, a hike, a barbecue. Everyone can post into it while it lasts."
                    ) {
                        startButton
                    }
                } else {
                    HStack {
                        Spacer(minLength: 0)
                        startButton
                    }
                }
            } else if loadFailed {
                EmptyStateView(emoji: "📡", title: "Couldn’t load moments") {
                    Button("Try again") {
                        loadFailed = false
                        Task { await load() }
                    }
                    .buttonStyle(.fwCompact(.primary))
                }
            }

            ZStack(alignment: .top) {
                // Always there, so the cards rise in one after another.
                LazyVGrid(columns: columns, alignment: .leading, spacing: 20) {
                    ForEach(Array((list ?? []).enumerated()), id: \.element.id) { index, moment in
                        NavigationLink(value: AppRoute.moment(moment.id)) {
                            MomentCard(moment: moment)
                        }
                        .buttonStyle(PressScaleButtonStyle(scale: 0.97))
                        .listItemTransition(index: index)
                    }
                }
                if list == nil && !loadFailed {
                    MomentCardSkeleton()
                        .transition(.opacity)
                }
            }

            if list != nil && moments.hasMore(in: groupID) {
                LoadMoreRow(
                    title: "Load more moments",
                    isLoading: moments.isLoadingMore,
                    failed: moments.loadMoreFailed,
                    loadsWhenVisible: true
                ) {
                    Task { await moments.loadMore(in: groupID) }
                }
            }
        }
        .motion(.fwEase, value: list?.map(\.id))
        .motion(.fwEase, value: loadFailed)
        // Again each time it shows, for moments friends started meanwhile.
        .task { await load() }
    }

    private var startButton: some View {
        Button {
            Haptics.tap()
            onStart()
        } label: {
            Label("Start a moment", systemImage: "plus")
        }
        .buttonStyle(.fwCompact(.primary))
    }

    private func load() async {
        do {
            try await moments.loadMoments(in: groupID)
            loadFailed = false
        } catch is CancellationError {
            return
        } catch {
            loadFailed = true
        }
    }
}

/// A moment's newest photo, name and size, and whether it's still going.
struct MomentCard: View {
    let moment: Moment

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MomentCover(moment: moment)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(alignment: .topLeading) {
                    if moment.isStillOpen() {
                        Text("Happening now")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.black.opacity(0.65), in: Capsule())
                            .padding(10)
                    }
                }
            VStack(alignment: .leading, spacing: 2) {
                Text(moment.heading)
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .foregroundStyle(.fg)
                    .lineLimit(1)
                Text("\(moment.photoCountText) · \(moment.isStillOpen() ? moment.endText() : Format.relative(moment.startsAt))")
                    .font(.caption)
                    .foregroundStyle(.sub)
                    .lineLimit(1)
            }
            .padding(.horizontal, 4)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// The newest photo, or the moment's emoji for an empty one. Size it with a frame.
struct MomentCover: View {
    let moment: Moment

    var body: some View {
        Rectangle()
            .fill(.surface)
            .overlay {
                if let cover = moment.cover {
                    AuthenticatedImage(path: cover.thumbnailUrl) {
                        Color.clear
                    }
                } else {
                    Text(moment.emoji ?? "✨")
                        .font(.system(size: 48))
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }
}

/// Moment cards while the moments load.
private struct MomentCardSkeleton: View {
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: 2)

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 20) {
            ForEach(0..<4, id: \.self) { index in
                VStack(alignment: .leading, spacing: 8) {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(.surface)
                        .aspectRatio(1, contentMode: .fit)
                    Capsule()
                        .fill(.surface)
                        .frame(width: index.isMultiple(of: 2) ? 110 : 80, height: 14)
                        .padding(.horizontal, 4)
                    Capsule()
                        .fill(.surface)
                        .frame(width: 90, height: 11)
                        .padding(.horizontal, 4)
                }
            }
        }
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading moments")
    }
}

/// Asks what's happening and for how long, to start a moment the whole group can post into
/// (the web app's StartMomentDialog). The server does the validation; its message shows under the field.
struct StartMomentSheet: View {
    /// Throws to keep the sheet open and show the error. Gets the title, emoji and hours.
    let onSubmit: (String, String?, Int) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var emoji: String?
    @State private var hours = MomentDuration.defaultHours
    @State private var isSaving = false
    @State private var failure: APIError?
    @FocusState private var isFocused: Bool

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Start a moment")
                    .font(Theme.title(.title2))
                    .accessibilityAddTraits(.isHeader)

                Text("Friends are told, and for a while everyone can post into it. It closes by itself.")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .fixedSize(horizontal: false, vertical: true)

                if let message = failure?.formMessage {
                    InlineAlert(message: message)
                }

                FWTextField(
                    label: "What’s happening?",
                    text: $title,
                    prompt: "Friday at the lake",
                    error: failure?.fieldErrors["title"],
                    submitLabel: .done,
                    onSubmit: { Task { await save() } }
                )
                .characterLimit(60, text: $title)
                .focused($isFocused)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Emoji (optional)")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    HStack(spacing: 8) {
                        ForEach(MomentEmoji.choices, id: \.self) { choice in
                            Button {
                                Haptics.tap()
                                emoji = emoji == choice ? nil : choice
                            } label: {
                                Text(choice)
                                    .font(.system(size: 24))
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    .overlay {
                                        if emoji == choice {
                                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                .strokeBorder(Theme.fg, lineWidth: 2)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(choice)
                            .accessibilityAddTraits(emoji == choice ? [.isButton, .isSelected] : .isButton)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Open for")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    SegmentedPicker(options: MomentDuration.options, selection: $hours)
                        .accessibilityLabel("How long the moment stays open")
                }

                HStack(spacing: 10) {
                    Button("Cancel") { dismiss() }
                        .buttonStyle(.fwSecondary)
                        .disabled(isSaving)
                    PrimaryButton(title: "Start moment", pendingTitle: "Starting…", isPending: isSaving) {
                        Task { await save() }
                    }
                    .disabled(trimmedTitle.isEmpty)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 28)
            .padding(.bottom, 16)
        }
        .scrollBounceBehavior(.basedOnSize)
        .screenBackground()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isSaving)
        .onAppear { isFocused = true }
    }

    private func save() async {
        guard !isSaving, !trimmedTitle.isEmpty else { return }
        isSaving = true
        failure = nil
        do {
            try await onSubmit(trimmedTitle, emoji, hours)
            Haptics.success()
            dismiss()
        } catch {
            failure = error.asAPIError
            isSaving = false
        }
    }
}

/// Above Home's feed: the moment happening now, with a way to post into it, or a way to start
/// one. Nothing while the answer is loading, so the feed doesn't jump for a moment that isn't there.
struct OpenMomentCard: View {
    let group: FriendGroup

    @Environment(MomentsStore.self) private var moments
    @Environment(AppRouter.self) private var router
    @State private var starting = false

    var body: some View {
        Group {
            if let moment = moments.openMoment(in: group.id) {
                openCard(moment)
                    .transition(.opacity)
            } else if moments.hasLoadedOpen(in: group.id) {
                Button {
                    Haptics.tap()
                    starting = true
                } label: {
                    Label("Start a moment", systemImage: "sparkles")
                }
                .buttonStyle(.fwSecondary)
                .transition(.opacity)
            }
        }
        .motion(.fwEase, value: moments.openMoment(in: group.id)?.id)
        .motion(.fwEase, value: moments.hasLoadedOpen(in: group.id))
        .sheet(isPresented: $starting) {
            StartMomentSheet { title, emoji, hours in
                let started = try await moments.start(in: group.id, title: title, emoji: emoji, durationHours: hours)
                router.push(.moment(started.id))
            }
        }
        // Again each time Home shows and every minute after, so a moment that has run out goes away.
        .task(id: group.id) {
            while !Task.isCancelled {
                try? await moments.loadOpenMoment(in: group.id)
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }

    private func openCard(_ moment: Moment) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Text(moment.emoji ?? "✨")
                    .font(.system(size: 32))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Happening now")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(.sub)
                    Text(moment.title)
                        .font(Theme.title(.headline))
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(moment.photoCountText) · \(moment.endText())")
                        .font(.subheadline)
                        .foregroundStyle(.sub)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 8) {
                Button {
                    router.openCamera(groupID: group.id, momentID: moment.id)
                } label: {
                    Label("Add a photo", systemImage: "camera.fill")
                }
                .buttonStyle(.fwAccent)
                Button("See all") {
                    router.push(.moment(moment.id))
                }
                .buttonStyle(.fwSecondary)
            }
            .padding(.top, 16)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}
