import Foundation

/// Display formatting shared across screens (the web app's lib/format.ts).
enum Format {
    /// "1 member", "5 members".
    static func memberCount(_ count: Int) -> String {
        count == 1 ? "1 member" : "\(count) members"
    }

    /// e.g. "8,421" in the viewer's locale.
    static func number(_ count: Int) -> String {
        count.formatted()
    }

    /// The word to follow a count: noun(1, "photo") is "photo", noun(3, "photo") is "photos".
    static func noun(_ count: Int, _ singular: String, plural: String? = nil) -> String {
        count == 1 ? singular : (plural ?? singular + "s")
    }

    /// e.g. "October 2026" in the viewer's locale.
    static func monthYear(_ date: Date) -> String {
        date.formatted(.dateTime.month(.wide).year())
    }

    /// e.g. "12 Oct" in the viewer's locale.
    static func dayMonth(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated))
    }

    /// e.g. "5 Oct 2026 at 22:59" in the viewer's locale.
    static func dateTime(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.dateTimeStyle = .named
        formatter.unitsStyle = .full
        return formatter
    }()

    /// "now", "5 minutes ago", "yesterday", "3 days ago", then a date: "12 Oct" (or "12 Oct 2025" in another year).
    static func relative(_ date: Date, now: Date = Date()) -> String {
        let elapsed = now.timeIntervalSince(date)
        if elapsed < 60 { return relativeFormatter.localizedString(fromTimeInterval: 0) }
        if elapsed < 7 * 86_400 { return relativeFormatter.localizedString(for: date, relativeTo: now) }
        if Calendar.current.isDate(date, equalTo: now, toGranularity: .year) {
            return date.formatted(.dateTime.day().month(.abbreviated))
        }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    /// "45s", "12m", "3h 20m".
    static func uptime(_ seconds: Int) -> String {
        if seconds < 60 { return "\(seconds)s" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        return "\(seconds / 3600)h \((seconds % 3600) / 60)m"
    }
}
