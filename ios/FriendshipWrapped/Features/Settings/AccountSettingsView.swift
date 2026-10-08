import PhotosUI
import SwiftUI
import UIKit

/// Settings → Account (the web app's AccountSettingsPage): your profile photo, name, username
/// and password, where you're signed in, downloading your photos, and deleting the account.
struct AccountSettingsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AccountStore.self) private var account
    @Environment(\.accentMemberColor) private var myColor

    @State private var editor: AccountEditorKind?
    @State private var deletingAccount = false

    // Where you're signed in
    @State private var devicesFailed = false
    @State private var signingOutID: String?
    @State private var isSigningOutOthers = false

    // Your data
    @State private var isDownloading = false
    @State private var downloadError: String?
    @State private var archive: PhotoArchiveFile?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let user = session.user {
                    AccountPhotoEditor(user: user, color: myColor)
                        .riseIn()
                    detailsGroup(user)
                        .riseIn(delay: 0.04)
                }
                devicesSection
                    .riseIn(delay: 0.08)
                dataSection
                    .riseIn(delay: 0.12)
                deleteSection
                    .riseIn(delay: 0.16)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.large)
        .task { await loadDevices() }
        .refreshable { await loadDevices() }
        .sheet(item: $editor) { kind in
            if let user = session.user {
                switch kind {
                case .displayName:
                    DisplayNameEditorSheet(user: user)
                case .username:
                    UsernameEditorSheet(user: user)
                case .password:
                    PasswordEditorSheet()
                }
            }
        }
        .sheet(isPresented: $deletingAccount) {
            DeleteAccountView()
        }
        .sheet(item: $archive) { file in
            PhotoArchiveShareSheet(url: file.url)
                .presentationDetents([.medium, .large])
                .ignoresSafeArea()
        }
    }

    // MARK: - Name, username, password

    private func detailsGroup(_ user: User) -> some View {
        SettingsGroup {
            editorRow("Display name", value: user.displayName, kind: .displayName)
            editorRow("Username", value: "@\(user.username)", kind: .username)
            editorRow("Password", value: "Change", kind: .password)
        }
    }

    private func editorRow(_ label: String, value: String, kind: AccountEditorKind) -> some View {
        Button {
            editor = kind
        } label: {
            SettingsRowLabel(label, value: value)
        }
        .buttonStyle(.settingsRow)
    }

    // MARK: - Where you're signed in

    private var devicesSection: some View {
        SettingsSection("Where you're signed in") {
            if let devices = account.devices {
                SettingsGroup {
                    ForEach(devices) { device in
                        deviceRow(device)
                    }
                    if devices.contains(where: { !$0.current }) {
                        SettingsButtonRow(
                            isSigningOutOthers ? "Signing out…" : "Sign out of all other devices",
                            strong: true
                        ) {
                            Task { await signOutOthers() }
                        }
                        .disabled(isSigningOutOthers || signingOutID != nil)
                    }
                }
                .motion(.fwEase, value: devices.map(\.id))
            } else if devicesFailed {
                SettingsLoadError("Couldn't load your devices. Check your connection.") {
                    await loadDevices()
                }
            } else {
                ListSkeleton(rows: 2)
            }
        }
    }

    private static func isPhone(_ device: SignedInDevice) -> Bool {
        device.device.range(of: "iphone|android|phone", options: [.regularExpression, .caseInsensitive]) != nil
    }

    private func deviceRow(_ device: SignedInDevice) -> some View {
        SettingsValueRow(
            label: device.current ? "\(device.device), this device" : device.device,
            description: device.current ? "Active now" : "Last active \(Format.relative(device.lastActiveAt))",
            systemImage: Self.isPhone(device) ? "iphone" : "laptopcomputer",
            leading: { EmptyView() },
            trailing: {
                if signingOutID == device.id {
                    ProgressView()
                        .frame(width: 44, height: 44)
                } else {
                    Button("Sign out") {
                        Task { await signOut(device) }
                    }
                    .buttonStyle(.fwCompact(.ghost))
                    .disabled(signingOutID != nil || isSigningOutOthers)
                    .accessibilityLabel(device.current ? "Sign out of this device" : "Sign out \(device.device)")
                }
            }
        )
    }

    private func loadDevices() async {
        do {
            try await account.loadDevices()
            devicesFailed = false
        } catch is CancellationError {
            return
        } catch {
            if account.devices == nil { devicesFailed = true }
        }
    }

    private func signOut(_ device: SignedInDevice) async {
        signingOutID = device.id
        do {
            try await account.signOut(device)
            if device.current {
                // This phone's session is gone on the server: the app goes back to the welcome screen.
                session.didSignOutThisDevice()
                return
            }
            ToastCenter.shared.show("Signed out of \(device.device)")
        } catch {
            ToastCenter.shared.show("Couldn't sign out that device.", isError: true)
        }
        signingOutID = nil
    }

    private func signOutOthers() async {
        isSigningOutOthers = true
        do {
            try await account.signOutOtherDevices()
            ToastCenter.shared.show("Signed out of your other devices")
        } catch {
            ToastCenter.shared.show("Couldn't sign out your other devices.", isError: true)
        }
        isSigningOutOthers = false
    }

    // MARK: - Your data

    private var dataSection: some View {
        SettingsSection(
            "Your data",
            footnote: "A zip of every photo you've posted, in full size. It can take a while if you've posted a lot."
        ) {
            VStack(alignment: .leading, spacing: 12) {
                SettingsGroup {
                    Button {
                        Task { await downloadPhotos() }
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "square.and.arrow.down")
                                .font(.system(size: 19))
                                .foregroundStyle(.fg)
                                .frame(width: 26)
                                .accessibilityHidden(true)
                            SettingsRowText(
                                label: isDownloading ? "Preparing your photos…" : "Download your photos",
                                description: isDownloading ? "Keep the app open until it's ready." : nil
                            )
                            if isDownloading {
                                ProgressView()
                            }
                        }
                        .settingsRow(trailingPadding: 16)
                    }
                    .buttonStyle(.settingsRow)
                    .disabled(isDownloading)
                }
                if let downloadError {
                    InlineAlert(message: downloadError)
                }
            }
        }
    }

    private func downloadPhotos() async {
        guard !isDownloading else { return }
        isDownloading = true
        downloadError = nil
        do {
            let url = try await APIClient.shared.downloadPhotoArchive()
            Haptics.success()
            archive = PhotoArchiveFile(url: url)
        } catch is CancellationError {
            // Nothing to say.
        } catch {
            // Includes the server's "a few times already, try again in an hour" limit.
            downloadError = error.asAPIError.message
        }
        isDownloading = false
    }

    // MARK: - Delete account

    private var deleteSection: some View {
        SettingsSection(
            footnote: "Deletes your photos, comments and reactions and takes you out of every group. You'll be asked for your password first."
        ) {
            SettingsGroup {
                SettingsButtonRow("Delete account", strong: true) {
                    deletingAccount = true
                }
            }
        }
    }
}

