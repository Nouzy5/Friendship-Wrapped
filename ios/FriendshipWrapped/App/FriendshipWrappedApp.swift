import SwiftUI

@main
struct FriendshipWrappedApp: App {
    @State private var session = SessionStore()
    @State private var groups = GroupsStore()
    @State private var photos = PhotosStore()
    @State private var albums = AlbumsStore()
    @State private var wrapped = WrappedStore()
    @State private var account = AccountStore()
    @State private var settings = DeviceSettings.shared
    @State private var network = NetworkMonitor()
    @State private var router = AppRouter()

    init() {
        Theme.configureNavigationBars()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(groups)
                .environment(photos)
                .environment(albums)
                .environment(wrapped)
                .environment(account)
                .environment(settings)
                .environment(network)
                .environment(router)
                .onAppear { router.attach(groups: groups) }
        }
    }
}
