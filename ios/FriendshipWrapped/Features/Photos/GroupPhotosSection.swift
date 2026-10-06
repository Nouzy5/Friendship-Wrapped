import SwiftUI

/// The group's newest photos, with a shortcut to post one here. GroupDetailView does the loading.
struct GroupPhotosSection: View {
    let groupID: String
    let loadFailed: Bool
    let onRetry: () -> Void

    @Environment(PhotosStore.self) private var photos
    @Environment(AppRouter.self) private var router

    var body: some View {
        Section {
            if let list = photos.photos(in: groupID) {
                if list.isEmpty {
                    EmptyStateView(
                        emoji: "📸",
                        title: "No photos yet",
                        message: "Be the first to share a moment with the group."
                    ) {
                        Button("Take a photo") { router.openCamera(groupID: groupID) }
                            .buttonStyle(.brand)
                            .frame(maxWidth: 240)
                    }
                } else {
                    PhotoGrid(photos: list)
                        .listRowInsets(EdgeInsets())
                }
            } else if loadFailed {
                EmptyStateView(
                    emoji: "📡",
                    title: "Couldn't load photos",
                    message: "Check your connection and try again."
                ) {
                    Button("Try again", action: onRetry)
                        .buttonStyle(.borderedProminent)
                }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            }
        } header: {
            HStack {
                Text("Photos")
                Spacer()
                Button {
                    router.openCamera(groupID: groupID)
                } label: {
                    Label("Add photo", systemImage: "camera")
                }
                .font(.caption.weight(.semibold))
                .textCase(nil)
            }
        }
    }
}

/// Square thumbnails, three across, each opening the photo. Plain buttons (rather than
/// NavigationLinks) so each thumbnail stays separately tappable inside one List row.
struct PhotoGrid: View {
    let photos: [Photo]

    @Environment(AppRouter.self) private var router

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 2), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 2) {
            ForEach(photos) { photo in
                Button {
                    router.homePath.append(.photo(photo.id))
                } label: {
                    Color(.tertiarySystemFill)
                        .aspectRatio(1, contentMode: .fit)
                        .overlay {
                            AuthenticatedImage(path: photo.imageUrls.thumbnail) {
                                Color.clear
                            }
                        }
                        .clipped()
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(photo.altText)
            }
        }
    }
}
