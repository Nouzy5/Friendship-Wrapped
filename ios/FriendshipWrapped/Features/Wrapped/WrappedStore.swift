import Foundation
import Observation

/// The Wrapped you can open. Whether there are any decides if the Wrapped tab shows.
@MainActor
@Observable
final class WrappedStore {
    enum ListState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    /// Newest year first, then by group name.
    private(set) var list: [WrappedSummary] = []
    private(set) var listState: ListState = .idle

    /// Only the latest request's answer is used, so a slow older one can't overwrite it
    /// (and nothing lands after a sign-out).
    @ObservationIgnored private var latestRequest = 0

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    var hasAny: Bool { !list.isEmpty }

    func loadList() async {
        latestRequest += 1
        let request = latestRequest
        if list.isEmpty { listState = .loading }
        do {
            let fresh = try await api.fetchWrappedList()
            guard request == latestRequest else { return }
            list = fresh
            listState = .loaded
        } catch is CancellationError {
            if request == latestRequest, listState == .loading { listState = .idle }
        } catch {
            guard request == latestRequest else { return }
            // Keep showing what we had if a refresh fails.
            listState = list.isEmpty ? .failed(error.asAPIError.message) : .loaded
        }
    }

    /// Call when photos come or go, or you join or leave a group: the list changes with them,
    /// and so do this year's numbers.
    func setNeedsRefresh() {
        Task { await loadList() }
    }

    /// Drops everything, e.g. when someone signs out.
    func reset() {
        latestRequest += 1
        list = []
        listState = .idle
    }
}
