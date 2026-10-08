import SwiftUI

/// One album (the web app's AlbumPage): its photos oldest first, adding photos, and (for its
/// creator or the group owner) renaming and deleting it, from the menu at the top.
struct AlbumDetailView: View {
    let albumID: String

    @Environment(AlbumsStore.self) private var albums
    @Environment(PhotosStore.self) private var photos
    @Environment(GroupsStore.self) private var groups
    @Environment(\.dismiss) private var dismiss

    @State private var model: PhotoListModel
    @State private var failure: APIError?
    @State private var showingPicker = false
    @State private var renaming = false
    @State private var confirmingDelete = false
    @State private var isDeleting = false
    @State private var alertMessage: String?
    /// The album's size when its photos were last loaded: coming back to it (say from the
    /// viewer, where a photo can leave the album) reloads them only if that changed.
    @State private var loadedPhotoCount: Int?
    /// Kept on screen while it closes after being deleted (the store has let it go by then).
    @State private var deletedAlbum: Album?

    init(albumID: String) {
        self.albumID = albumID
        _model = State(initialValue: PhotoListModel { cursor in
            try await APIClient.shared.fetchAlbumPhotos(albumID, cursor: cursor)
        })
    }

    private var album: Album? {
        albums.album(albumID) ?? deletedAlbum
    }

    var body: some View {
        content
            .navigationTitle(album?.name ?? "")
            .navigationBarTitleDisplayMode(.large)
            .toolbar(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    optionsMenu
                }
            }
            .task { await load(force: false) }
            // The sheets hang off the screen, not the refreshable scroll view, so they don't
            // inherit its pull to refresh.
            .sheet(isPresented: $showingPicker) {
                if let album {
                    AlbumPhotoPicker(album: album) {
                        await model.reload()
                        loadedPhotoCount = albums.album(albumID)?.photoCount
                    }
                }
            }
            .sheet(isPresented: $renaming) {
                AlbumNameSheet(title: "Rename album", submitTitle: "Save", initialName: album?.name ?? "") { name in
                    try await albums.rename(albumID, to: name)
                }
            }
            // No red: the button says what it does, and the alert asks first.
            .alert("Delete this album?", isPresented: $confirmingDelete) {
                Button("Delete album") {
                    Task { await deleteAlbum() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The album goes for everyone in the group. Its photos stay in the group.")
            }
            .errorAlert("Couldn't delete the album", message: $alertMessage)
    }

    @ViewBuilder private var optionsMenu: some View {
        if isDeleting {
            ProgressView()
        } else if let album {
            Menu {
                Button("Add photos", systemImage: "plus") {
                    showingPicker = true
                }
                if album.canManage {
                    Button("Rename album", systemImage: "pencil") {
                        renaming = true
                    }
                    Button("Delete album", systemImage: "trash") {
                        confirmingDelete = true
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 19, weight: .medium))
            }
            .accessibilityLabel("Album options")
        }
    }

    @ViewBuilder private var content: some View {
        if let album {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    Text(subtitle(album))
                        .font(.subheadline)
                        .foregroundStyle(.sub)
                        .fixedSize(horizontal: false, vertical: true)

                    Button {
                        Haptics.tap()
                        showingPicker = true
                    } label: {
                        Label("Add photos", systemImage: "plus")
                    }
                    .buttonStyle(.fwCompact(.primary))

                    photoSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 32)
            }
            .screenBackground()
            .refreshable { await load(force: true) }
        } else if let error = failure {
            ScrollView {
                if error.status == 404 || error.status == 400 {
                    EmptyStateView(
                        emoji: "🔍",
                        title: "Album not found",
                        message: "It may have been deleted, or it's in a group you're not part of."
                    ) {
                        Button("Back to Memories") { dismiss() }
                            .buttonStyle(.fwCompact(.primary))
                    }
                } else {
                    EmptyStateView(emoji: "📡", title: "Couldn't load this album") {
                        Button("Try again") {
                            failure = nil
                            Task { await load(force: true) }
                        }
                        .buttonStyle(.fwCompact(.primary))
                    }
                }
            }
            .screenBackground()
        } else {
            ScrollView {
                GridSkeleton()
                    .padding(.horizontal, 8)
                    .padding(.top, 8)
            }
            .screenBackground()
        }
    }

    @ViewBuilder private var photoSection: some View {
        if model.phase == .failed {
            EmptyStateView(emoji: "📡", title: "Couldn't load the photos") {
                Button("Try again") {
                    Task { await model.reload() }
                }
                .buttonStyle(.fwCompact(.primary))
            }
        } else if model.phase == .loaded && model.photos.isEmpty {
            EmptyStateView(
                emoji: "🖼️",
                title: "This album is empty",
                message: "Add photos from the group. Anyone in the group can add to it."
            )
        }
        MemoriesPhotoList(model: model, loadMoreLabel: "Load more photos")
    }

    private func subtitle(_ album: Album) -> String {
        guard let creator = album.createdBy else { return album.photoCountText }
        return "\(album.photoCountText) · started by \(creator.displayName)"
    }

    /// The album, then its photos: on first showing, when `force`d (pull to refresh, try again),
    /// or when its size changed since they loaded.
    private func load(force: Bool) async {
        model.store = photos
        var found: Album?
        do {
            found = try await albums.loadAlbum(albumID)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            failure = error.asAPIError
            // Offline, the album may still be cached; gone (404), the store has let it go.
            found = albums.album(albumID)
        }
        guard let latest = found else { return }

        let groupID = latest.groupId
        Task { await groups.loadMembersIfNeeded(of: groupID) }

        if force || model.phase != .loaded || loadedPhotoCount != latest.photoCount {
            loadedPhotoCount = latest.photoCount
            await model.reload()
        }
    }

    private func deleteAlbum() async {
        guard let current = album else { return }
        isDeleting = true
        do {
            try await albums.delete(albumID)
            deletedAlbum = current
            ToastCenter.shared.show("Album deleted")
            dismiss()
            // The album list underneath updates while this screen closes.
            albums.forget(albumID)
        } catch {
            alertMessage = error.asAPIError.message
            isDeleting = false
        }
    }
}