private enum AccountEditorKind: String, Identifiable {
    case displayName, username, password

    var id: String { rawValue }
}

/// The zip of your photos, ready to share or save to Files.
private struct PhotoArchiveFile: Identifiable {
    let id = UUID()
    let url: URL
}

/// The system share sheet for the photo archive (Save to Files, AirDrop, …).
private struct PhotoArchiveShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

// MARK: - Profile photo

/// Your profile picture, ringed in your colour, with Add / Change (from the photo library) and Remove.
private struct AccountPhotoEditor: View {
    let user: User
    let color: MemberColor?

    @Environment(SessionStore.self) private var session

    @State private var pickerItem: PhotosPickerItem?
    @State private var isUploading = false
    @State private var isRemoving = false
    @State private var errorMessage: String?

    private var busy: Bool { isUploading || isRemoving }

    private var pickTitle: String {
        if isUploading { return "Uploading…" }
        return user.avatarUrl == nil ? "Add a profile photo" : "Change photo"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 16) {
                PersonAvatar(name: user.displayName, imagePath: user.avatarUrl, color: color, size: .xl)
                    .motion(.fwEase, value: user.avatarUrl)

                VStack(alignment: .leading, spacing: 6) {
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Text(pickTitle)
                    }
                    .buttonStyle(.fwCompact(.secondary))
                    .disabled(busy)

                    if user.avatarUrl != nil {
                        Button(isRemoving ? "Removing…" : "Remove") {
                            Task { await remove() }
                        }
                        .buttonStyle(.fwCompact(.ghost))
                        .disabled(busy)
                    }

                    Text(user.avatarUrl == nil
                         ? "Until then, friends see your initial in your colour."
                         : "Ringed in your colour in each group.")
                        .font(.footnote)
                        .foregroundStyle(.sub)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let errorMessage {
                InlineAlert(message: errorMessage)
            }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await upload(item) }
        }
    }

    private func upload(_ item: PhotosPickerItem) async {
        isUploading = true
        errorMessage = nil
        defer {
            isUploading = false
            pickerItem = nil
        }
        // The server crops profile pictures to a 256 px square, so a 1024 px square is plenty.
        guard let jpeg = await SquarePhotoUpload.jpeg(from: item, side: 1024) else {
            errorMessage = "That photo couldn't be opened. Try another one."
            return
        }
        do {
            try await session.setAvatar(jpeg: jpeg)
            Haptics.success()
        } catch {
            errorMessage = error.asAPIError.message
        }
    }

    private func remove() async {
        isRemoving = true
        errorMessage = nil
        do {
            try await session.removeAvatar()
        } catch {
            errorMessage = error.asAPIError.message
        }
        isRemoving = false
    }
}

