import SwiftUI

/// The emoji a group can pick with one tap (the web app's PRESET_EMOJIS).
let presetEmojis = ["🍻", "🎉", "🏖️", "🏔️", "✈️", "🎮", "⚽", "🎸", "🍕", "🔥", "💛", "🌴", "🎓", "🏠", "🐶", "🎄", "🚗", "📸"]

/// Name and emoji fields shared by "new group", onboarding and the group's settings (the web
/// app's GroupForm). A plain stack: put it in a ScrollView with the screen's side padding. The
/// server does the validation; its messages show under each field.
struct GroupFormFields: View {
    @Binding var name: String
    @Binding var emoji: String
    var errors: [String: String] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            FWTextField(
                label: "Group name",
                text: $name,
                prompt: "e.g. The Boys",
                error: errors["name"],
                autocapitalization: .words,
                submitLabel: .done
            )
            .characterLimit(50, text: $name)

            VStack(alignment: .leading, spacing: 12) {
                Text("Emoji")
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(.fg)
                    .accessibilityHidden(true)

                EmojiGrid(selection: $emoji)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Emoji")

                FWTextField(
                    label: "Or type any emoji",
                    text: customEmoji,
                    prompt: "🙂",
                    error: errors["emoji"]
                )
            }
        }
    }

    /// Shows an emoji that isn't one of the presets; typing keeps only the last character,
    /// since a group has exactly one.
    private var customEmoji: Binding<String> {
        Binding(
            get: { presetEmojis.contains(emoji) ? "" : emoji },
            set: { newValue in emoji = newValue.last.map { String($0) } ?? "" }
        )
    }
}

/// The preset emoji as a grid of tiles. The chosen one gets an ink ring and springs up a little.
struct EmojiGrid: View {
    @Binding var selection: String

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 6)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(presetEmojis, id: \.self) { emoji in
                EmojiTile(emoji: emoji, isSelected: emoji == selection) {
                    guard emoji != selection else { return }
                    Haptics.tap()
                    withMotion(.fwPop) { selection = emoji }
                }
            }
        }
    }
}

private struct EmojiTile: View {
    let emoji: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)

        Button(action: action) {
            shape
                .fill(isSelected ? Theme.line : Theme.surface)
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    Text(emoji)
                        .font(.system(size: 26))
                        .scaleEffect(isSelected ? 1.15 : 1)
                }
                .overlay {
                    if isSelected {
                        shape
                            .strokeBorder(.fg, lineWidth: 2.5)
                            .transition(.scale(scale: 0.8).combined(with: .opacity))
                    }
                }
                .frame(minHeight: 44)
                .contentShape(shape)
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel(Text(emoji))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}
