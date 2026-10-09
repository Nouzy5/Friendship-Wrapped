import AVFoundation
import Combine
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// A video picked from the library, or a Live Photo's motion, converted and waiting to be posted.
private struct ShotVideo {
    /// The MP4 that is uploaded.
    let file: URL
    let durationMs: Int
    let isLive: Bool
}

/// A photo taken or picked (or a video), waiting to be posted.
private struct Shot {
    enum Source {
        case camera, library
    }

    /// What's uploaded (and saved, with Settings → Photos & data → Save to this device). For a
    /// video, a frame of it; for a Live Photo, its still picture, which is uploaded with the motion.
    let image: UIImage
    /// A smaller copy for the screen.
    let preview: UIImage
    let source: Source
    var video: ShotVideo?
}

/// The camera, full screen from the shutter in the tab bar (the web app's /camera page): the
/// group you're sharing with at the top, a square viewfinder, the shutter, and who'll see it.
/// After a photo, the square preview with a caption, posted to that group.
struct CaptureFlowView: View {
    /// The group the camera was opened from, if any.
    let preferredGroupID: String?
    /// A moment to post into, if the camera was opened from one. It only counts while it's open, in the group you're sharing with.
    var momentID: String?

    @Environment(GroupsStore.self) private var groups
    @Environment(PhotosStore.self) private var photos
    @Environment(WrappedStore.self) private var wrapped
    @Environment(MomentsStore.self) private var moments
    @Environment(NetworkMonitor.self) private var network
    @Environment(DeviceSettings.self) private var settings
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.fwReduceMotion) private var reduceMotion
    /// Your colour in the current group (from the root). Here the accent is your colour in the
    /// group you're sharing with.
    @Environment(\.accentMemberColor) private var inheritedAccent

    @State private var camera = CameraModel()
    @State private var poster = CapturePoster()
    /// A group picked at the top, over the one the camera opened with.
    @State private var chosenGroupID: String?
    @State private var shot: Shot?
    @State private var caption = ""
    @State private var editingCaption = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var isOpeningPick = false
    /// A short message over the viewfinder, e.g. "Couldn't take that photo".
    @State private var notice: String?
    /// Shutter presses so far: each one flashes.
    @State private var flashes = 0
    /// Half turns of the switch-camera icon.
    @State private var flipTurns = 0
    @State private var showingNewGroup = false
    /// The moment the camera was opened for, once it has loaded.
    @State private var requestedMoment: Moment?
    /// It closed while the photo was being posted, so the photo goes to the group instead.
    @State private var leftMoment = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            // The keyboard (for the caption) comes up over the photo instead of squeezing it.
            .ignoresSafeArea(.keyboard)

            if editingCaption {
                Color.black.opacity(0.4)
                    .ignoresSafeArea()
                    .onTapGesture { closeCaption() }
                    .transition(.opacity)
                    .zIndex(1)
                    .accessibilityHidden(true)
            }
            if editingCaption {
                CaptionEditorPanel(caption: $caption, error: poster.failure?.fieldErrors["caption"]) {
                    closeCaption()
                }
                .transition(.sheetUp)
                .zIndex(2)
            }
        }
        .environment(\.accentMemberColor, accentColor)
        .task { await groups.loadGroupsIfNeeded() }
        .task(id: momentID) {
            guard let momentID else { return }
            requestedMoment = try? await APIClient.shared.fetchMoment(momentID)
        }
        .sheet(isPresented: $showingNewGroup) {
            // The new group joins your list and is picked here, so the camera opens on it.
            NewGroupView(onCreated: { created in
                chosenGroupID = created.id
                groups.setCurrentGroup(created.id)
                showingNewGroup = false
            })
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await openPick(item) }
        }
        .onDisappear {
            // A post still waiting (or uploading) doesn't go up after the camera has closed.
            poster.cancel()
            camera.deactivate()
            discardVideoFile(of: shot)
        }
    }

    /// Photos and videos from the library (Live Photos are among the photos).
    private var pickerFilter: PHPickerFilter {
        .any(of: [.images, .videos])
    }

    // MARK: - Header

    private var topBar: some View {
        HStack(spacing: 0) {
            IconButton(systemImage: "xmark", label: "Close camera") {
                dismiss()
            }

            ZStack {
                if let group {
                    GroupPicker(current: group, style: .pill, context: "Sharing with", onSelect: { next in
                        choose(next)
                    })
                    .disabled(poster.isBusy)
                }
            }
            .frame(maxWidth: .infinity)

            if showsFlashToggle {
                IconButton(
                    systemImage: camera.flashOn ? "bolt.fill" : "bolt.slash",
                    label: "Flash",
                    isOn: camera.flashOn
                ) {
                    Haptics.tap()
                    camera.flashOn.toggle()
                }
                .accessibilityValue(camera.flashOn ? "On" : "Off")
                .transition(.opacity)
            } else {
                // Keeps the group centred.
                Color.clear
                    .frame(width: 44, height: 44)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 4)
        .motion(.fwQuick, value: showsFlashToggle)
    }

    private var showsFlashToggle: Bool {
        shot == nil && camera.isLive && camera.hasFlash
    }

    // MARK: - Content

    @ViewBuilder private var content: some View {
        if let group {
            if let shot {
                composer(shot: shot, group: group)
                    .transition(.opacity)
            } else {
                cameraStage(group: group)
                    .transition(.opacity)
            }
        } else {
            switch groups.listState {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed:
                EmptyStateView(
                    emoji: "📡",
                    title: "Couldn't load your groups",
                    message: "Check your connection and try again."
                ) {
                    Button("Try again") {
                        Task { await groups.loadGroups() }
                    }
                    .buttonStyle(.fwCompact(.primary))
                }
            case .loaded:
                EmptyStateView(
                    emoji: "🫶",
                    title: "Join a group first",
                    message: "Photos are shared with a group of friends. Create one, or open an invite link from a friend."
                ) {
                    Button("Create a group") { showingNewGroup = true }
                        .buttonStyle(.fwCompact(.primary))
                }
            }
        }
    }

    // MARK: - Camera

    private func cameraStage(group: FriendGroup) -> some View {
        VStack(spacing: 0) {
            viewfinder
                .padding(.horizontal, 8)
                .padding(.top, 24)
                // As big as fits with the shutter and the people still on screen.
                .layoutPriority(1)
            controls
                .padding(.top, 40)
            if activeMoment != nil {
                momentNote
                    .padding(.top, 24)
            }
            CameraAudience(group: group)
                .padding(.top, activeMoment == nil ? 32 : 12)
            Spacer(minLength: 12)
        }
        .onAppear { camera.activate(preferred: preferredSide) }
        .onDisappear { camera.deactivate() }
        .onChange(of: scenePhase) { _, phase in
            // Off in the background: the camera light goes out and the battery is spared.
            switch phase {
            case .background:
                camera.deactivate()
            case .active:
                camera.activate(preferred: preferredSide)
            default:
                break
            }
        }
        .onReceive(sessionNotifications(CameraEngine.wasInterrupted)) { notification in
            camera.sessionWasInterrupted(notification)
        }
        .onReceive(sessionNotifications(CameraEngine.interruptionEnded)) { _ in
            camera.sessionInterruptionEnded()
        }
        .onReceive(sessionNotifications(CameraEngine.runtimeError)) { notification in
            camera.sessionRuntimeError(notification)
        }
    }

    private func sessionNotifications(_ name: Notification.Name) -> AnyPublisher<Notification, Never> {
        NotificationCenter.default.publisher(for: name, object: camera.captureSession)
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    /// The square viewfinder: photos are cropped to exactly this.
    private var viewfinder: some View {
        Color.black
            .aspectRatio(1, contentMode: .fit)
            .overlay { viewfinderContent }
            .clipShape(RoundedRectangle(cornerRadius: 44, style: .continuous))
            .overlay(alignment: .top) { noticePill }
    }

    private var viewfinderContent: some View {
        ZStack {
            if camera.showsPreview {
                CameraPreviewView(session: camera.captureSession, side: camera.side)
                    .opacity(camera.isSwitching ? 0.3 : 1)
                    .motion(.fwQuick, value: camera.isSwitching)
            }
            if settings.values.cameraGrid, camera.isLive {
                ViewfinderGrid()
            }
            cameraStatusOverlay
            if isOpeningPick {
                Color.black.opacity(0.5)
                ProgressView()
                    .controlSize(.large)
                    .tint(Color.white)
            }
            // A white flash on the shutter, like a camera.
            if flashes > 0, !reduceMotion {
                ShutterFlash()
                    .id(flashes)
            }
        }
    }

    @ViewBuilder private var cameraStatusOverlay: some View {
        switch camera.status {
        case .idle, .live:
            EmptyView()
        case .starting:
            ProgressView()
                .controlSize(.large)
                .tint(Color.white)
        case .paused(let message):
            CameraMessage(systemImage: "pause.circle", title: "Camera paused", message: message)
        case .denied:
            CameraMessage(
                systemImage: "camera",
                title: "Camera access is off",
                message: "Allow it in Settings to take photos here, or choose a photo or video from your library."
            ) {
                Button("Open Settings") { openSystemSettings() }
                    .buttonStyle(.fwCompact(.accent))
            }
        case .noCamera:
            CameraMessage(
                systemImage: "camera",
                title: "No camera here",
                message: "Choose a photo from your library instead."
            ) {
                PhotosPicker(selection: $pickerItem, matching: pickerFilter, photoLibrary: .shared()) {
                    Text("Choose a photo or video")
                }
                .buttonStyle(.fwCompact(.accent))
                .disabled(isOpeningPick)
            }
        case .failed:
            CameraMessage(
                systemImage: "camera",
                title: "The camera couldn't start",
                message: "Try again, or choose a photo from your library."
            ) {
                Button("Try again") { camera.retry(preferred: preferredSide) }
                    .buttonStyle(.fwCompact(.accent))
            }
        }
    }

    @ViewBuilder private var noticePill: some View {
        if let notice {
            Text(notice)
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(Color.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.black.opacity(0.6), in: Capsule())
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .transition(.opacity)
                .accessibilityHidden(true) // announced when shown
        }
    }

    /// The library, the shutter and the switch-camera button.
    private var controls: some View {
        HStack(spacing: 0) {
            PhotosPicker(selection: $pickerItem, matching: pickerFilter, photoLibrary: .shared()) {
                Image(systemName: "photo.on.rectangle")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(.fg)
                    .frame(width: 52, height: 52)
                    .background(.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(PressScaleButtonStyle())
            .disabled(isOpeningPick || camera.isCapturing)
            .accessibilityLabel("Choose from your photos and videos")

            Spacer(minLength: 16)

            CameraShutterButton(isEnabled: canShoot) {
                takePhoto()
            }

            Spacer(minLength: 16)

            if camera.canSwitch {
                switchButton
            } else {
                // Keeps the shutter centred.
                Color.clear
                    .frame(width: 52, height: 52)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 40)
    }

    private var switchButton: some View {
        let isEnabled = camera.isLive && !camera.isSwitching && !camera.isCapturing
        return Button {
            Haptics.tap()
            flipTurns += 1
            camera.switchCamera()
        } label: {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 22, weight: .medium))
                .rotationEffect(.degrees(Double(flipTurns) * 180))
                .motion(.fwEase, value: flipTurns)
                .foregroundStyle(.fg)
                .frame(width: 52, height: 52)
                .background(.surface, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle())
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.4)
        .accessibilityLabel(camera.side == .front ? "Switch to the back camera" : "Switch to the front camera")
    }

    private var canShoot: Bool {
        camera.isLive && !camera.isCapturing && !camera.isSwitching && !isOpeningPick
    }

    private func takePhoto() {
        guard canShoot else { return }
        Haptics.shutter()
        notice = nil
        if !reduceMotion { flashes += 1 }
        let pressedAt = Date()
        let mirror = settings.values.mirrorFrontCamera
        Task {
            guard let image = await camera.capture(mirrorFront: mirror) else {
                showNotice("Couldn't take that photo. Try again.")
                return
            }
            let preview = await Task.detached(priority: .userInitiated) {
                CameraImage.displayCopy(of: image)
            }.value
            // The flash first; the preview takes over once it has been seen.
            if !reduceMotion {
                let remaining = 0.18 - Date().timeIntervalSince(pressedAt)
                if remaining > 0 {
                    try? await Task.sleep(for: .seconds(remaining))
                }
            }
            show(Shot(image: image, preview: preview, source: .camera))
        }
    }

    private func openPick(_ item: PhotosPickerItem) async {
        isOpeningPick = true
        notice = nil
        defer {
            isOpeningPick = false
            // So the same photo can be picked again after "Choose another".
            pickerItem = nil
        }
        do {
            let isMovie = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
            if isMovie {
                if let movie = try await item.loadTransferable(type: PickedMovie.self) {
                    try await openVideo(movie.url, still: nil, isLive: false)
                    return
                }
            } else if let data = try await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                // A Live Photo posts its motion too, when the library can be read for it (otherwise just the still).
                let isLivePhoto = item.supportedContentTypes.contains { $0.conforms(to: .livePhoto) }
                if isLivePhoto, let identifier = item.itemIdentifier,
                    let motion = await LivePhotoMotion.file(forAssetIdentifier: identifier)
                {
                    if (try? await openVideo(motion, still: image, isLive: true)) != nil { return }
                }
                let preview = await Task.detached(priority: .userInitiated) {
                    CameraImage.displayCopy(of: image)
                }.value
                show(Shot(image: image, preview: preview, source: .library))
                return
            }
        } catch VideoPreparation.Failure.tooLong {
            showNotice("Videos can be at most 60 seconds. Choose a shorter one.")
            return
        } catch {
            // Falls through to the message below.
        }
        showNotice("That couldn't be opened. Try another photo or video.")
    }

    /// Converts the chosen video (or a Live Photo's motion) and shows it ready to post. `source` is
    /// the file made for us; it is removed once converted.
    private func openVideo(_ source: URL, still: UIImage?, isLive: Bool) async throws {
        defer { try? FileManager.default.removeItem(at: source) }
        let prepared = try await VideoPreparation.prepare(source)
        let image = still ?? prepared.poster
        let preview = await Task.detached(priority: .userInitiated) {
            CameraImage.displayCopy(of: image)
        }.value
        show(
            Shot(
                image: image,
                preview: preview,
                source: .library,
                video: ShotVideo(file: prepared.file, durationMs: prepared.durationMs, isLive: isLive)
            )
        )
    }

    private func discardVideoFile(of shot: Shot?) {
        guard let file = shot?.video?.file else { return }
        try? FileManager.default.removeItem(at: file)
    }

    private func show(_ next: Shot) {
        discardVideoFile(of: shot)
        caption = ""
        poster.clearFailure()
        withMotion(.fwEase) { shot = next }
    }

    private func showNotice(_ message: String) {
        withMotion(.fwQuick) { notice = message }
        UIAccessibility.post(notification: .announcement, argument: message)
        Task {
            try? await Task.sleep(for: .seconds(3.5))
            if notice == message {
                withMotion(.fwQuick) { notice = nil }
            }
        }
    }

    private func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        openURL(url)
    }

    // MARK: - Preview and posting

    private func composer(shot: Shot, group: FriendGroup) -> some View {
        let discardLabel: String = shot.source == .camera ? "Retake" : "Choose another"
        return VStack(spacing: 0) {
            Color.black
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    if let video = shot.video {
                        LoopingVideoView(url: video.file, gravity: .resizeAspectFill)
                            .allowsHitTesting(false)
                            .accessibilityLabel(photoAccessibilityLabel(for: shot))
                    } else {
                        Image(uiImage: shot.preview)
                            .resizable()
                            .scaledToFill()
                            .allowsHitTesting(false)
                            .accessibilityLabel(photoAccessibilityLabel(for: shot))
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 44, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    if let video = shot.video {
                        VideoBadge(durationMs: video.durationMs, isLive: video.isLive)
                            .padding(18)
                            .allowsHitTesting(false)
                    }
                }
                .overlay(alignment: .bottom) { photoFooter }
                .padding(.horizontal, 8)
                .padding(.top, 24)
                .layoutPriority(1)

            VStack(spacing: 12) {
                momentNote
                composerMessage
                postButton(group: group)
                Button(discardLabel) { discard() }
                    .buttonStyle(.fwSecondary)
                    .disabled(poster.isUploading)
            }
            .padding(.horizontal, 16)
            .padding(.top, 28)
            .motion(.fwEase, value: composerMessageKind)

            Spacer(minLength: 12)
        }
    }

    /// Over the bottom of the photo: the caption pill, or the upload's progress while it posts.
    @ViewBuilder private var photoFooter: some View {
        if poster.isUploading {
            UploadProgressBar(fraction: poster.uploadFraction)
                .padding(.horizontal, 24)
                .padding(.bottom, 20)
        } else {
            Button {
                openCaption()
            } label: {
                HStack(spacing: 6) {
                    if !caption.isEmpty {
                        Image(systemName: "pencil")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    Text(caption.isEmpty ? "Add a caption" : caption)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(Color.white)
                .padding(.horizontal, 18)
                .frame(minHeight: 44)
                .background(Color.black.opacity(0.5), in: Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.96))
            .disabled(poster.isBusy)
            .padding(.horizontal, 24)
            .padding(.bottom, 18)
            .accessibilityLabel(captionButtonLabel)
        }
    }

    @ViewBuilder private var composerMessage: some View {
        switch poster.phase {
        case .waitingForWifi:
            WifiWaitNotice {
                poster.postNow()
            }
        case .waitingForConnection:
            InlineAlert(
                message: "You're offline. This will post as soon as you're back online, so keep this screen open.",
                systemImage: "wifi.slash"
            )
        default:
            if poster.failure?.code == "MOMENT_ENDED", let moment = requestedMoment {
                VStack(spacing: 8) {
                    InlineAlert(message: "“\(moment.title)” has just ended.")
                    if let group {
                        Button("Post to \(group.name) instead") {
                            leftMoment = true
                            poster.clearFailure()
                            post(to: group)
                        }
                        .buttonStyle(.fwCompact(.secondary))
                    }
                }
            } else if let message = failureMessage {
                InlineAlert(message: message)
            }
        }
    }

    /// What the photo is being posted into, while that's a moment that is open.
    @ViewBuilder private var momentNote: some View {
        if let moment = activeMoment {
            Text("\(moment.emoji ?? "✨") Posting into \(moment.title)")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .accessibilityElement(children: .combine)
        }
    }

    /// Which message shows above the buttons, so it eases in and out.
    private var composerMessageKind: Int {
        switch poster.phase {
        case .waitingForWifi: return 1
        case .waitingForConnection: return 2
        default: return poster.failure == nil ? 0 : (poster.failure?.code == "MOMENT_ENDED" ? 4 : 3)
        }
    }

    private var failureMessage: String? {
        guard let failure = poster.failure else { return nil }
        return failure.formMessage ?? failure.fieldErrors["caption"] ?? failure.message
    }

    private func postButton(group: FriendGroup) -> some View {
        Button {
            post(to: group)
        } label: {
            HStack(spacing: 8) {
                if poster.isBusy {
                    ProgressView()
                        .controlSize(.small)
                        .tint(accentFill.ink)
                }
                Text(postTitle(group: group))
                    .lineLimit(1)
            }
        }
        .buttonStyle(.fwAccent)
        // Not `.disabled`: the progress stays readable at full strength.
        .allowsHitTesting(!poster.isBusy)
    }

    private func postTitle(group: FriendGroup) -> String {
        switch poster.phase {
        case .idle:
            return "Post to \(group.name)"
        case .preparing:
            return "Posting…"
        case .waitingForConnection:
            return "Waiting for connection…"
        case .waitingForWifi:
            return "Waiting for Wi-Fi…"
        case .uploading(let fraction):
            guard let fraction, fraction > 0, fraction < 1 else { return "Posting…" }
            return "Posting… \(Int((fraction * 100).rounded()))%"
        }
    }

    private func photoAccessibilityLabel(for shot: Shot) -> String {
        let what = shot.video == nil ? "Your photo" : (shot.video?.isLive == true ? "Your Live Photo" : "Your video")
        return caption.isEmpty ? what : "\(what): \(caption)"
    }

    private var captionButtonLabel: String {
        caption.isEmpty ? "Add a caption" : "Edit caption: \(caption)"
    }

    private func openCaption() {
        guard !poster.isBusy else { return }
        withMotion(.fwEase) { editingCaption = true }
    }

    private func closeCaption() {
        withMotion(.fwEase) { editingCaption = false }
    }

    private func post(to group: FriendGroup) {
        guard let shot, !poster.isBusy else { return }
        let text = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload: CapturePoster.Payload
        if let video = shot.video {
            payload = .video(file: video.file, still: video.isLive ? shot.image : nil, isLive: video.isLive)
        } else {
            payload = .photo(shot.image)
        }
        poster.post(
            payload,
            caption: text,
            to: group.id,
            momentID: activeMoment?.id,
            photos: photos,
            network: network,
            settings: settings
        ) { photo in
            didPost(photo, shot: shot)
        }
    }

    private func didPost(_ photo: Photo, shot: Shot) {
        // It may start this year's Wrapped, and it counts in it.
        wrapped.setNeedsRefresh()
        if let momentID = photo.momentId { moments.didPost(into: momentID) }
        Haptics.success()
        let groupName = groups.group(photo.groupId)?.name
        groups.setCurrentGroup(photo.groupId)
        // Lands on the group's feed, where the store has already put the photo on top.
        router.openGroup(photo.groupId)
        ToastCenter.shared.show(groupName.map { "Posted to \($0)" } ?? "Posted")
        if settings.values.saveToDevice, shot.source == .camera {
            PostedPhotoSaver.saveCopy(of: shot.image)
        }
        discardVideoFile(of: shot)
        dismiss()
    }

    /// Back to the camera.
    private func discard() {
        poster.cancel()
        poster.clearFailure()
        discardVideoFile(of: shot)
        caption = ""
        // The camera stage is rebuilt: without this its shutter flash would play again.
        flashes = 0
        withMotion(.fwEase) {
            editingCaption = false
            shot = nil
        }
    }

    private func choose(_ next: FriendGroup) {
        chosenGroupID = next.id
        // Like the web app: the group you share with becomes the one you're looking at.
        groups.setCurrentGroup(next.id)
        poster.clearFailure()
    }

    // MARK: - Choices

    /// The group you're sharing with: the one picked at the top, else the one the camera opened
    /// from, else the current one.
    private var group: FriendGroup? {
        let list = groups.groups
        if let chosenGroupID, let chosen = list.first(where: { $0.id == chosenGroupID }) {
            return chosen
        }
        if let preferredGroupID, let preferred = list.first(where: { $0.id == preferredGroupID }) {
            return preferred
        }
        return groups.currentGroup
    }

    /// The moment this photo goes into: the one the camera was opened for, while it's open and in the group you're sharing with.
    private var activeMoment: Moment? {
        guard let moment = requestedMoment, !leftMoment, moment.isStillOpen(), moment.groupId == group?.id else { return nil }
        return moment
    }

    /// Your colour in the group you're sharing with paints the shutter and the Post button.
    private var accentColor: MemberColor? {
        if let group { return group.myColor }
        return inheritedAccent
    }

    private var accentFill: MemberFill {
        MemberFill(accentColor ?? .cobalt)
    }

    /// Settings → Photos & data → Camera opens with.
    private var preferredSide: CameraSide {
        settings.values.cameraFacing == .front ? .front : .back
    }
}

/// Who'll see what you post: everyone in the group but you (the web app's Audience).
private struct CameraAudience: View {
    let group: FriendGroup

    @Environment(GroupsStore.self) private var groups
    @Environment(SessionStore.self) private var session

    var body: some View {
        let members = groups.members(of: group.id)
        let myID = session.user?.id
        let others = (members ?? []).filter { $0.user.id != myID }

        VStack(spacing: 10) {
            if members == nil {
                // Holds the place while the members load.
                Color.clear
                    .frame(height: 32)
            } else if others.isEmpty {
                Text("Only you will see this")
            } else {
                PersonDots(
                    people: others.map { PersonDots.Person(id: $0.user.id, name: $0.user.displayName, color: $0.color) },
                    size: 32,
                    maxShown: 6,
                    ring: Theme.bg
                )
                Text(Self.sentence(others: others, groupName: group.name))
            }
        }
        .font(.subheadline)
        .foregroundStyle(.sub)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 24)
        .frame(minHeight: 56, alignment: .top)
        .accessibilityElement(children: .combine)
        .task(id: group.id) {
            await groups.loadMembersIfNeeded(of: group.id)
        }
    }

    /// "Tomáš, Marek and Adam will see this"; for more than four, "Everyone in The Boys will see this".
    static func sentence(others: [GroupMember], groupName: String) -> String {
        guard others.count <= 4 else { return "Everyone in \(groupName) will see this" }
        let names = others.map { member -> String in
            let name = member.user.displayName
            return name.split(whereSeparator: \.isWhitespace).first.map { String($0) } ?? name
        }
        return "\(Format.list(names)) will see this"
    }
}