// MARK: - Editors

private struct DisplayNameEditorSheet: View {
    let user: User

    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var isSaving = false
    @State private var failure: APIError?

    init(user: User) {
        self.user = user
        _name = State(initialValue: user.displayName)
    }

    private var canSave: Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed != user.displayName
    }

    var body: some View {
        SettingsFormSheet(title: "Display name", isBusy: isSaving) {
            if let message = failure?.formMessage {
                InlineAlert(message: message)
            }
            FWTextField(
                label: "Name",
                text: $name,
                error: failure?.fieldErrors["displayName"],
                hint: "This is how your friends see you.",
                contentType: .nickname,
                autocapitalization: .words,
                submitLabel: .done,
                onSubmit: { Task { await save() } }
            )
            .characterLimit(40, text: $name)
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
            _ = try await session.updateProfile(displayName: name)
            Haptics.success()
            ToastCenter.shared.show("Name saved")
            dismiss()
        } catch {
            failure = error.asAPIError
        }
        isSaving = false
    }
}

private struct UsernameEditorSheet: View {
    let user: User

    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var username: String
    @State private var isSaving = false
    @State private var failure: APIError?

    init(user: User) {
        self.user = user
        _username = State(initialValue: user.username)
    }

    private var canSave: Bool {
        let trimmed = username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return !trimmed.isEmpty && trimmed != user.username
    }

    /// "That username is already taken" (409 USERNAME_TAKEN) belongs under the field.
    private var isTaken: Bool { failure?.code == "USERNAME_TAKEN" }

    private var fieldError: String? {
        if let message = failure?.fieldErrors["username"] { return message }
        return isTaken ? failure?.message : nil
    }

    var body: some View {
        SettingsFormSheet(title: "Username", isBusy: isSaving) {
            if !isTaken, let message = failure?.formMessage {
                InlineAlert(message: message)
            }
            FWTextField(
                label: "Username",
                text: $username,
                error: fieldError,
                hint: "You sign in with it. Letters, numbers, periods and underscores.",
                contentType: .username,
                autocapitalization: .never,
                submitLabel: .done,
                onSubmit: { Task { await save() } }
            )
            .characterLimit(20, text: $username)
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
            try await session.updateUsername(username.trimmingCharacters(in: .whitespacesAndNewlines))
            Haptics.success()
            ToastCenter.shared.show("Username saved")
            dismiss()
        } catch {
            failure = error.asAPIError
        }
        isSaving = false
    }
}

private struct PasswordEditorSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(AccountStore.self) private var account
    @Environment(\.dismiss) private var dismiss

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var isSaving = false
    @State private var failure: APIError?

    private var canSave: Bool {
        !currentPassword.isEmpty && !newPassword.isEmpty
    }

    var body: some View {
        SettingsFormSheet(title: "Change password", isBusy: isSaving) {
            if let message = failure?.formMessage {
                InlineAlert(message: message)
            }
            FWTextField(
                label: "Current password",
                text: $currentPassword,
                error: failure?.fieldErrors["currentPassword"],
                isSecure: true,
                contentType: .password,
                submitLabel: .next
            )
            FWTextField(
                label: "New password",
                text: $newPassword,
                error: failure?.fieldErrors["newPassword"],
                hint: "At least 8 characters. Other devices will be signed out.",
                isSecure: true,
                contentType: .newPassword,
                submitLabel: .done,
                onSubmit: { Task { await save() } }
            )
            PrimaryButton(title: "Change password", pendingTitle: "Changing…", isPending: isSaving) {
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
            try await session.changePassword(current: currentPassword, new: newPassword)
            Haptics.success()
            ToastCenter.shared.show("Password changed. Your other devices are signed out.")
            // The devices list drops the ones that were just signed out.
            try? await account.loadDevices()
            dismiss()
        } catch {
            failure = error.asAPIError
        }
        isSaving = false
    }
}
