import PhotosUI
import SwiftUI
import UIKit

private struct Shot {
    enum Source {
        case camera, library
    }

    let image: UIImage
    let source: Source
}

/// Camera or library → preview → caption → choose group → post (the web app's /camera page).
struct CaptureFlowView: View {
    /// The group the camera was opened from, if any.
    let preferredGroupID: String?

    @Environment(GroupsStore.self) private var groups
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var shot: Shot?
    @State private var showingCamera = false
    @State private var showingNewGroup = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var isOpeningPick = false
    @State private var pickError: String?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(shot == nil ? "New photo" : "Share photo")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                }
        }
        .task { await groups.loadGroupsIfNeeded() }
        .fullScreenCover(isPresented: $showingCamera) {
            CameraPicker { image in
                shot = Shot(image: image, source: .camera)
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showingNewGroup) {
            // The new group joins your list, so it's preselected when you come back here.
            NewGroupView { _ in }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await openPick(item) }
        }
    }

    @ViewBuilder private var content: some View {
        if groups.groups.isEmpty {
            switch groups.listState {
            case .idle, .loading:
                ProgressView()
            case .failed:
                EmptyStateView(
                    emoji: "📡",
                    title: "Couldn't load your groups",
                    message: "Check your connection and try again."
                ) {
                    Button("Try again") { Task { await groups.loadGroups() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded:
                EmptyStateView(
                    emoji: "🫶",
                    title: "Join a group first",
                    message: "Photos are shared with a group of friends. Create one, or open an invite link from a friend."
                ) {
                    Button("Create a group") { showingNewGroup = true }
                        .buttonStyle(.brand)
                        .frame(maxWidth: 240)
                }
            }
        } else if let shot {
            PhotoComposer(
                image: shot.image,
                groups: groups.groups,
                initialGroupID: defaultGroupID,
                discardLabel: shot.source == .camera ? "Retake" : "Choose another",
                onDiscard: {
                    self.shot = nil
                    pickerItem = nil
                },
                onPosted: { photo in
                    dismiss()
                    router.openGroup(photo.groupId)
                }
            )
        } else {
            sourcePicker
        }
    }

    private var sourcePicker: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "camera.fill")
                .font(.system(size: 56))
                .foregroundStyle(LinearGradient.brand)
                .accessibilityHidden(true)
            Text("Share a moment")
                .font(.title2.bold())
            Text("Take a photo or choose one from your library, then pick which group to share it with.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            if let pickError {
                Text(pickError)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Spacer()

            VStack(spacing: 12) {
                if CameraPicker.isAvailable {
                    Button {
                        showingCamera = true
                    } label: {
                        Label("Take photo", systemImage: "camera")
                    }
                    .buttonStyle(.brand)

                    libraryPicker
                        .buttonStyle(.brandSecondary)
                } else {
                    libraryPicker
                        .buttonStyle(.brand)
                }
            }
            .disabled(isOpeningPick)
        }
        .padding(24)
    }

    private var libraryPicker: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            Label(isOpeningPick ? "Opening…" : "Choose from library", systemImage: "photo.on.rectangle")
        }
    }

    /// The group the camera was opened from, or your only group. With several groups and no
    /// hint nothing is preselected, so a photo is never shared with the wrong friends by accident.
    private var defaultGroupID: String? {
        let list = groups.groups
        if let preferredGroupID, list.contains(where: { $0.id == preferredGroupID }) {
            return preferredGroupID
        }
        return list.count == 1 ? list[0].id : nil
    }

    private func openPick(_ item: PhotosPickerItem) async {
        isOpeningPick = true
        pickError = nil
        defer { isOpeningPick = false }

        do {
            if let data = try await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                shot = Shot(image: image, source: .library)
                return
            }
        } catch {
            // Falls through to the message below.
        }
        pickError = "That photo couldn't be opened. Try another one."
        pickerItem = nil
    }
}

/// Preview → caption → choose group → post.
struct PhotoComposer: View {
    let image: UIImage
    let groups: [FriendGroup]
    let initialGroupID: String?
    let discardLabel: String
    let onDiscard: () -> Void
    let onPosted: (Photo) -> Void

    @Environment(PhotosStore.self) private var photos

    @State private var caption = ""
    @State private var groupID: String?
    @State private var groupError: String?
    @State private var isPosting = false
    @State private var failure: APIError?

    init(
        image: UIImage,
        groups: [FriendGroup],
        initialGroupID: String?,
        discardLabel: String,
        onDiscard: @escaping () -> Void,
        onPosted: @escaping (Photo) -> Void
    ) {
        self.image = image
        self.groups = groups
        self.initialGroupID = initialGroupID
        self.discardLabel = discardLabel
        self.onDiscard = onDiscard
        self.onPosted = onPosted
        _groupID = State(initialValue: initialGroupID)
    }

    var body: some View {
        Form {
            Section {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: 360)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .accessibilityLabel("Your photo")
            }
            .buttonRow()

            if let message = failure?.formMessage {
                FormErrorSection(message: message)
            }

            Section {
                TextField("Say something about it…", text: $caption, axis: .vertical)
                    .lineLimit(1...5)
                    .characterLimit(500, text: $caption)
            } header: {
                Text("Caption")
            } footer: {
                FieldFooter(error: failure?.fieldErrors["caption"])
            }

            Section {
                if groups.count == 1, let only = groups.first {
                    HStack(spacing: 12) {
                        GroupEmojiTile(emoji: only.emoji)
                        Text("Sharing with \(Text(only.name).bold())")
                    }
                } else {
                    Picker("Share with", selection: $groupID) {
                        Text("Choose a group").tag(String?.none)
                        ForEach(groups) { group in
                            Text("\(group.emoji) \(group.name)").tag(String?.some(group.id))
                        }
                    }
                }
            } footer: {
                FieldFooter(error: groupError)
            }

            Section {
                VStack(spacing: 12) {
                    PrimaryButton(title: "Post", pendingTitle: "Posting…", isPending: isPosting) {
                        Task { await post() }
                    }
                    Button(discardLabel, action: onDiscard)
                        .buttonStyle(.brandSecondary)
                        .disabled(isPosting)
                }
            }
            .buttonRow()
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: groupID) { groupError = nil }
    }

    private func post() async {
        let target = groupID ?? (groups.count == 1 ? groups.first?.id : nil)
        guard let target else {
            groupError = "Choose who to share this with"
            return
        }

        isPosting = true
        failure = nil

        let image = self.image
        let jpeg = await Task.detached(priority: .userInitiated) {
            image.jpegForUpload(maxDimension: 2560)
        }.value

        guard let jpeg else {
            failure = APIError(status: -1, code: "ENCODE_FAILED", message: "Couldn't prepare that photo. Try another one.")
            isPosting = false
            return
        }

        do {
            let photo = try await photos.upload(jpeg, caption: caption, to: target)
            onPosted(photo)
        } catch {
            failure = error.asAPIError
            isPosting = false
        }
    }
}

/// The system camera. Only on real devices: the Simulator has no camera.
struct CameraPicker: UIViewControllerRepresentable {
    static var isAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    let onCapture: (UIImage) -> Void

    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {
        // Keeps the coordinator's copy current, including the `dismiss` action from the environment.
        context.coordinator.parent = self
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        var parent: CameraPicker

        init(_ parent: CameraPicker) {
            self.parent = parent
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                parent.onCapture(image)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
