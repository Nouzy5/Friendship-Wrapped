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

    /// A clip's length as a player shows it: 7 seconds is "0:07", a minute is "1:00". Rounded up, so a clip is never "0:00".
    static func duration(milliseconds: Int) -> String {
        let seconds = max(1, Int((Double(milliseconds) / 1000).rounded(.up)))
        return "\(seconds / 60):" + String(format: "%02d", seconds % 60)
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

    /// For a photo's name tag: "Now", "5 min", "2 h", "Yesterday", "Monday", then "12 Oct"
    /// (or "12 Oct 2025" in another year).
    static func shortAgo(_ date: Date, now: Date = Date()) -> String {
        let elapsed = now.timeIntervalSince(date)
        if elapsed < 60 { return "Now" }
        if elapsed < 3600 { return "\(Int(elapsed / 60)) min" }
        if elapsed < 86_400 { return "\(Int(elapsed / 3600)) h" }
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
        if days <= 1 { return "Yesterday" }
        if days < 7 { return date.formatted(.dateTime.weekday(.wide)) }
        if calendar.isDate(date, equalTo: now, toGranularity: .year) {
            return date.formatted(.dateTime.day().month(.abbreviated))
        }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    /// "Tomáš, Marek and Adam".
    static func list(_ names: [String]) -> String {
        guard names.count > 1, let last = names.last else { return names.first ?? "" }
        return names.dropLast().joined(separator: ", ") + " and " + last
    }

    /// "45s", "12m", "3h 20m".
    static func uptime(_ seconds: Int) -> String {
        if seconds < 60 { return "\(seconds)s" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        return "\(seconds / 3600)h \((seconds % 3600) / 60)m"
    }
}
