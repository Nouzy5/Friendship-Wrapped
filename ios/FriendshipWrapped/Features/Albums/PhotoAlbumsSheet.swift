import SwiftUI

/// Tick the group's albums this photo should be in, or start a new one with it (the photo
/// viewer's "Add to an album"; the web app's PhotoAlbumsDialog).
struct PhotoAlbumsSheet: View {
    let photo: Photo

    @Environment(AlbumsStore.self) private var albums
    @Environment(\.dismiss) private var dismiss

    /// The albums the photo is in; nil until loaded.
    @State private var memberOf: Set<String>?
    @State private var loadFailed = false
    /// Albums with a change on its way: one at a time each, so the last tap is what sticks.
    @State private var pending: Set<String> = []
    @State private var toggleError: String?
    @State private var newName = ""
    @State private var isCreating = false
    @State private var createError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .screenBackground()
            .navigationTitle("Albums")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
        .task { await load() }
    }

    @ViewBuilder private var content: some View {
        if let list = albums.albums(in: photo.groupId), let memberOf {
            if list.isEmpty {
                Text("No albums in this group yet. Start one with this photo:")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                SettingsGroup {
                    ForEach(Array(list.enumerated()), id: \.element.id) { index, album in
                        row(album, isMember: memberOf.contains(album.id))
                            .listItemTransition(index: index)
                    }
                }
                .motion(.fwEase, value: list.map(\.id))
            }

            if let toggleError {
                InlineAlert(message: toggleError)
            }

            newAlbumForm
        } else if loadFailed {
            EmptyStateView(emoji: "📡", title: "Couldn't load albums", message: "Check your connection.") {
                Button("Try again") {
                    loadFailed = false
                    Task { await load() }
                }
                .buttonStyle(.fwCompact(.primary))
            }
        } else {
            ListSkeleton(rows: 3)
        }
    }

    private func row(_ album: Album, isMember: Bool) -> some View {
        Button {
            Task { await toggle(album) }
        } label: {
            HStack(spacing: 14) {
                AlbumCover(album: album, compact: true)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                SettingsRowText(label: album.name, description: album.photoCountText)
                ChoiceCheck(isOn: isMember)
            }
            .settingsRow(trailingPadding: 16)
        }
        .buttonStyle(.settingsRow)
        .disabled(pending.contains(album.id))
        .accessibilityAddTraits(isMember ? [.isButton, .isSelected] : .isButton)
    }

    private var newAlbumForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            FWTextField(
                label: "New album with this photo",
                text: $newName,
                prompt: "New album…",
                error: createError,
                submitLabel: .done,
                onSubmit: { Task { await createAlbum() } }
            )
            .characterLimit(60, text: $newName)

            PrimaryButton(title: "Create album", pendingTitle: "Creating…", isPending: isCreating, variant: .secondary) {
                Task { await createAlbum() }
            }
            .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private func load() async {
        do {
            try await albums.loadAlbums(in: photo.groupId)
            let albumIDs = try await APIClient.shared.fetchAlbumIDs(forPhoto: photo.id)
            memberOf = Set(albumIDs)
            loadFailed = false
        } catch is CancellationError {
            return
        } catch {
            if memberOf == nil { loadFailed = true }
        }
    }

    /// The tick changes straight away; it goes back if the change doesn't go through.
    private func toggle(_ album: Album) async {
        guard let current = memberOf, !pending.contains(album.id) else { return }
        let adding = !current.contains(album.id)
        Haptics.tap()

        var next = current
        if adding {
            next.insert(album.id)
        } else {
            next.remove(album.id)
        }
        withMotion(.fwQuick) { memberOf = next }
        pending.insert(album.id)
        toggleError = nil

        do {
            if adding {
                try await albums.addPhotos([photo.id], to: album.id)
            } else {
                try await albums.removePhoto(photo.id, from: album.id)
            }
        } catch {
            // Only this album's tick goes back: others may have changed meanwhile.
            var reverted = memberOf ?? []
            if adding {
                reverted.remove(album.id)
            } else {
                reverted.insert(album.id)
            }
            withMotion(.fwQuick) { memberOf = reverted }
            let apiError = error.asAPIError
            toggleError = apiError.formMessage ?? apiError.message
        }
        pending.remove(album.id)
    }

    private func createAlbum() async {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !isCreating else { return }
        isCreating = true
        createError = nil
        toggleError = nil
        do {
            let album = try await albums.create(in: photo.groupId, name: name)
            newName = ""
            do {
                try await albums.addPhotos([photo.id], to: album.id)
                var next = memberOf ?? []
                next.insert(album.id)
                withMotion(.fwQuick) { memberOf = next }
                Haptics.success()
            } catch {
                // The album exists; the photo just isn't in it yet (its tick stays clear).
                let apiError = error.asAPIError
                toggleError = apiError.formMessage ?? apiError.message
            }
        } catch {
            let apiError = error.asAPIError
            createError = apiError.fieldErrors["name"] ?? apiError.formMessage ?? apiError.message
        }
        isCreating = false
    }
}
