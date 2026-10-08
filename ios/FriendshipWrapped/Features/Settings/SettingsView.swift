import SwiftUI

/// Settings (the web app's SettingsHomePage): you, the settings screens, your groups, help and
/// the app's status, and signing out. Opened from your avatar at the top of Home.
struct SettingsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var groups
    @Environment(AccountStore.self) private var account
    @Environment(DeviceSettings.self) private var settings
    @Environment(AppRouter.self) private var router
    @Environment(\.accentMemberColor) private var myColor

    @State private var reporting = false
    @State private var isSigningOut = false
    @State private var signOutError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let user = session.user {
                    profileCard(user)
                        .riseIn()
                }
                mainRows
                    .riseIn(delay: 0.04)
                groupsSection
                    .riseIn(delay: 0.08)
                helpSection
                    .riseIn(delay: 0.12)
                SystemStatusSection()
                    .riseIn(delay: 0.16)
                signOutSection
                    .riseIn(delay: 0.2)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.large)
        .task { await account.loadSettingsIfNeeded() }
        .task { await groups.loadGroupsIfNeeded() }
        .sheet(isPresented: $reporting) {
            ReportSheet()
        }
    }

    // MARK: - You

    private func profileCard(_ user: User) -> some View {
        HStack(spacing: 14) {
            PersonAvatar(name: user.displayName, imagePath: user.avatarUrl, color: myColor, size: .lg)
            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName)
                    .font(Theme.title(.title3))
                    .foregroundStyle(.fg)
                    .lineLimit(1)
                Text("@\(user.username)")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            NavigationLink(value: AppRoute.settings(.account)) {
                Text("Edit profile")
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(.fg)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .background(.bg, in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.95))
        }
        .padding(16)
        .background(.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    // MARK: - Settings screens

    private var notificationsValue: String? {
        account.settings.map { $0.notifications.enabled ? "On" : "Off" }
    }

    private var mainRows: some View {
        SettingsGroup {
            screenLink(.account, "Account", systemImage: "person")
            screenLink(.notifications, "Notifications", systemImage: "bell", value: notificationsValue)
            screenLink(.appearance, "Appearance", systemImage: "circle.lefthalf.filled", value: settings.values.theme.label)
            screenLink(.privacy, "Privacy & safety", systemImage: "hand.raised")
            screenLink(.photosAndData, "Photos & data", systemImage: "camera")
        }
    }

    private func screenLink(_ route: SettingsRoute, _ label: String, systemImage: String, value: String? = nil) -> some View {
        NavigationLink(value: AppRoute.settings(route)) {
            SettingsRowLabel(label, systemImage: systemImage, value: value)
        }
        .buttonStyle(.settingsRow)
    }

    // MARK: - Your groups

    private var groupsSection: some View {
        SettingsSection("Your groups") {
            SettingsGroup {
                ForEach(groups.groups) { group in
                    NavigationLink(value: AppRoute.groupSettings(group.id)) {
                        SettingsRowLabel(
                            label: group.name,
                            description: Format.memberCount(group.memberCount) + (group.muted ? ", muted" : "")
                        ) {
                            GroupBadge(group: group, size: 36)
                        }
                    }
                    .buttonStyle(.settingsRow)
                }

                Button {
                    // The shell presents the new group sheet.
                    router.showingNewGroup = true
                } label: {
                    SettingsRowLabel(label: "New group", showsChevron: false) {
                        Image(systemName: "plus")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.fg)
                            .frame(width: 36, height: 36)
                            .background(.bg, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                            .accessibilityHidden(true)
                    }
                }
                .buttonStyle(.settingsRow)
            }
            .motion(.fwEase, value: groups.groups.map(\.id))
        }
    }

    // MARK: - Help & about

    private var helpSection: some View {
        SettingsSection("Help & about") {
            SettingsGroup {
                SettingsButtonRow("Report a problem", systemImage: "questionmark.circle") {
                    reporting = true
                }
                NavigationLink(value: AppRoute.settings(.terms)) {
                    SettingsRowLabel("Terms and privacy policy", systemImage: "doc.text")
                }
                .buttonStyle(.settingsRow)
                SettingsValueRow("Version", systemImage: "info.circle", value: AppConfig.version)
            }
        }
    }

    // MARK: - Sign out

    private var signOutSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let signOutError {
                InlineAlert(message: signOutError)
            }
            SettingsGroup {
                SettingsButtonRow(
                    isSigningOut ? "Signing out…" : "Sign out",
                    systemImage: "rectangle.portrait.and.arrow.right",
                    strong: true
                ) {
                    Task { await signOut() }
                }
                .disabled(isSigningOut)
            }
        }
    }

    private func signOut() async {
        guard !isSigningOut else { return }
        isSigningOut = true
        signOutError = nil
        do {
            // Signed out: the app goes back to the welcome screen.
            try await session.logout()
        } catch {
            signOutError = error.asAPIError.message
        }
        isSigningOut = false
    }
}

