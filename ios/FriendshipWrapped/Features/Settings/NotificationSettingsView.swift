import SwiftUI
import UIKit

/// Settings → Notifications (the web app's NotificationSettingsPage). The choices are kept with
/// your account and decide what the server sends to every device you've turned notifications on
/// for, this iPhone included. Switches flip at once and flip back if saving fails.
struct NotificationSettingsView: View {
    @Environment(AccountStore.self) private var account
    @Environment(GroupsStore.self) private var groups

    /// Each group's mute while it saves (the switch flips at once), and the latest change sent.
    @State private var pendingMutes: [String: Bool] = [:]
    @State private var muteRequests: [String: Int] = [:]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ThisPhoneNotifications()
                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.large)
        .task { await account.loadSettingsIfNeeded() }
        .task { await groups.loadGroupsIfNeeded() }
        .refreshable { await account.loadSettings() }
    }

    @ViewBuilder private var content: some View {
        if let settings = account.settings {
            loaded(settings.notifications)
        } else if account.settingsState == .failed {
            SettingsLoadError("Couldn't load your notification settings. Check your connection and try again.") {
                await account.loadSettings()
            }
        } else {
            ListSkeleton(rows: 6)
        }
    }

    @ViewBuilder
    private func loaded(_ notifications: NotificationSettings) -> some View {
        let off = !notifications.enabled

        SettingsGroup {
            SettingsToggleRow(
                "Allow notifications",
                description: "Turn this off to pause everything at once.",
                isOn: toggle(notifications.enabled) { UserSettingsChange.NotificationChange(enabled: $0) }
            )
        }
        .riseIn()

        VStack(alignment: .leading, spacing: 24) {
            SettingsSection("From your groups") {
                SettingsGroup {
                    SettingsToggleRow(
                        "New photos",
                        description: "When a friend posts",
                        isOn: toggle(notifications.photos) { UserSettingsChange.NotificationChange(photos: $0) }
                    )
                    SettingsToggleRow(
                        "Reactions",
                        description: "When someone reacts to your photo",
                        isOn: toggle(notifications.reactions) { UserSettingsChange.NotificationChange(reactions: $0) }
                    )
                    SettingsToggleRow(
                        "Comments",
                        description: "On your photos, and on ones you've commented on",
                        isOn: toggle(notifications.comments) { UserSettingsChange.NotificationChange(comments: $0) }
                    )
                    SettingsToggleRow(
                        "New members",
                        description: "When someone joins one of your groups",
                        isOn: toggle(notifications.members) { UserSettingsChange.NotificationChange(members: $0) }
                    )
                    SettingsToggleRow(
                        "Moments",
                        description: "When someone starts a moment in one of your groups",
                        isOn: toggle(notifications.moments) { UserSettingsChange.NotificationChange(moments: $0) }
                    )
                }
            }
            .riseIn(delay: 0.04)

            SettingsSection("Memories") {
                SettingsGroup {
                    SettingsToggleRow(
                        "On this day",
                        description: "In the morning, when there are photos from this date",
                        isOn: toggle(notifications.onThisDay) { UserSettingsChange.NotificationChange(onThisDay: $0) }
                    )
                    SettingsToggleRow(
                        "Wrapped is ready",
                        description: "Once a year, when your group's Wrapped is out",
                        isOn: toggle(notifications.wrapped) { UserSettingsChange.NotificationChange(wrapped: $0) }
                    )
                }
            }
            .riseIn(delay: 0.08)

            SettingsSection(
                "Reminders",
                footnote: "Never more than one every two weeks, and never about anyone else: it only says it has been a while since you posted."
            ) {
                SettingsGroup {
                    SettingsToggleRow(
                        "Gentle reminders",
                        description: "In the early evening, when you haven't posted for a while",
                        isOn: toggle(notifications.nudges) { UserSettingsChange.NotificationChange(nudges: $0) }
                    )
                }
            }
            .riseIn(delay: 0.1)

            quietHoursSection(notifications.quietHours)
                .riseIn(delay: 0.12)

            if !groups.groups.isEmpty {
                SettingsSection(
                    "Each group",
                    footnote: "A muted group still shows new photos in the app. It just doesn't notify you."
                ) {
                    SettingsGroup {
                        ForEach(groups.groups) { group in
                            groupRow(group)
                        }
                    }
                }
                .riseIn(delay: 0.16)
            }
        }
        // With everything paused, the rest stays as it was but can't be changed.
        .disabled(off)
        .motion(.fwQuick, value: off)
    }

    // MARK: - Quiet hours

    private func quietHoursSection(_ quiet: QuietHours) -> some View {
        SettingsSection("Quiet hours", footnote: "Anything that comes in during quiet hours waits until they end.") {
            SettingsGroup {
                SettingsToggleRow(
                    "Quiet hours",
                    description: "Notifications wait until the morning",
                    isOn: Binding(
                        get: { quiet.enabled },
                        set: { enabled in
                            save(UserSettingsChange(notifications: UserSettingsChange.NotificationChange(
                                quietHours: UserSettingsChange.QuietHoursChange(enabled: enabled)
                            )))
                        }
                    )
                )
                if quiet.enabled {
                    timeRow("From", accessibilityLabel: "Quiet hours start", value: quiet.start) { start in
                        UserSettingsChange.QuietHoursChange(start: start)
                    }
                    timeRow("Until", accessibilityLabel: "Quiet hours end", value: quiet.end) { end in
                        UserSettingsChange.QuietHoursChange(end: end)
                    }
                }
            }
            .motion(.fwEase, value: quiet.enabled)
        }
    }

    private func timeRow(
        _ label: String,
        accessibilityLabel: String,
        value: String,
        change: @escaping (String) -> UserSettingsChange.QuietHoursChange
    ) -> some View {
        SettingsValueRow(
            label: label,
            leading: { EmptyView() },
            trailing: {
                DatePicker(
                    accessibilityLabel,
                    selection: Binding(
                        get: { QuietHoursClock.date(from: value) },
                        set: { date in
                            let text = QuietHoursClock.text(from: date)
                            guard text != value else { return }
                            save(UserSettingsChange(notifications: UserSettingsChange.NotificationChange(quietHours: change(text))))
                        }
                    ),
                    displayedComponents: .hourAndMinute
                )
                .labelsHidden()
            }
        )
        .transition(.opacity)
    }

    // MARK: - Each group

    private func groupRow(_ group: FriendGroup) -> some View {
        let muted = pendingMutes[group.id] ?? group.muted
        return HStack(spacing: 12) {
            GroupBadge(group: group, size: 32)
            Toggle(isOn: Binding(get: { !muted }, set: { on in setMuted(group, muted: !on) })) {
                SettingsRowText(label: group.name, description: muted ? "Muted" : "Everything")
            }
            .toggleStyle(.fw)
        }
        .settingsRow(trailingPadding: 8)
    }

    private func setMuted(_ group: FriendGroup, muted: Bool) {
        let sent = (muteRequests[group.id] ?? 0) + 1
        muteRequests[group.id] = sent
        pendingMutes[group.id] = muted
        Task {
            do {
                try await groups.updateMyMembership(in: group.id, muted: muted)
            } catch {
                ToastCenter.shared.show("Couldn't change that group's notifications.", isError: true)
            }
            if muteRequests[group.id] == sent { pendingMutes[group.id] = nil }
        }
    }

    // MARK: - Saving

    private func toggle(_ value: Bool, _ change: @escaping (Bool) -> UserSettingsChange.NotificationChange) -> Binding<Bool> {
        Binding(
            get: { value },
            set: { newValue in save(UserSettingsChange(notifications: change(newValue))) }
        )
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

/// "Notifications on this iPhone": whether this phone gets them at all. iOS asks its own
/// permission the first time; once refused, only iOS Settings can change it.
private struct ThisPhoneNotifications: View {
    @State private var push = PushRegistrar.shared
    @State private var isChanging = false

    var body: some View {
        SettingsSection("This iPhone", footnote: footnote) {
            SettingsGroup {
                if push.serverCanPush == false {
                    SettingsValueRow(
                        "Notifications on this iPhone",
                        description: "This server isn't set up to send them to iPhones yet",
                        systemImage: "bell.slash"
                    )
                } else {
                    SettingsToggleRow(
                        "Notifications on this iPhone",
                        description: description,
                        isOn: Binding(get: { push.isOn }, set: { on in change(to: on) })
                    )
                    .disabled(isChanging || push.permission == .unknown)

                    if push.permission == .denied {
                        SettingsButtonRow("Open iOS Settings", description: "Allow notifications for Friendship Wrapped", systemImage: "gearshape") {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                        }
                    }
                }
            }
        }
        .task { await push.refreshStatus() }
        .riseIn()
    }

    private var description: String {
        switch push.permission {
        case .denied: return "Turned off for this app in iOS Settings"
        case .allowed where push.isOn && push.isRegistered: return "On"
        case .allowed where push.isOn: return "Setting up…"
        default: return "Off"
        }
    }

    private var footnote: String? {
        if let failure = push.failure, push.isOn {
            return "This build can't receive notifications: \(failure)"
        }
        return "Which ones you get is up to the switches below, and they follow you to every device."
    }

    private func change(to on: Bool) {
        guard !isChanging else { return }
        isChanging = true
        Task {
            if on {
                if await push.turnOn() == .denied, push.permission == .denied {
                    ToastCenter.shared.show("Turn notifications on for Friendship Wrapped in iOS Settings.", isError: true)
                }
            } else {
                await push.turnOff()
            }
            isChanging = false
        }
    }
}

/// Quiet hours are "HH:MM" (24-hour, in your time zone) on the server; the time pickers want dates.
private enum QuietHoursClock {
    static func date(from text: String) -> Date {
        let parts = text.split(separator: ":").compactMap { Int($0) }
        let calendar = Calendar.current
        var components = calendar.dateComponents([.year, .month, .day], from: Date())
        components.hour = parts.count > 0 ? min(max(parts[0], 0), 23) : 22
        components.minute = parts.count > 1 ? min(max(parts[1], 0), 59) : 0
        return calendar.date(from: components) ?? Date()
    }

    static func text(from date: Date) -> String {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)
    }
}
