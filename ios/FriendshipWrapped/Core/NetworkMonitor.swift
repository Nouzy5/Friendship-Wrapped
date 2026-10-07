import Foundation
import Network
import Observation
import SwiftUI

/// Whether the device has a network connection, for the offline banner and for posting to wait
/// until it's back (the web app's online/offline events).
@MainActor
@Observable
final class NetworkMonitor {
    private(set) var isOnline = true

    @ObservationIgnored private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in
                self?.isOnline = online
            }
        }
        monitor.start(queue: DispatchQueue(label: "FriendshipWrapped.NetworkMonitor"))
    }

    /// Returns once there's a connection: straight away if there already is, or when cancelled.
    func waitUntilOnline() async {
        while !isOnline, !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(500))
        }
    }
}

/// Shown along the top while the device is offline.
struct OfflineBanner: View {
    var body: some View {
        Label("You're offline. Some things can't load until you're back.", systemImage: "wifi.slash")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color.ink950)
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(Color.brandGold.ignoresSafeArea(edges: .top))
    }
}
