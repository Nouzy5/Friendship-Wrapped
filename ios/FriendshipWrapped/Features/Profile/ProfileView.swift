import PhotosUI
import SwiftUI

struct ProfileView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        if let user = session.user {
            ProfileForm(user: user)
        }
    }
}

private struct ProfileForm: View {
    let user: User

    @Environment(SessionStore.self) private var session

    @State private var displayName: String
    @State private var isSaving = false
    @State private var failure: APIError?
    @State private var saved = false

    init(user: User) {
        self.user = user
        _displayName = State(initialValue: user.displayName)
    }

    private var unchanged: Bool {
        displayName.trimmingCharacters(in: .whitespaces) == user.displayName
    }

    var body: some View {
        Form {
            Section {
                VStack(spacing: 4) {
                    AvatarEditor(user: user)
                        .padding(.bottom, 8)
                    Text(user.displayName)
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    Text("@\(user.username)")
                        .foregroundStyle(.secondary)
                    Text("Joined \(Format.monthYear(user.createdAt))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }

            if let message = failure?.formMessage {
                FormErrorSection(message: message)
            }

            Section {
                TextField("Display name", text: $displayName)
                    .textContentType(.nickname)
                    .characterLimit(40, text: $displayName)
                    .submitLabel(.done)
                    .onSubmit { Task { await save() } }
            } header: {
                Text("Display name")
            } footer: {
                FieldFooter(
                    error: failure?.fieldErrors["displayName"],
                    hint: saved && unchanged ? "Saved." : "This is how your friends will see you."
                )
            }

            Section {
                PrimaryButton(title: "Save", pendingTitle: "Saving…", isPending: isSaving) {
                    Task { await save() }
                }
                .disabled(unchanged)
            }
            .buttonRow()
        }
        .navigationTitle("Profile")
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    SettingsView()
                } label: {
                    Image(systemName: "gearshape")
                }
                .accessibilityLabel("Settings")
            }
        }
        .sensoryFeedback(.success, trigger: saved) { _, isSaved in isSaved }
    }

    private func save() async {
        guard !unchanged, !isSaving else { return }
        isSaving = true
        failure = nil
        saved = false
        do {
            let updated = try await session.updateProfile(displayName: displayName)
            displayName = updated.displayName
            saved = true
        } catch {
            failure = error.asAPIError
        }
        isSaving = false
    }
}

/// Profile picture with Add / Change (from the photo library) and Remove.
private struct AvatarEditor: View {
    let user: User

    @Environment(SessionStore.self) private var session

    @State private var pickerItem: PhotosPickerItem?
    @State private var isUploading = false
    @State private var isRemoving = false
    @State private var errorMessage: String?

    private var busy: Bool { isUploading || isRemoving }

    private var pickTitle: String {
        if isUploading { return "Uploading…" }
        return user.avatarUrl == nil ? "Add photo" : "Change photo"
    }

    private var removeTitle: String {
        isRemoving ? "Removing…" : "Remove"
    }

    var body: some View {
        VStack(spacing: 12) {
            AvatarView(name: user.displayName, seed: user.id, imagePath: user.avatarUrl, size: 96)

            HStack(spacing: 8) {
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Text(pickTitle)
                }
                .buttonStyle(.bordered)
                .disabled(busy)

                if user.avatarUrl != nil {
                    Button(removeTitle, role: .destructive) {
                        Task { await remove() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(busy)
                }
            }
            .controlSize(.small)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
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

        let image: UIImage
        do {
            guard let data = try await item.loadTransferable(type: Data.self), let decoded = UIImage(data: data) else {
                errorMessage = "That photo couldn't be opened. Try another one."
                return
            }
            image = decoded
        } catch {
            errorMessage = "That photo couldn't be opened. Try another one."
            return
        }

        // The server crops avatars to 256 px, so there's no point sending more than this.
        let jpeg = await Task.detached(priority: .userInitiated) {
            image.jpegForUpload(maxDimension: 1024)
        }.value
        guard let jpeg else {
            errorMessage = "That photo couldn't be opened. Try another one."
            return
        }

        do {
            try await session.setAvatar(jpeg: jpeg)
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
