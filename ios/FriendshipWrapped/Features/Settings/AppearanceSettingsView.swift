import SwiftUI

/// Settings → Appearance (the web app's AppearanceSettingsPage): theme, app icon, reduce motion
/// and haptics. These belong to this phone. The root applies the theme and motion as they change.
struct AppearanceSettingsView: View {
    @Environment(DeviceSettings.self) private var settings
    @Environment(\.accentMemberColor) private var myColor
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                themeSection
                    .riseIn()
                iconSection
                    .riseIn(delay: 0.05)
                motionSection
                    .riseIn(delay: 0.1)
                hapticsSection
                    .riseIn(delay: 0.15)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Theme

    private var themeNote: String {
        switch settings.values.theme {
        case .system:
            // With "Match device" the app follows the device, so this is the device's look.
            return "Follows your device. It's \(colorScheme == .dark ? "dark" : "light") right now, so the app is too."
        case .light:
            return "Always light, whatever your device is set to."
        case .dark:
            return "Always dark, whatever your device is set to."
        }
    }

    private var themeSection: some View {
        SettingsSection("Theme", footnote: themeNote) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(DeviceSettings.ThemeChoice.allCases) { choice in
                    ThemePreviewCard(choice: choice, isSelected: settings.values.theme == choice) {
                        guard settings.values.theme != choice else { return }
                        Haptics.tap()
                        withMotion(.fwPop) {
                            settings.update { $0.theme = choice }
                        }
                    }
                }
            }
            .padding(6)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Theme")
        }
    }

    // MARK: - App icon

    private var iconSection: some View {
        SettingsSection(
            "App icon",
            footnote: "Changes the icon on your Home Screen. “Your colour” is your colour in the group you're looking at."
        ) {
            HStack(alignment: .top, spacing: 20) {
                ForEach(DeviceSettings.AppIconChoice.allCases) { choice in
                    AppIconChoiceButton(choice: choice, color: myColor, isSelected: settings.values.appIcon == choice) {
                        Haptics.tap()
                        withMotion(.fwPop) {
                            settings.update { $0.appIcon = choice }
                        }
                        // iOS confirms the change with an alert of its own.
                        AppIconApplier.apply(choice, color: myColor)
                    }
                }
            }
            .padding(6)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("App icon")
        }
    }

    // MARK: - Motion and haptics

    private var motionOptions: [SettingsChoiceGroup<DeviceSettings.MotionChoice>.Option] {
        DeviceSettings.MotionChoice.allCases.map { SettingsChoiceGroup<DeviceSettings.MotionChoice>.Option(value: $0, label: $0.label) }
    }

    private var motionSection: some View {
        SettingsSection("Reduce motion", footnote: "Calmer Wrapped transitions and no zooms or floating emoji.") {
            SettingsChoiceGroup(
                options: motionOptions,
                selection: Binding(
                    get: { settings.values.reduceMotion },
                    set: { choice in settings.update { $0.reduceMotion = choice } }
                )
            )
        }
    }

    private var hapticsSection: some View {
        SettingsSection(footnote: "Text size follows your device's settings.") {
            SettingsGroup {
                SettingsToggleRow(
                    "Haptics",
                    description: "A small tap when you react or take a photo",
                    isOn: Binding(
                        get: { settings.values.haptics },
                        set: { isOn in settings.update { $0.haptics = isOn } }
                    )
                )
            }
        }
    }
}

/// A theme to choose, shown as a tiny feed in that look. The chosen one is ringed in your colour.
private struct ThemePreviewCard: View {
    let choice: DeviceSettings.ThemeChoice
    let isSelected: Bool
    let action: () -> Void

    @Environment(\.accent) private var accent

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                preview
                    .frame(maxWidth: .infinity)
                    .frame(height: 150)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .strokeBorder(Theme.line, lineWidth: 1)
                    }
                    .overlay {
                        if isSelected {
                            RoundedRectangle(cornerRadius: 26, style: .continuous)
                                .strokeBorder(accent.background, lineWidth: 3)
                                .padding(-6)
                                .transition(.scale(scale: 0.94).combined(with: .opacity))
                        }
                    }
                Text(choice.label)
                    .font(.system(.subheadline, design: .rounded, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(.fg)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.96))
        .accessibilityLabel(choice.label)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    @ViewBuilder private var preview: some View {
        switch choice {
        case .system:
            // Light, with the dark look across its lower-right half.
            ZStack {
                ThemeMiniFeed(dark: false)
                ThemeMiniFeed(dark: true)
                    .clipShape(ThemeSplitTriangle())
            }
        case .light:
            ThemeMiniFeed(dark: false)
        case .dark:
            ThemeMiniFeed(dark: true)
        }
    }
}

/// A tiny feed: the app's mark, a name, a photo and two reaction pills (the web app's MiniFeed).
private struct ThemeMiniFeed: View {
    let dark: Bool

    var body: some View {
        let ink: Color = dark ? .white : .black
        let pill = dark ? Color(hex: 0x2C2C2A) : Color(hex: 0xF2F2F0)

        ZStack(alignment: .topLeading) {
            (dark ? Color.black : Color.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            HStack(spacing: 0) {
                ForEach(MemberColor.markStripes) { stripe in
                    Rectangle().fill(stripe.fill)
                }
            }
            .frame(width: 18, height: 18)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .offset(x: 10, y: 12)

            Capsule()
                .fill(ink)
                .frame(width: 44, height: 10)
                .offset(x: 34, y: 16)

            // An evening photo: a warm light over a dark purple room.
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(
                    RadialGradient(
                        colors: [Color(hex: 0x40203F), Color(hex: 0x150B1F), Color(hex: 0x07060C)],
                        center: UnitPoint(x: 0.5, y: 1.15),
                        startRadius: 0,
                        endRadius: 110
                    )
                )
                .overlay(alignment: .topLeading) {
                    Circle()
                        .fill(Color(red: 1, green: 0.69, blue: 0.27).opacity(0.95))
                        .frame(width: 9, height: 9)
                        .blur(radius: 2.5)
                        .offset(x: 22, y: 20)
                }
                .frame(height: 70)
                .padding(.horizontal, 8)
                .offset(y: 40)

            Capsule()
                .fill(pill)
                .frame(width: 34, height: 14)
                .offset(x: 10, y: 120)
            Capsule()
                .fill(pill)
                .frame(width: 34, height: 14)
                .offset(x: 48, y: 120)
        }
        .accessibilityHidden(true)
    }
}

/// The lower-right half of a rectangle, split corner to corner.
private struct ThemeSplitTriangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// An app icon to choose, drawn like the real one. The chosen one is ringed in your colour.
private struct AppIconChoiceButton: View {
    let choice: DeviceSettings.AppIconChoice
    let color: MemberColor?
    let isSelected: Bool
    let action: () -> Void

    @Environment(\.accent) private var accent

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                AppIconArtwork(choice: choice, color: color, size: 64)
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(Theme.line, lineWidth: 1)
                    }
                    .overlay {
                        if isSelected {
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .strokeBorder(accent.background, lineWidth: 3)
                                .padding(-6)
                                .transition(.scale(scale: 0.9).combined(with: .opacity))
                        }
                    }
                Text(choice.label)
                    .font(.system(.subheadline, design: .rounded, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(.fg)
                    .lineLimit(1)
                    .fixedSize()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.94))
        .accessibilityLabel(choice.label)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}
