import SwiftUI

/// The group's shared albums, with a button to start a new one (Memories → Albums).
struct AlbumsSection: View {
    let groupID: String

    @Environment(AlbumsStore.self) private var albums
    @Environment(AppRouter.self) private var router
    @State private var loadFailed = false
    @State private var creating = false

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12), count: 2)

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let list = albums.albums(in: groupID) {
                if list.isEmpty {
                    EmptyStateView(
                        emoji: "📚",
                        title: "No albums yet",
                        message: "Gather a trip, a party or a whole summer into an album the whole group can add to."
                    ) {
                        newAlbumButton
                            .buttonStyle(.brand)
                            .frame(maxWidth: 240)
                    }
                } else {
                    HStack {
                        Spacer()
                        newAlbumButton
                            .buttonStyle(.bordered)
                    }
                    LazyVGrid(columns: columns, spacing: 18) {
                        ForEach(list) { album in
                            NavigationLink(value: AppRoute.album(album.id)) {
                                AlbumCard(album: album)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            } else if loadFailed {
                EmptyStateView(emoji: "📡", title: "Couldn't load albums") {
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
            }
        }
        .task { await load() }
        .sheet(isPresented: $creating) {
            AlbumNameSheet(title: "New album", submitTitle: "Create") { name in
                let album = try await albums.create(in: groupID, name: name)
                router.memoriesPath.append(.album(album.id))
            }
        }
    }

    private var newAlbumButton: some View {
        Button {
            creating = true
        } label: {
            Label("New album", systemImage: "plus")
        }
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
        VStack(alignment: .leading, spacing: 6) {
            AlbumCover(album: album)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(album.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(album.photoCountText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 2)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// The cover thumbnail, or an album icon for an empty album.
struct AlbumCover: View {
    let album: Album

    var body: some View {
        Color(.tertiarySystemFill)
            .overlay {
                if let cover = album.cover {
                    AuthenticatedImage(path: cover.thumbnailUrl) {
                        Color.clear
                    }
                } else {
                    Image(systemName: "rectangle.stack")
                        .font(.title)
                        .foregroundStyle(.secondary)
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }
}

/// One album: its photos oldest first, adding photos, and (for its creator or the group owner)
/// renaming and deleting it.
struct AlbumDetailView: View {
    let albumID: String

    @Environment(AlbumsStore.self) private var albums
    @Environment(PhotosStore.self) private var photos
    @Environment(\.dismiss) private var dismiss

    @State private var model: PhotoListModel
    @State private var failure: APIError?
    @State private var showingPicker = false
    @State private var renaming = false
    @State private var confirmingDelete = false
    @State private var isDeleting = false
    @State private var alertMessage: String?

    init(albumID: String) {
        self.albumID = albumID
        _model = State(initialValue: PhotoListModel { cursor in
            try await APIClient.shared.fetchAlbumPhotos(albumID, cursor: cursor)
        })
    }

    private var album: Album? {
        albums.album(albumID)
    }

    var body: some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if album?.canManage == true {
                        Menu {
                            Button("Rename", systemImage: "pencil") { renaming = true }
                            Button("Delete album", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                        } label: {
                            if isDeleting { ProgressView() } else { Image(systemName: "ellipsis.circle") }
                        }
                        .disabled(isDeleting)
                        .accessibilityLabel("Album options")
                    }
                }
            }
            .task { await load() }
            .sheet(isPresented: $showingPicker) {
                if let album {
                    AlbumPhotoPicker(album: album) {
                        await model.reload()
                    }
                }
            }
            .sheet(isPresented: $renaming) {
                AlbumNameSheet(title: "Rename album", submitTitle: "Save", initialName: album?.name ?? "") { name in
                    try await albums.rename(albumID, to: name)
                }
            }
            .confirmationDialog("Delete this album?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete album", role: .destructive) {
                    Task { await deleteAlbum() }
                }
            } message: {
                Text("The album goes for everyone in the group. Its photos stay in the group.")
            }
            .errorAlert("Something went wrong", message: $alertMessage)
    }

    @ViewBuilder private var content: some View {
        if let album {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(album.name)
                            .font(.largeTitle.weight(.black))
                        Text(subtitle(album))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    Button {
                        showingPicker = true
                    } label: {
                        Label("Add photos", systemImage: "plus")
                    }
                    .buttonStyle(.brand)
                    .frame(maxWidth: 220)

                    photoGrid
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .refreshable { await load() }
        } else if let failure {
            if failure.status == 404 || failure.status == 400 {
                EmptyStateView(
                    emoji: "🔍",
                    title: "Album not found",
                    message: "It may have been deleted, or it's in a group you're not part of."
                ) {
                    Button("Go back") { dismiss() }
                        .buttonStyle(.bordered)
                }
            } else {
                EmptyStateView(emoji: "📡", title: "Couldn't load this album") {
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.borderedProminent)
                }
            }
        } else {
            ProgressView()
        }
    }

    @ViewBuilder private var photoGrid: some View {
        switch model.phase {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
        case .failed:
            EmptyStateView(emoji: "📡", title: "Couldn't load the photos") {
                Button("Try again") { Task { await model.reload() } }
                    .buttonStyle(.borderedProminent)
            }
        case .loaded:
            if model.photos.isEmpty {
                EmptyStateView(
                    emoji: "🖼️",
                    title: "This album is empty",
                    message: "Add photos from the group. Anyone in the group can add to it."
                )
            } else {
                PhotoGrid(photos: model.photos)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                if model.hasMore {
                    LoadMoreRow(title: "Load more photos", isLoading: model.isLoadingMore, failed: model.loadMoreFailed) {
                        Task { await model.loadMore() }
                    }
                }
            }
        }
    }

    private func subtitle(_ album: Album) -> String {
        guard let creator = album.createdBy else { return album.photoCountText }
        return "\(album.photoCountText) · started by \(creator.displayName)"
    }

    private func load() async {
        model.store = photos
        do {
            try await albums.loadAlbum(albumID)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            failure = error.asAPIError
            return
        }
        await model.reload()
    }

    private func deleteAlbum() async {
        isDeleting = true
        do {
            try await albums.delete(albumID)
            // Close first so the album list updates underneath, not this screen.
            dismiss()
            albums.forget(albumID)
        } catch {
            alertMessage = error.asAPIError.message
            isDeleting = false
        }
    }
}

/// Asks for an album's name, to create or rename it. The server does the validation.
struct AlbumNameSheet: View {
    let title: String
    let submitTitle: String
    var initialName = ""
    /// Throws to keep the sheet open and show the error.
    let onSubmit: (String) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var isSaving = false
    @State private var failure: APIError?

    var body: some View {
        NavigationStack {
            Form {
                if let message = failure?.formMessage {
                    FormErrorSection(message: message)
                }
                Section {
                    TextField("Summer trip 2026", text: $name)
                        .characterLimit(60, text: $name)
                        .submitLabel(.done)
                        .onSubmit { Task { await save() } }
                } header: {
                    Text("Album name")
                } footer: {
                    FieldFooter(error: failure?.fieldErrors["name"])
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button(submitTitle) { Task { await save() } }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
        .presentationDetents([.medium])
        .onAppear { name = initialName }
    }

    private func save() async {
        guard !isSaving, !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSaving = true
        failure = nil
        do {
            try await onSubmit(name)
            dismiss()
        } catch {
            failure = error.asAPIError
            isSaving = false
        }
    }
}

/// Pick photos from the group (newest first) to add to an album.
struct AlbumPhotoPicker: View {
    let album: Album
    /// Called after photos were added, e.g. to reload the album.
    let onAdded: () async -> Void

    @Environment(AlbumsStore.self) private var albums
    @Environment(\.dismiss) private var dismiss
    @State private var model: PhotoListModel
    @State private var selected: Set<String> = []
    @State private var isAdding = false
    @State private var errorMessage: String?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 2), count: 3)

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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Photos already in the album are skipped.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }

                    switch model.phase {
                    case .loading:
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 32)
                    case .failed:
                        Text("Couldn't load the group's photos.")
                            .foregroundStyle(.secondary)
                    case .loaded:
                        if model.photos.isEmpty {
                            Text("This group has no photos yet.")
                                .foregroundStyle(.secondary)
                        } else {
                            LazyVGrid(columns: columns, spacing: 2) {
                                ForEach(model.photos) { photo in
                                    selectableThumbnail(photo)
                                }
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            if model.hasMore {
                                LoadMoreRow(title: "Load more photos", isLoading: model.isLoadingMore, failed: model.loadMoreFailed) {
                                    Task { await model.loadMore() }
                                }
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Add to \(album.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isAdding)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isAdding {
                        ProgressView()
                    } else {
                        Button(addTitle) { Task { await add() } }
                            .disabled(selected.isEmpty)
                    }
                }
            }
            .interactiveDismissDisabled(isAdding)
        }
        .task { await model.reload() }
    }

    private func selectableThumbnail(_ photo: Photo) -> some View {
        let isSelected = selected.contains(photo.id)

        return Button {
            if isSelected {
                selected.remove(photo.id)
            } else {
                selected.insert(photo.id)
            }
        } label: {
            PhotoThumbnail(photo: photo)
                .overlay {
                    if isSelected {
                        Rectangle()
                            .fill(Color.accentColor.opacity(0.25))
                            .overlay(Rectangle().strokeBorder(Color.accentColor, lineWidth: 4))
                    }
                }
                .overlay(alignment: .topTrailing) {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isSelected ? Color.accentColor : Color.white)
                        .shadow(radius: 2)
                        .padding(6)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(photo.altText)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func add() async {
        isAdding = true
        errorMessage = nil
        do {
            try await albums.addPhotos(Array(selected), to: album.id)
            await onAdded()
            dismiss()
        } catch {
            errorMessage = error.asAPIError.message
            isAdding = false
        }
    }
}

/// Tick the group's albums this photo should be in, or start a new one with it (from the photo viewer).
struct PhotoAlbumsSheet: View {
    let photo: Photo

    @Environment(AlbumsStore.self) private var albums
    @Environment(\.dismiss) private var dismiss
    @State private var memberOf: Set<String>?
    @State private var loadFailed = false
    @State private var pending: Set<String> = []
    @State private var newName = ""
    @State private var isCreating = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if let list = albums.albums(in: photo.groupId), let memberOf {
                    List {
                        if list.isEmpty {
                            Text("No albums in this group yet. Start one with this photo:")
                                .foregroundStyle(.secondary)
                        } else {
                            Section {
                                ForEach(list) { album in
                                    albumRow(album, isMember: memberOf.contains(album.id))
                                }
                            }
                        }

                        Section {
                            HStack {
                                TextField("New album…", text: $newName)
                                    .characterLimit(60, text: $newName)
                                    .submitLabel(.done)
                                    .onSubmit { Task { await createAlbum() } }
                                if isCreating {
                                    ProgressView()
                                } else {
                                    Button("Create") { Task { await createAlbum() } }
                                        .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
                                }
                            }
                        } header: {
                            Text("New album with this photo")
                        } footer: {
                            if let errorMessage {
                                Text(errorMessage).foregroundStyle(.red)
                            }
                        }
                    }
                } else if loadFailed {
                    EmptyStateView(emoji: "📡", title: "Couldn't load albums", message: "Check your connection.") {
                        Button("Try again") { Task { await load() } }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Albums")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private func albumRow(_ album: Album, isMember: Bool) -> some View {
        Button {
            Task { await toggle(album, isMember: isMember) }
        } label: {
            HStack(spacing: 12) {
                AlbumCover(album: album)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(album.name)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text(album.photoCountText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if pending.contains(album.id) {
                    ProgressView()
                } else {
                    Image(systemName: isMember ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isMember ? Color.accentColor : Color.secondary)
                }
            }
        }
        .disabled(pending.contains(album.id))
        .accessibilityAddTraits(isMember ? .isSelected : [])
    }

    private func load() async {
        loadFailed = false
        do {
            try await albums.loadAlbums(in: photo.groupId)
            let albumIDs = try await APIClient.shared.fetchAlbumIDs(forPhoto: photo.id)
            memberOf = Set(albumIDs)
        } catch is CancellationError {
            return
        } catch {
            loadFailed = true
        }
    }

    private func toggle(_ album: Album, isMember: Bool) async {
        pending.insert(album.id)
        errorMessage = nil
        do {
            if isMember {
                try await albums.removePhoto(photo.id, from: album.id)
                memberOf?.remove(album.id)
            } else {
                try await albums.addPhotos([photo.id], to: album.id)
                memberOf?.insert(album.id)
            }
        } catch {
            errorMessage = error.asAPIError.message
        }
        pending.remove(album.id)
    }

    private func createAlbum() async {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !isCreating else { return }
        isCreating = true
        errorMessage = nil
        do {
            let album = try await albums.create(in: photo.groupId, name: name)
            try await albums.addPhotos([photo.id], to: album.id)
            memberOf?.insert(album.id)
            newName = ""
        } catch {
            let apiError = error.asAPIError
            errorMessage = apiError.fieldErrors["name"] ?? apiError.formMessage ?? apiError.message
        }
        isCreating = false
    }
}
