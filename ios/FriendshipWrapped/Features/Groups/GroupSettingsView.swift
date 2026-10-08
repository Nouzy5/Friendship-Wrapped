import PhotosUI
import SwiftUI

/// A group's settings (the web app's GroupSettingsPage): your colour in it, the group photo, the
/// members (report, block, and for the owner remove), name and emoji, notifications, invite
/// links, and leaving. Opened from the group's header and from Settings → Your groups.
struct GroupSettingsView: View {
    let groupID: String

    @Environment(GroupsStore.self) private var groups

    /// Set once you've left: the screen stays blank while it slides away, rather than showing
    /// (or loading again) a group you're no longer in.
    @State private var hasLeft = false

    var body: some View {
        Group {
            if hasLeft {
                Color.bg.ignoresSafeArea()
            } else if let group = groups.group(groupID) {
                GroupSettingsContent(group: group, hasLeft: $hasLeft)
            } else {
                missingGroup
            }
        }
        .navigationTitle("Group settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private var missingGroup: some View {
        switch groups.listState {
        case .loaded:
            ScrollView {
                EmptyStateView(
                    emoji: "🔒",
                    title: "This group isn't available",
                    message: "You may have left it, or the owner removed you."
                )
            }
            .screenBackground()
        case .failed(let message):
            ScrollView {
                EmptyStateView(emoji: "📡", title: "Couldn't load this group", message: message) {
                    Button("Try again") {
                        Task { await groups.loadGroups() }
                    }
                    .buttonStyle(.fwCompact(.primary))
                }
            }
            .screenBackground()
        case .idle, .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.bg.ignoresSafeArea())
                .task { await groups.loadGroupsIfNeeded() }
        }
    }
}

private struct GroupSettingsContent: View {
    let group: FriendGroup
    @Binding var hasLeft: Bool

    @Environment(GroupsStore.self) private var groups
    @Environment(SessionStore.self) private var session
    @Environment(WrappedStore.self) private var wrapped
    @Environment(AppRouter.self) private var router
    @Environment(DeviceSettings.self) private var settings

    // Your colour: the one you just picked, until the server agrees.
    @State private var pendingColor: MemberColor?

    // Group photo
    @State private var photoItem: PhotosPickerItem?
    @State private var isUploadingPhoto = false
    @State private var isRemovingPhoto = false
    @State private var photoError: String?

    // Members
    @State private var membersFailed = false
    @State private var memberToRemove: GroupMember?
    @State private var removingID: String?
    @State private var reportingMember: GroupMember?
    @State private var personToBlock: UserSummary?

    // Name and emoji
    @State private var editingName = false

    // Notifications: the switch flips at once; only the latest change's answer counts.
    @State private var pendingMuted: Bool?
    @State private var muteRequests = 0

    // Leaving
    @State private var confirmingLeave = false
    @State private var isLeaving = false

    private var myID: String? { session.user?.id }
    private var myColor: MemberColor? { pendingColor ?? group.myColor }
    private var muted: Bool { pendingMuted ?? group.muted }
    private var photoBusy: Bool { isUploadingPhoto || isRemovingPhoto }

