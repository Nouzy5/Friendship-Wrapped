import SwiftUI

/// Settings → Photos & data (the web app's PhotoSettingsPage): how this phone's camera and
/// connection are used. These belong to this phone, not the account.
struct PhotoSettingsView: View {
    @Environment(DeviceSettings.self) private var settings

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("These apply to this phone.")
                    .font(.callout)
                    .foregroundStyle(.sub)
                    .padding(.horizontal, 8)
                    .riseIn()

                SettingsSection("Camera opens with") {
                    SettingsChoiceGroup(options: facingOptions, selection: binding(\.cameraFacing))
                }
                .riseIn(delay: 0.04)

                SettingsSection("Camera") {
                    SettingsGroup {
                        SettingsToggleRow(
                            "Mirror front camera",
                            description: "Selfies come out the way you saw them on screen",
                            isOn: binding(\.mirrorFrontCamera)
                        )
                        SettingsToggleRow("Grid lines", isOn: binding(\.cameraGrid))
                        SettingsToggleRow(
                            "Save a copy to your photos",
                            description: "Every photo you post is also saved to your photo library",
                            isOn: binding(\.saveToDevice)
                        )
                    }
                }
                .riseIn(delay: 0.08)

                SettingsSection("Photo quality") {
                    SettingsChoiceGroup(options: qualityOptions, selection: binding(\.photoQuality))
                }
                .riseIn(delay: 0.12)

                SettingsSection("Data") {
                    SettingsGroup {
                        SettingsToggleRow(
                            "Upload on mobile data",
                            description: "When off, photos wait for Wi-Fi before they're posted",
                            isOn: binding(\.uploadOnMobileData)
                        )
                        SettingsToggleRow(
                            "Data saver",
                            description: "Loads smaller photos, even full screen",
                            isOn: binding(\.dataSaver)
                        )
                    }
                }
                .riseIn(delay: 0.16)

                SettingsSection(
                    "Storage",
                    footnote: "Only removes copies kept to make the app faster. Your posts and your groups' photos aren't touched."
                ) {
                    SettingsGroup {
                        SettingsButtonRow(
                            "Clear photos saved on this phone",
                            description: "Copies kept while the app is open, so photos show quickly"
                        ) {
                            ImageCache.shared.removeAll()
                            Haptics.tap()
                            ToastCenter.shared.show("Saved photos cleared")
                        }
                    }
                }
                .riseIn(delay: 0.2)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .navigationTitle("Photos & data")
        .navigationBarTitleDisplayMode(.large)
    }

    private var facingOptions: [SettingsChoiceGroup<DeviceSettings.CameraFacing>.Option] {
        [
            SettingsChoiceGroup<DeviceSettings.CameraFacing>.Option(value: .back, label: "Back camera"),
            SettingsChoiceGroup<DeviceSettings.CameraFacing>.Option(value: .front, label: "Front camera"),
        ]
    }

    private var qualityOptions: [SettingsChoiceGroup<DeviceSettings.PhotoQuality>.Option] {
        [
            SettingsChoiceGroup<DeviceSettings.PhotoQuality>.Option(
                value: .standard,
                label: "Standard",
                description: "Up to 1920 px. Quick to send, looks great on a phone"
            ),
            SettingsChoiceGroup<DeviceSettings.PhotoQuality>.Option(
                value: .high,
                label: "High",
                description: "Up to 2560 px. Sharper, takes longer to send"
            ),
        ]
    }

    /// A setting on this phone, saved as soon as it changes.
    private func binding<Value>(_ keyPath: WritableKeyPath<DeviceSettings.Values, Value>) -> Binding<Value> {
        Binding(
            get: { settings.values[keyPath: keyPath] },
            set: { newValue in settings.update { $0[keyPath: keyPath] = newValue } }
        )
    }
}
