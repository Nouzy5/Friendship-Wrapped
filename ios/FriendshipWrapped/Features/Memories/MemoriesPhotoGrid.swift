import SwiftUI

// The photo grid and its paging, shared by the timeline, favorites and albums (the web app's
// PhotoGrid and LoadMore).

/// Square photos three across, 4 points apart and 8 points from the screen's edges (it reaches
/// 8 points past its container's 16-point margins), each with a dot in the poster's colour and
/// each opening the viewer. New photos rise in and removed ones fade out when the container
/// animates with `.motion(value:)` on the photos' ids.
struct MemoriesPhotoGrid: View {
    @Environment(GroupsStore.self) private var groups

    let photos: [Photo]

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                NavigationLink(value: AppRoute.photo(photo.id)) {
                    PhotoTile(
                        photo: photo,
                        color: groups.colorOf(photo.uploader.id, in: photo.groupId),
                        showsDot: true
                    )
                }
                .buttonStyle(PressScaleButtonStyle(scale: 0.96))
                .listItemTransition(index: index)
            }
        }
        .padding(.horizontal, -8)
    }
}

/// A paged list of photos as a grid: a skeleton while the first page loads, photos rising in as
/// they arrive, and the next page loading by itself as the end comes into view. Empty and error
/// states are the caller's (the grid is empty then).
struct MemoriesPhotoList: View {
    let model: PhotoListModel
    let loadMoreLabel: String
    var endMessage: String?

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .top) {
                // Always there, so the first page's photos rise in one after another.
                MemoriesPhotoGrid(photos: model.photos)
                if model.phase == .loading {
                    GridSkeleton()
                        .padding(.horizontal, -8)
                        .transition(.opacity)
                }
            }
            if model.phase == .loaded && !model.photos.isEmpty {
                MemoriesLoadMore(model: model, label: loadMoreLabel, endMessage: endMessage)
            }
        }
        .motion(.fwEase, value: model.photos.map(\.id))
        .motion(.fwEase, value: model.phase)
    }
}

/// The end of a paged list. The next page loads by itself as this scrolls into view (keep it in a
/// lazy stack); the button does the same for VoiceOver. After a failed page it waits for "Try
/// again" instead of retrying in a loop.
struct MemoriesLoadMore: View {
    let model: PhotoListModel
    /// e.g. "Load more photos".
    let label: String
    /// Shown once everything has loaded.
    var endMessage: String?

    var body: some View {
        if model.loadMoreFailed && !model.isLoadingMore {
            VStack(spacing: 12) {
                Text("Couldn't load more. Check your connection.")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .multilineTextAlignment(.center)
                Button("Try again") {
                    Task { await model.loadMore() }
                }
                .buttonStyle(.fwCompact(.secondary))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
        } else if model.hasMore {
            ZStack {
                if model.isLoadingMore {
                    ProgressView()
                } else {
                    Button(label) {
                        Task { await model.loadMore() }
                    }
                    .buttonStyle(.fwCompact(.ghost))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 80)
            .onAppear {
                Task { await model.loadMore() }
            }
            // A new page makes this a new view, so it loads the next one if it's still in view.
            .id(model.nextCursor)
        } else if let endMessage {
            Text(endMessage)
                .font(.subheadline)
                .foregroundStyle(.sub)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
        }
    }
}
