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
    /// On mobile data (Settings → Photos & data → "Upload on mobile data" can make posts wait for Wi-Fi).
    private(set) var isOnCellular = false

    @ObservationIgnored private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            let cellular = path.usesInterfaceType(.cellular)
            Task { @MainActor in
                self?.isOnline = online
                self?.isOnCellular = cellular
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
            .font(.system(.footnote, design: .rounded, weight: .semibold))
            .foregroundStyle(.onInverse)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(Color.inverse.ignoresSafeArea(edges: .top))
    }
}
