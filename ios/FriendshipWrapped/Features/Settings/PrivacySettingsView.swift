import SwiftUI

/// Settings → Privacy & safety (the web app's PrivacySettingsPage): what happens to your photos,
/// Wrapped, people you've blocked, invite links you've made, and reporting a problem.
struct PrivacySettingsView: View {
    @Environment(AccountStore.self) private var account

    @State private var reporting = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Only the people in a group can see what's posted to it. Nothing you post is public.")
                    .font(.callout)
                    .foregroundStyle(.sub)
                    .padding(.horizontal, 8)
                    .fixedSize(horizontal: false, vertical: true)
                    .riseIn()

                settingsContent
                    .riseIn(delay: 0.05)

                safetySection
                    .riseIn(delay: 0.1)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .navigationTitle("Privacy & safety")
        .navigationBarTitleDisplayMode(.large)
        .task { await account.loadSettingsIfNeeded() }
        // Fresh each time, so the counts are right after unblocking or turning off a link.
        .task { try? await account.loadBlocked() }
        .task { try? await account.loadInvites() }
        .refreshable { await account.loadSettings() }
        .sheet(isPresented: $reporting) {
            ReportSheet()
        }
    }

    @ViewBuilder private var settingsContent: some View {
        if let settings = account.settings {
            VStack(alignment: .leading, spacing: 24) {
                SettingsSection("Your photos") {
                    SettingsGroup {
                        SettingsValueRow(
                            "Location removed",
                            description: "Where a photo was taken is always stripped before it's stored."
                        )
                        SettingsToggleRow(
                            "Let friends save your photos",
                            description: "Shows a Save option on the photos you post",
                            isOn: Binding(
                                get: { settings.allowPhotoSaving },
                                set: { save(UserSettingsChange(allowPhotoSaving: $0)) }
                            )
                        )
                    }
                }
                SettingsSection("Wrapped") {
                    SettingsGroup {
                        SettingsToggleRow(
                            "Show my name in Wrapped",
                            description: "Off keeps your photos in the group's totals but leaves your name and colour off the slides",
                            isOn: Binding(
                                get: { settings.showInWrapped },
                                set: { save(UserSettingsChange(showInWrapped: $0)) }
                            )
                        )
                    }
                }
            }
        } else if account.settingsState == .failed {
            SettingsLoadError("Couldn't load your privacy settings. Check your connection.") {
                await account.loadSettings()
            }
        } else {
            ListSkeleton(rows: 3)
        }
    }

    private var blockedValue: String? {
        account.blocked.map { $0.isEmpty ? "None" : Format.number($0.count) }
    }

    private var invitesValue: String? {
        account.invites.map { $0.isEmpty ? "None" : "\(Format.number($0.count)) active" }
    }

    private var safetySection: some View {
        SettingsSection(
            "Safety",
            footnote: "Someone you block can't see your photos, comments or reactions, even in groups you share. You won't see theirs either."
        ) {
            SettingsGroup {
                NavigationLink(value: AppRoute.settings(.blocked)) {
                    SettingsRowLabel("Blocked people", value: blockedValue)
                }
                .buttonStyle(.settingsRow)
                NavigationLink(value: AppRoute.settings(.invites)) {
                    SettingsRowLabel("Invite links you've made", value: invitesValue)
                }
                .buttonStyle(.settingsRow)
                SettingsButtonRow("Report a problem") {
                    reporting = true
                }
            }
        }
    }

    private func save(_ change: UserSettingsChange) {
        Task {
            do {
                try await account.update(change)
            } catch {
                ToastCenter.shared.show("Couldn't save that setting.", isError: true)
            }
        }
    }
}
