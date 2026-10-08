import AVFoundation
import SwiftUI
import UIKit

/// The live camera, filling its frame: in the square viewfinder that's the middle of the
/// picture, exactly what's kept. The front camera's preview is mirrored, like a mirror.
struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession
    /// The camera showing; when it changes the preview's rotation is checked again.
    var side: CameraSide?

    func makeUIView(context: Context) -> CameraPreviewUIView {
        let view = CameraPreviewUIView()
        view.backgroundColor = .black
        view.previewLayer.videoGravity = .resizeAspectFill
        view.previewLayer.session = session
        view.isAccessibilityElement = true
        view.accessibilityLabel = "Camera preview"
        view.accessibilityTraits = .image
        return view
    }

    func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {
        uiView.keepUpright()
    }
}

final class CameraPreviewUIView: UIView {
    override class var layerClass: AnyClass {
        AVCaptureVideoPreviewLayer.self
    }

    var previewLayer: AVCaptureVideoPreviewLayer {
        // The layer is always this class (`layerClass`).
        layer as! AVCaptureVideoPreviewLayer
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        keepUpright()
    }

    /// The app is portrait only, so the picture stays at 90° (upright in portrait).
    func keepUpright() {
        guard
            let connection = previewLayer.connection,
            connection.isVideoRotationAngleSupported(90),
            connection.videoRotationAngle != 90
        else { return }
        connection.videoRotationAngle = 90
    }
}

/// The big shutter: a ring and a dot in your colour (the web app's 88-point shutter).
struct CameraShutterButton: View {
    var isEnabled = true
    let action: () -> Void

    @Environment(\.accent) private var accent

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .strokeBorder(accent.background, lineWidth: 5)
                Circle()
                    .fill(accent.background)
                    .padding(11)
            }
            .frame(width: 88, height: 88)
            .contentShape(Circle())
            .motion(.fwEase, value: accent)
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.9))
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.4)
        .motion(.fwQuick, value: isEnabled)
        .accessibilityLabel("Take photo")
    }
}

/// Rule-of-thirds lines over the viewfinder (Settings → Photos & data → Grid lines).
struct ViewfinderGrid: View {
    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            Path { path in
                for step in 1...2 {
                    let x = size.width * CGFloat(step) / 3
                    let y = size.height * CGFloat(step) / 3
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: size.height))
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                }
            }
            .stroke(Color.white.opacity(0.35), lineWidth: 1)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// A white flash that fades out when the shutter fires, like a camera. Give it a new `.id` per
/// photo. Not shown at all with reduced motion.
struct ShutterFlash: View {
    @State private var opacity = 0.85

    var body: some View {
        Color.white
            .opacity(opacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                withMotion(.easeOut(duration: 0.35)) { opacity = 0 }
            }
    }
}

/// White words over the black viewfinder when there's no live camera (no access, no camera,
/// paused), with what you can do about it.
struct CameraMessage<Actions: View>: View {
    let systemImage: String
    let title: String
    var message: String?
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 32, weight: .medium))
                .foregroundStyle(Color.white.opacity(0.7))
                .accessibilityHidden(true)
            Text(title)
                .font(.system(.headline, design: .rounded, weight: .semibold))
                .foregroundStyle(Color.white)
                .accessibilityAddTraits(.isHeader)
            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Color.white.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
            actions()
                .padding(.top, 6)
        }
        .multilineTextAlignment(.center)
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .fadeIn()
    }
}

extension CameraMessage where Actions == EmptyView {
    init(systemImage: String, title: String, message: String? = nil) {
        self.init(systemImage: systemImage, title: title, message: message, actions: { EmptyView() })
    }
}

/// The upload's progress, along the bottom of the photo while it posts.
struct UploadProgressBar: View {
    /// 0–1, or nil before the first progress report.
    let fraction: Double?

    var body: some View {
        GeometryReader { proxy in
            Capsule()
                .fill(Color.white.opacity(0.3))
                .overlay(alignment: .leading) {
                    Capsule()
                        .fill(Color.white)
                        .frame(width: proxy.size.width * CGFloat(max(0.04, min(1, fraction ?? 0.2))))
                }
        }
        .frame(height: 6)
        .motion(.fwQuick, value: fraction)
        .accessibilityElement()
        .accessibilityLabel("Upload")
        .accessibilityValue(valueDescription)
    }

    private var valueDescription: String {
        guard let fraction else { return "Starting" }
        return "\(Int((fraction * 100).rounded())) percent"
    }
}

/// The caption field, rising from the bottom over the photo (the web app's caption input).
struct CaptionEditorPanel: View {
    /// The server's limit, in code points.
    static let limit = 500

    @Binding var caption: String
    /// The server's message about the caption, if it turned it down.
    var error: String?
    let onDone: () -> Void

    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Text("Caption")
                    .font(Theme.title(.title3))
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Button("Done", action: onDone)
                    .buttonStyle(.fwCompact(.primary))
            }

            TextField("Add a caption", text: $caption, axis: .vertical)
                .lineLimit(1...5)
                .focused($isFocused)
                .foregroundStyle(.fg)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay {
                    if error != nil {
                        RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.fg, lineWidth: 2)
                    }
                }
                .characterLimit(Self.limit, text: $caption)

            if let error {
                Label(error, systemImage: "exclamationmark.circle")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.fg)
            } else if remaining <= 50 {
                Text(remaining == 1 ? "1 character left" : "\(remaining) characters left")
                    .font(.footnote)
                    .foregroundStyle(.sub)
            }
        }
        .padding(16)
        .padding(.bottom, 4)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28, style: .continuous)
                .fill(Theme.bg)
                .shadow(color: Color.black.opacity(0.15), radius: 18, y: -4)
                .ignoresSafeArea(edges: .bottom)
        }
        .onAppear { isFocused = true }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }

    private var remaining: Int {
        max(0, Self.limit - caption.unicodeScalars.count)
    }
}

/// On mobile data with "Upload on mobile data" off: the photo waits for Wi-Fi, or goes now.
struct WifiWaitNotice: View {
    let onPostNow: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label {
                Text("You're on mobile data, so this will post when you're back on Wi-Fi. Keep this screen open, or post it now.")
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "wifi")
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.fg)

            Button("Post now", action: onPostNow)
                .buttonStyle(.fwCompact(.primary))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .riseIn()
    }
}
