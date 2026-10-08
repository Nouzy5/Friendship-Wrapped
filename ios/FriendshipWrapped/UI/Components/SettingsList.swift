import SwiftUI

// Settings screens are built from these (the web app's SettingsList): titled sections of rows
// on rounded grey panels, divided by hairlines. Put them in a ScrollView with `.screenBackground()`.
//
//     SettingsSection("Privacy", footnote: "…") {
//         SettingsGroup {
//             NavigationLink(value: AppRoute.settings(.blocked)) {
//                 SettingsRowLabel("Blocked people", systemImage: "nosign", value: "2")
//             }
//             .buttonStyle(.settingsRow)
//             SettingsToggleRow("Let friends save your photos", isOn: $allowSaving)
//         }
//     }

/// A titled block of settings, with an optional note under it.
struct SettingsSection<Content: View>: View {
    var title: String?
    var footnote: String?
    @ViewBuilder var content: Content

    init(_ title: String? = nil, footnote: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.footnote = footnote
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title {
                Text(title)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(.sub)
                    .padding(.horizontal, 8)
                    .accessibilityAddTraits(.isHeader)
            }
            content
            if let footnote {
                Text(footnote)
                    .font(.footnote)
                    .foregroundStyle(.sub)
                    .padding(.horizontal, 8)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// Rows on one grey panel. Each row draws a hairline above itself; the panel hides the first.
struct SettingsGroup<Content: View>: View {
    @ViewBuilder var content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            content
        }
        .background(.surface)
        .overlay(alignment: .top) {
            Rectangle().fill(.surface).frame(height: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

extension View {
    /// Lays out custom content as a settings row: padding, minimum height and the hairline above.
    func settingsRow(trailingPadding: CGFloat = 12) -> some View {
        modifier(SettingsRowFrame(trailingPadding: trailingPadding))
    }

    /// The page behind settings and other detail screens.
    func screenBackground() -> some View {
        scrollContentBackground(.hidden)
            .background(Color.bg.ignoresSafeArea())
    }
}

private struct SettingsRowFrame: ViewModifier {
    @Environment(\.displayScale) private var displayScale
    let trailingPadding: CGFloat

    func body(content: Content) -> some View {
        content
            .padding(.leading, 16)
            .padding(.trailing, trailingPadding)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .contentShape(Rectangle())
            .overlay(alignment: .top) {
                Rectangle().fill(.line).frame(height: 1 / displayScale).padding(.leading, 16)
            }
    }
}

/// The label and description on the left of a row.
struct SettingsRowText: View {
    let label: String
    var description: String?
    var strong = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(.body, design: .rounded, weight: strong ? .semibold : .regular))
                .foregroundStyle(.fg)
            if let description {
                Text(description)
                    .font(.footnote)
                    .foregroundStyle(.sub)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .multilineTextAlignment(.leading)
    }
}

/// A row that opens another screen: put it inside a NavigationLink (or Button) with
/// `.buttonStyle(.settingsRow)`. `value` is the current choice, shown on the right.
struct SettingsRowLabel<Leading: View>: View {
    let label: String
    var description: String?
    var systemImage: String?
    var value: String?
    var showsChevron = true
    var strong = false
    @ViewBuilder var leading: Leading

    var body: some View {
        HStack(spacing: 14) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(.fg)
                    .frame(width: 26)
                    .accessibilityHidden(true)
            }
            leading
            SettingsRowText(label: label, description: description, strong: strong)
            if let value {
                Text(value)
                    .foregroundStyle(.sub)
                    .lineLimit(1)
                    .frame(maxWidth: 160, alignment: .trailing)
            }
            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.sub)
                    .accessibilityHidden(true)
            }
        }
        .settingsRow()
    }
}

extension SettingsRowLabel where Leading == EmptyView {
    init(
        _ label: String,
        description: String? = nil,
        systemImage: String? = nil,
        value: String? = nil,
        showsChevron: Bool = true,
        strong: Bool = false
    ) {
        self.init(
            label: label,
            description: description,
            systemImage: systemImage,
            value: value,
            showsChevron: showsChevron,
            strong: strong,
            leading: { EmptyView() }
        )
    }
}

/// Rows highlight while pressed.
struct SettingsRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Theme.line.opacity(0.7) : Color.clear)
    }
}

extension ButtonStyle where Self == SettingsRowButtonStyle {
    static var settingsRow: SettingsRowButtonStyle { SettingsRowButtonStyle() }
}

