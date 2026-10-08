import SwiftUI

/// Pick photos from the group (newest first) to add to an album (the web app's AlbumPhotoPicker).
/// Up to 100 at a time, the most the server takes in one go.
struct AlbumPhotoPicker: View {
    /// The most photos the server adds in one go.
    static let maxPerAdd = 100

    let album: Album
    /// Called after photos were added (the sheet has closed by then), e.g. to reload the album.
    let onAdded: () async -> Void

    @Environment(AlbumsStore.self) private var albums
    @Environment(PhotosStore.self) private var photos
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accent) private var accent

    @State private var model: PhotoListModel
    @State private var selected: Set<String> = []
    @State private var isAdding = false
    @State private var errorMessage: String?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 3)

    init(album: Album, onAdded: @escaping () async -> Void) {
        self.album = album
        self.onAdded = onAdded
        let groupID = album.groupId
        _model = State(initialValue: PhotoListModel { cursor in
            try await APIClient.shared.fetchGroupPhotos(groupID, cursor: cursor)
        })
    }

    private var addTitle: String {
        switch selected.count {
        case 0: return "Add"
        case 1: return "Add 1 photo"
        default: return "Add \(selected.count) photos"
        }
    }

    private var note: String {
        selected.count >= Self.maxPerAdd
            ? "You can add up to \(Self.maxPerAdd) photos at a time."
            : "Photos already in the album are skipped."
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    Text(note)
                        .font(.subheadline)
                        .foregroundStyle(.sub)
                        .fixedSize(horizontal: false, vertical: true)
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 16)
            }
            .screenBackground()
            .safeAreaInset(edge: .bottom, spacing: 0) {
                addBar
            }
            .navigationTitle("Add to \(album.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isAdding)
                }
            }
        }
        .interactiveDismissDisabled(isAdding)
        .task {
            model.store = photos
            await model.reload()
        }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading:
            GridSkeleton()
                .padding(.horizontal, -8)
        case .failed:
            VStack(alignment: .leading, spacing: 12) {
                Text("Couldn't load the group's photos.")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                Button("Try again") {
                    Task { await model.reload() }
                }
                .buttonStyle(.fwCompact(.secondary))
            }
            .padding(.vertical, 16)
        case .loaded:
            if model.photos.isEmpty {
                Text("This group has no photos yet.")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .padding(.vertical, 16)
            } else {
                LazyVGrid(columns: columns, spacing: 4) {
                    ForEach(model.photos) { photo in
                        selectableTile(photo)
                    }
                }
                .padding(.horizontal, -8)
                MemoriesLoadMore(model: model, label: "Load more photos")
            }
        }
    }

    private var addBar: some View {
        VStack(spacing: 10) {
            if let errorMessage {
                InlineAlert(message: errorMessage)
            }
            PrimaryButton(title: addTitle, pendingTitle: "Adding…", isPending: isAdding) {
                Task { await add() }
            }
            .disabled(selected.isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(.bg)
    }

    private func selectableTile(_ photo: Photo) -> some View {
        let isSelected = selected.contains(photo.id)
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)

        return Button {
            toggle(photo.id)
        } label: {
            PhotoTile(photo: photo)
                .overlay {
                    // Your choice, so your colour.
                    if isSelected {
                        shape
                            .fill(accent.background.opacity(0.25))
                            .overlay(shape.strokeBorder(accent.background, lineWidth: 4))
                    }
                }
                .overlay(alignment: .topTrailing) {
                    ZStack {
                        Circle()
                            .fill(isSelected ? accent.background : Color.black.opacity(0.3))
                        Circle()
                            .strokeBorder(isSelected ? accent.background : Color.white.opacity(0.85), lineWidth: 2)
                        if isSelected {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .heavy))
                                .foregroundStyle(accent.ink)
                                .popIn()
                        }
                    }
                    .frame(width: 24, height: 24)
                    .padding(6)
                    .accessibilityHidden(true)
                }
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.96))
        .accessibilityLabel(photo.altText)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private func toggle(_ photoID: String) {
        var next = selected
        if next.contains(photoID) {
            next.remove(photoID)
        } else if next.count < Self.maxPerAdd {
            next.insert(photoID)
        } else {
            return
        }
        Haptics.tap()
        withMotion(.fwQuick) { selected = next }
    }

    private func add() async {
        guard !selected.isEmpty, !isAdding else { return }
        isAdding = true
        errorMessage = nil
        do {
            try await albums.addPhotos(Array(selected), to: album.id)
            Haptics.success()
            dismiss()
            await onAdded()
        } catch {
            let apiError = error.asAPIError
            errorMessage = apiError.fieldErrors["photoIds"] ?? apiError.formMessage ?? apiError.message
            isAdding = false
        }
    }
}
