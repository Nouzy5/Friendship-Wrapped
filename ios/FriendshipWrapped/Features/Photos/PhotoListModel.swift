import Foundation
import Observation

/// A list of photos loaded a page at a time from any paged endpoint: the timeline,
/// favorites, an album, the album photo picker.
@MainActor
@Observable
final class PhotoListModel {
    enum Phase: Equatable {
        case loading, loaded, failed
    }

    /// What's been loaded, minus photos deleted since (the store knows which), so a photo
    /// deleted from the viewer doesn't linger in the timeline, an album or favorites.
    var photos: [Photo] {
        guard let deleted = store?.deletedPhotoIDs, !deleted.isEmpty else { return loaded }
        return loaded.filter { !deleted.contains($0.id) }
    }

    private var loaded: [Photo] = []
    private(set) var nextCursor: String?
    private(set) var phase: Phase = .loading
    private(set) var isLoadingMore = false
    private(set) var loadMoreFailed = false

    /// Photos loaded here are shared with the store, so the viewer opens them instantly.
    @ObservationIgnored weak var store: PhotosStore?
    private let fetch: (String?) async throws -> PhotoPage

    /// `fetch` gets the cursor of the page to load (nil for the first page).
    init(fetch: @escaping (String?) async throws -> PhotoPage) {
        self.fetch = fetch
    }

    var hasMore: Bool { nextCursor != nil }

    /// Loads the first page again, replacing what was there.
    func reload() async {
        if loaded.isEmpty { phase = .loading }
        do {
            let page = try await fetch(nil)
            loaded = page.photos
            nextCursor = page.nextCursor
            phase = .loaded
            store?.remember(page.photos)
        } catch {
            // Keep showing what's already loaded when a refresh fails.
            if loaded.isEmpty { phase = .failed }
        }
    }

    func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        loadMoreFailed = false
        do {
            let page = try await fetch(cursor)
            let known = Set(loaded.map(\.id))
            loaded.append(contentsOf: page.photos.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
            store?.remember(page.photos)
        } catch {
            loadMoreFailed = true
        }
        isLoadingMore = false
    }
}
