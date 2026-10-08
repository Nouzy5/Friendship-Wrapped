import Foundation
import Observation
import UIKit

/// Settings that belong to this phone rather than the account: how the app looks and feels here,
/// and how this phone's camera and connection are used (the web app's lib/device-settings.ts).
/// Account settings (privacy, notifications) live on the server, in `AccountStore`.
@MainActor
@Observable
final class DeviceSettings {
    enum ThemeChoice: String, Codable, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }

        var label: String {
            switch self {
            case .system: return "Match device"
            case .light: return "Light"
            case .dark: return "Dark"
            }
        }
    }

    enum AppIconChoice: String, Codable, CaseIterable, Identifiable {
        case classic, night, yours
        var id: String { rawValue }

        var label: String {
            switch self {
            case .classic: return "Classic"
            case .night: return "Night"
            case .yours: return "Your colour"
            }
        }
    }

    enum MotionChoice: String, Codable, CaseIterable, Identifiable {
        case system, on, off
        var id: String { rawValue }

        var label: String {
            switch self {
            case .system: return "Match device"
            case .on: return "On"
            case .off: return "Off"
            }
        }
    }

    enum CameraFacing: String, Codable, CaseIterable, Identifiable {
        case back, front
        var id: String { rawValue }

        var label: String {
            switch self {
            case .back: return "Back camera"
            case .front: return "Front camera"
            }
        }
    }

    enum PhotoQuality: String, Codable, CaseIterable, Identifiable {
        case standard, high
        var id: String { rawValue }

        var label: String {
            switch self {
            case .standard: return "Standard"
            case .high: return "High"
            }
        }

        /// The longest side photos are scaled to before uploading.
        var maxDimension: CGFloat {
            switch self {
            case .standard: return 1920
            case .high: return 2560
            }
        }
    }

    struct Values: Codable, Equatable {
        var theme: ThemeChoice = .system
        var appIcon: AppIconChoice = .classic
        var reduceMotion: MotionChoice = .system
        var haptics = true
        /// Which camera the camera screen opens with.
        var cameraFacing: CameraFacing = .back
        var mirrorFrontCamera = true
        var cameraGrid = false
        /// Save a copy of each photo you post to your photo library.
        var saveToDevice = false
        var photoQuality: PhotoQuality = .standard
        /// When off, photos taken on mobile data wait for Wi-Fi.
        var uploadOnMobileData = true
        /// Never load the full-size photo.
        var dataSaver = false

        init() {}

        // Each field on its own, so a value saved by an older version of the app (or one that
        // no longer exists) only resets that one setting.
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            let defaults = Values()
            theme = (try? container.decodeIfPresent(ThemeChoice.self, forKey: .theme)) ?? defaults.theme
            appIcon = (try? container.decodeIfPresent(AppIconChoice.self, forKey: .appIcon)) ?? defaults.appIcon
            reduceMotion = (try? container.decodeIfPresent(MotionChoice.self, forKey: .reduceMotion)) ?? defaults.reduceMotion
            haptics = (try? container.decodeIfPresent(Bool.self, forKey: .haptics)) ?? defaults.haptics
            cameraFacing = (try? container.decodeIfPresent(CameraFacing.self, forKey: .cameraFacing)) ?? defaults.cameraFacing
            mirrorFrontCamera = (try? container.decodeIfPresent(Bool.self, forKey: .mirrorFrontCamera)) ?? defaults.mirrorFrontCamera
            cameraGrid = (try? container.decodeIfPresent(Bool.self, forKey: .cameraGrid)) ?? defaults.cameraGrid
            saveToDevice = (try? container.decodeIfPresent(Bool.self, forKey: .saveToDevice)) ?? defaults.saveToDevice
            photoQuality = (try? container.decodeIfPresent(PhotoQuality.self, forKey: .photoQuality)) ?? defaults.photoQuality
            uploadOnMobileData = (try? container.decodeIfPresent(Bool.self, forKey: .uploadOnMobileData)) ?? defaults.uploadOnMobileData
            dataSaver = (try? container.decodeIfPresent(Bool.self, forKey: .dataSaver)) ?? defaults.dataSaver
        }
    }

    static let shared = DeviceSettings()

    private(set) var values: Values

    @ObservationIgnored private let defaults: UserDefaults
    private static let key = "fw.device-settings"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.key), let stored = try? JSONDecoder().decode(Values.self, from: data) {
            values = stored
        } else {
            values = Values()
        }
    }

    /// Changes and saves, e.g. `settings.update { $0.theme = .dark }`.
    func update(_ change: (inout Values) -> Void) {
        var next = values
        change(&next)
        guard next != values else { return }
        values = next
        if let data = try? JSONEncoder().encode(values) {
            defaults.set(data, forKey: Self.key)
        }
    }

    /// Back to the defaults, e.g. after deleting the account.
    func reset() {
        values = Values()
        defaults.removeObject(forKey: Self.key)
    }
}

/// A small tap when you react, take a photo or flip a switch (Settings → Appearance → Haptics).
@MainActor
enum Haptics {
    static func tap() {
        guard DeviceSettings.shared.values.haptics else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// Taking a photo: a firmer click.
    static func shutter() {
        guard DeviceSettings.shared.values.haptics else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func success() {
        guard DeviceSettings.shared.values.haptics else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}
