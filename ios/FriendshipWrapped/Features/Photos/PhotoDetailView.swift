import SwiftUI

/// One photo: the image, who posted it and when, and its caption. The uploader can delete it.
struct PhotoDetailView: View {
    let photoID: String

    @Environment(PhotosStore.self) private var photos
    @Environment(GroupsStore.self) private var groups
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    /// Kept so the screen doesn't blank out while it closes after a delete.
    @State private var lastShown: Photo?
    @State private var failure: APIError?
    @State private var confirmingDelete = false
    @State private var isDeleting = false
    @State private var alertMessage: String?

    private var photo: Photo? {
        photos.photo(photoID) ?? lastShown
    }

    private var groupName: String {
        photo?.group?.name ?? photo.flatMap { groups.group($0.groupId)?.name } ?? "the group"
    }

    var body: some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if photo?.canDelete == true {
                        Button {
                            confirmingDelete = true
                        } label: {
                            if isDeleting { ProgressView() } else { Image(systemName: "trash") }
                        }
                        .disabled(isDeleting)
                        .accessibilityLabel("Delete photo")
                    }
                }
            }
            .task { await load() }
            .confirmationDialog("Delete this photo?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete photo", role: .destructive) {
                    Task { await delete() }
                }
            } message: {
                Text("It will be removed for everyone in \(groupName). This can't be undone.")
            }
            .errorAlert("Couldn't delete photo", message: $alertMessage)
    }

    @ViewBuilder private var content: some View {
        if let photo {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Color(.tertiarySystemFill)
                        .aspectRatio(photo.aspectRatio, contentMode: .fit)
                        .overlay {
                            AuthenticatedImage(path: photo.imageUrls.medium, contentMode: .fit) {
                                ProgressView()
                            }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .accessibilityElement()
                        .accessibilityLabel(photo.altText)

                    HStack(spacing: 12) {
                        AvatarView(
                            name: photo.uploader.displayName,
                            seed: photo.uploader.id,
                            imagePath: photo.uploader.avatarUrl
                        )
                        VStack(alignment: .leading, spacing: 2) {
                            Text(photo.uploader.displayName)
                                .font(.headline)
                                .lineLimit(1)
                            Text(subtitle(for: photo))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    if let caption = photo.caption {
                        Text(caption)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                }
                .padding()
            }
        } else if let failure {
            if failure.status == 404 || failure.status == 400 {
                EmptyStateView(
                    emoji: "🔍",
                    title: "Photo not found",
                    message: "It may have been deleted, or it's in a group you're not part of."
                ) {
                    Button("Go home") { router.popToHome() }
                        .buttonStyle(.bordered)
                }
            } else {
                EmptyStateView(
                    emoji: "📡",
                    title: "Couldn't load this photo",
                    message: "Check your connection and try again."
                ) {
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.borderedProminent)
                }
            }
        } else {
            ProgressView()
        }
    }

    private func subtitle(for photo: Photo) -> String {
        let when = Format.dateTime(photo.createdAt)
        if let group = photo.group ?? groups.group(photo.groupId).map({ Photo.GroupInfo(id: $0.id, name: $0.name, emoji: $0.emoji) }) {
            return "\(when) · \(group.emoji) \(group.name)"
        }
        return when
    }

    private func load() async {
        do {
            lastShown = try await photos.loadPhoto(photoID)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            lastShown = nil
            failure = error.asAPIError
        }
    }

    private func delete() async {
        guard let photo else { return }
        isDeleting = true
        do {
            try await photos.delete(photo)
            lastShown = photo
            // Close first so the group's grid updates underneath, not this screen.
            dismiss()
            photos.forget(photo.id)
        } catch {
            alertMessage = error.asAPIError.message
            isDeleting = false
        }
    }
}
