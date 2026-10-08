import SwiftUI

/// The group's shared albums as cards, with a button to start a new one (Memories → Albums).
/// The new-album sheet is the caller's (`onNewAlbum`), so it isn't inside a pull-to-refresh.
struct AlbumsSection: View {
    let groupID: String
    let onNewAlbum: () -> Void

    @Environment(AlbumsStore.self) private var albums
    @State private var loadFailed = false

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: 2)

    var body: some View {
        let list = albums.albums(in: groupID)

        VStack(alignment: .leading, spacing: 16) {
            if let list {
                if list.isEmpty {
                    EmptyStateView(
                        emoji: "📚",
                        title: "No albums yet",
                        message: "Gather a trip, a party or a whole summer into an album the whole group can add to."
                    ) {
                        newAlbumButton
                    }
                } else {
                    HStack {
                        Spacer(minLength: 0)
                        newAlbumButton
                    }
                }
            } else if loadFailed {
                EmptyStateView(emoji: "📡", title: "Couldn't load albums") {
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
                    ForEach(Array((list ?? []).enumerated()), id: \.element.id) { index, album in
                        NavigationLink(value: AppRoute.album(album.id)) {
                            AlbumCard(album: album)
                        }
                        .buttonStyle(PressScaleButtonStyle(scale: 0.97))
                        .listItemTransition(index: index)
                    }
                }
                if list == nil && !loadFailed {
                    AlbumCardSkeleton()
                        .transition(.opacity)
                }
            }
        }
        .motion(.fwEase, value: list?.map(\.id))
        .motion(.fwEase, value: loadFailed)
        // Again each time it shows, for albums friends started meanwhile.
        .task { await load() }
    }

    private var newAlbumButton: some View {
        Button {
            Haptics.tap()
            onNewAlbum()
        } label: {
            Label("New album", systemImage: "plus")
        }
        .buttonStyle(.fwCompact(.primary))
    }

    private func load() async {
        do {
            try await albums.loadAlbums(in: groupID)
            loadFailed = false
        } catch is CancellationError {
            return
        } catch {
            loadFailed = true
        }
    }
}

/// An album's cover (the photo added most recently), name and size.
struct AlbumCard: View {
    let album: Album

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            AlbumCover(album: album)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(album.name)
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .foregroundStyle(.fg)
                    .lineLimit(1)
                Text(album.photoCountText)
                    .font(.caption)
                    .foregroundStyle(.sub)
            }
            .padding(.horizontal, 4)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// The cover photo, or an album icon for an empty album. Size it with a frame.
struct AlbumCover: View {
    let album: Album
    /// A small icon, for the 40-point covers in lists.
    var compact = false

    var body: some View {
        Rectangle()
            .fill(.surface)
            .overlay {
                if let cover = album.cover {
                    AuthenticatedImage(path: cover.thumbnailUrl) {
                        Color.clear
                    }
                } else {
                    Image(systemName: "rectangle.stack")
                        .font(compact ? Font.body : Font.largeTitle)
                        .foregroundStyle(.sub)
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }
}

/// Album cards while the albums load.
private struct AlbumCardSkeleton: View {
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
                        .frame(width: 56, height: 11)
                        .padding(.horizontal, 4)
                }
            }
        }
        .modifier(SkeletonPulse())
        .accessibilityElement()
        .accessibilityLabel("Loading albums")
    }
}

/// Asks for an album's name, to create or rename it (the web app's AlbumNameDialog). The server
/// does the validation; its message shows under the field.
struct AlbumNameSheet: View {
    let title: String
    let submitTitle: String
    /// Throws to keep the sheet open and show the error.
    let onSubmit: (String) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var isSaving = false
    @State private var failure: APIError?
    @FocusState private var isFocused: Bool

    init(
        title: String,
        submitTitle: String,
        initialName: String = "",
        onSubmit: @escaping (String) async throws -> Void
    ) {
        self.title = title
        self.submitTitle = submitTitle
        self.onSubmit = onSubmit
        _name = State(initialValue: initialName)
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(title)
                    .font(Theme.title(.title2))
                    .accessibilityAddTraits(.isHeader)

                if let message = failure?.formMessage {
                    InlineAlert(message: message)
                }

                FWTextField(
                    label: "Album name",
                    text: $name,
                    prompt: "Summer trip 2026",
                    error: failure?.fieldErrors["name"],
                    submitLabel: .done,
                    onSubmit: { Task { await save() } }
                )
                .characterLimit(60, text: $name)
                .focused($isFocused)

                HStack(spacing: 10) {
                    Button("Cancel") { dismiss() }
                        .buttonStyle(.fwSecondary)
                        .disabled(isSaving)
                    PrimaryButton(title: submitTitle, pendingTitle: "Saving…", isPending: isSaving) {
                        Task { await save() }
                    }
                    .disabled(trimmedName.isEmpty)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 28)
            .padding(.bottom, 16)
        }
        .scrollBounceBehavior(.basedOnSize)
        .screenBackground()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isSaving)
        .onAppear { isFocused = true }
    }

    private func save() async {
        guard !isSaving, !trimmedName.isEmpty else { return }
        isSaving = true
        failure = nil
        do {
            try await onSubmit(trimmedName)
            Haptics.success()
            dismiss()
        } catch {
            failure = error.asAPIError
            isSaving = false
        }
    }
}
