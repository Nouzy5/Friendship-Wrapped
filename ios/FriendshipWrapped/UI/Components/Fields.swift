import SwiftUI

/// A row of mutually exclusive options, e.g. a page's tabs. The raised marker slides to the
/// chosen one (the web app's SegmentedControl).
struct SegmentedPicker<Value: Hashable>: View {
    struct Option {
        let value: Value
        let label: String
    }

    let options: [Option]
    @Binding var selection: Value
    @Namespace private var marker

    var body: some View {
        HStack(spacing: 3) {
            ForEach(options, id: \.value) { option in
                let isSelected = option.value == selection
                Button {
                    guard !isSelected else { return }
                    Haptics.tap()
                    withMotion(.fwSlide) { selection = option.value }
                } label: {
                    Text(option.label)
                        .font(.system(.subheadline, design: .rounded, weight: isSelected ? .semibold : .medium))
                        .foregroundStyle(isSelected ? Theme.fg : Theme.sub)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background {
                            if isSelected {
                                Capsule()
                                    .fill(.raised)
                                    .shadow(color: .black.opacity(0.12), radius: 1, y: 1)
                                    .matchedGeometryEffect(id: "marker", in: marker)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(3)
        .background(.surface, in: Capsule())
    }
}

/// A labelled text field on a grey panel, with its error under it (the web app's TextField).
struct FWTextField: View {
    let label: String
    @Binding var text: String
    var prompt: String?
    var error: String?
    var hint: String?
    var isSecure = false
    var contentType: UITextContentType?
    var keyboard: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences
    /// Nil: off for passwords and usernames, on otherwise.
    var autocorrection: Bool?
    var submitLabel: SubmitLabel = .done
    var onSubmit: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(.fg)
            Group {
                if isSecure {
                    SecureField(label, text: $text, prompt: prompt.map { Text($0) })
                } else {
                    TextField(label, text: $text, prompt: prompt.map { Text($0) })
                }
            }
            .textContentType(contentType)
            .keyboardType(keyboard)
            .textInputAutocapitalization(autocapitalization)
            .autocorrectionDisabled(!(autocorrection ?? !(isSecure || contentType == .username)))
            .submitLabel(submitLabel)
            .onSubmit(onSubmit)
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .background(.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                if error != nil {
                    RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.fg, lineWidth: 2)
                }
            }
            if let error {
                Label(error, systemImage: "exclamationmark.circle")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.fg)
                    .transition(.opacity)
            } else if let hint {
                Text(hint)
                    .font(.footnote)
                    .foregroundStyle(.sub)
            }
        }
        .motion(.fwQuick, value: error)
    }
}

/// A form's error (or note) in a panel, e.g. "Incorrect username or password". No red: the
/// words say what's wrong.
struct InlineAlert: View {
    let message: String
    var systemImage = "exclamationmark.circle.fill"

    var body: some View {
        Label {
            Text(message).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: systemImage)
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.fg)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .riseIn()
    }
}