/// A row that does something right here (report, clear, sign out). `strong` for the ones with
/// consequences.
struct SettingsButtonRow: View {
    let label: String
    var description: String?
    var systemImage: String?
    var strong = false
    let action: () -> Void

    init(_ label: String, description: String? = nil, systemImage: String? = nil, strong: Bool = false, action: @escaping () -> Void) {
        self.label = label
        self.description = description
        self.systemImage = systemImage
        self.strong = strong
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            SettingsRowLabel(label, description: description, systemImage: systemImage, showsChevron: false, strong: strong)
        }
        .buttonStyle(.settingsRow)
    }
}

/// A setting that's on or off. On is your own colour: it's your choice.
struct SettingsToggleRow: View {
    let label: String
    var description: String?
    @Binding var isOn: Bool

    init(_ label: String, description: String? = nil, isOn: Binding<Bool>) {
        self.label = label
        self.description = description
        _isOn = isOn
    }

    var body: some View {
        Toggle(isOn: $isOn) {
            SettingsRowText(label: label, description: description)
        }
        .toggleStyle(.fw)
        .settingsRow(trailingPadding: 8)
    }
}

/// A fact rather than a choice (version, storage used), with an optional small action on the right.
struct SettingsValueRow<Leading: View, Trailing: View>: View {
    let label: String
    var description: String?
    var systemImage: String?
    var value: String?
    @ViewBuilder var leading: Leading
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 14) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 19))
                    .frame(width: 26)
                    .accessibilityHidden(true)
            }
            leading
            SettingsRowText(label: label, description: description)
            if let value {
                Text(value).foregroundStyle(.sub)
            }
            trailing
        }
        .settingsRow(trailingPadding: 16)
    }
}

extension SettingsValueRow where Leading == EmptyView, Trailing == EmptyView {
    init(_ label: String, description: String? = nil, systemImage: String? = nil, value: String? = nil) {
        self.init(label: label, description: description, systemImage: systemImage, value: value, leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

/// One of a few choices, as rows with a check on the chosen one (e.g. which camera opens first).
struct SettingsChoiceGroup<Value: Hashable>: View {
    struct Option {
        let value: Value
        let label: String
        var description: String?
    }

    let options: [Option]
    @Binding var selection: Value

    var body: some View {
        SettingsGroup {
            ForEach(options, id: \.value) { option in
                Button {
                    Haptics.tap()
                    withMotion(.fwQuick) { selection = option.value }
                } label: {
                    HStack(spacing: 14) {
                        SettingsRowText(label: option.label, description: option.description)
                        ChoiceCheck(isOn: option.value == selection)
                    }
                    .settingsRow(trailingPadding: 16)
                }
                .buttonStyle(.settingsRow)
                .accessibilityAddTraits(option.value == selection ? [.isButton, .isSelected] : .isButton)
            }
        }
    }
}

/// The round check on a chosen option: filled in your colour, the tick pops in.
struct ChoiceCheck: View {
    @Environment(\.accent) private var accent
    let isOn: Bool

    var body: some View {
        ZStack {
            if isOn {
                Circle().fill(accent.background)
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(accent.ink)
                    .popIn()
            } else {
                Circle().strokeBorder(.switchOff, lineWidth: 2)
            }
        }
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
    }
}

/// An on/off switch. On is your own colour; the knob slides with a little spring.
struct FWToggleStyle: ToggleStyle {
    @Environment(\.accent) private var accent
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        Button {
            Haptics.tap()
            withMotion(.fwSlide) { configuration.isOn.toggle() }
        } label: {
            HStack(spacing: 12) {
                configuration.label
                Capsule()
                    .fill(configuration.isOn ? accent.background : Theme.switchOff)
                    .frame(width: 52, height: 32)
                    .overlay(alignment: configuration.isOn ? .trailing : .leading) {
                        Circle()
                            .fill(.white)
                            .shadow(color: .black.opacity(0.25), radius: 1.5, y: 1)
                            .padding(2)
                    }
                    .frame(width: 60, height: 44)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.98))
        .opacity(isEnabled ? 1 : 0.4)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isToggle)
        .accessibilityValue(configuration.isOn ? "On" : "Off")
    }
}

extension ToggleStyle where Self == FWToggleStyle {
    static var fw: FWToggleStyle { FWToggleStyle() }
}
