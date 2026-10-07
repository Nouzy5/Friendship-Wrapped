import SwiftUI

@main
struct FriendshipWrappedApp: App {
    @State private var session = SessionStore()
    @State private var groups = GroupsStore()
    @State private var photos = PhotosStore()
    @State private var albums = AlbumsStore()
    @State private var wrapped = WrappedStore()
    @State private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(groups)
                .environment(photos)
                .environment(albums)
                .environment(wrapped)
                .environment(router)
        }
    }
}