/// Whether the app's server, database and photo storage are reachable (the web app's App
/// status card): folded away unless something's wrong.
struct SystemStatusSection: View {
    private struct Service {
        let status: ServiceStatus
        var detail: String?
    }

    @State private var report: HealthReport?
    @State private var failure: APIError?
    @State private var isChecking = false
    @State private var expanded = false

    var body: some View {
        SettingsGroup {
            Button {
                Haptics.tap()
                withMotion(.fwEase) { expanded.toggle() }
            } label: {
                HStack(spacing: 12) {
                    Text("App status")
                        .font(.system(.body, design: .rounded))
                        .foregroundStyle(.fg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(headline)
                        .foregroundStyle(.sub)
                        .lineLimit(1)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.sub)
                        .rotationEffect(.degrees(expanded ? 90 : 0))
                        .accessibilityHidden(true)
                }
                .settingsRow()
            }
            .buttonStyle(.settingsRow)
            .accessibilityHint(expanded ? "Hides the details" : "Shows the details")

            if expanded {
                serviceRow("API server", api)
                serviceRow("Database", database)
                serviceRow("Photo storage", storage)
                HStack(spacing: 12) {
                    Text(summary)
                        .font(.footnote)
                        .foregroundStyle(.sub)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(isChecking ? "Checking…" : "Recheck") {
                        Task { await check() }
                    }
                    .buttonStyle(.fwCompact(.ghost))
                    .disabled(isChecking)
                }
                .settingsRow(trailingPadding: 4)
            }
        }
        .task {
            // Once per visit to Settings: not again when coming back from a screen under it,
            // unless the last check never finished.
            guard report == nil, failure == nil, !isChecking else { return }
            await check()
        }
        .onChange(of: isChecking) { _, checking in
            // Opens by itself when a check finds something wrong (not when one was cancelled,
            // e.g. by opening a screen under Settings mid-check: that leaves no result).
            if !checking, report != nil || failure != nil, !allOK { withMotion(.fwEase) { expanded = true } }
        }
    }

    private var allOK: Bool {
        api.status == .ok && database.status == .ok && storage.status == .ok
    }

    private var headline: String {
        if isChecking { return "Checking…" }
        return allOK ? "Everything's working" : "Something's wrong"
    }

    // The API checks the database first, so when it reports storage down the database was fine.
    private var databaseDown: Bool { failure?.code == "DATABASE_UNAVAILABLE" }
    private var storageDown: Bool { failure?.code == "STORAGE_UNAVAILABLE" }

    private var api: Service {
        if let report { return Service(status: .ok, detail: "up \(Format.uptime(report.uptimeSeconds))") }
        guard let failure else { return Service(status: .checking) }
        // The API answered, but told us what's down.
        if databaseDown || storageDown { return Service(status: .ok) }
        return Service(status: .down, detail: failure.message)
    }

    private var database: Service {
        if let report { return Service(status: .ok, detail: "\(report.checks.database.latencyMs ?? 0) ms") }
        guard let failure else { return Service(status: .checking) }
        if databaseDown { return Service(status: .down, detail: failure.message) }
        if storageDown { return Service(status: .ok) }
        return Service(status: .unknown)
    }

    private var storage: Service {
        if let report {
            guard let storage = report.checks.storage else { return Service(status: .unknown) }
            return Service(status: .ok, detail: "\(storage.latencyMs ?? 0) ms")
        }
        guard let failure else { return Service(status: .checking) }
        if storageDown { return Service(status: .down, detail: failure.message) }
        return Service(status: .unknown)
    }

    private var summary: String {
        if isChecking { return "Running checks…" }
        if allOK { return "All systems connected." }
        return "Something isn't connected right now, so some features may not work."
    }

    private func serviceRow(_ title: String, _ service: Service) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .foregroundStyle(.fg)
                if let detail = service.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.sub)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            StatusIndicator(status: service.status)
        }
        .settingsRow(trailingPadding: 16)
        .accessibilityElement(children: .combine)
        .transition(.opacity)
    }

    private func check() async {
        isChecking = true
        do {
            report = try await APIClient.shared.fetchHealth()
            failure = nil
        } catch is CancellationError {
            // Leave the previous result in place.
        } catch {
            failure = error.asAPIError
            report = nil
        }
        isChecking = false
    }
}
