import Observation
import SwiftUI
import UIKit

/// Short confirmations at the bottom of the screen ("Photo deleted", "Tomáš is blocked"), and
/// errors from things done in the background ("Couldn't save that setting."). The web app's toast().
@MainActor
@Observable
final class ToastCenter {
    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let message: String
        let isError: Bool
    }

    static let shared = ToastCenter()

    private(set) var current: Toast?
    @ObservationIgnored private var dismissTask: Task<Void, Never>?

    func show(_ message: String, isError: Bool = false) {
        withMotion(.fwEase) { current = Toast(message: message, isError: isError) }
        UIAccessibility.post(notification: .announcement, argument: message)
        dismissTask?.cancel()
        dismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(isError ? 4 : 2.6))
            guard !Task.isCancelled else { return }
            self?.dismiss()
        }
    }

    func dismiss() {
        withMotion(.fwEase) { current = nil }
    }
}

extension View {
    /// Shows the toasts over this view, above `bottomInset` (the tab bar).
    func toastOverlay(_ center: ToastCenter, bottomInset: CGFloat = 0) -> some View {
        overlay(alignment: .bottom) {
            if let toast = center.current {
                HStack(spacing: 10) {
                    if toast.isError {
                        Image(systemName: "exclamationmark.circle.fill")
                            .accessibilityHidden(true)
                    }
                    Text(toast.message)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(.onInverse)
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .background(.inverse, in: Capsule())
                .shadow(color: .black.opacity(0.18), radius: 12, y: 4)
                .padding(.horizontal, 24)
                .padding(.bottom, bottomInset + 12)
                .onTapGesture { center.dismiss() }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .id(toast.id)
                .accessibilityHidden(true) // announced when shown
            }
        }
    }
}
