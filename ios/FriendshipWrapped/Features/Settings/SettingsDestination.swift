import SwiftUI

/// The screen for each place under Settings (`AppRoute.settings`), on whichever tab's stack it
/// was pushed. Screens push each other with `NavigationLink(value: AppRoute.settings(.account))`.
struct SettingsDestination: View {
    let route: SettingsRoute

    var body: some View {
        switch route {
        case .home:
            SettingsView()
        case .account:
            AccountSettingsView()
        case .notifications:
            NotificationSettingsView()
        case .appearance:
            AppearanceSettingsView()
        case .privacy:
            PrivacySettingsView()
        case .blocked:
            BlockedPeopleView()
        case .invites:
            MyInviteLinksView()
        case .photosAndData:
            PhotoSettingsView()
        case .terms:
            TermsAndPrivacyView()
        }
    }
}
