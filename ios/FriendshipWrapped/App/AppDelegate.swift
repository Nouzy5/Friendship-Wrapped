import UIKit
import UserNotifications

/// SwiftUI has no hooks for Apple's push callbacks, so this small delegate hands them to the
/// `PushRegistrar` (and is attached in `FriendshipWrappedApp`).
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in
            PushRegistrar.shared.didRegister(deviceToken: deviceToken)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        let message = error.localizedDescription
        Task { @MainActor in
            PushRegistrar.shared.didFailToRegister(message: message)
        }
    }

    /// A notification that arrives while the app is open still shows as a banner.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    /// Tapping a notification opens the page it is about (`url` in its payload).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let path = response.notification.request.content.userInfo["url"] as? String else { return }
        await MainActor.run {
            PushRegistrar.shared.didTapNotification(path: path)
        }
    }
}