    private var leaveConsequence: String {
        if group.memberCount == 1 {
            return "You're the only member, so leaving will permanently delete this group."
        }
        if group.isOwner {
            return "Ownership will pass to the member who has been in the group longest."
        }
        return "You'll lose access to this group until someone sends you a new invite link."
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header
                    .riseIn()
                colourSection
                    .riseIn(delay: 0.05)
                if group.isOwner {
                    photoSection
                        .riseIn(delay: 0.1)
                }
                membersSection
                    .riseIn(delay: 0.12)
                groupSection
                    .riseIn(delay: 0.15)
                InviteFriendsSection(group: group)
                    .riseIn(delay: 0.18)
                leaveSection
                    .riseIn(delay: 0.2)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        // Your colour here is this screen's accent (switches, checks), even if it isn't the
        // group you're looking at.
        .environment(\.accentMemberColor, myColor)
        .refreshable { await refresh() }
        .task { await refresh() }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task { await uploadPhoto(item) }
        }
        .sheet(item: $reportingMember) { member in
            ReportSheet(userID: member.user.id, title: "Report \(member.user.displayName)")
        }
        .sheet(isPresented: $editingName) {
            GroupNameEditorSheet(group: group)
        }
        .blockConfirmation($personToBlock, context: group.name) {
            Task { await loadMembers() }
        }
        .alert(
            "Remove \(memberToRemove?.user.displayName ?? "them")?",
            isPresented: Binding(
                get: { memberToRemove != nil },
                set: { if !$0 { memberToRemove = nil } }
            ),
            presenting: memberToRemove
        ) { member in
            Button("Remove") {
                Task { await remove(member) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("They'll lose access to this group straight away. They can only come back with a new invite link.")
        }
        .alert("Leave \(group.name)?", isPresented: $confirmingLeave) {
            Button(group.memberCount == 1 ? "Leave and delete" : "Leave group") {
                Task { await leave() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(leaveConsequence)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 16) {
            GroupBadge(group: group, size: 76)
            VStack(alignment: .leading, spacing: 2) {
                Text(group.name)
                    .font(Theme.title(.title))
                    .foregroundStyle(.fg)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(Format.memberCount(group.memberCount)), together since \(Format.monthYear(group.createdAt))")
                    .font(.subheadline)
                    .foregroundStyle(.sub)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    // MARK: - Your colour

    /// Colours other people here have, and who has each.
    private var takenBy: [MemberColor: GroupMember] {
        var taken: [MemberColor: GroupMember] = [:]
        for member in groups.members(of: group.id) ?? [] where member.user.id != myID {
            if let color = member.color { taken[color] = member }
        }
        return taken
    }

    private var colourSection: some View {
        let taken = takenBy
        let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 6)

        return SettingsSection(
            "Your colour",
            footnote: "Your photos, reactions and part of Wrapped show in this colour. Colours with a letter belong to someone else here."
        ) {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(MemberColor.allCases) { color in
                    GroupColourSwatch(
                        color: color,
                        takenBy: taken[color]?.user.displayName,
                        isSelected: color == myColor
                    ) {
                        Task { await pick(color) }
                    }
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 14)
            .background(.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Your colour")
        }
    }

    private func pick(_ color: MemberColor) async {
        guard color != myColor, pendingColor == nil else { return }
        Haptics.tap()
        withMotion(.fwPop) { pendingColor = color }
        do {
            let updated = try await groups.updateMyMembership(in: group.id, color: color)
            // "Your colour" icon follows your colour in the group you're looking at.
            if settings.values.appIcon == .yours, groups.currentGroup?.id == group.id {
                AppIconApplier.apply(.yours, color: updated.myColor)
            }
        } catch is CancellationError {
            // Nothing to say.
        } catch {
            // The members were reloaded either way, so the grid now shows who has what.
            let apiError = error.asAPIError
            ToastCenter.shared.show(
                apiError.code == "COLOR_TAKEN" ? "Someone just took that colour. Pick another." : "Couldn't change your colour.",
                isError: true
            )
        }
        withMotion(.fwPop) { pendingColor = nil }
    }

    // MARK: - Group photo (owner)

    private var photoSection: some View {
        SettingsSection(
            "Group photo",
            footnote: group.avatarUrl == nil ? "Without a photo, the group's picture is everyone's colours." : nil
        ) {
            VStack(alignment: .leading, spacing: 12) {
                SettingsGroup {
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        SettingsRowLabel(
                            isUploadingPhoto ? "Uploading…" : (group.avatarUrl == nil ? "Add a group photo" : "Change group photo"),
                            systemImage: "photo",
                            showsChevron: false
                        )
                    }
                    .buttonStyle(.settingsRow)
                    .disabled(photoBusy)

                    if group.avatarUrl != nil {
                        SettingsButtonRow(
                            isRemovingPhoto ? "Removing…" : "Use everyone's colours",
                            systemImage: "square.split.2x1"
                        ) {
                            Task { await removePhoto() }
                        }
                        .disabled(photoBusy)
                    }
                }
                if let photoError {
                    InlineAlert(message: photoError)
                }
            }
        }
    }

    private func uploadPhoto(_ item: PhotosPickerItem) async {
        isUploadingPhoto = true
        photoError = nil
        defer {
            isUploadingPhoto = false
            photoItem = nil
        }
        guard let jpeg = await SquarePhotoUpload.jpeg(from: item) else {
            photoError = "That photo couldn't be opened. Try another one."
            return
        }
        do {
            try await groups.setGroupPhoto(group.id, jpeg: jpeg)
            Haptics.success()
            ToastCenter.shared.show("Group photo saved")
        } catch {
            photoError = error.asAPIError.message
        }
    }

    private func removePhoto() async {
        isRemovingPhoto = true
        photoError = nil
        do {
            try await groups.removeGroupPhoto(group.id)
        } catch {
            photoError = error.asAPIError.message
        }
        isRemovingPhoto = false
    }

    // MARK: - Members

    private var membersSection: some View {
        SettingsSection("Members") {
            if let members = groups.members(of: group.id) {
                let sorted = members.sorted { $0.joinedAt < $1.joinedAt }
                SettingsGroup {
                    ForEach(Array(sorted.enumerated()), id: \.element.id) { index, member in
                        memberRow(member)
                            .listItemTransition(index: index)
                    }
                }
                .motion(.fwEase, value: sorted.map(\.id))
            } else if membersFailed {
                SettingsLoadError("Couldn't load the members. Check your connection.") {
                    await loadMembers()
                }
            } else {
                ListSkeleton(rows: min(max(group.memberCount, 1), 6))
            }
        }
    }

    private func memberRow(_ member: GroupMember) -> some View {
        let isYou = member.user.id == myID
        return SettingsValueRow(
            label: isYou ? "\(member.user.displayName) (you)" : member.user.displayName,
            description: "@\(member.user.username)",
            value: member.role == .owner ? "Owner" : nil,
            leading: {
                PersonAvatar(
                    name: member.user.displayName,
                    imagePath: member.user.avatarUrl,
                    color: member.color,
                    size: .md
                )
            },
            trailing: {
                if removingID == member.user.id {
                    ProgressView()
                        .frame(width: 44, height: 44)
                } else if !isYou {
                    memberMenu(member)
                }
            }
        )
    }

    private func memberMenu(_ member: GroupMember) -> some View {
        let name = member.user.displayName
        return Menu {
            Button {
                reportingMember = member
            } label: {
                Label("Report \(name)", systemImage: "flag")
            }
            Button {
                personToBlock = member.user
            } label: {
                Label("Block \(name)", systemImage: "nosign")
            }
            if group.isOwner {
                Button {
                    memberToRemove = member
                } label: {
                    Label("Remove from \(group.name)", systemImage: "person.badge.minus")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.fg)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .disabled(removingID != nil)
        .accessibilityLabel("Options for \(name)")
    }

    private func loadMembers() async {
        do {
            try await groups.loadMembers(of: group.id)
            membersFailed = false
        } catch is CancellationError {
            return
        } catch {
            if groups.members(of: group.id) == nil { membersFailed = true }
        }
    }

    private func remove(_ member: GroupMember) async {
        removingID = member.user.id
        do {
            try await groups.removeMember(member.user.id, from: group.id)
            ToastCenter.shared.show("\(member.user.displayName) was removed from \(group.name)")
        } catch {
            ToastCenter.shared.show(error.asAPIError.message, isError: true)
        }
        removingID = nil
    }

    // MARK: - Name, emoji and notifications

    private var groupSection: some View {
        SettingsSection(
            "Group",
            footnote: group.isOwner ? nil : "Only the owner can change the name, emoji and photo."
        ) {
            SettingsGroup {
                if group.isOwner {
                    Button {
                        editingName = true
                    } label: {
                        SettingsRowLabel("Name and emoji", value: "\(group.emoji) \(group.name)")
                    }
                    .buttonStyle(.settingsRow)
                } else {
                    SettingsValueRow("Name and emoji", value: "\(group.emoji) \(group.name)")
                }

                SettingsToggleRow(
                    "Notifications",
                    description: muted ? "Muted: nothing from this group" : "Everything, as set in Settings → Notifications",
                    isOn: Binding(
                        get: { !muted },
                        set: { on in setMuted(!on) }
                    )
                )
            }
        }
    }

    private func setMuted(_ value: Bool) {
        muteRequests += 1
        let sent = muteRequests
        pendingMuted = value
        Task {
            do {
                try await groups.updateMyMembership(in: group.id, muted: value)
            } catch {
                ToastCenter.shared.show("Couldn't change this group's notifications.", isError: true)
            }
            if sent == muteRequests { pendingMuted = nil }
        }
    }

    // MARK: - Leaving

    private var leaveSection: some View {
        SettingsSection(footnote: leaveConsequence) {
            SettingsGroup {
                SettingsButtonRow(isLeaving ? "Leaving…" : "Leave \(group.name)", strong: true) {
                    confirmingLeave = true
                }
                .disabled(isLeaving)
            }
        }
    }

    /// The group Home shows once you've left this one: the one you were looking at, or another.
    private func groupToShow(afterLeaving groupID: String) -> FriendGroup? {
        if let current = groups.currentGroup, current.id != groupID { return current }
        return groups.groups.first { $0.id != groupID }
    }

    private func leave() async {
        let left = group
        isLeaving = true
        do {
            // Straight from the API: the server says whether the group was deleted (the member
            // count shown may be out of date).
            let groupDeleted = try await APIClient.shared.leaveGroup(left.id)
            let next = groupToShow(afterLeaving: left.id)

            // Navigate away first, so no screen tries to reload a group you're no longer in.
            hasLeft = true
            router.currentPath = []
            if let next {
                router.openGroup(next.id)
            } else {
                router.selectTab(.home)
                router.popToHome()
            }
            groups.forget(left.id)
            wrapped.setNeedsRefresh()

            Haptics.success()
            ToastCenter.shared.show(groupDeleted ? "\(left.name) was deleted" : "You left \(left.name)")
        } catch {
            ToastCenter.shared.show(error.asAPIError.message, isError: true)
            isLeaving = false
        }
    }

    // MARK: - Loading

    private func refresh() async {
        // A 404 here means you're no longer in the group: the store forgets it.
        _ = try? await groups.loadGroup(group.id)
        await loadMembers()
    }
}

/// One colour to pick: yours has a ring and a tick, other people's carry their initial and
/// can't be picked.
private struct GroupColourSwatch: View {
    let color: MemberColor
    /// Who has it, if it's someone else's.
    let takenBy: String?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    Circle().fill(color.fill)
                    if let takenBy {
                        Circle().strokeBorder(Color.black.opacity(0.18), lineWidth: 3)
                        Text(PersonAvatar.initial(of: takenBy))
                            .font(.system(size: 17, weight: .semibold, design: .rounded))
                            .foregroundStyle(color.ink)
                    } else if isSelected {
                        Image(systemName: "checkmark")
                            .font(.system(size: 16, weight: .heavy))
                            .foregroundStyle(color.ink)
                            .popIn()
                    }
                }
                .frame(width: 42, height: 42)
                .overlay {
                    if isSelected {
                        Circle()
                            .strokeBorder(Theme.fg, lineWidth: 2.5)
                            .padding(-5.5)
                            .transition(.scale(scale: 0.7).combined(with: .opacity))
                    }
                }
                .padding(.top, 6)

                Text(color.name)
                    .font(.system(size: 11, weight: isSelected ? .semibold : .regular, design: .rounded))
                    .foregroundStyle(isSelected ? Theme.fg : Theme.sub)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, minHeight: 72)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.9))
        .disabled(takenBy != nil)
        .accessibilityLabel(takenBy.map { "\(color.name), taken by \($0)" } ?? color.name)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

/// The owner changes the group's name and emoji.
private struct GroupNameEditorSheet: View {
    let group: FriendGroup

    @Environment(GroupsStore.self) private var groups
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var emoji: String
    @State private var isSaving = false
    @State private var failure: APIError?

    init(group: FriendGroup) {
        self.group = group
        _name = State(initialValue: group.name)
        _emoji = State(initialValue: group.emoji)
    }

    private var canSave: Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && !emoji.isEmpty && (trimmed != group.name || emoji != group.emoji)
    }

    var body: some View {
        SettingsFormSheet(title: "Name and emoji", isBusy: isSaving) {
            if let message = failure?.formMessage {
                InlineAlert(message: message)
            }
            GroupFormFields(name: $name, emoji: $emoji, errors: failure?.fieldErrors ?? [:])
            PrimaryButton(title: "Save", pendingTitle: "Saving…", isPending: isSaving) {
                Task { await save() }
            }
            .disabled(!canSave)
        }
    }

    private func save() async {
        guard canSave, !isSaving else { return }
        isSaving = true
        failure = nil
        do {
            _ = try await groups.updateGroup(group.id, name: name, emoji: emoji)
            Haptics.success()
            ToastCenter.shared.show("Group saved")
            dismiss()
        } catch {
            failure = error.asAPIError
        }
        isSaving = false
    }
}
